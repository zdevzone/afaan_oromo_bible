import {
  DEFAULT_PREFERENCES,
  validateNote,
  validatePreferences,
  validateReadingPosition,
} from '../../domain/notes';
import type { Note, Preferences, ReadingPosition } from '../../domain/notes';
import type { UserStore } from '../../domain/ports';
import { AppError } from '../../domain/scripture';

const DEFAULT_DATABASE_NAME = 'afaan-oromo-bible-development-v1';
const DATABASE_VERSION = 1;

interface BrowserStoreOptions {
  databaseName?: string;
  indexedDb?: IDBFactory;
}

function storageError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return new AppError('STORAGE_FULL', 'Browser storage is full. Keep the draft and free space before retrying.');
  }
  return new AppError('WRITE_FAILED', 'Browser storage is unavailable. Keep the draft and retry.');
}

/** Development persistence. Completion of the transaction, not the request, acknowledges a save. */
export class IndexedDbUserStore implements UserStore {
  private database: Promise<IDBDatabase> | undefined;
  private readonly factory: IDBFactory;
  private readonly databaseName: string;

  constructor(options: BrowserStoreOptions = {}) {
    const factory = options.indexedDb ?? globalThis.indexedDB;
    if (!factory) throw new AppError('STORAGE_UNAVAILABLE', 'IndexedDB is unavailable in this browser.');
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
        request.result.createObjectStore('notes', { keyPath: 'id' });
        request.result.createObjectStore('state');
      };
      request.onsuccess = () => {
        const database = request.result;
        if (rejected) {
          database.close();
          return;
        }
        if (!database.objectStoreNames.contains('notes') || !database.objectStoreNames.contains('state')) {
          database.close();
          this.database = undefined;
          reject(new AppError('STORAGE_INVALID', 'The development database schema is invalid. Export useful drafts before an explicit development reset.'));
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
        reject(new AppError('STORAGE_BLOCKED', 'Close other development tabs, then retry opening browser storage.'));
      };
    });
    return this.database;
  }

  private async transaction<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    run: (transaction: IDBTransaction, result: (value: T) => void, fail: (error: unknown) => void) => void,
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
        else reject(new AppError('WRITE_FAILED', 'The storage transaction completed without a result.'));
      };
      transaction.onabort = () => reject(storageError(failure ?? transaction.error));
      transaction.onerror = () => { failure ??= transaction.error; };
      const fail = (error: unknown) => {
        failure = error;
        transaction.abort();
      };
      try {
        run(transaction, (value) => { result = value; hasResult = true; }, fail);
      } catch (error) {
        fail(error);
      }
    });
  }

  async listNotes(): Promise<Note[]> {
    return this.transaction(['notes'], 'readonly', (transaction, result, fail) => {
      const request = transaction.objectStore('notes').getAll();
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
        } catch (error) { fail(error); }
      };
    });
  }

  async saveNote(input: Note): Promise<Note> {
    validateNote(input);
    if (input.revision === 0 && input.title.trim().length === 0 && input.bodyText.trim().length === 0) {
      throw new AppError('INPUT_INVALID', 'Write a note title or body before saving a new note.');
    }
    const note = structuredClone(input);
    return this.transaction(['notes'], 'readwrite', (transaction, result, fail) => {
      const store = transaction.objectStore('notes');
      const request = store.get(note.id);
      request.onsuccess = () => {
        try {
          const previous: unknown = request.result;
          if (previous !== undefined) {
            validateNote(previous);
            if (note.revision !== previous.revision) {
              throw new AppError('REVISION_CONFLICT', 'This note changed elsewhere. Keep the draft, then reload before retrying.');
            }
            if (note.createdAt !== previous.createdAt || Date.parse(note.updatedAt) < Date.parse(previous.updatedAt)) {
              throw new AppError('INPUT_INVALID', 'The note timestamps are inconsistent. Keep the draft and retry.');
            }
          } else if (note.revision !== 0) {
            throw new AppError('REVISION_CONFLICT', 'The original note is no longer present. Keep the draft before reloading.');
          }
          const committed: Note = { ...note, revision: note.revision + 1 };
          validateNote(committed);
          store.put(committed);
          result(committed);
        } catch (error) { fail(error); }
      };
    });
  }

  async deleteNote(id: string): Promise<void> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(id)) {
      throw new AppError('INPUT_INVALID', 'The note identifier is invalid.');
    }
    return this.transaction(['notes'], 'readwrite', (transaction, result) => {
      transaction.objectStore('notes').delete(id);
      result(undefined);
    });
  }

  async getReadingPosition(): Promise<ReadingPosition | null> {
    return this.transaction(['state'], 'readonly', (transaction, result, fail) => {
      const request = transaction.objectStore('state').get('readingPosition');
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value === undefined) result(null);
          else {
            validateReadingPosition(value);
            result(value);
          }
        } catch (error) { fail(error); }
      };
    });
  }

  async saveReadingPosition(position: ReadingPosition): Promise<void> {
    validateReadingPosition(position);
    const snapshot = structuredClone(position);
    return this.transaction(['state'], 'readwrite', (transaction, result, fail) => {
      const store = transaction.objectStore('state');
      const request = store.get('readingPosition');
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
          store.put(snapshot, 'readingPosition');
          result(undefined);
        } catch (error) { fail(error); }
      };
    });
  }

  async getPreferences(): Promise<Preferences> {
    return this.transaction(['state'], 'readonly', (transaction, result, fail) => {
      const request = transaction.objectStore('state').get('preferences');
      request.onsuccess = () => {
        try {
          const value: unknown = request.result;
          if (value === undefined) result({ ...DEFAULT_PREFERENCES });
          else {
            validatePreferences(value);
            result(value);
          }
        } catch (error) { fail(error); }
      };
    });
  }

  async savePreferences(preferences: Preferences): Promise<void> {
    validatePreferences(preferences);
    const snapshot = structuredClone(preferences);
    return this.transaction(['state'], 'readwrite', (transaction, result) => {
      transaction.objectStore('state').put(snapshot, 'preferences');
      result(undefined);
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
