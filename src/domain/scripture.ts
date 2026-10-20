/** Source labels are strings: a verse unit can be a bridge or subdivision. */
export interface Edition {
  id: string;
  title: string;
  abbreviation: string;
  languageTag: string;
  versificationId: string;
  contentRevision: string;
  canonId: string;
  isSynthetic: boolean;
  attribution: string;
  licenseNotice: string;
}

export interface BookSummary {
  editionId: string;
  code: string;
  name: string;
  aliases: string[];
  order: number;
  chapters: string[];
}

export interface ChapterKey {
  editionId: string;
  bookCode: string;
  chapterLabel: string;
}

export interface VerseAddress {
  bookCode: string;
  chapterLabel: string;
  verseLabel: string;
}

export interface VerseUnit {
  key: string;
  label: string;
  order: number;
  textPlain: string;
  textDigest: string;
}

export type InlineNode =
  | { type: 'text'; text: string }
  | { type: 'verse'; unitKey: string }
  | { type: 'footnote'; id: string; caller: string; text: string }
  | {
      type: 'crossReference';
      id: string;
      caller: string;
      text: string;
      target: VerseAddress | null;
    };

export type ContentBlock =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; children: InlineNode[] }
  | { type: 'poetry'; level: number; children: InlineNode[] };

export interface ChapterContent extends ChapterKey {
  blocks: ContentBlock[];
  verseUnits: VerseUnit[];
  /** Explicit requested source label -> ordered whole units, including bridge members. */
  referenceLookup: Record<string, string[]>;
}

export interface FixturePack {
  formatVersion: 1;
  edition: Edition;
  books: BookSummary[];
  chapters: ChapterContent[];
}

export interface ReferenceResolution {
  chapter: ChapterKey;
  unitKeys: string[];
}

export interface SearchClause {
  /** One token is a term; multiple tokens form an adjacent-token phrase. */
  tokens: string[];
  prefix: boolean;
}

export interface ParsedSearch {
  /** All clauses must match within the same verse unit. */
  clauses: SearchClause[];
}

export interface SearchRequest {
  editionId: string;
  query: ParsedSearch;
  bookCode?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  editionId: string;
  bookCode: string;
  bookName: string;
  chapterLabel: string;
  verseLabel: string;
  unitKey: string;
  textPlain: string;
}

export interface SearchResults {
  items: SearchResult[];
  total: number;
  hasMore: boolean;
}

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function verseUnitKey(
  editionId: string,
  versificationId: string,
  address: VerseAddress,
): string {
  return JSON.stringify([
    editionId,
    versificationId,
    address.bookCode,
    address.chapterLabel,
    address.verseLabel,
  ]);
}
