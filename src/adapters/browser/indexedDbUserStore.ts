import {
  DEFAULT_PREFERENCES,
  bookmarkIdentity,
  validateBookmark,
  validateHighlight,
  validateNote,
  validatePreferences,
  validateReadingPosition,
} from "../../domain/notes";
import type { Bookmark, Highlight, Note, Preferences, ReadingPosition } from "../../domain/notes";
import type { UserStore } from "../../domain/ports";
import { AppError } from "../../domain/scripture";
import {
  createBackup,
  parseBackup,
  type PersonalSnapshot,
  type UserBackup,
} from "../../domain/backup";

const DEFAULT_DATABASE_NAME = "afaan-oromo-bible-development-v3";
const DATABASE_VERSION = 1;

interface BookmarkRecord {
  id: string;
  identity: string;
  bookmark: Bookmark;
}

interface HighlightRecord {
  id: string;
  unitKey: string;
  highlight: Highlight;
}

function decodeHighlightRecord(value: unknown): HighlightRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    !("unitKey" in value) ||
    !("highlight" in value) ||
    typeof value.id !== "string" ||
    typeof value.unitKey !== "string"
  )
    throw new AppError("STORAGE_INVALID", "A saved highlight is invalid. It was preserved.");
  validateHighlight(value.highlight);
  if (value.id !== value.highlight.id || value.unitKey !== value.highlight.anchor.unitKeys[0])
    throw new AppError("STORAGE_INVALID", "A saved highlight identity is inconsistent.");
  return { id: value.id, unitKey: value.unitKey, highlight: value.highlight };
}

function decodeBookmarkRecord(value: unknown): BookmarkRecord {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !("id" in value) ||
    !("identity" in value) ||
    !("bookmark" in value) ||
    typeof value.id !== "string" ||
    typeof value.identity !== "string"
  ) {
    throw new AppError("STORAGE_INVALID", "A saved bookmark is invalid. It was preserved.");
  }
  validateBookmark(value.bookmark);
  if (
    value.id !== value.bookmark.id ||
    value.identity !== bookmarkIdentity(value.bookmark.anchor)
  ) {
    throw new AppError("STORAGE_INVALID", "A saved bookmark identity is inconsistent.");
  }
  return { id: value.id, identity: value.identity, bookmark: value.bookmark };
}

interface BrowserStoreOptions {
  databaseName?: string;
  indexedDb?: IDBFactory;
}

function storageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return new AppError(
      "STORAGE_FULL",
      "Browser storage is full. Keep the draft and free space before retrying.",
    );
  }
  return new AppError("WRITE_FAILED", "Browser storage is unavailable. Keep the draft and retry.");
}

/** Development persistence. Completion of the transaction, not the request, acknowledges a save. */
export class IndexedDbUserStore implements UserStore {
  private database: Promise<IDBDatabase> | undefined;
  private readonly factory: IDBFactory;
  private readonly databaseName: string;

  constructor(options: BrowserStoreOptions = {}) {
    const factory = options.indexedDb ?? globalThis.indexedDB;
    if (!factory)
      throw new AppError("STORAGE_UNAVAILABLE", "IndexedDB is unavailable in this browser.");
    this.factory = factory;
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
  }

  private open(): Promise<IDBDatabase> {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      let rejected = false;
      request.onupgradeneeded = () => {
        // One current schema. No historical migrations or automatic destructive resets.
        request.result.createObjectStore("notes", { keyPath: "id" });
        const bookmarks = request.result.createObjectStore("bookmarks", { keyPath: "id" });
        bookmarks.createIndex("identity", "identity", { unique: true });
        const highlights = request.result.createObjectStore("highlights", { keyPath: "id" });
        highlights.createIndex("unitKey", "unitKey", { unique: true });
        request.result.createObjectStore("state");
      };
      request.onsuccess = () => {
        const database = request.result;
        if (rejected) {
          database.close();
          return;
        }
        if (
          !database.objectStoreNames.contains("notes") ||
          !database.objectStoreNames.contains("bookmarks") ||
          !database.objectStoreNames.contains("highlights") ||
          !database.objectStoreNames.contains("state")
        ) {
          database.close();
          this.database = undefined;
          reject(
            new AppError(
              "STORAGE_INVALID",
              "The development database schema is invalid. Export useful drafts before an explicit development reset.",
            ),
          );
          return;
        }
        database.onversionchange = () => {
          database.close();
          this.database = undefined;
        };
        resolve(database);
      };
      request.onerror = () => {
        rejected = true;
        this.database = undefined;
        reject(storageError(request.error));
      };
      request.onblocked = () => {
        rejected = true;
        this.database = undefined;
        reject(
          new AppError(
            "STORAGE_BLOCKED",
            "Close other development tabs, then retry opening browser storage.",
          ),
        );
      };
    });
    return this.database;
  }

  async listBookmarks(): Promise<Bookmark[]> {
    return this.transaction(["bookmarks"], "readonly", (transaction, result, fail) => {
      const request = transaction.objectStore("bookmarks").getAll();
      request.onsuccess = () => {
        try {
          const values: unknown[] = request.result;
          const bookmarks = values.map((value) => decodeBookmarkRecord(value).bookmark);
          bookmarks.sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.id.localeCompare(b.id),
          );
          result(bookmarks);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async saveBookmark(input: Bookmark): Promise<Bookmark> {
    validateBookmark(input);
    const bookmark = structuredClone(input);
    const identity = bookmarkIdentity(bookmark.anchor);
    return this.transaction(["bookmarks"], "readwrite", (transaction, result, fail) => {
      const store = transaction.objectStore("bookmarks");
      const byId = store.get(bookmark.id);
      byId.onsuccess = () => {
        try {
          const previous =
            byId.result === undefined ? undefined : decodeBookmarkRecord(byId.result);
          if (previous && previous.identity !== identity) {
            throw new AppError("INPUT_INVALID", "A bookmark cannot be moved to another passage.");
          }
          const byAnchor = store.index("identity").get(identity);
          byAnchor.onsuccess = () => {
            try {
              const matching =
                byAnchor.result === undefined ? undefined : decodeBookmarkRecord(byAnchor.result);
              if (previous && matching?.id !== previous.id) {
                throw new AppError("STORAGE_INVALID", "The bookmark identity is inconsistent.");
              }
              if (previous && previous.bookmark.createdAt !== bookmark.createdAt) {
                throw new AppError("INPUT_INVALID", "A bookmark's creation time cannot change.");
              }
              const saved: Bookmark =
                matching && !previous
                  ? { ...matching.bookmark, updatedAt: bookmark.updatedAt }
                  : bookmark;
              if (
                matching &&
                Date.parse(saved.updatedAt) < Date.parse(matching.bookmark.updatedAt)
              ) {
                throw new AppError("REVISION_CONFLICT", "A newer bookmark is already saved.");
              }
              validateBookmark(saved);
              store.put({ id: saved.id, identity, bookmark: saved } satisfies BookmarkRecord);
              result(saved);
            } catch (error) {
              fail(error);
            }
          };
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async deleteBookmark(id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      throw new AppError("INPUT_INVALID", "The bookmark identifier is invalid.");
    }
    return this.transaction(["bookmarks"], "readwrite", (transaction, result) => {
      transaction.objectStore("bookmarks").delete(id);
      result(undefined);
    });
  }

  async listHighlights(): Promise<Highlight[]> {
    return this.transaction(["highlights"], "readonly", (transaction, result, fail) => {
      const request = transaction.objectStore("highlights").getAll();
      request.onsuccess = () => {
        try {
          result(
            (request.result as unknown[]).map((item) => decodeHighlightRecord(item).highlight),
          );
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async saveHighlights(inputs: Highlight[]): Promise<Highlight[]> {
    if (inputs.length === 0 || inputs.length > 200)
      throw new AppError("INPUT_INVALID", "Select up to 200 verses to highlight.");
    inputs.forEach(validateHighlight);
    const keys = inputs.map((item) => item.anchor.unitKeys[0]!);
    if (
      new Set(keys).size !== keys.length ||
      new Set(inputs.map((item) => item.id)).size !== inputs.length
    )
      throw new AppError("INPUT_INVALID", "Select each verse only once.");
    const highlights = structuredClone(inputs);
    return this.transaction(["highlights"], "readwrite", (transaction, result, fail) => {
      const store = transaction.objectStore("highlights");
      const saved: Highlight[] = [];
      let remaining = highlights.length;
      for (const input of highlights) {
        const unitKey = input.anchor.unitKeys[0]!;
        const byId = store.get(input.id);
        byId.onsuccess = () => {
          try {
            const previous =
              byId.result === undefined ? undefined : decodeHighlightRecord(byId.result);
            if (previous && previous.unitKey !== unitKey)
              throw new AppError(
                "INPUT_INVALID",
                "An existing highlight cannot move to another verse.",
              );
            const lookup = store.index("unitKey").get(unitKey);
            lookup.onsuccess = () => {
              try {
                const existing =
                  lookup.result === undefined ? undefined : decodeHighlightRecord(lookup.result);
                if (existing && existing.id !== input.id)
                  throw new AppError(
                    "REVISION_CONFLICT",
                    "A highlight already exists for this verse. Reload and retry.",
                  );
                if (
                  existing &&
                  (existing.highlight.createdAt !== input.createdAt ||
                    Date.parse(input.updatedAt) < Date.parse(existing.highlight.updatedAt))
                )
                  throw new AppError("REVISION_CONFLICT", "A newer highlight is already saved.");
                store.put({ id: input.id, unitKey, highlight: input } satisfies HighlightRecord);
                saved.push(input);
                if (--remaining === 0) result(saved);
              } catch (error) {
                fail(error);
              }
            };
          } catch (error) {
            fail(error);
          }
        };
      }
    });
  }

  async deleteHighlights(ids: string[]): Promise<void> {
    if (
      ids.length === 0 ||
      ids.length > 200 ||
      new Set(ids).size !== ids.length ||
      ids.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id),
      )
    )
      throw new AppError("INPUT_INVALID", "Choose valid highlights to remove.");
    return this.transaction(["highlights"], "readwrite", (transaction, result) => {
      const store = transaction.objectStore("highlights");
      ids.forEach((id) => store.delete(id));
      result(undefined);
    });
  }

  private async transaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    run: (
      transaction: IDBTransaction,
      result: (value: T) => void,
      fail: (error: unknown) => void,
    ) => void,
  ): Promise<T> {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      let transaction: IDBTransaction;
      try {
        transaction = database.transaction(storeNames, mode);
      } catch (error) {
        reject(storageError(error));
        return;
      }
      let result: T;
      let hasResult = false;
      let failure: unknown;
      transaction.oncomplete = () => {
        if (hasResult) resolve(result);
        else
          reject(
            new AppError("WRITE_FAILED", "The storage transaction completed without a result."),
          );
      };
      transaction.onabort = () => reject(storageError(failure ?? transaction.error));
      transaction.onerror = () => {
        failure ??= transaction.error;
      };
      const fail = (error: unknown) => {
        failure = error;
        transaction.abort();
      };
      try {
        run(
          transaction,
          (value) => {
            result = value;
            hasResult = true;
          },
          fail,
        );
      } catch (error) {
        fail(error);
      }
    });
  }

  async listNotes(): Promise<Note[]> {
    return this.transaction(["notes"], "readonly", (transaction, result, fail) => {
      const request = transaction.objectStore("notes").getAll();
      request.onsuccess = () => {
        try {
          const values: unknown[] = request.result;
          const notes: Note[] = [];
          for (const value of values) {
            validateNote(value);
            notes.push(value);
          }
          notes.sort((a, b) => {
            const byTime = Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
            if (byTime !== 0) return byTime;
            return a.id === b.id ? 0 : a.id < b.id ? -1 : 1;
          });
          result(notes);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async saveNote(input: Note): Promise<Note> {
    validateNote(input);
    if (
      input.revision === 0 &&
      input.title.trim().length === 0 &&
      input.bodyText.trim().length === 0
    ) {
      throw new AppError("INPUT_INVALID", "Write a note title or body before saving a new note.");
    }
    const note = structuredClone(input);
    return this.transaction(["notes"], "readwrite", (transaction, result, fail) => {
      const store = transaction.objectStore("notes");
      const request = store.get(note.id);
      request.onsuccess = () => {
        try {
          const previous: unknown = request.result;
          if (previous !== undefined) {
            validateNote(previous);
            if (note.revision !== previous.revision) {
              throw new AppError(
                "REVISION_CONFLICT",
                "This note changed elsewhere. Keep the draft, then reload before retrying.",
              );
            }
            if (
              note.createdAt !== previous.createdAt ||
              Date.parse(note.updatedAt) < Date.parse(previous.updatedAt)
            ) {
              throw new AppError(
                "INPUT_INVALID",
                "The note timestamps are inconsistent. Keep the draft and retry.",
              );
            }
          } else if (note.revision !== 0) {
            throw new AppError(
              "REVISION_CONFLICT",
              "The original note is no longer present. Keep the draft before reloading.",
            );
          }
          const committed: Note = { ...note, revision: note.revision + 1 };
          validateNote(committed);
          store.put(committed);
          result(committed);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async deleteNote(id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      throw new AppError("INPUT_INVALID", "The note identifier is invalid.");
    }
    return this.transaction(["notes"], "readwrite", (transaction, result) => {
      transaction.objectStore("notes").delete(id);
      result(undefined);
    });
  }

  async getReadingPosition(): Promise<ReadingPosition | null> {
    return this.transaction(["state"], "readonly", (transaction, result, fail) => {
      const request = transaction.objectStore("state").get("readingPosition");
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value === undefined) result(null);
          else {
            validateReadingPosition(value);
            result(value);
          }
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async saveReadingPosition(position: ReadingPosition): Promise<void> {
    validateReadingPosition(position);
    const snapshot = structuredClone(position);
    return this.transaction(["state"], "readwrite", (transaction, result, fail) => {
      const store = transaction.objectStore("state");
      const request = store.get("readingPosition");
      request.onsuccess = () => {
        try {
          const previous: unknown = request.result;
          if (previous !== undefined) {
            validateReadingPosition(previous);
            if (Date.parse(previous.updatedAt) > Date.parse(snapshot.updatedAt)) {
              result(undefined);
              return;
            }
          }
          store.put(snapshot, "readingPosition");
          result(undefined);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async getPreferences(): Promise<Preferences> {
    return this.transaction(["state"], "readonly", (transaction, result, fail) => {
      const request = transaction.objectStore("state").get("preferences");
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value === undefined) result({ ...DEFAULT_PREFERENCES });
          else {
            validatePreferences(value);
            result(value);
          }
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    validatePreferences(preferences);
    const snapshot = structuredClone(preferences);
    return this.transaction(["state"], "readwrite", (transaction, result) => {
      transaction.objectStore("state").put(snapshot, "preferences");
      result(undefined);
    });
  }

  async getDatabaseId(): Promise<string> {
    return this.transaction(["state"], "readwrite", (transaction, result, fail) => {
      const store = transaction.objectStore("state");
      const request = store.get("databaseId");
      request.onsuccess = () => {
        try {
          if (request.result !== undefined && typeof request.result !== "string")
            throw new AppError("STORAGE_INVALID", "The development database identity is invalid.");
          const id: string = request.result ?? crypto.randomUUID();
          if (request.result === undefined) store.put(id, "databaseId");
          result(id);
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async readSnapshot(): Promise<PersonalSnapshot> {
    return this.transaction(
      ["notes", "bookmarks", "highlights", "state"],
      "readonly",
      (transaction, result, fail) => {
        const notes = transaction.objectStore("notes").getAll();
        const bookmarks = transaction.objectStore("bookmarks").getAll();
        const highlights = transaction.objectStore("highlights").getAll();
        const preferences = transaction.objectStore("state").get("preferences");
        const position = transaction.objectStore("state").get("readingPosition");
        const requests = [notes, bookmarks, highlights, preferences, position];
        let remaining = requests.length;
        const complete = () => {
          if (--remaining !== 0) return;
          try {
            const snapshot: PersonalSnapshot = {
              notes: (notes.result as unknown[]).map((value) => {
                validateNote(value);
                return value;
              }),
              bookmarks: (bookmarks.result as unknown[]).map(
                (value) => decodeBookmarkRecord(value).bookmark,
              ),
              highlights: (highlights.result as unknown[]).map(
                (value) => decodeHighlightRecord(value).highlight,
              ),
              preferences: preferences.result === undefined ? [] : [preferences.result],
              readingPositions: position.result === undefined ? [] : [position.result],
            };
            snapshot.preferences.forEach(validatePreferences);
            snapshot.readingPositions.forEach(validateReadingPosition);
            result(snapshot);
          } catch (error) {
            fail(error);
          }
        };
        requests.forEach((request) => {
          request.onsuccess = complete;
        });
      },
    );
  }

  /** Development restore: durable recovery record first, then one replacement transaction. */
  async replaceSnapshot(snapshot: PersonalSnapshot): Promise<string> {
    const databaseId = await this.getDatabaseId();
    createBackup(snapshot, databaseId, "0.1.0");
    const recovery = createBackup(await this.readSnapshot(), databaseId, "0.1.0");
    const recoveryKey = `preRestoreRecovery:${crypto.randomUUID()}`;
    await this.transaction(["state"], "readwrite", (transaction, result) => {
      transaction.objectStore("state").put(recovery, recoveryKey);
      result(undefined);
    });
    const replacement = structuredClone(snapshot);
    await this.transaction(
      ["notes", "bookmarks", "highlights", "state"],
      "readwrite",
      (transaction, result) => {
        const notes = transaction.objectStore("notes");
        const bookmarks = transaction.objectStore("bookmarks");
        const highlights = transaction.objectStore("highlights");
        const state = transaction.objectStore("state");
        notes.clear();
        bookmarks.clear();
        highlights.clear();
        state.delete("preferences");
        state.delete("readingPosition");
        replacement.notes.forEach((item) => notes.put(item));
        replacement.bookmarks.forEach((item) =>
          bookmarks.put({
            id: item.id,
            identity: bookmarkIdentity(item.anchor),
            bookmark: item,
          } satisfies BookmarkRecord),
        );
        replacement.highlights.forEach((item) =>
          highlights.put({
            id: item.id,
            unitKey: item.anchor.unitKeys[0]!,
            highlight: item,
          } satisfies HighlightRecord),
        );
        replacement.preferences.forEach((item) => state.put(item, "preferences"));
        replacement.readingPositions.forEach((item) => state.put(item, "readingPosition"));
        state.put(recoveryKey, "latestRecoveryKey");
        result(undefined);
      },
    );
    return "Browser development storage";
  }

  async readRecoveryBackup(): Promise<UserBackup | null> {
    return this.transaction(["state"], "readonly", (transaction, result, fail) => {
      const state = transaction.objectStore("state");
      const request = state.get("latestRecoveryKey");
      request.onsuccess = () => {
        try {
          if (request.result === undefined) {
            result(null);
            return;
          }
          if (
            typeof request.result !== "string" ||
            !/^preRestoreRecovery:[0-9a-f-]{36}$/iu.test(request.result)
          )
            throw new AppError("STORAGE_INVALID", "The recovery identity is invalid.");
          const recovery = state.get(request.result);
          recovery.onsuccess = () => {
            try {
              if (recovery.result === undefined)
                throw new AppError("STORAGE_INVALID", "The recovery copy is missing.");
              const parsed = parseBackup(JSON.stringify(recovery.result));
              result(parsed.backup);
            } catch (error) {
              fail(error);
            }
          };
        } catch (error) {
          fail(error);
        }
      };
    });
  }

  async close(): Promise<void> {
    if (this.database) (await this.database).close();
    this.database = undefined;
  }
}

export function createIndexedDbUserStore(options: BrowserStoreOptions = {}): IndexedDbUserStore {
  return new IndexedDbUserStore(options);
}
