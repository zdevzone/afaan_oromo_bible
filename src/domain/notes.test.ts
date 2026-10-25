import { describe, expect, it } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import {
  anchorMatchesChapter,
  anchorMatchesContent,
  createVerseAnchor,
  getNoteSizeProblem,
  isUtcTimestamp,
  resolvedHighlightColors,
  validateAnchor,
  validateNote,
} from "./notes";

describe("personal-record boundary validation", () => {
  it("uses code points for titles and UTF-8 bytes for note bodies", () => {
    expect(getNoteSizeProblem("😀".repeat(256), "é".repeat(524_288))).toBeNull();
    expect(getNoteSizeProblem("😀".repeat(257), "valid")).toBe("title");
    expect(getNoteSizeProblem("valid", "é".repeat(524_289))).toBe("body");
  });

  it("rejects rolled-over calendar dates and accepts exact UTC timestamp variants", () => {
    expect(isUtcTimestamp("2026-02-30T13:00:00Z")).toBe(false);
    expect(isUtcTimestamp("2026-02-28T13:00:00Z")).toBe(true);
    expect(isUtcTimestamp("2026-02-28T13:00:00.1Z")).toBe(true);
    expect(isUtcTimestamp("2026-02-28T13:00:00+00:00")).toBe(false);
  });

  it("requires generic anchor tuples to match stored edition, scheme and endpoints", async () => {
    const library = createFixtureLibrary();
    const chapter = await library.getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const anchor = createVerseAnchor(
      fixture.edition,
      chapter,
      chapter.verseUnits.slice(0, 2).map((unit) => unit.key),
      "Sample A",
    );
    expect(() => validateAnchor(anchor)).not.toThrow();
    expect(() => validateAnchor({ ...anchor, start: anchor.end, end: anchor.start })).toThrow();
    expect(() =>
      validateAnchor({
        ...anchor,
        unitKeys: ["not-a-reference"],
        selectedTextDigests: anchor.selectedTextDigests.slice(0, 1),
      }),
    ).toThrow();
    expect(() => validateAnchor({ ...anchor, editionId: "another-edition" })).toThrow();
    // No installed-library lookup occurs here: a valid unavailable record remains recoverable.
    expect(() =>
      validateAnchor({ ...anchor, contentRevision: "a-source-revision-not-installed" }),
    ).not.toThrow();
  });

  it("allows empty titles and valid existing blank records without discarding their identity", () => {
    const now = new Date().toISOString();
    const note = {
      id: crypto.randomUUID(),
      title: "",
      bodyText: "A useful observation.",
      anchor: null,
      createdAt: now,
      updatedAt: now,
      revision: 0,
    };
    expect(() => validateNote(note)).not.toThrow();
    expect(() => validateNote({ ...note, bodyText: " \n ", revision: 1 })).not.toThrow();
  });

  it("resolves a stored range only to matching ordered units and text", async () => {
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const anchor = createVerseAnchor(
      fixture.edition,
      chapter,
      chapter.verseUnits.slice(0, 2).map((unit) => unit.key),
      "Sample A",
    );
    expect(anchorMatchesChapter(anchor, fixture.edition, chapter)).toBe(true);
    expect(anchorMatchesContent(anchor, fixture.edition, chapter)).toBe(true);
    expect(
      anchorMatchesChapter({ ...anchor, contentRevision: "different" }, fixture.edition, chapter),
    ).toBe(false);
    expect(
      anchorMatchesContent({ ...anchor, contentRevision: "different" }, fixture.edition, chapter),
    ).toBe(true);
    const revisedChapter = {
      ...chapter,
      verseUnits: [
        chapter.verseUnits[0]!,
        {
          key: "synthetic-inserted-unit",
          label: "1a",
          order: 1,
          textPlain: "Synthetic inserted text.",
          textDigest: "1".repeat(64),
        },
        ...chapter.verseUnits.slice(1).map((unit) => ({ ...unit, order: unit.order + 1 })),
      ],
    };
    expect(
      anchorMatchesContent(
        { ...anchor, contentRevision: "different" },
        fixture.edition,
        revisedChapter,
      ),
    ).toBe(false);
    expect(
      anchorMatchesContent(
        { ...anchor, selectedTextDigests: ["0".repeat(64), anchor.selectedTextDigests[1]!] },
        fixture.edition,
        chapter,
      ),
    ).toBe(false);
    expect(
      anchorMatchesChapter(
        { ...anchor, selectedTextDigests: ["0".repeat(64), anchor.selectedTextDigests[1]!] },
        fixture.edition,
        chapter,
      ),
    ).toBe(false);
    expect(
      anchorMatchesChapter(
        { ...anchor, unitKeys: [...anchor.unitKeys].reverse() },
        fixture.edition,
        chapter,
      ),
    ).toBe(false);
  });

  it("hides a saved highlight when its source revision or verse text no longer matches", async () => {
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const anchor = createVerseAnchor(
      fixture.edition,
      chapter,
      [chapter.verseUnits[0]!.key],
      "Sample A",
    );
    const now = new Date().toISOString();
    const highlight = {
      id: crypto.randomUUID(),
      anchor,
      colorToken: "yellow" as const,
      createdAt: now,
      updatedAt: now,
    };
    expect(resolvedHighlightColors([highlight], fixture.edition, chapter)).toEqual({
      [anchor.unitKeys[0]!]: "yellow",
    });
    expect(
      resolvedHighlightColors(
        [{ ...highlight, anchor: { ...anchor, contentRevision: "changed" } }],
        fixture.edition,
        chapter,
      ),
    ).toEqual({});
    expect(
      resolvedHighlightColors(
        [{ ...highlight, anchor: { ...anchor, selectedTextDigests: ["0".repeat(64)] } }],
        fixture.edition,
        chapter,
      ),
    ).toEqual({});
  });
});
