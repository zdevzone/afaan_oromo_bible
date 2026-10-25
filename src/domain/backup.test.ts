import { describe, expect, it } from "vite-plus/test";
import fixture from "../../content/fixtures/sample.json";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { createVerseAnchor, DEFAULT_PREFERENCES, type Note } from "./notes";
import { createBackup, parseBackup, type PersonalSnapshot } from "./backup";

const databaseId = "1ba9139d-41dd-4f2a-bd11-09738a9e4970";

async function sample(): Promise<PersonalSnapshot> {
  const chapter = await createFixtureLibrary().getChapter({
    editionId: fixture.edition.id,
    bookCode: "TSA",
    chapterLabel: "1",
  });
  const anchor = createVerseAnchor(
    fixture.edition,
    chapter,
    [chapter.verseUnits[1]!.key],
    "Sample Book A",
  );
  const now = "2026-10-24T10:00:00.000Z";
  const note: Note = {
    id: crypto.randomUUID(),
    title: "My note",
    bodyText: "User text only",
    anchor,
    createdAt: now,
    updatedAt: now,
    revision: 2,
  };
  const standalone: Note = {
    id: crypto.randomUUID(),
    title: "Standalone note",
    bodyText: "Personal text without a passage",
    anchor: null,
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
  return {
    notes: [note, standalone],
    bookmarks: [{ id: crypto.randomUUID(), anchor, label: "Here", createdAt: now, updatedAt: now }],
    highlights: [
      { id: crypto.randomUUID(), anchor, colorToken: "yellow", createdAt: now, updatedAt: now },
    ],
    preferences: [{ ...DEFAULT_PREFERENCES }],
    readingPositions: [
      {
        editionId: fixture.edition.id,
        bookCode: "TSA",
        chapterLabel: "1",
        verseLabel: "2-3",
        updatedAt: now,
      },
    ],
  };
}

describe("portable backup contract", () => {
  it("round-trips linked personal records without including source Scripture text", async () => {
    const snapshot = await sample();
    snapshot.preferences[0]!.uiLocale = "om";
    const backup = createBackup(snapshot, databaseId, "0.1.0", "2026-10-24T10:00:00.000Z");
    expect(backup.data.anchors).toHaveLength(1);
    expect(backup.data.notes.map((item) => item.anchorId)).toEqual([
      snapshot.notes[0]!.anchor!.id,
      null,
    ]);
    expect(JSON.stringify(backup)).not.toContain("Synthetic test sentence:");
    expect(parseBackup(JSON.stringify(backup)).snapshot).toEqual(snapshot);
  });

  it("rejects an unsupported interface locale before restoring records", async () => {
    const backup = createBackup(await sample(), databaseId, "0.1.0");
    const tampered = JSON.stringify(backup).replace('"uiLocale":"en"', '"uiLocale":"fr"');
    expect(tampered).not.toBe(JSON.stringify(backup));
    expect(() => parseBackup(tampered)).toThrow();
  });

  it("rejects missing links, duplicate identities, unsupported fields and versions", async () => {
    const backup = createBackup(await sample(), databaseId, "0.1.0");
    const text = (value: unknown) => JSON.stringify(value);
    expect(() => parseBackup(text({ ...backup, formatVersion: 2 }))).toThrow();
    expect(() => parseBackup(text({ ...backup, unexpected: true }))).toThrow();
    expect(() => parseBackup(text({ ...backup, data: { ...backup.data, anchors: [] } }))).toThrow();
    expect(() =>
      parseBackup(
        text({
          ...backup,
          data: { ...backup.data, notes: [...backup.data.notes, backup.data.notes[0]] },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(
        text({
          ...backup,
          data: { ...backup.data, notes: [{ ...backup.data.notes[0], revision: 0 }] },
        }),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(
        text({
          ...backup,
          data: {
            ...backup.data,
            highlights: [{ ...backup.data.highlights[0], colorToken: "orange" }],
          },
        }),
      ),
    ).toThrow();
  });

  it("rejects a backup beyond the encoded byte limit before parsing", () => {
    expect(() => parseBackup("x".repeat(50 * 1024 * 1024 + 1))).toThrow();
  });
});
