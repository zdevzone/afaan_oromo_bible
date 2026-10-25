import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import fixture from "../../../content/fixtures/sample.json";
import { createVerseAnchor, DEFAULT_PREFERENCES } from "../../domain/notes";
import type { Note } from "../../domain/notes";
import { createFixtureLibrary } from "./fixtureLibrary";
import { IndexedDbUserStore } from "./indexedDbUserStore";

const stores: IndexedDbUserStore[] = [];

function openStore(factory = new IDBFactory(), databaseName = crypto.randomUUID()) {
  const store = new IndexedDbUserStore({ indexedDb: factory, databaseName });
  stores.push(store);
  return store;
}

function note(): Note {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Private draft",
    bodyText: "A plain local note.",
    anchor: null,
    createdAt: now,
    updatedAt: now,
    revision: 0,
  };
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

describe("IndexedDB user-store durability contract", () => {
  it("takes a consistent personal snapshot and replaces records with a retained recovery copy", async () => {
    const factory = new IDBFactory();
    const databaseName = crypto.randomUUID();
    const first = openStore(factory, databaseName);
    const original = await first.saveNote(note());
    await first.savePreferences({ ...DEFAULT_PREFERENCES, theme: "dark" });
    const originalSnapshot = await first.readSnapshot();
    const replacement = {
      ...originalSnapshot,
      notes: [{ ...original, id: crypto.randomUUID(), title: "Restored note", revision: 1 }],
    };
    const location = await first.replaceSnapshot(replacement);
    expect(location).toBe("Browser development storage");
    const recovery = await first.readRecoveryBackup();
    expect(recovery?.data.notes[0]?.id).toBe(original.id);
    await first.close();
    const reopened = openStore(factory, databaseName);
    expect(await reopened.readSnapshot()).toEqual(replacement);
    expect(await reopened.readRecoveryBackup()).toEqual(recovery);
    await reopened.replaceSnapshot(originalSnapshot);
    expect(await reopened.readSnapshot()).toEqual(originalSnapshot);
  });

  it("leaves current records intact when replacement fails after recovery is saved", async () => {
    const store = openStore();
    const original = await store.saveNote(note());
    const replacement = {
      ...(await store.readSnapshot()),
      notes: [{ ...original, id: crypto.randomUUID() }],
    };
    // The write fails inside the replacement transaction. Its clear and prior puts roll back.
    // oxlint-disable-next-line typescript/unbound-method
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (this.name === "notes" && args[0]?.id === replacement.notes[0]?.id)
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return originalPut.apply(this, args);
    });
    await expect(store.replaceSnapshot(replacement)).rejects.toMatchObject({
      code: "STORAGE_FULL",
    });
    expect(await store.listNotes()).toEqual([original]);
    expect(await store.readRecoveryBackup()).toBeNull();
  });
  it("keeps the last successful recovery pointer after a later failed replacement", async () => {
    const store = openStore();
    const original = await store.saveNote(note());
    const firstReplacement = { ...(await store.readSnapshot()), notes: [] };
    await store.replaceSnapshot(firstReplacement);
    const firstRecovery = await store.readRecoveryBackup();
    const invalid = { ...firstReplacement, notes: [{ ...original, id: crypto.randomUUID() }] };
    // The test adapter injects an in-transaction failure after the recovery copy is written.
    // oxlint-disable-next-line typescript/unbound-method
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function (
      this: IDBObjectStore,
      ...args
    ) {
      if (this.name === "notes")
        throw new DOMException("Synthetic quota failure", "QuotaExceededError");
      return originalPut.apply(this, args);
    });
    await expect(store.replaceSnapshot(invalid)).rejects.toMatchObject({ code: "STORAGE_FULL" });
    expect(await store.readRecoveryBackup()).toEqual(firstRecovery);
    expect(await store.listNotes()).toEqual([]);
  });
  it("persists one color per verse and rolls back a failed highlight batch", async () => {
    const factory = new IDBFactory();
    const databaseName = crypto.randomUUID();
    const first = openStore(factory, databaseName);
    const chapter = await createFixtureLibrary().getChapter({
      editionId: fixture.edition.id,
      bookCode: "TSA",
      chapterLabel: "1",
    });
    const now = new Date().toISOString();
    const records = chapter.verseUnits.slice(0, 2).map((unit) => ({
      id: crypto.randomUUID(),
      anchor: createVerseAnchor(fixture.edition, chapter, [unit.key], "Sample Book A"),
      colorToken: "yellow" as const,
      createdAt: now,
      updatedAt: now,
    }));
    expect(await first.saveHighlights(records)).toEqual(records);
    const recolored = {
      ...records[0]!,
      colorToken: "blue" as const,
      updatedAt: new Date(Date.parse(now) + 1000).toISOString(),
    };
    await first.saveHighlights([recolored]);
    await expect(
      first.saveHighlights([{ ...recolored, anchor: records[1]!.anchor }]),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    await expect(
      first.saveHighlights([
        {
          ...recolored,
          colorToken: "rose",
          updatedAt: new Date(Date.parse(now) + 2000).toISOString(),
        },
        { ...records[1]!, id: crypto.randomUUID(), colorToken: "green" },
      ]),
    ).rejects.toMatchObject({ code: "REVISION_CONFLICT" });
    await first.close();
    const reopened = openStore(factory, databaseName);
    expect((await reopened.listHighlights()).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [recolored, records[1]].sort((a, b) => a.id.localeCompare(b.id)),
    );
    await reopened.deleteHighlights(records.map((item) => item.id));
    expect(await reopened.listHighlights()).toEqual([]);
  });
  it("deduplicates passage bookmarks, preserves labels, and commits edits and removal across restart", async () => {
    const factory = new IDBFactory();
    const databaseName = crypto.randomUUID();
    const first = openStore(factory, databaseName);
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
    const createdAt = "2026-10-24T10:00:00.000Z";
    const saved = await first.saveBookmark({
      id: crypto.randomUUID(),
      anchor,
      label: "Return here",
      createdAt,
      updatedAt: createdAt,
    });
    const duplicate = await first.saveBookmark({
      id: crypto.randomUUID(),
      anchor: { ...anchor, id: crypto.randomUUID() },
      label: "",
      createdAt: "2026-10-24T10:00:01.000Z",
      updatedAt: "2026-10-24T10:00:01.000Z",
    });
    expect(duplicate.id).toBe(saved.id);
    expect(duplicate.label).toBe("Return here");
    expect(await first.listBookmarks()).toHaveLength(1);
    const edited = await first.saveBookmark({
      ...duplicate,
      label: "Edited label",
      updatedAt: "2026-10-24T10:00:02.000Z",
    });
    await first.close();
    const reopened = openStore(factory, databaseName);
    expect(await reopened.listBookmarks()).toEqual([edited]);
    await expect(reopened.saveBookmark({ ...saved, label: "Stale" })).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    await reopened.deleteBookmark(edited.id);
    expect(await reopened.listBookmarks()).toEqual([]);
  });
  it("refuses an empty new record but preserves an existing note intentionally emptied by its author", async () => {
    const store = openStore();
    await expect(store.saveNote({ ...note(), title: "", bodyText: " \n " })).rejects.toMatchObject({
      code: "INPUT_INVALID",
    });
    const saved = await store.saveNote(note());
    const emptied = await store.saveNote({ ...saved, title: "", bodyText: "" });
    expect(emptied.revision).toBe(2);
    expect(await store.listNotes()).toEqual([emptied]);
  });

  it("reopens notes, reading position and preferences in a fresh adapter instance", async () => {
    const factory = new IDBFactory();
    const databaseName = crypto.randomUUID();
    const first = openStore(factory, databaseName);
    expect(await first.getPreferences()).toEqual(DEFAULT_PREFERENCES);
    const saved = await first.saveNote(note());
    expect(saved.revision).toBe(1);
    const position = {
      editionId: "synthetic-development",
      bookCode: "TSA",
      chapterLabel: "1",
      verseLabel: "2-3",
      updatedAt: new Date().toISOString(),
    };
    await first.saveReadingPosition(position);
    await first.savePreferences({
      uiLocale: "om",
      theme: "dark",
      fontSizePx: 24,
      lineHeight: 1.9,
      width: "wide",
    });
    await first.close();
    const reopened = openStore(factory, databaseName);
    expect(await reopened.listNotes()).toEqual([saved]);
    expect(await reopened.getReadingPosition()).toEqual(position);
    expect(await reopened.getPreferences()).toEqual({
      uiLocale: "om",
      theme: "dark",
      fontSizePx: 24,
      lineHeight: 1.9,
      width: "wide",
    });
    await reopened.deleteNote(saved.id);
    expect(await reopened.listNotes()).toEqual([]);
  });

  it("serializes competing writes and rejects a stale revision instead of losing a newer edit", async () => {
    const factory = new IDBFactory();
    const name = crypto.randomUUID();
    const a = openStore(factory, name);
    const b = openStore(factory, name);
    const saved = await a.saveNote(note());
    const results = await Promise.allSettled([
      a.saveNote({ ...saved, bodyText: "First competing edit" }),
      b.saveNote({ ...saved, bodyText: "Second competing edit" }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const records = await a.listNotes();
    expect(records[0]?.revision).toBe(2);
    await expect(a.saveNote({ ...saved, bodyText: "Stale editor buffer" })).rejects.toMatchObject({
      code: "REVISION_CONFLICT",
    });
    expect((await a.listNotes())[0]).toEqual(records[0]);
  });

  it("keeps the newer reading position when a delayed older write arrives", async () => {
    const store = openStore();
    const position = {
      editionId: "synthetic-development",
      bookCode: "TSA",
      chapterLabel: "2",
      verseLabel: "1",
      updatedAt: "2026-10-19T12:00:01Z",
    };
    await store.saveReadingPosition(position);
    await store.saveReadingPosition({
      ...position,
      chapterLabel: "1",
      updatedAt: "2026-10-19T12:00:00.999Z",
    });
    expect(await store.getReadingPosition()).toEqual(position);
  });

  it("rejects and rolls back a transaction aborted after a successful write request", async () => {
    const store = openStore();
    const saved = await store.saveNote(note());
    // The spy preserves this method and explicitly supplies the real store through apply below.
    // oxlint-disable-next-line typescript/unbound-method
    const originalPut = IDBObjectStore.prototype.put;
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(function (
      this: IDBObjectStore,
      ...args
    ) {
      const request = originalPut.apply(this, args);
      request.addEventListener("success", () => request.transaction?.abort());
      return request;
    });
    const unsaved = { ...saved, bodyText: "This buffer must remain an unsaved draft." };
    await expect(store.saveNote(unsaved)).rejects.toMatchObject({ code: "WRITE_FAILED" });
    expect(unsaved.bodyText).toBe("This buffer must remain an unsaved draft.");
    expect(await store.listNotes()).toEqual([saved]);
  });

  it("preserves existing data when a write fails or an oversized edit is rejected", async () => {
    const store = openStore();
    const saved = await store.saveNote(note());
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementationOnce(() => {
      throw new DOMException("Synthetic quota failure", "QuotaExceededError");
    });
    await expect(
      store.saveNote({ ...saved, bodyText: "An unsaved update." }),
    ).rejects.toMatchObject({ code: "STORAGE_FULL" });
    await expect(
      store.saveNote({ ...saved, bodyText: "é".repeat(1024 * 1024) }),
    ).rejects.toMatchObject({ code: "INPUT_INVALID" });
    expect(await store.listNotes()).toEqual([saved]);
  });
});
