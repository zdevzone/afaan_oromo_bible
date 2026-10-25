import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark as BookmarkIcon,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Feather,
  FileText,
  Info,
  Leaf,
  List,
  LoaderCircle,
  Minus,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import type { AppServices } from "../domain/ports";
import type {
  BookSummary,
  ChapterContent,
  ChapterKey,
  Edition,
  ParsedSearch,
  SearchResults,
  SourceReferenceTarget,
} from "../domain/scripture";
import { AppError } from "../domain/scripture";
import {
  createVerseAnchor,
  anchorMatchesChapter,
  anchorMatchesContent,
  resolvedHighlightColors,
  DEFAULT_PREFERENCES,
  type Bookmark,
  type Highlight,
  type HighlightColor,
  type Preferences,
  type VerseAnchor,
} from "../domain/notes";
import { parseSearchQuery } from "../services/search";
import { resolveSourceTarget } from "../services/reference";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { SelectField } from "../components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "../components/ui/dialog";
import { ReaderContent } from "../features/reader/ReaderContent";
import { useNoteWorkspace } from "../features/notes/useNoteWorkspace";
import { NotesPanel, noteTitle } from "../features/notes/NotesPanel";
import { SearchPanel } from "../features/reader/SearchPanel";
import { BookmarksPanel } from "../features/reader/BookmarksPanel";
import { BackupControls } from "../features/backup/BackupControls";
import { AboutDialog } from "../features/about/AboutDialog";
import { en } from "../locales/en";
import { activeUiLanguage, catalogFor, oromoCatalogComplete } from "../locales/catalog";
import { messageForError } from "../locales/errors";
import { useWindowCloseGuard } from "./useWindowCloseGuard";

export function App({ services }: { services: AppServices }) {
  const notes = useNoteWorkspace(services);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [books, setBooks] = useState<BookSummary[]>([]);
  const [chapter, setChapter] = useState<ChapterContent | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({ ...DEFAULT_PREFERENCES });
  const strings = useMemo(() => catalogFor(preferences.uiLocale), [preferences.uiLocale]);
  const stringsRef = useRef(strings);
  useEffect(() => {
    stringsRef.current = strings;
  }, [strings]);
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = activeUiLanguage(preferences.uiLocale);
    return () => {
      document.documentElement.lang = previous;
    };
  }, [preferences.uiLocale]);
  const errorMessage = (error: unknown) => messageForError(error, stringsRef.current);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<{ code: string; message: string } | null>(null);
  const [recoveryConfirmOpen, setRecoveryConfirmOpen] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState("");
  const [recoveryLocation, setRecoveryLocation] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  const [positionObserverRevision, setPositionObserverRevision] = useState(0);
  const [notice, setNotice] = useState("");
  const [failedCopy, setFailedCopy] = useState<{ text: string; error: string } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [panel, setPanel] = useState<"search" | "notes" | "bookmarks" | null>(null);
  const [singlePane, setSinglePane] = useState(
    () => window.matchMedia("(max-width: 1099px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 1099px)");
    const update = () => setSinglePane(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [highlightBusy, setHighlightBusy] = useState(false);
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  const [bookmarkError, setBookmarkError] = useState("");
  const [deleteBookmarkTarget, setDeleteBookmarkTarget] = useState<Bookmark | null>(null);
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [extendSelection, setExtendSelection] = useState(false);
  const [referenceInput, setReferenceInput] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [query, setQuery] = useState("");
  const [searchBook, setSearchBook] = useState("all");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [guardBusy, setGuardBusy] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const requestId = useRef(0);
  const navigationIntent = useRef(0);
  const searchId = useRef(0);
  const submittedSearch = useRef<{
    editionId: string;
    query: ParsedSearch;
    bookCode?: string;
  } | null>(null);
  const positionQueue = useRef(Promise.resolve());
  const flushPendingPosition = useRef<(() => void) | null>(null);
  const preferenceQueue = useRef(Promise.resolve());
  const userWritesPaused = useRef(false);
  const closeGuard = useWindowCloseGuard(services.platform.window, notes, async () => {
    // Wait for already queued position/preferences transactions. Their failure
    // notices are separate from note durability; Discard never deletes records.
    let position: Promise<void>;
    let preferences: Promise<void>;
    do {
      position = positionQueue.current;
      preferences = preferenceQueue.current;
      await Promise.allSettled([position, preferences]);
    } while (position !== positionQueue.current || preferences !== preferenceQueue.current);
  });
  const referenceRef = useRef<HTMLInputElement>(null);
  const passageRef = useRef<HTMLElement>(null);
  const activeBook = books.find((book) => book.code === chapter?.bookCode);
  const selectedUnits = chapter?.verseUnits.filter((unit) => selectedKeys.includes(unit.key)) ?? [];
  const highlightColors = resolvedHighlightColors(highlights, edition, chapter);
  const selectedReference =
    chapter && activeBook && selectedUnits.length
      ? `${activeBook.name} ${chapter.chapterLabel}:${selectedUnits[0]!.label}${selectedUnits.length > 1 ? `–${selectedUnits[selectedUnits.length - 1]!.label}` : ""}`
      : "";

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setBootError(null);
      setPreferencesReady(false);
      try {
        const preferenceResult = await services.userStore.getPreferences().then(
          (value) => ({ value, error: "" }),
          (cause) => ({ value: { ...DEFAULT_PREFERENCES }, error: errorMessage(cause) }),
        );
        if (!active) return;
        setPreferences(preferenceResult.value);
        setPreferencesReady(true);
        const loadedStrings = catalogFor(preferenceResult.value.uiLocale);
        const editions = await services.library.listEditions();
        const first = editions[0];
        if (!first) throw new Error(loadedStrings.noContentInstalled);
        const [bookList, positionResult] = await Promise.all([
          services.library.listBooks(first.id),
          services.userStore.getReadingPosition().then(
            (value) => ({ value, error: "" }),
            (cause) => ({ value: null, error: errorMessage(cause) }),
          ),
        ]);
        const storedPosition = positionResult.value;
        const firstBook = bookList[0];
        if (!firstBook?.chapters[0]) throw new Error(loadedStrings.noReadableChapters);
        const storedBook =
          storedPosition?.editionId === first.id
            ? bookList.find(
                (book) =>
                  book.code === storedPosition.bookCode &&
                  book.chapters.includes(storedPosition.chapterLabel),
              )
            : null;
        const key =
          storedBook && storedPosition
            ? {
                editionId: first.id,
                bookCode: storedBook.code,
                chapterLabel: storedPosition.chapterLabel,
              }
            : {
                editionId: first.id,
                bookCode: firstBook.code,
                chapterLabel: firstBook.chapters[0],
              };
        const content = await services.library.getChapter(key);
        if (!active) return;
        setEdition(first);
        setBooks(bookList);
        setNotice(
          [
            preferenceResult.error
              ? loadedStrings.preferencesLoadError.replace("{error}", preferenceResult.error)
              : "",
            positionResult.error
              ? loadedStrings.positionLoadError.replace("{error}", positionResult.error)
              : storedPosition && !storedBook
                ? loadedStrings.previousPositionUnavailable
                : "",
          ]
            .filter(Boolean)
            .join(" "),
        );
        setChapter(content);
        setLoading(false);
        if (storedBook && storedPosition?.verseLabel) {
          const unit = content.verseUnits.find((item) => item.label === storedPosition.verseLabel);
          if (unit)
            requestAnimationFrame(() =>
              document.getElementById(`verse-${unit.order}`)?.scrollIntoView({ block: "center" }),
            );
        }
      } catch (cause) {
        if (active) {
          setBootError({
            code: cause instanceof AppError ? cause.code : "UNKNOWN",
            message: errorMessage(cause),
          });
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [services, bootAttempt]);

  useEffect(() => {
    let active = true;
    services.userStore.listBookmarks().then(
      (saved) => {
        if (active) setBookmarks(saved);
      },
      (cause) => {
        if (active)
          setBookmarkError(
            stringsRef.current.bookmarksLoadError.replace("{error}", errorMessage(cause)),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    let active = true;
    services.userStore.listHighlights().then(
      (saved) => {
        if (active) setHighlights(saved);
      },
      (cause) => {
        if (active)
          setNotice(stringsRef.current.highlightsLoadError.replace("{error}", errorMessage(cause)));
      },
    );
    return () => {
      active = false;
    };
  }, [services]);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      document.documentElement.classList.toggle(
        "dark",
        preferences.theme === "dark" || (preferences.theme === "system" && media.matches),
      );
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preferences.theme]);

  useEffect(() => {
    document.title =
      chapter && activeBook
        ? `${activeBook.name} ${chapter.chapterLabel} · ${en.appName}`
        : en.appName;
  }, [chapter, activeBook]);

  useEffect(() => {
    const viewport = passageRef.current;
    if (!viewport || !chapter) return;
    const chapterIntent = navigationIntent.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const queueVisiblePosition = () => {
      clearTimeout(timer);
      timer = undefined;
      flushPendingPosition.current = null;
      if (chapterIntent !== navigationIntent.current) return;
      const viewportTop = viewport.getBoundingClientRect().top;
      const visible = chapter.verseUnits.find((unit) => {
        const marker = document.getElementById(`verse-${unit.order}`);
        return marker && marker.getBoundingClientRect().bottom >= viewportTop;
      });
      if (!visible) return;
      positionQueue.current = positionQueue.current
        .catch(() => {})
        .then(() =>
          services.userStore.saveReadingPosition({
            editionId: chapter.editionId,
            bookCode: chapter.bookCode,
            chapterLabel: chapter.chapterLabel,
            verseLabel: visible.label,
            updatedAt: new Date().toISOString(),
          }),
        );
      void positionQueue.current.catch((cause) =>
        setNotice(stringsRef.current.positionSaveError.replace("{error}", errorMessage(cause))),
      );
    };
    const remember = () => {
      clearTimeout(timer);
      if (userWritesPaused.current) return;
      flushPendingPosition.current = queueVisiblePosition;
      timer = setTimeout(() => {
        if (userWritesPaused.current) return;
        queueVisiblePosition();
      }, 250);
    };
    viewport.addEventListener("scroll", remember, { passive: true });
    return () => {
      clearTimeout(timer);
      if (flushPendingPosition.current === queueVisiblePosition)
        flushPendingPosition.current = null;
      viewport.removeEventListener("scroll", remember);
    };
  }, [chapter, services, positionObserverRevision]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement;
      if (
        target.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]',
        )
      )
        return;
      if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        referenceRef.current?.focus();
      }
      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        setPanel("search");
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  async function safely(action: () => void) {
    if (await notes.save()) action();
    else setPendingAction(() => action);
  }

  function stayOnCurrentPassage() {
    setPendingAction(null);
    setPositionObserverRevision((value) => value + 1);
  }

  async function flushUserWrites(): Promise<boolean> {
    if (!(await notes.save())) return false;
    flushPendingPosition.current?.();
    let position: Promise<void>;
    let preferencesWrite: Promise<void>;
    do {
      position = positionQueue.current;
      preferencesWrite = preferenceQueue.current;
      await Promise.all([position, preferencesWrite]);
    } while (position !== positionQueue.current || preferencesWrite !== preferenceQueue.current);
    return true;
  }

  function pauseUserWrites() {
    userWritesPaused.current = true;
    notes.pauseForClose();
  }

  function resumeUserWrites() {
    notes.resumeAfterClose();
    userWritesPaused.current = false;
    flushPendingPosition.current?.();
  }

  async function navigate(key: ChapterKey, unitKeys: string[], intent: number) {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setReferenceError("");
    try {
      const next = await services.library.getChapter(key);
      if (currentRequest !== requestId.current || intent !== navigationIntent.current) return;
      setChapter(next);
      setSelectedKeys(unitKeys);
      setExtendSelection(false);
      setNavigationOpen(false);
      const book = books.find((candidate) => candidate.code === key.bookCode);
      setAnnouncement(
        strings.openedChapter
          .replace("{book}", book?.name ?? key.bookCode)
          .replace("{chapter}", key.chapterLabel),
      );
      const unit = next.verseUnits.find((candidate) => unitKeys.includes(candidate.key));
      if (!userWritesPaused.current) {
        positionQueue.current = positionQueue.current
          .catch(() => {})
          .then(() =>
            services.userStore.saveReadingPosition({
              ...key,
              verseLabel: unit?.label ?? next.verseUnits[0]?.label ?? null,
              updatedAt: new Date().toISOString(),
            }),
          );
        void positionQueue.current.catch((cause) =>
          setNotice(stringsRef.current.positionSaveError.replace("{error}", errorMessage(cause))),
        );
      }
      requestAnimationFrame(() => {
        if (currentRequest !== requestId.current || intent !== navigationIntent.current) return;
        if (unit) {
          const marker = document.getElementById(`verse-${unit.order}`);
          marker?.focus({ preventScroll: true });
          marker?.scrollIntoView({ block: "center" });
        } else {
          passageRef.current?.focus({ preventScroll: true });
          passageRef.current?.scrollTo({ top: 0 });
        }
      });
    } catch (cause) {
      if (currentRequest === requestId.current && intent === navigationIntent.current) {
        setNotice(errorMessage(cause));
        setPositionObserverRevision((value) => value + 1);
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function goToChapter(key: ChapterKey, unitKeys: string[] = [], closeNarrowPanel = false) {
    const intent = ++navigationIntent.current;
    void safely(() => {
      if (intent !== navigationIntent.current) return;
      void navigate(key, unitKeys, intent);
      if (closeNarrowPanel && window.matchMedia("(max-width: 1099px)").matches) setPanel(null);
    });
  }

  async function openReference(event: FormEvent) {
    event.preventDefault();
    await goToReference(referenceInput, true);
  }

  async function goToReference(input: string, fieldError = false) {
    if (!edition) return;
    const intent = ++navigationIntent.current;
    try {
      const target = await services.library.resolveReference(input, edition.id);
      if (intent !== navigationIntent.current) return;
      await safely(() => {
        if (intent === navigationIntent.current)
          void navigate(target.chapter, target.unitKeys, intent);
      });
      setReferenceError("");
    } catch (cause) {
      if (intent !== navigationIntent.current) return;
      if (fieldError) setReferenceError(errorMessage(cause));
      else setNotice(errorMessage(cause));
      setPositionObserverRevision((value) => value + 1);
    }
  }

  async function goToSourceReference(target: SourceReferenceTarget) {
    if (!edition) return;
    const intent = ++navigationIntent.current;
    try {
      const resolved = await resolveSourceTarget(target, edition.id, books, (key) =>
        services.library.getChapter(key),
      );
      if (intent !== navigationIntent.current) return;
      await safely(() => {
        if (intent === navigationIntent.current)
          void navigate(resolved.chapter, resolved.unitKeys, intent);
      });
    } catch (cause) {
      if (intent !== navigationIntent.current) return;
      setNotice(errorMessage(cause));
      setPositionObserverRevision((value) => value + 1);
    }
  }

  async function recoverCorruptDatabase() {
    if (!services.platform.recoverCorruptDatabase || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError("");
    try {
      const location = await services.platform.recoverCorruptDatabase();
      setRecoveryConfirmOpen(false);
      setRecoveryLocation(location);
      setBootAttempt((value) => value + 1);
    } catch (cause) {
      setRecoveryError(errorMessage(cause));
    } finally {
      setRecoveryBusy(false);
    }
  }

  async function runSearch(event: FormEvent) {
    event.preventDefault();
    if (!edition) return;
    const currentRequest = ++searchId.current;
    submittedSearch.current = null;
    setSearchError("");
    setSearching(true);
    try {
      const request = {
        editionId: edition.id,
        query: parseSearchQuery(query),
        ...(searchBook !== "all" ? { bookCode: searchBook } : {}),
      };
      const next = await services.library.search({ ...request, limit: 50, offset: 0 });
      if (currentRequest !== searchId.current) return;
      submittedSearch.current = request;
      setResults(next);
      setAnnouncement(
        (next.total === 1
          ? strings.searchResultAnnouncementSingular
          : strings.searchResultAnnouncementPlural
        ).replace("{count}", String(next.total)),
      );
    } catch (cause) {
      if (currentRequest === searchId.current) {
        setResults(null);
        setSearchError(errorMessage(cause));
      }
    } finally {
      if (currentRequest === searchId.current) setSearching(false);
    }
  }

  async function loadMoreResults() {
    const request = submittedSearch.current;
    if (!request || !results?.hasMore || searching) return;
    const currentRequest = ++searchId.current;
    const offset = results.items.length;
    setSearchError("");
    setSearching(true);
    try {
      const page = await services.library.search({ ...request, limit: 50, offset });
      if (currentRequest !== searchId.current) return;
      setResults((previous) =>
        previous && previous.items.length === offset
          ? { items: [...previous.items, ...page.items], total: page.total, hasMore: page.hasMore }
          : previous,
      );
      setAnnouncement(
        strings.searchPageAnnouncement
          .replace("{shown}", String(Math.min(offset + page.items.length, page.total)))
          .replace("{total}", String(page.total)),
      );
    } catch (cause) {
      if (currentRequest === searchId.current) setSearchError(errorMessage(cause));
    } finally {
      if (currentRequest === searchId.current) setSearching(false);
    }
  }

  function clearStaleSearch() {
    ++searchId.current;
    submittedSearch.current = null;
    setResults(null);
    setSearchError("");
    setSearching(false);
  }

  function selectUnit(key: string, extend: boolean) {
    if (!chapter) return;
    if ((extend || extendSelection) && selectedKeys.length) {
      const first = chapter.verseUnits.findIndex((unit) => unit.key === selectedKeys[0]);
      const last = chapter.verseUnits.findIndex((unit) => unit.key === key);
      setSelectedKeys(
        chapter.verseUnits
          .slice(Math.min(first, last), Math.max(first, last) + 1)
          .map((unit) => unit.key),
      );
    } else setSelectedKeys(selectedKeys.length === 1 && selectedKeys[0] === key ? [] : [key]);
    setExtendSelection(false);
  }

  function adjacentChapter(direction: -1 | 1) {
    if (!chapter) return null;
    const chapters = books.flatMap((book) =>
      book.chapters.map((chapterLabel) => ({
        editionId: book.editionId,
        bookCode: book.code,
        chapterLabel,
      })),
    );
    const index = chapters.findIndex(
      (candidate) =>
        candidate.bookCode === chapter.bookCode && candidate.chapterLabel === chapter.chapterLabel,
    );
    return chapters[index + direction] ?? null;
  }

  async function copySelection() {
    if (!edition || !selectedUnits.length) return;
    const text = `${selectedUnits.map((unit) => `${unit.label} ${unit.textPlain}`).join("\n")}\n\n${selectedReference} · ${edition.abbreviation}\n${edition.attribution}`;
    try {
      await services.platform.copyText(text);
      setFailedCopy(null);
      setAnnouncement(strings.selectedVersesCopied);
      setNotice(strings.copyAttributionNotice);
    } catch (cause) {
      setFailedCopy({ text, error: errorMessage(cause) });
      setNotice(strings.copyFailedNotice);
    }
  }

  function changePreferences(patch: Partial<Preferences>) {
    if (!preferencesReady) return;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    preferenceQueue.current = preferenceQueue.current
      .catch(() => {})
      .then(() => services.userStore.savePreferences(next));
    void preferenceQueue.current.catch((cause) =>
      setNotice(stringsRef.current.preferencesSaveError.replace("{error}", errorMessage(cause))),
    );
  }

  function newNote(linked: boolean) {
    if (linked && (!edition || !chapter || !activeBook)) return;
    void safely(() => {
      try {
        notes.create(
          linked && edition && chapter && activeBook
            ? createVerseAnchor(edition, chapter, selectedKeys, activeBook.name)
            : null,
        );
        setPanel("notes");
      } catch (cause) {
        setNotice(errorMessage(cause));
      }
    });
  }

  async function addBookmark() {
    if (!edition || !chapter || !activeBook || !selectedKeys.length || bookmarkBusy) return;
    setBookmarkBusy(true);
    setBookmarkError("");
    try {
      const anchor = createVerseAnchor(edition, chapter, selectedKeys, activeBook.name);
      const now = new Date().toISOString();
      const saved = await services.userStore.saveBookmark({
        id: crypto.randomUUID(),
        anchor,
        label: "",
        createdAt: now,
        updatedAt: now,
      });
      setBookmarks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setPanel("bookmarks");
      setAnnouncement(
        strings.bookmarkedReference.replace("{reference}", saved.anchor.displayReferenceSnapshot),
      );
    } catch (cause) {
      setBookmarkError(strings.bookmarkSaveError.replace("{error}", errorMessage(cause)));
      setPanel("bookmarks");
    } finally {
      setBookmarkBusy(false);
    }
  }

  async function colorSelection(colorToken: HighlightColor | null) {
    if (!edition || !chapter || !activeBook || selectedUnits.length === 0 || highlightBusy) return;
    setHighlightBusy(true);
    try {
      const matching = selectedUnits.map((unit) =>
        highlights.find((item) => item.anchor.unitKeys[0] === unit.key),
      );
      if (colorToken) {
        const now = new Date().toISOString();
        const records = selectedUnits.map((unit, index) => {
          const previous = matching[index];
          return {
            id: previous?.id ?? crypto.randomUUID(),
            anchor:
              previous && anchorMatchesChapter(previous.anchor, edition, chapter)
                ? previous.anchor
                : createVerseAnchor(edition, chapter, [unit.key], activeBook.name),
            colorToken,
            createdAt: previous?.createdAt ?? now,
            updatedAt: now,
          } satisfies Highlight;
        });
        const saved = await services.userStore.saveHighlights(records);
        const savedIds = new Set(saved.map((item) => item.id));
        setHighlights((current) => [...current.filter((item) => !savedIds.has(item.id)), ...saved]);
        setAnnouncement(
          (selectedUnits.length === 1
            ? strings.highlightedUnitSingular
            : strings.highlightedUnitPlural
          )
            .replace("{count}", String(selectedUnits.length))
            .replace("{color}", strings[colorToken]),
        );
      } else {
        const ids = matching.flatMap((item) => (item ? [item.id] : []));
        if (ids.length) await services.userStore.deleteHighlights(ids);
        const removed = new Set(ids);
        setHighlights((current) => current.filter((item) => !removed.has(item.id)));
        setAnnouncement(strings.highlightsRemoved);
      }
    } catch (cause) {
      setNotice(strings.highlightsChangeError.replace("{error}", errorMessage(cause)));
    } finally {
      setHighlightBusy(false);
    }
  }

  async function saveBookmarkLabel(bookmark: Bookmark, label: string): Promise<boolean> {
    if (bookmarkBusy) return false;
    setBookmarkBusy(true);
    setBookmarkError("");
    try {
      const saved = await services.userStore.saveBookmark({
        ...bookmark,
        label,
        updatedAt: new Date().toISOString(),
      });
      setBookmarks((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      setAnnouncement(strings.bookmarkLabelSaved);
      return true;
    } catch (cause) {
      setBookmarkError(strings.bookmarkLabelSaveError.replace("{error}", errorMessage(cause)));
      return false;
    } finally {
      setBookmarkBusy(false);
    }
  }

  async function removeBookmark() {
    const target = deleteBookmarkTarget;
    if (!target || bookmarkBusy) return;
    setBookmarkBusy(true);
    setBookmarkError("");
    try {
      await services.userStore.deleteBookmark(target.id);
      setBookmarks((current) => current.filter((item) => item.id !== target.id));
      setDeleteBookmarkTarget(null);
      setAnnouncement(strings.bookmarkRemoved);
    } catch (cause) {
      setBookmarkError(strings.bookmarkRemoveError.replace("{error}", errorMessage(cause)));
      setDeleteBookmarkTarget(null);
    } finally {
      setBookmarkBusy(false);
    }
  }

  async function openBookmark(bookmark: Bookmark) {
    if (
      !edition ||
      bookmark.anchor.editionId !== edition.id ||
      bookmark.anchor.versificationId !== edition.versificationId
    ) {
      setBookmarkError(strings.bookmarkEditionMissing);
      return;
    }
    const intent = ++navigationIntent.current;
    const key = {
      editionId: bookmark.anchor.editionId,
      bookCode: bookmark.anchor.start.bookCode,
      chapterLabel: bookmark.anchor.start.chapterLabel,
    };
    try {
      const content = await services.library.getChapter(key);
      if (intent !== navigationIntent.current) return;
      const exact = anchorMatchesContent(bookmark.anchor, edition, content);
      await safely(() => {
        if (intent !== navigationIntent.current) return;
        setBookmarkError(exact ? "" : strings.bookmarkPassageChanged);
        void navigate(key, exact ? bookmark.anchor.unitKeys : [], intent);
        if (window.matchMedia("(max-width: 1099px)").matches) setPanel(null);
      });
    } catch (cause) {
      if (intent === navigationIntent.current)
        setBookmarkError(strings.bookmarkPassageMissing.replace("{error}", errorMessage(cause)));
    }
  }

  async function openNotePassage(anchor: VerseAnchor) {
    if (!edition || anchor.editionId !== edition.id) {
      setNotice(strings.noteEditionMissing);
      return;
    }
    if (anchor.versificationId !== edition.versificationId) {
      setNotice(strings.noteVersificationChanged);
      return;
    }
    const intent = ++navigationIntent.current;
    const key = {
      editionId: anchor.editionId,
      bookCode: anchor.start.bookCode,
      chapterLabel: anchor.start.chapterLabel,
    };
    try {
      const content = await services.library.getChapter(key);
      if (intent !== navigationIntent.current) return;
      const exact = anchorMatchesContent(anchor, edition, content);
      await safely(() => {
        if (intent !== navigationIntent.current) return;
        if (!exact) setNotice(strings.notePassageChanged);
        void navigate(key, exact ? anchor.unitKeys : [], intent);
        if (window.matchMedia("(max-width: 1099px)").matches) setPanel(null);
      });
    } catch (cause) {
      if (intent === navigationIntent.current)
        setNotice(strings.notePassageMissing.replace("{error}", errorMessage(cause)));
    }
  }

  async function attachNotePassage(noteId: string, input: string) {
    if (!edition || notes.draft?.id !== noteId)
      throw new AppError("NOTE_UNAVAILABLE", strings.noteNoLongerOpen);
    const target = await services.library.resolveReference(input, edition.id);
    if (target.unitKeys.length === 0)
      throw new AppError("REFERENCE_INVALID", strings.verseLabelRequired);
    const content = await services.library.getChapter(target.chapter);
    const book = books.find((item) => item.code === target.chapter.bookCode);
    if (!book) throw new AppError("CONTENT_UNAVAILABLE", strings.bookUnavailable);
    const anchor = createVerseAnchor(edition, content, target.unitKeys, book.name);
    if (!notes.edit({ anchor }, noteId))
      throw new AppError("NOTE_CHANGED", strings.noteChangedDuringLink);
  }

  function renderLibrary() {
    return (
      <>
        <div className="sidebar-section-label">{strings.library}</div>
        <nav className="main-navigation" aria-label={strings.workspace}>
          <Button
            variant="ghost"
            className={panel === null ? "nav-item active" : "nav-item"}
            onClick={() => {
              void safely(() => {
                setPanel(null);
                setNavigationOpen(false);
              });
            }}
          >
            <BookOpen size={18} aria-hidden="true" />
            {strings.readBible}
          </Button>
          <Button
            variant="ghost"
            className={panel === "search" ? "nav-item active" : "nav-item"}
            onClick={() => {
              void safely(() => {
                setPanel("search");
                setNavigationOpen(false);
              });
            }}
          >
            <Search size={18} aria-hidden="true" />
            {strings.searchScripture}
          </Button>
          <Button
            variant="ghost"
            className={panel === "notes" ? "nav-item active" : "nav-item"}
            onClick={() => {
              setPanel("notes");
              setNavigationOpen(false);
            }}
          >
            <FileText size={18} aria-hidden="true" />
            {strings.notes}
            <span className="nav-count">{notes.notes.length}</span>
          </Button>
          <Button
            variant="ghost"
            className={panel === "bookmarks" ? "nav-item active" : "nav-item"}
            onClick={() => {
              void safely(() => {
                setPanel("bookmarks");
                setNavigationOpen(false);
              });
            }}
          >
            <BookmarkIcon size={18} aria-hidden="true" />
            {strings.bookmarks}
            <span className="nav-count">{bookmarks.length}</span>
          </Button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">{strings.booksAndChapters}</div>
        <nav className="book-navigation" aria-label={strings.bookAndChapter}>
          {books.map((book) => (
            <div key={book.code} className="book-group">
              <Button
                variant="ghost"
                className={`book-name ${chapter?.bookCode === book.code ? "current-book" : ""}`}
                onClick={() => {
                  const label = book.chapters[0];
                  if (label)
                    goToChapter({
                      editionId: book.editionId,
                      bookCode: book.code,
                      chapterLabel: label,
                    });
                }}
              >
                <BookOpen size={15} aria-hidden="true" />
                <span lang={edition?.languageTag}>{book.name}</span>
              </Button>
              {chapter?.bookCode === book.code && (
                <div className="chapter-grid">
                  {book.chapters.map((chapterLabel) => (
                    <Button
                      variant="ghost"
                      className={
                        chapter.chapterLabel === chapterLabel
                          ? "chapter-button selected"
                          : "chapter-button"
                      }
                      key={chapterLabel}
                      aria-label={strings.bookChapterLabel
                        .replace("{book}", book.name)
                        .replace("{chapter}", chapterLabel)}
                      aria-current={chapter.chapterLabel === chapterLabel ? "page" : undefined}
                      onClick={() => {
                        goToChapter({
                          editionId: book.editionId,
                          bookCode: book.code,
                          chapterLabel,
                        });
                      }}
                    >
                      {chapterLabel}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="edition-mark">
            <Leaf size={18} aria-hidden="true" />
            <span>{edition?.abbreviation ?? strings.localLibrary}</span>
          </div>
          <p>
            {edition?.title ??
              (bootError
                ? bootError.code === "STORAGE_CORRUPT" || bootError.code === "STORAGE_IN_USE"
                  ? strings.personalDataUnavailable
                  : strings.contentUnavailable
                : strings.loadingLibrary)}
          </p>
          <div className="offline-label">
            <span className="status-dot" />
            {strings.availableOffline}
          </div>
        </div>
      </>
    );
  }

  const previous = adjacentChapter(-1);
  const next = adjacentChapter(1);

  return (
    <div className="app-shell" inert={closeGuard.active}>
      <a
        href="#passage"
        className="skip-link"
        onClick={(event) => {
          if (!singlePane || !panel) return;
          event.preventDefault();
          setPanel(null);
          requestAnimationFrame(() => passageRef.current?.focus());
        }}
      >
        {strings.skipToReading}
      </a>
      <aside className="sidebar desktop-sidebar" aria-label={strings.librarySidebar}>
        <div className="brand">
          <div className="brand-icon">
            <BookOpen size={23} aria-hidden="true" />
          </div>
          <div>
            <strong>Afaan Oromo</strong>
            <span>{strings.bibleReader}</span>
          </div>
        </div>
        {renderLibrary()}
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <Button
            variant="ghost"
            size="icon"
            className="mobile-menu"
            onClick={() => setNavigationOpen(true)}
            aria-label={strings.openLibraryNavigation}
          >
            <List size={21} />
          </Button>
          <form
            className="reference-form"
            onSubmit={(event) => {
              void openReference(event);
            }}
          >
            <BookOpen size={17} aria-hidden="true" />
            <Input
              ref={referenceRef}
              aria-label={strings.openReference}
              aria-invalid={!!referenceError}
              aria-describedby={referenceError ? "reference-error" : undefined}
              placeholder={
                books[0]
                  ? `${strings.goToPassage} · ${books[0].code} ${books[0].chapters[0]}:1`
                  : strings.goToPassage
              }
              value={referenceInput}
              onChange={(event) => setReferenceInput(event.target.value)}
            />
            <Button variant="ghost" size="sm" type="submit">
              {strings.go}
              <ArrowRight size={14} aria-hidden="true" />
            </Button>
          </form>
          <div className="toolbar-actions">
            <span className="local-badge">
              <ShieldCheck size={14} aria-hidden="true" />
              {strings.offlinePrivate}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.aboutContent}
              onClick={() => setAboutOpen(true)}
            >
              <Info size={19} aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.appearance}
              data-dialog-focus-fallback
              disabled={!preferencesReady}
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 size={19} />
            </Button>
          </div>
        </header>
        {referenceError && (
          <div role="alert" className="inline-alert" id="reference-error">
            {referenceError}
          </div>
        )}
        {notice && (
          <div className="notice" role="status" aria-label={notice}>
            <span>{notice}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.dismissMessage}
              onClick={() => setNotice("")}
            >
              <X size={15} />
            </Button>
          </div>
        )}
        <div className={`content-grid ${panel ? "has-panel" : ""}`}>
          <main
            ref={passageRef}
            id="passage"
            tabIndex={-1}
            className="reader-workspace"
            aria-busy={loading}
          >
            {bootError ? (
              <div className="empty-state">
                <BookOpen size={36} aria-hidden="true" />
                <h1>
                  {bootError.code === "STORAGE_CORRUPT" || bootError.code === "STORAGE_IN_USE"
                    ? strings.personalDataUnavailable
                    : strings.contentUnavailable}
                </h1>
                <p role="alert">{bootError.message}</p>
                {bootError.code === "STORAGE_IN_USE" ? (
                  <p className="muted">{strings.storageInUseHelp}</p>
                ) : bootError.code === "STORAGE_CORRUPT" ? (
                  <p className="muted">{strings.storageCorruptHelp}</p>
                ) : (
                  <p className="muted">{strings.recordsNotReset}</p>
                )}
                <Button variant="outline" onClick={() => setBootAttempt((value) => value + 1)}>
                  {strings.tryOpeningAgain}
                </Button>
                {bootError.code === "STORAGE_CORRUPT" &&
                  services.platform.recoverCorruptDatabase && (
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setRecoveryError("");
                        setRecoveryConfirmOpen(true);
                      }}
                    >
                      {strings.archiveUnreadableAction}
                    </Button>
                  )}
              </div>
            ) : !chapter || !edition ? (
              <div className="empty-state">
                <LoaderCircle className="spin" size={26} aria-hidden="true" />
                <p>{strings.openingReadingSpace}</p>
              </div>
            ) : (
              <>
                <div className="reader-context">
                  <span>
                    <BookOpen size={15} aria-hidden="true" />
                    {edition.abbreviation}
                    <span className="context-divider">/</span>
                    <span lang={edition.languageTag}>{activeBook?.name}</span>
                  </span>
                  <span className="small muted">
                    {strings.sourceVerseUnits.replace("{count}", String(chapter.verseUnits.length))}
                  </span>
                </div>
                <article
                  className={`reading-column reading-width-${preferences.width}`}
                  style={
                    {
                      "--reader-font-size": `${preferences.fontSizePx}px`,
                      "--reader-line-height": preferences.lineHeight,
                    } as CSSProperties
                  }
                >
                  <div className="chapter-heading">
                    <div className="eyebrow" lang={edition.languageTag}>
                      {activeBook?.name}
                    </div>
                    <h1>
                      {strings.chapter} {chapter.chapterLabel}
                    </h1>
                    <div className="heading-rule" />
                  </div>
                  {edition.isSynthetic && (
                    <aside className="fixture-banner">
                      <span className="fixture-tag">{strings.developmentPreview}</span>
                      <strong>{en.fixtureNotice}</strong>
                      <p>{en.fixtureDetail}</p>
                    </aside>
                  )}
                  {edition.technicalReviewOnly && (
                    <aside className="fixture-banner" role="note">
                      <span className="fixture-tag">{strings.developmentPreview}</span>
                      <strong>{en.technicalReviewNotice}</strong>
                      <p>{en.technicalReviewDetail}</p>
                    </aside>
                  )}
                  <ReaderContent
                    chapter={chapter}
                    strings={strings}
                    selectedKeys={selectedKeys}
                    highlightColors={highlightColors}
                    onSelect={selectUnit}
                    languageTag={edition.languageTag}
                    bookName={activeBook?.name ?? chapter.bookCode}
                    onNavigate={(target) => {
                      void goToSourceReference(target);
                    }}
                  />
                  <div className="chapter-end">
                    <span />
                    <Leaf size={17} aria-hidden="true" />
                    <span />
                  </div>
                  <nav aria-label={strings.adjacentChapter} className="chapter-pagination">
                    <Button
                      variant="outline"
                      disabled={!previous || loading}
                      onClick={() => {
                        if (previous) goToChapter(previous);
                      }}
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                      {strings.previousChapter}
                    </Button>
                    <span className="muted small">
                      {activeBook?.name} {chapter.chapterLabel}
                    </span>
                    <Button
                      variant="outline"
                      disabled={!next || loading}
                      onClick={() => {
                        if (next) goToChapter(next);
                      }}
                    >
                      {strings.nextChapter}
                      <ChevronRight size={16} aria-hidden="true" />
                    </Button>
                  </nav>
                  <p className="attribution">{edition.attribution}</p>
                </article>
              </>
            )}
          </main>
          {panel && (
            <div
              className="study-panel"
              role={singlePane ? "main" : "complementary"}
              aria-label={
                panel === "notes"
                  ? strings.personalNotes
                  : panel === "bookmarks"
                    ? strings.savedBookmarks
                    : strings.scriptureSearch
              }
            >
              <div className="panel-heading">
                <div>
                  <div className="eyebrow">{strings.yourReadingSpace}</div>
                  {singlePane ? (
                    <h1>
                      {panel === "notes"
                        ? strings.notes
                        : panel === "bookmarks"
                          ? strings.bookmarks
                          : strings.searchScripture}
                    </h1>
                  ) : (
                    <h2>
                      {panel === "notes"
                        ? strings.notes
                        : panel === "bookmarks"
                          ? strings.bookmarks
                          : strings.searchScripture}
                    </h2>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={strings.closeStudyPanel}
                  onClick={() => {
                    void safely(() => setPanel(null));
                  }}
                >
                  <X size={19} />
                </Button>
              </div>
              <Button
                className="mobile-back"
                variant="ghost"
                onClick={() => {
                  void safely(() => setPanel(null));
                }}
              >
                <ArrowLeft size={15} aria-hidden="true" />
                {strings.backToReading}
              </Button>
              {panel === "search" ? (
                <SearchPanel
                  editionLabel={edition?.abbreviation ?? strings.yourEdition}
                  strings={strings}
                  languageTag={edition?.languageTag ?? "en"}
                  books={books}
                  query={query}
                  setQuery={(value) => {
                    setQuery(value);
                    clearStaleSearch();
                  }}
                  book={searchBook}
                  setBook={(value) => {
                    setSearchBook(value);
                    clearStaleSearch();
                  }}
                  searching={searching}
                  error={searchError}
                  results={results}
                  onSubmit={(event) => {
                    void runSearch(event);
                  }}
                  onLoadMore={() => {
                    void loadMoreResults();
                  }}
                  onOpen={(result) => {
                    goToChapter(
                      {
                        editionId: result.editionId,
                        bookCode: result.bookCode,
                        chapterLabel: result.chapterLabel,
                      },
                      [result.unitKey],
                      true,
                    );
                  }}
                />
              ) : panel === "bookmarks" ? (
                <BookmarksPanel
                  strings={strings}
                  bookmarks={bookmarks}
                  edition={edition}
                  busy={bookmarkBusy}
                  error={bookmarkError}
                  onOpen={(bookmark) => {
                    void openBookmark(bookmark);
                  }}
                  onSaveLabel={saveBookmarkLabel}
                  onDelete={setDeleteBookmarkTarget}
                />
              ) : (
                <NotesPanel
                  workspace={notes}
                  edition={edition}
                  strings={strings}
                  uiLocale={preferences.uiLocale}
                  onCreate={() => newNote(false)}
                  onOpen={(note) => {
                    void safely(() => notes.open(note));
                  }}
                  onDelete={() => {
                    setDeleteFailed(false);
                    setDeleteOpen(true);
                  }}
                  onOpenPassage={(anchor) => {
                    void openNotePassage(anchor);
                  }}
                  onAttachPassage={attachNotePassage}
                  onCopyDraft={(text) => services.platform.copyText(text)}
                />
              )}
            </div>
          )}
        </div>
        {selectedUnits.length > 0 && (
          <section className="selection-toolbar" aria-label={strings.selectedVerseActions}>
            <div>
              <strong>{selectedReference}</strong>
              <span>
                {(selectedUnits.length === 1
                  ? strings.selectedVerseUnit
                  : strings.selectedVerseUnits
                ).replace("{count}", String(selectedUnits.length))}
              </span>
            </div>
            <Button
              variant="ghost"
              aria-pressed={extendSelection}
              onClick={() => setExtendSelection((value) => !value)}
            >
              {extendSelection ? strings.chooseRangeEnd : strings.extendRange}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                void copySelection();
              }}
            >
              <Copy size={15} aria-hidden="true" />
              {strings.copy}
            </Button>
            <Button onClick={() => newNote(true)}>
              <Feather size={15} aria-hidden="true" />
              {strings.addNote}
            </Button>
            <Button
              variant="outline"
              disabled={bookmarkBusy}
              onClick={() => {
                void addBookmark();
              }}
            >
              <BookmarkIcon size={15} aria-hidden="true" />
              {strings.bookmark}
            </Button>
            <div className="highlight-actions" role="group" aria-label={strings.highlightColor}>
              {(["yellow", "green", "blue", "rose"] as const).map((color) => (
                <Button
                  key={color}
                  variant="outline"
                  disabled={highlightBusy}
                  aria-label={strings.highlightColorAction.replace("{color}", strings[color])}
                  aria-pressed={selectedUnits.every((unit) => highlightColors[unit.key] === color)}
                  onClick={() => {
                    void colorSelection(color);
                  }}
                >
                  <span
                    className={`highlight-swatch highlight-swatch-${color}`}
                    aria-hidden="true"
                  />
                  {strings[color]}
                </Button>
              ))}
              <Button
                variant="ghost"
                disabled={
                  highlightBusy ||
                  !selectedUnits.some((unit) =>
                    highlights.some((item) => item.anchor.unitKeys[0] === unit.key),
                  )
                }
                onClick={() => {
                  void colorSelection(null);
                }}
              >
                {strings.removeHighlight}
              </Button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label={strings.clearVerseSelection}
              onClick={() => {
                setSelectedKeys([]);
                setExtendSelection(false);
              }}
            >
              <X size={17} />
            </Button>
          </section>
        )}
        <footer className="statusbar">
          <span>
            <span className="status-dot" />
            {strings.allReadingOffline}
          </span>
          <span>{strings.thoughtfulReading}</span>
        </footer>
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>
      <Dialog open={navigationOpen} onOpenChange={setNavigationOpen}>
        <DialogContent closeLabel={strings.closeDialog} className="navigation-dialog">
          <DialogTitle>{strings.libraryDialogTitle}</DialogTitle>
          <DialogDescription>{strings.libraryDialogDescription}</DialogDescription>
          {renderLibrary()}
        </DialogContent>
      </Dialog>
      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        edition={edition}
        books={books}
        strings={strings}
      />
      <Dialog
        open={recoveryConfirmOpen}
        onOpenChange={(open) => {
          if (!recoveryBusy) setRecoveryConfirmOpen(open);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={!recoveryBusy}>
          <DialogTitle>{strings.archiveUnreadableTitle}</DialogTitle>
          <DialogDescription>{strings.archiveUnreadableDescription}</DialogDescription>
          {recoveryError && <p role="alert">{recoveryError}</p>}
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={recoveryBusy}
              onClick={() => setRecoveryConfirmOpen(false)}
            >
              {strings.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={recoveryBusy}
              onClick={() => void recoverCorruptDatabase()}
            >
              {recoveryBusy ? strings.archiving : strings.archiveCreateEmpty}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={recoveryLocation !== null} onOpenChange={() => {}}>
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={false}>
          <DialogTitle>{strings.personalDatabaseReady}</DialogTitle>
          <DialogDescription>
            {strings.archivedAt.replace("{location}", recoveryLocation ?? "")}
          </DialogDescription>
          <Button
            onClick={() => {
              setRecoveryLocation(null);
              setSettingsOpen(true);
            }}
          >
            {strings.openBackupControls}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={failedCopy !== null}
        onOpenChange={(open) => {
          if (!open) setFailedCopy(null);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog}>
          <DialogTitle>{strings.manualCopyTitle}</DialogTitle>
          <DialogDescription>
            {strings.manualCopyDescription.replace("{error}", failedCopy?.error ?? "")}
          </DialogDescription>
          <Textarea
            className="manual-copy-text"
            aria-label={strings.manualCopyLabel}
            lang={edition?.languageTag}
            readOnly
            value={failedCopy?.text ?? ""}
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button variant="outline" onClick={() => setFailedCopy(null)}>
            {strings.close}
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent closeLabel={strings.closeDialog}>
          <DialogTitle>{strings.settingsTitle}</DialogTitle>
          <DialogDescription>{strings.settingsDescription}</DialogDescription>
          <div className="settings-content">
            <SelectField
              label={strings.interfaceLanguage}
              id="ui-locale-setting"
              value={preferences.uiLocale}
              onValueChange={(value) =>
                changePreferences({ uiLocale: value as Preferences["uiLocale"] })
              }
              options={[
                { value: "en", label: strings.english },
                {
                  value: "om",
                  label: oromoCatalogComplete ? strings.oromoOptionLabel : strings.oromoFallback,
                },
              ]}
            />
            <p className="field-help" role="status">
              {preferences.uiLocale === "om"
                ? oromoCatalogComplete
                  ? strings.oromoDescription
                  : strings.oromoFallbackDescription
                : oromoCatalogComplete
                  ? strings.englishDescription
                  : strings.englishFallbackDescription}
            </p>
            <SelectField
              label={strings.appearanceLabel}
              id="theme-setting"
              value={preferences.theme}
              onValueChange={(value) => changePreferences({ theme: value as Preferences["theme"] })}
              options={[
                { value: "system", label: strings.followSystem },
                { value: "light", label: strings.light },
                { value: "dark", label: strings.dark },
              ]}
            />
            <div className="field">
              <label>{strings.scriptureTextSize}</label>
              <div className="font-control">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={strings.decreaseTextSize}
                  disabled={preferences.fontSizePx <= 16}
                  onClick={() =>
                    changePreferences({ fontSizePx: Math.max(16, preferences.fontSizePx - 2) })
                  }
                >
                  <Minus size={16} />
                </Button>
                <output aria-live="polite">{preferences.fontSizePx} px</output>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={strings.increaseTextSize}
                  disabled={preferences.fontSizePx >= 32}
                  onClick={() =>
                    changePreferences({ fontSizePx: Math.min(32, preferences.fontSizePx + 2) })
                  }
                >
                  <Plus size={16} />
                </Button>
                <span
                  className="font-preview"
                  aria-hidden="true"
                  style={{ fontSize: preferences.fontSizePx }}
                >
                  Aa
                </span>
              </div>
            </div>
            <SelectField
              id="line-height-setting"
              label={strings.lineSpacing}
              value={String(preferences.lineHeight)}
              onValueChange={(value) =>
                changePreferences({ lineHeight: Number(value) as Preferences["lineHeight"] })
              }
              options={[
                { value: "1.4", label: strings.compact },
                { value: "1.65", label: strings.comfortable },
                { value: "1.9", label: strings.relaxed },
              ]}
            />
            <SelectField
              id="reading-width-setting"
              label={strings.readingWidth}
              value={preferences.width}
              onValueChange={(value) => changePreferences({ width: value as Preferences["width"] })}
              options={[
                { value: "comfortable", label: strings.comfortable },
                { value: "wide", label: strings.wide },
              ]}
            />
            <div className="settings-edition">
              <div className="eyebrow">{strings.contentInformation}</div>
              <strong>{edition?.title}</strong>
              <p>{edition?.attribution}</p>
              <p>{edition?.licenseNotice}</p>
            </div>
            <BackupControls
              services={services}
              strings={strings}
              uiLocale={preferences.uiLocale}
              flushWrites={flushUserWrites}
              pauseWrites={pauseUserWrites}
              resumeWrites={resumeUserWrites}
              writesBusy={bookmarkBusy || highlightBusy || deleteBusy}
            />
          </div>
          <DialogClose asChild>
            <Button variant="outline">{strings.done}</Button>
          </DialogClose>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteBookmarkTarget !== null}
        onOpenChange={(open) => {
          if (!open && !bookmarkBusy) setDeleteBookmarkTarget(null);
        }}
      >
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={!bookmarkBusy}>
          <DialogTitle>{strings.removeBookmarkTitle}</DialogTitle>
          <DialogDescription>
            {strings.removeBookmarkDescription.replace(
              "{reference}",
              deleteBookmarkTarget?.anchor.displayReferenceSnapshot ?? "",
            )}
          </DialogDescription>
          <div className="dialog-actions">
            <Button
              variant="outline"
              disabled={bookmarkBusy}
              onClick={() => setDeleteBookmarkTarget(null)}
            >
              {strings.cancel}
            </Button>
            <Button
              variant="destructive"
              disabled={bookmarkBusy}
              onClick={() => {
                void removeBookmark();
              }}
            >
              {strings.removeBookmark}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deleteBusy) {
            setDeleteOpen(open);
            if (!open) setDeleteFailed(false);
          }
        }}
      >
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={!deleteBusy}>
          <DialogTitle>{strings.deleteNoteTitle}</DialogTitle>
          <DialogDescription>
            {strings.deleteNoteDescription.replace(
              "{title}",
              notes.draft ? noteTitle(notes.draft, strings) : strings.thisNote,
            )}
          </DialogDescription>
          {deleteFailed && (
            <p className="error-box" role="alert">
              {strings.noteDeleteFailed.replace("{error}", notes.error || strings.couldNotSave)}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="outline" disabled={deleteBusy} onClick={() => setDeleteOpen(false)}>
              {strings.keepNote}
            </Button>
            <Button
              variant="destructive"
              disabled={deleteBusy}
              onClick={() => {
                setDeleteBusy(true);
                void notes
                  .remove()
                  .then((success) => {
                    if (success) setDeleteOpen(false);
                    else setDeleteFailed(true);
                  })
                  .finally(() => setDeleteBusy(false));
              }}
            >
              {deleteBusy ? strings.deleting : strings.deleteNote}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open && !guardBusy) stayOnCurrentPassage();
        }}
      >
        <DialogContent closeLabel={strings.closeDialog} showCloseButton={!guardBusy}>
          <DialogTitle>{strings.unsavedNoteTitle}</DialogTitle>
          <DialogDescription>{strings.unsavedNoteDescription}</DialogDescription>
          <div className="dialog-actions">
            <Button variant="outline" disabled={guardBusy} onClick={stayOnCurrentPassage}>
              {strings.stayHere}
            </Button>
            <Button
              variant="ghost"
              disabled={guardBusy}
              onClick={() => {
                const action = pendingAction;
                setGuardBusy(true);
                void notes
                  .discard()
                  .then(() => {
                    setPendingAction(null);
                    action?.();
                  })
                  .finally(() => setGuardBusy(false));
              }}
            >
              {strings.discardChanges}
            </Button>
            <Button
              disabled={guardBusy}
              onClick={() => {
                setGuardBusy(true);
                void notes
                  .save()
                  .then((success) => {
                    if (success) {
                      const action = pendingAction;
                      setPendingAction(null);
                      action?.();
                    }
                  })
                  .finally(() => setGuardBusy(false));
              }}
            >
              {strings.retrySave}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={closeGuard.open}
        onOpenChange={(open) => {
          if (!open) closeGuard.cancel();
        }}
      >
        <DialogContent
          closeLabel={strings.closeDialog}
          showCloseButton={!closeGuard.busy}
          onEscapeKeyDown={(event) => {
            if (closeGuard.busy) event.preventDefault();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
        >
          <DialogTitle>{strings.closeUnsavedTitle}</DialogTitle>
          <DialogDescription>{strings.closeUnsavedDescription}</DialogDescription>
          {closeGuard.error && (
            <p role="alert" className="text-error">
              {closeGuard.error} {notes.error}
            </p>
          )}
          <div className="dialog-actions">
            <Button variant="outline" disabled={closeGuard.busy} onClick={closeGuard.cancel}>
              {strings.cancel}
            </Button>
            <Button
              variant="ghost"
              disabled={closeGuard.busy}
              onClick={() => {
                void closeGuard.discardAndClose();
              }}
            >
              {strings.discardChanges}
            </Button>
            <Button
              disabled={closeGuard.busy}
              onClick={() => {
                void closeGuard.saveAndClose();
              }}
            >
              {closeGuard.busy ? strings.closing : strings.saveAndClose}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
