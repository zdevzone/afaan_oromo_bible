import { useCallback, useEffect, useRef, useState } from "react";
import type { AppServices } from "../../domain/ports";
import type { Note, VerseAnchor } from "../../domain/notes";

const fingerprint = (note: Note) => JSON.stringify([note.title, note.bodyText, note.anchor]);
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Your note could not be saved. Keep your draft and try again.";

/** The editor buffer and committed records stay separate until persistence acknowledges a save. */
export function useNoteWorkspace(services: AppServices) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraftState] = useState<Note | null>(null);
  const [status, setStatus] = useState<"idle" | "unsaved" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [closePaused, setClosePaused] = useState(false);
  const draftRef = useRef<Note | null>(null);
  const committed = useRef(new Map<string, Note>());
  const queue = useRef<Promise<boolean>>(Promise.resolve(true));
  const deleting = useRef(false);
  const generations = useRef(new Map<string, number>());
  const closePausedRef = useRef(false);
  const autosaveEpoch = useRef(0);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mutation = useRef<Promise<boolean> | null>(null);

  const updateDraft = useCallback((note: Note | null) => {
    draftRef.current = note;
    setDraftState(note);
  }, []);

  const hasUnsavedChanges = useCallback(() => {
    const current = draftRef.current;
    if (!current) return false;
    const saved = committed.current.get(current.id);
    return saved
      ? fingerprint(current) !== fingerprint(saved)
      : !!(current.title.trim() || current.bodyText.trim());
  }, []);

  const pauseForClose = useCallback(() => {
    closePausedRef.current = true;
    autosaveEpoch.current += 1;
    clearTimeout(autosaveTimer.current);
    autosaveTimer.current = undefined;
    setClosePaused(true);
  }, []);

  const resumeAfterClose = useCallback(() => {
    closePausedRef.current = false;
    setClosePaused(false);
  }, []);

  useEffect(() => {
    let active = true;
    services.userStore
      .listNotes()
      .then((records) => {
        if (!active) return;
        committed.current = new Map(records.map((note) => [note.id, note]));
        setNotes(records);
        setLoading(false);
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause));
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [services]);

  const save = useCallback(
    (automatic = false, epoch = autosaveEpoch.current): Promise<boolean> => {
      const requested = draftRef.current;
      if (!requested) return Promise.resolve(true);
      if (deleting.current) return Promise.resolve(false);
      if (automatic && (closePausedRef.current || epoch !== autosaveEpoch.current))
        return Promise.resolve(true);
      const generation = generations.current.get(requested.id) ?? 0;
      const operation = queue.current.then(async () => {
        // A close decision pauses queued automatic work without cancelling an explicit Save.
        if (automatic && (closePausedRef.current || epoch !== autosaveEpoch.current)) return true;
        // Discard/delete invalidates snapshots which have not reached the store yet.
        if ((generations.current.get(requested.id) ?? 0) !== generation) return true;
        // Coalesce queued edits into the latest buffer rather than committing stale text.
        const snapshot = draftRef.current?.id === requested.id ? draftRef.current : requested;
        const saved = committed.current.get(snapshot.id);
        if (saved && fingerprint(saved) === fingerprint(snapshot)) return true;
        if (!saved && !snapshot.title.trim() && !snapshot.bodyText.trim()) return true;
        setStatus("saving");
        try {
          const result = await services.userStore.saveNote({
            ...snapshot,
            revision: saved?.revision ?? 0,
            updatedAt: new Date().toISOString(),
          });
          committed.current.set(result.id, result);
          setNotes((records) =>
            [result, ...records.filter((note) => note.id !== result.id)].sort(
              (a, b) =>
                Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
            ),
          );
          if (draftRef.current?.id === result.id) {
            const current = draftRef.current;
            updateDraft({ ...current, revision: result.revision, updatedAt: result.updatedAt });
            setStatus(fingerprint(current) === fingerprint(result) ? "saved" : "unsaved");
          }
          setError("");
          return true;
        } catch (cause) {
          setError(message(cause));
          setStatus("error");
          return false;
        }
      });
      queue.current = operation;
      return operation;
    },
    [services, updateDraft],
  );

  const flush = useCallback(async () => {
    // A clean-looking editor can still have a delete/discard awaiting persistence.
    const pendingMutation = mutation.current;
    if (pendingMutation && !(await pendingMutation)) return false;
    const noteId = draftRef.current?.id;
    // Continue until the latest buffer is durable, including edits made during a save.
    while (noteId && draftRef.current?.id === noteId) {
      if (deleting.current) return false;
      if (!(await save())) return false;
      // Autosave may have added work while the explicit save was in flight.
      let tail: Promise<boolean>;
      do {
        tail = queue.current;
        if (!(await tail)) return false;
      } while (tail !== queue.current);
      if (draftRef.current?.id !== noteId) return true;
      const latest = draftRef.current;
      const saved = committed.current.get(noteId);
      if (saved && fingerprint(latest) === fingerprint(saved)) return true;
      if (!saved && !latest.title.trim() && !latest.bodyText.trim()) return true;
    }
    return queue.current;
  }, [save]);

  useEffect(() => {
    if (!draft || deleting.current || closePaused) return;
    const saved = committed.current.get(draft.id);
    if (saved && fingerprint(saved) === fingerprint(draft)) return;
    if (!saved && !draft.title.trim() && !draft.bodyText.trim()) return;
    const epoch = autosaveEpoch.current;
    const timer = setTimeout(() => {
      autosaveTimer.current = undefined;
      void save(true, epoch);
    }, 300);
    autosaveTimer.current = timer;
    return () => {
      clearTimeout(timer);
      if (autosaveTimer.current === timer) autosaveTimer.current = undefined;
    };
  }, [draft, save, closePaused]);

  const edit = (patch: Partial<Pick<Note, "title" | "bodyText" | "anchor">>) => {
    if (!draftRef.current || closePausedRef.current || deleting.current) return;
    updateDraft({ ...draftRef.current, ...patch });
    setStatus("unsaved");
  };

  const open = (note: Note) => {
    if (closePausedRef.current || deleting.current) return;
    updateDraft(committed.current.get(note.id) ?? note);
    setStatus("saved");
    setError("");
  };

  const create = (anchor: VerseAnchor | null = null) => {
    if (closePausedRef.current || deleting.current) return;
    const now = new Date().toISOString();
    updateDraft({
      id: crypto.randomUUID(),
      title: "",
      bodyText: "",
      anchor,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    });
    setStatus("idle");
    setError("");
  };

  const discard = async () => {
    // Finish an already-started mutation before replacing the editor buffer.
    if (mutation.current) await mutation.current;
    const current = draftRef.current;
    deleting.current = true;
    if (current)
      generations.current.set(current.id, (generations.current.get(current.id) ?? 0) + 1);
    const operation = (async () => {
      try {
        await queue.current;
        updateDraft(current ? (committed.current.get(current.id) ?? null) : null);
        setStatus(current && committed.current.has(current.id) ? "saved" : "idle");
        setError("");
        queue.current = Promise.resolve(true);
        return true;
      } finally {
        deleting.current = false;
      }
    })();
    mutation.current = operation;
    try {
      await operation;
    } finally {
      if (mutation.current === operation) mutation.current = null;
    }
  };

  const remove = async () => {
    if (closePausedRef.current || deleting.current) return false;
    const current = draftRef.current;
    if (!current) return true;
    deleting.current = true;
    generations.current.set(current.id, (generations.current.get(current.id) ?? 0) + 1);
    const operation = (async () => {
      try {
        await queue.current;
        if (committed.current.has(current.id)) await services.userStore.deleteNote(current.id);
        committed.current.delete(current.id);
        setNotes((records) => records.filter((note) => note.id !== current.id));
        updateDraft(null);
        setStatus("idle");
        setError("");
        queue.current = Promise.resolve(true);
        return true;
      } catch (cause) {
        setError(message(cause));
        setStatus("error");
        return false;
      } finally {
        deleting.current = false;
      }
    })();
    mutation.current = operation;
    try {
      return await operation;
    } finally {
      if (mutation.current === operation) mutation.current = null;
    }
  };

  const dirty = hasUnsavedChanges();

  useEffect(() => {
    if (!dirty || services.runtime !== "browser") return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, services.runtime]);

  return {
    notes,
    draft,
    status,
    error,
    loading,
    dirty,
    closePaused,
    hasUnsavedChanges,
    pauseForClose,
    resumeAfterClose,
    edit,
    open,
    create,
    save: flush,
    discard,
    remove,
  };
}
