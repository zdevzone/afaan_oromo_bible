import { AppError } from "./scripture";
import type { ChapterContent, Edition, VerseAddress } from "./scripture";

export interface VerseAnchor {
  id: string;
  editionId: string;
  versificationId: string;
  contentRevision: string;
  start: VerseAddress;
  end: VerseAddress;
  unitKeys: string[];
  selectedTextDigests: string[];
  displayReferenceSnapshot: string;
  createdAt: string;
}

export interface Note {
  id: string;
  title: string;
  bodyText: string;
  anchor: VerseAnchor | null;
  createdAt: string;
  updatedAt: string;
  /** New records begin at 0; each successful commit returns revision + 1. */
  revision: number;
}

export interface ReadingPosition {
  editionId: string;
  bookCode: string;
  chapterLabel: string;
  verseLabel: string | null;
  updatedAt: string;
}

export interface Preferences {
  theme: "light" | "dark" | "system";
  fontSizePx: number;
  lineHeight: 1.4 | 1.65 | 1.9;
  width: "comfortable" | "wide";
}

export const DEFAULT_PREFERENCES: Readonly<Preferences> = {
  theme: "system",
  fontSizePx: 20,
  lineHeight: 1.65,
  width: "comfortable",
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u;

function fail(message: string): never {
  throw new AppError("INPUT_INVALID", message);
}

export function isUtcTimestamp(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !UTC_TIMESTAMP.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    return false;
  const canonicalInput = value.replace(
    /(?:\.(\d{1,3}))?Z$/u,
    (_match, fraction: string | undefined) => `.${(fraction ?? "").padEnd(3, "0")}Z`,
  );
  return new Date(value).toISOString() === canonicalInput;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && Array.from(value).length <= 256;
}

function isAddress(value: unknown): value is VerseAddress {
  return (
    isRecord(value) &&
    isText(value.bookCode) &&
    isText(value.chapterLabel) &&
    isText(value.verseLabel)
  );
}

export function validateAnchor(value: unknown): asserts value is VerseAnchor {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    !isText(value.editionId) ||
    !isText(value.versificationId) ||
    !isText(value.contentRevision) ||
    !isAddress(value.start) ||
    !isAddress(value.end) ||
    value.start.bookCode !== value.end.bookCode ||
    value.start.chapterLabel !== value.end.chapterLabel ||
    !Array.isArray(value.unitKeys) ||
    value.unitKeys.length === 0 ||
    !value.unitKeys.every((key: unknown) => typeof key === "string" && key.length > 0) ||
    new Set(value.unitKeys).size !== value.unitKeys.length ||
    !Array.isArray(value.selectedTextDigests) ||
    value.selectedTextDigests.length !== value.unitKeys.length ||
    !value.selectedTextDigests.every(
      (digest: unknown) => typeof digest === "string" && /^[a-f0-9]{64}$/u.test(digest),
    ) ||
    !isText(value.displayReferenceSnapshot) ||
    !isUtcTimestamp(value.createdAt)
  ) {
    fail("The passage link is invalid. Keep the draft and select the passage again.");
  }
  for (const [index, key] of value.unitKeys.entries()) {
    if (key.length > 4096) fail("A passage identity exceeds the supported size.");
    let tuple: unknown;
    try {
      tuple = JSON.parse(key);
    } catch {
      fail("The passage identity is invalid. Keep the original record for review.");
    }
    if (
      !Array.isArray(tuple) ||
      tuple.length !== 5 ||
      tuple[0] !== value.editionId ||
      tuple[1] !== value.versificationId ||
      tuple[2] !== value.start.bookCode ||
      tuple[3] !== value.start.chapterLabel ||
      !isText(tuple[4]) ||
      (index === 0 && tuple[4] !== value.start.verseLabel) ||
      (index === value.unitKeys.length - 1 && tuple[4] !== value.end.verseLabel)
    )
      fail(
        "The passage identities do not match their stored reference. Keep the original record for review.",
      );
  }
}

export function validateNote(value: unknown): asserts value is Note {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    typeof value.title !== "string" ||
    Array.from(value.title).length > 256 ||
    typeof value.bodyText !== "string" ||
    new TextEncoder().encode(value.bodyText).byteLength > 1024 * 1024 ||
    !isUtcTimestamp(value.createdAt) ||
    !isUtcTimestamp(value.updatedAt) ||
    Date.parse(value.updatedAt) < Date.parse(value.createdAt) ||
    !Number.isSafeInteger(value.revision) ||
    typeof value.revision !== "number" ||
    value.revision < 0
  ) {
    fail("The note is invalid or exceeds the supported size. Your draft was not saved.");
  }
  if (value.anchor !== null) validateAnchor(value.anchor);
}

export function validatePreferences(value: unknown): asserts value is Preferences {
  if (
    !isRecord(value) ||
    !["light", "dark", "system"].includes(String(value.theme)) ||
    typeof value.fontSizePx !== "number" ||
    !Number.isFinite(value.fontSizePx) ||
    value.fontSizePx < 16 ||
    value.fontSizePx > 32 ||
    ![1.4, 1.65, 1.9].includes(Number(value.lineHeight)) ||
    typeof value.lineHeight !== "number" ||
    !["comfortable", "wide"].includes(String(value.width))
  ) {
    fail("Choose supported reading preferences.");
  }
}

export function validateReadingPosition(value: unknown): asserts value is ReadingPosition {
  if (
    !isRecord(value) ||
    !isText(value.editionId) ||
    !isText(value.bookCode) ||
    !isText(value.chapterLabel) ||
    !(value.verseLabel === null || isText(value.verseLabel)) ||
    !isUtcTimestamp(value.updatedAt)
  ) {
    fail("The reading position is invalid.");
  }
}

/** Validate against the actual chapter before constructing a new passage link. */
export function createVerseAnchor(
  edition: Edition,
  chapter: ChapterContent,
  unitKeys: readonly string[],
  bookName: string,
): VerseAnchor {
  if (edition.id !== chapter.editionId || unitKeys.length === 0) {
    fail("Choose one or more verses in the current edition.");
  }
  const selected = chapter.verseUnits.filter((unit) => unitKeys.includes(unit.key));
  const first = selected[0];
  const last = selected.at(-1);
  if (
    !first ||
    !last ||
    selected.length !== unitKeys.length ||
    new Set(unitKeys).size !== unitKeys.length ||
    selected.some((unit, index) => unit.order !== first.order + index)
  ) {
    fail("Select a contiguous range of whole verses within one chapter.");
  }
  const createdAt = new Date().toISOString();
  const verseLabel = first.label === last.label ? first.label : `${first.label}–${last.label}`;
  const anchor: VerseAnchor = {
    id: crypto.randomUUID(),
    editionId: edition.id,
    versificationId: edition.versificationId,
    contentRevision: edition.contentRevision,
    start: {
      bookCode: chapter.bookCode,
      chapterLabel: chapter.chapterLabel,
      verseLabel: first.label,
    },
    end: { bookCode: chapter.bookCode, chapterLabel: chapter.chapterLabel, verseLabel: last.label },
    unitKeys: selected.map((unit) => unit.key),
    selectedTextDigests: selected.map((unit) => unit.textDigest),
    displayReferenceSnapshot: `${bookName} ${chapter.chapterLabel}:${verseLabel}`,
    createdAt,
  };
  validateAnchor(anchor);
  return anchor;
}
