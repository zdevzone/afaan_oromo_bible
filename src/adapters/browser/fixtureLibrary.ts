import fixture from "../../../content/fixtures/sample.json";
import type { ScriptureLibrary } from "../../domain/ports";
import { AppError } from "../../domain/scripture";
import type { FixturePack, SearchResult } from "../../domain/scripture";
import { assertFixturePack } from "../../domain/validation";
import { resolveReference } from "../../services/reference";
import { matchesSearch, validateParsedSearch } from "../../services/search";

/** Small synthetic development library. The native composition never imports this module. */
export function createFixtureLibrary(input: unknown = fixture): ScriptureLibrary {
  assertFixturePack(input);
  if (!input.edition.isSynthetic) {
    throw new AppError(
      "CONTENT_INVALID",
      "This development adapter requires a labeled synthetic fixture.",
    );
  }
  const pack: FixturePack = structuredClone(input);
  const books = [...pack.books].sort((a, b) => a.order - b.order);
  function requireEdition(editionId: string): void {
    if (editionId !== pack.edition.id) {
      throw new AppError("CONTENT_UNAVAILABLE", "The requested edition is not installed.");
    }
  }
  const library: ScriptureLibrary = {
    async listEditions() {
      return [structuredClone(pack.edition)];
    },
    async listBooks(editionId) {
      requireEdition(editionId);
      return structuredClone(books);
    },
    async getChapter(key) {
      requireEdition(key.editionId);
      const chapter = pack.chapters.find(
        (candidate) =>
          candidate.bookCode === key.bookCode && candidate.chapterLabel === key.chapterLabel,
      );
      if (!chapter)
        throw new AppError("CONTENT_UNAVAILABLE", "The requested chapter is unavailable.");
      return structuredClone(chapter);
    },
    async resolveReference(input, editionId) {
      requireEdition(editionId);
      return resolveReference(input, editionId, books, (key) => library.getChapter(key));
    },
    async search(request) {
      requireEdition(request.editionId);
      validateParsedSearch(request.query);
      const limit = request.limit ?? 50;
      const offset = request.offset ?? 0;
      if (
        !Number.isSafeInteger(limit) ||
        limit < 1 ||
        limit > 50 ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      ) {
        throw new AppError(
          "QUERY_INVALID",
          "Use a page size from one to fifty and a nonnegative result offset.",
        );
      }
      if (request.bookCode !== undefined && !books.some((book) => book.code === request.bookCode)) {
        throw new AppError(
          "CONTENT_UNAVAILABLE",
          "That search book is unavailable in this edition.",
        );
      }
      const matches: SearchResult[] = [];
      for (const book of books) {
        if (request.bookCode !== undefined && request.bookCode !== book.code) continue;
        for (const chapterLabel of book.chapters) {
          const chapter = pack.chapters.find(
            (candidate) =>
              candidate.bookCode === book.code && candidate.chapterLabel === chapterLabel,
          );
          if (!chapter)
            throw new AppError("CONTENT_INVALID", "The content pack has a missing chapter.");
          for (const unit of chapter.verseUnits) {
            if (matchesSearch(unit.textPlain, request.query)) {
              matches.push({
                editionId: request.editionId,
                bookCode: book.code,
                bookName: book.name,
                chapterLabel,
                verseLabel: unit.label,
                unitKey: unit.key,
                textPlain: unit.textPlain,
              });
            }
          }
        }
      }
      return {
        items: matches.slice(offset, offset + limit),
        total: matches.length,
        hasMore: offset + limit < matches.length,
      };
    },
  };
  return library;
}
