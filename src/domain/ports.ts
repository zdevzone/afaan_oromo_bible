import type { Note, Preferences, ReadingPosition } from "./notes";
import type {
  BookSummary,
  ChapterContent,
  ChapterKey,
  Edition,
  ReferenceResolution,
  SearchRequest,
  SearchResults,
} from "./scripture";

export interface ScriptureLibrary {
  listEditions(): Promise<Edition[]>;
  listBooks(editionId: string): Promise<BookSummary[]>;
  getChapter(key: ChapterKey): Promise<ChapterContent>;
  resolveReference(input: string, editionId: string): Promise<ReferenceResolution>;
  search(request: SearchRequest): Promise<SearchResults>;
}

export interface UserStore {
  listNotes(): Promise<Note[]>;
  saveNote(note: Note): Promise<Note>;
  deleteNote(id: string): Promise<void>;
  getReadingPosition(): Promise<ReadingPosition | null>;
  saveReadingPosition(position: ReadingPosition): Promise<void>;
  getPreferences(): Promise<Preferences>;
  savePreferences(preferences: Preferences): Promise<void>;
}

export interface AppServices {
  library: ScriptureLibrary;
  userStore: UserStore;
  runtime: "browser" | "tauri";
  platform: {
    copyText(text: string): Promise<void>;
    window?: DesktopWindow;
  };
}

/** Requests are already prevented by the adapter; only close() authorizes destruction. */
export interface DesktopWindow {
  onCloseRequested(handler: () => void): () => void;
  close(): Promise<void>;
}
