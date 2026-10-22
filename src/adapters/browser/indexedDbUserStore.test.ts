import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { DEFAULT_PREFERENCES } from "../../domain/notes";
import type { Note } from "../../domain/notes";
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
    await first.savePreferences({ theme: "dark", fontSizePx: 24, lineHeight: 1.9, width: "wide" });
    await first.close();
    const reopened = openStore(factory, databaseName);
    expect(await reopened.listNotes()).toEqual([saved]);
    expect(await reopened.getReadingPosition()).toEqual(position);
    expect(await reopened.getPreferences()).toEqual({
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
