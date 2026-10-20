import { AppError } from "../domain/scripture";
import type {
  BookSummary,
  ChapterContent,
  ChapterKey,
  ReferenceResolution,
} from "../domain/scripture";
import { normalizeSearchText } from "./search";

export async function resolveReference(
  input: string,
  editionId: string,
  books: readonly BookSummary[],
  getChapter: (key: ChapterKey) => Promise<ChapterContent>,
): Promise<ReferenceResolution> {
  if (Array.from(input).length > 256)
    throw new AppError("REFERENCE_INVALID", "Use a shorter passage reference.");
  const match = input.trim().match(/^(.+?)\s+([^\s:]+)(?::([^\s]+))?$/u);
  if (!match)
    throw new AppError(
      "REFERENCE_INVALID",
      "Enter a book and chapter, optionally followed by :verse.",
    );
  const [, alias = "", chapterLabel = "", verseLabel] = match;
  const normalizedAlias = normalizeSearchText(alias);
  const candidates = books.filter(
    (book) =>
      book.editionId === editionId &&
      [book.name, book.code, ...book.aliases].some(
        (name) => normalizeSearchText(name) === normalizedAlias,
      ),
  );
  if (candidates.length > 1) {
    throw new AppError(
      "REFERENCE_AMBIGUOUS",
      `Choose a book: ${candidates.map((book) => book.name).join(", ")}.`,
    );
  }
  const book = candidates[0];
  if (!book)
    throw new AppError("REFERENCE_UNAVAILABLE", "That book name is not available in this edition.");
  if (!book.chapters.includes(chapterLabel)) {
    throw new AppError("REFERENCE_UNAVAILABLE", "That chapter is not available in this book.");
  }
  const chapter: ChapterKey = { editionId, bookCode: book.code, chapterLabel };
  if (verseLabel === undefined) return { chapter, unitKeys: [] };
  const content = await getChapter(chapter);
  const exact = Object.hasOwn(content.referenceLookup, verseLabel)
    ? content.referenceLookup[verseLabel]
    : undefined;
  if (exact) return { chapter, unitKeys: [...exact] };
  const range = verseLabel.match(/^([0-9]+[a-z]?)[–-]([0-9]+[a-z]?)$/iu);
  if (range) {
    const firstLabel = range[1] ?? "";
    const lastLabel = range[2] ?? "";
    const startKeys = Object.hasOwn(content.referenceLookup, firstLabel)
      ? content.referenceLookup[firstLabel]
      : undefined;
    const endKeys = Object.hasOwn(content.referenceLookup, lastLabel)
      ? content.referenceLookup[lastLabel]
      : undefined;
    if (startKeys && endKeys) {
      const firstIndex = content.verseUnits.findIndex((unit) => unit.key === startKeys[0]);
      const lastIndex = content.verseUnits.findIndex((unit) => unit.key === endKeys.at(-1));
      if (firstIndex >= 0 && lastIndex >= firstIndex) {
        return {
          chapter,
          unitKeys: content.verseUnits.slice(firstIndex, lastIndex + 1).map((unit) => unit.key),
        };
      }
    }
  }
  throw new AppError(
    "REFERENCE_UNAVAILABLE",
    "That verse or range is not available in this chapter.",
  );
}
