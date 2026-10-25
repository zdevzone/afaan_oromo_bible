import { AppError } from "./scripture";
import {
  validateAnchor,
  validateBookmark,
  validateHighlight,
  validateNote,
  validatePreferences,
  validateReadingPosition,
  isUtcTimestamp,
  bookmarkIdentity,
  type Bookmark,
  type Highlight,
  type Note,
  type Preferences,
  type ReadingPosition,
  type VerseAnchor,
} from "./notes";

export const BACKUP_FORMAT = "afaan-oromo-bible-user-backup";
export const BACKUP_VERSION = 1;
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
export const BACKUP_MAX_RECORDS = 100_000;

export interface PersonalSnapshot {
  notes: Note[];
  bookmarks: Bookmark[];
  highlights: Highlight[];
  preferences: Preferences[];
  readingPositions: ReadingPosition[];
}

type Linked<T extends { anchor: VerseAnchor | null }> = Omit<T, "anchor"> & {
  anchorId: string | null;
};

export interface UserBackup {
  format: typeof BACKUP_FORMAT;
  formatVersion: typeof BACKUP_VERSION;
  appVersion: string;
  createdAt: string;
  sourceDatabaseId: string;
  requiredEditions: { editionId: string; versificationId: string; contentRevision: string }[];
  data: {
    notes: Linked<Note>[];
    anchors: VerseAnchor[];
    bookmarks: Linked<Bookmark>[];
    highlights: Linked<Highlight>[];
    preferences: Preferences[];
    readingPositions: ReadingPosition[];
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function invalid(message: string): never {
  throw new AppError("BACKUP_INVALID", message);
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    invalid("The backup has an invalid object.");
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, expected: string[]): void {
  const actual = Object.keys(value);
  if (actual.length !== expected.length || actual.some((key) => !expected.includes(key)))
    invalid("The backup contains unsupported fields.");
}

function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) invalid("The backup has a missing record list.");
  return value;
}

function unique<T>(items: T[], identity: (item: T) => string): void {
  if (new Set(items.map(identity)).size !== items.length)
    invalid("The backup contains duplicate records.");
}

function editionKey(value: {
  editionId: string;
  versificationId: string;
  contentRevision: string;
}): string {
  return JSON.stringify([value.editionId, value.versificationId, value.contentRevision]);
}

function validateSnapshot(snapshot: PersonalSnapshot): void {
  for (const note of snapshot.notes) {
    validateNote(note);
    if (note.revision === 0) invalid("A saved backup cannot contain an unsaved note revision.");
  }
  for (const bookmark of snapshot.bookmarks) validateBookmark(bookmark);
  for (const highlight of snapshot.highlights) validateHighlight(highlight);
  for (const preference of snapshot.preferences) validatePreferences(preference);
  for (const position of snapshot.readingPositions) validateReadingPosition(position);
  if (snapshot.preferences.length > 1)
    invalid("The backup contains conflicting reading preferences.");
  unique(snapshot.notes, (item) => item.id);
  unique(snapshot.bookmarks, (item) => item.id);
  unique(snapshot.bookmarks, (item) => bookmarkIdentity(item.anchor));
  unique(snapshot.highlights, (item) => item.id);
  unique(snapshot.highlights, (item) => item.anchor.unitKeys[0]!);
  unique(snapshot.readingPositions, (item) => item.editionId);
}

export function createBackup(
  snapshot: PersonalSnapshot,
  sourceDatabaseId: string,
  appVersion: string,
  createdAt = new Date().toISOString(),
): UserBackup {
  validateSnapshot(snapshot);
  if (
    !UUID.test(sourceDatabaseId) ||
    !isUtcTimestamp(createdAt) ||
    !/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/u.test(appVersion)
  )
    invalid("The backup metadata is invalid.");
  const anchors = new Map<string, VerseAnchor>();
  const add = (anchor: VerseAnchor | null): string | null => {
    if (!anchor) return null;
    const previous = anchors.get(anchor.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(anchor))
      invalid("The backup contains conflicting passage links.");
    anchors.set(anchor.id, anchor);
    return anchor.id;
  };
  const notes = snapshot.notes.map(({ anchor, ...item }) => ({ ...item, anchorId: add(anchor) }));
  const bookmarks = snapshot.bookmarks.map(({ anchor, ...item }) => ({
    ...item,
    anchorId: add(anchor),
  }));
  const highlights = snapshot.highlights.map(({ anchor, ...item }) => ({
    ...item,
    anchorId: add(anchor),
  }));
  const required = new Map<string, UserBackup["requiredEditions"][number]>();
  for (const anchor of anchors.values()) {
    const value = {
      editionId: anchor.editionId,
      versificationId: anchor.versificationId,
      contentRevision: anchor.contentRevision,
    };
    required.set(editionKey(value), value);
  }
  const backup: UserBackup = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_VERSION,
    appVersion,
    createdAt,
    sourceDatabaseId,
    requiredEditions: [...required.values()],
    data: {
      notes,
      anchors: [...anchors.values()],
      bookmarks,
      highlights,
      preferences: snapshot.preferences,
      readingPositions: snapshot.readingPositions,
    },
  };
  if (new TextEncoder().encode(JSON.stringify(backup)).byteLength > BACKUP_MAX_BYTES)
    invalid("The backup exceeds 50 MiB.");
  if (
    notes.length +
      anchors.size +
      bookmarks.length +
      highlights.length +
      snapshot.preferences.length +
      snapshot.readingPositions.length >
    BACKUP_MAX_RECORDS
  )
    invalid("The backup exceeds 100,000 records.");
  return backup;
}

export function parseBackup(text: string): { backup: UserBackup; snapshot: PersonalSnapshot } {
  if (
    text.length > BACKUP_MAX_BYTES ||
    new TextEncoder().encode(text).byteLength > BACKUP_MAX_BYTES
  )
    invalid("The backup exceeds 50 MiB.");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    invalid("The backup is not valid JSON.");
  }
  const root = record(raw);
  keys(root, [
    "format",
    "formatVersion",
    "appVersion",
    "createdAt",
    "sourceDatabaseId",
    "requiredEditions",
    "data",
  ]);
  if (root.format !== BACKUP_FORMAT || root.formatVersion !== BACKUP_VERSION)
    invalid("This backup format or version is unsupported.");
  if (
    typeof root.appVersion !== "string" ||
    !/^\d+\.\d+\.\d+(?:[-+][\w.]+)?$/u.test(root.appVersion) ||
    !isUtcTimestamp(root.createdAt) ||
    typeof root.sourceDatabaseId !== "string" ||
    !UUID.test(root.sourceDatabaseId)
  )
    invalid("The backup metadata is invalid.");
  const required = array(root.requiredEditions).map((value) => {
    const item = record(value);
    keys(item, ["editionId", "versificationId", "contentRevision"]);
    if (
      ![item.editionId, item.versificationId, item.contentRevision].every(
        (part) => typeof part === "string" && part.length > 0 && Array.from(part).length <= 256,
      )
    )
      invalid("The backup edition identity is invalid.");
    return item as UserBackup["requiredEditions"][number];
  });
  if (required.length > BACKUP_MAX_RECORDS) invalid("The backup has too many edition references.");
  unique(required, editionKey);
  const data = record(root.data);
  keys(data, ["notes", "anchors", "bookmarks", "highlights", "preferences", "readingPositions"]);
  const lists = [
    "notes",
    "anchors",
    "bookmarks",
    "highlights",
    "preferences",
    "readingPositions",
  ] as const;
  const parsed = Object.fromEntries(lists.map((name) => [name, array(data[name])])) as Record<
    (typeof lists)[number],
    unknown[]
  >;
  if (lists.reduce((count, name) => count + parsed[name].length, 0) > BACKUP_MAX_RECORDS)
    invalid("The backup exceeds 100,000 records.");
  const anchors = new Map<string, VerseAnchor>();
  const usedAnchors = new Set<string>();
  for (const value of parsed.anchors) {
    const item = record(value);
    keys(item, [
      "id",
      "editionId",
      "versificationId",
      "contentRevision",
      "start",
      "end",
      "unitKeys",
      "selectedTextDigests",
      "displayReferenceSnapshot",
      "createdAt",
    ]);
    keys(record(item.start), ["bookCode", "chapterLabel", "verseLabel"]);
    keys(record(item.end), ["bookCode", "chapterLabel", "verseLabel"]);
    try {
      validateAnchor(value);
    } catch {
      invalid("The backup contains an invalid passage link.");
    }
    if (anchors.has(value.id)) invalid("The backup contains duplicate passage links.");
    anchors.set(value.id, value);
  }
  const resolve = (value: unknown, requiredAnchor: boolean): VerseAnchor | null => {
    if (value === null && !requiredAnchor) return null;
    if (typeof value !== "string" || !anchors.has(value))
      invalid("The backup refers to a missing passage link.");
    usedAnchors.add(value);
    return anchors.get(value)!;
  };
  const linked = <T extends { anchor: VerseAnchor | null }>(
    values: unknown[],
    fields: string[],
    check: (value: unknown) => asserts value is T,
    requiredAnchor: boolean,
  ): T[] =>
    values.map((value) => {
      const item = record(value);
      keys(item, [...fields, "anchorId"]);
      const { anchorId, ...rest } = item;
      const restored: unknown = { ...rest, anchor: resolve(anchorId, requiredAnchor) };
      try {
        check(restored);
      } catch {
        invalid("The backup contains an invalid personal record.");
      }
      return restored;
    });
  const snapshot: PersonalSnapshot = {
    notes: linked(
      parsed.notes,
      ["id", "title", "bodyText", "createdAt", "updatedAt", "revision"],
      validateNote,
      false,
    ),
    bookmarks: linked(
      parsed.bookmarks,
      ["id", "label", "createdAt", "updatedAt"],
      validateBookmark,
      true,
    ),
    highlights: linked(
      parsed.highlights,
      ["id", "colorToken", "createdAt", "updatedAt"],
      validateHighlight,
      true,
    ),
    preferences: parsed.preferences.map((value) => {
      const item = record(value);
      keys(item, ["uiLocale", "theme", "fontSizePx", "lineHeight", "width"]);
      try {
        validatePreferences(value);
      } catch {
        invalid("The backup contains invalid reading preferences.");
      }
      return value;
    }),
    readingPositions: parsed.readingPositions.map((value) => {
      const item = record(value);
      keys(item, ["editionId", "bookCode", "chapterLabel", "verseLabel", "updatedAt"]);
      try {
        validateReadingPosition(value);
      } catch {
        invalid("The backup contains an invalid reading position.");
      }
      return value;
    }),
  };
  try {
    validateSnapshot(snapshot);
  } catch {
    invalid("The backup contains inconsistent personal records.");
  }
  if (usedAnchors.size !== anchors.size) invalid("The backup contains unused passage links.");
  const actualRequired = new Set(
    [...anchors.values()].map((anchor) =>
      editionKey({
        editionId: anchor.editionId,
        versificationId: anchor.versificationId,
        contentRevision: anchor.contentRevision,
      }),
    ),
  );
  if (
    required.length !== actualRequired.size ||
    required.some((item) => !actualRequired.has(editionKey(item)))
  )
    invalid("The backup edition list does not match its passage links.");
  return { backup: raw as UserBackup, snapshot };
}
