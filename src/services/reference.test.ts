import { describe, expect, it } from "vite-plus/test";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { resolveReference, resolveSourceTarget } from "./reference";

describe("source reference navigation", () => {
  it("uses the source book identity even when that code is an ambiguous text alias", async () => {
    const library = createFixtureLibrary();
    const [edition] = await library.listEditions();
    const books = await library.listBooks(edition!.id);
    const ambiguousBooks = books.map((book) =>
      book.code === "TSB" ? { ...book, aliases: [...book.aliases, "TSA"] } : book,
    );
    const getChapter = (key: Parameters<typeof library.getChapter>[0]) => library.getChapter(key);
    await expect(
      resolveReference("TSA 1:2", edition!.id, ambiguousBooks, getChapter),
    ).rejects.toMatchObject({ code: "REFERENCE_AMBIGUOUS" });
    await expect(
      resolveSourceTarget(
        { bookCode: "TSA", chapterLabel: "1", verseLabel: "2" },
        edition!.id,
        ambiguousBooks,
        getChapter,
      ),
    ).resolves.toMatchObject({
      chapter: { bookCode: "TSA", chapterLabel: "1" },
      unitKeys: [expect.any(String)],
    });
    await expect(
      resolveSourceTarget(
        { bookCode: "TSA", chapterLabel: "99", verseLabel: "1" },
        edition!.id,
        ambiguousBooks,
        getChapter,
      ),
    ).rejects.toMatchObject({ code: "REFERENCE_UNAVAILABLE" });
  });
});
