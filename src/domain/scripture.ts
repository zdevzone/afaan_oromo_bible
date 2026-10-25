/** Source labels are strings: a verse unit can be a bridge or subdivision. */
export interface Edition {
  id: string;
  title: string;
  abbreviation: string;
  languageTag: string;
  languageName?: string;
  versificationId: string;
  contentRevision: string;
  canonId: string;
  isSynthetic: boolean;
  technicalReviewOnly?: boolean;
  sourceTitle?: string;
  rightsHolderName?: string;
  sourceCompletedOn?: string;
  sourceArchiveSha256?: string;
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

/** A source reference may name a whole chapter or a range spanning chapters. */
export interface SourceReferenceTarget {
  bookCode: string;
  chapterLabel: string;
  verseLabel?: string;
  end?: { bookCode: string; chapterLabel: string; verseLabel?: string };
}

export interface VerseUnit {
  key: string;
  label: string;
  order: number;
  textPlain: string;
  textDigest: string;
}

export type SourceAttributes = [string, string][];
export type SourcePath = number[];

/** Exact source text and markers; display whitespace is handled by the renderer. */
export type InlineNode =
  | { kind: "text"; text: string; sourcePath?: SourcePath }
  | {
      kind: "verseStart";
      unitKey: string;
      sourcePath?: SourcePath;
      sourceAttributes?: SourceAttributes;
    }
  | { kind: "verseEnd"; sourcePath?: SourcePath; sourceAttributes?: SourceAttributes }
  | {
      kind: "character";
      style: string;
      content?: InlineNode[];
      sourcePath?: SourcePath;
      sourceAttributes?: SourceAttributes;
    }
  | {
      kind: "footnote";
      content?: InlineNode[];
      sourcePath?: SourcePath;
      sourceAttributes?: SourceAttributes;
    }
  | {
      kind: "reference";
      content?: InlineNode[];
      sourcePath?: SourcePath;
      sourceAttributes?: SourceAttributes;
      target?: SourceReferenceTarget | null;
      displayMode?: "inline" | "callout";
    }
  | { kind: "optionalBreak"; sourcePath?: SourcePath };

export interface ContentBlock {
  kind: "block";
  role: "metadata" | "heading" | "poetry" | "list" | "paragraph";
  style: string;
  content?: InlineNode[];
  sourcePath?: SourcePath;
  sourceAttributes?: SourceAttributes;
}

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
    this.name = "AppError";
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
