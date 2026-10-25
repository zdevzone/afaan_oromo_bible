import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { assertBook, assertChapter, assertEdition } from "../../src/domain/validation";
import { normalizeSearchText } from "../../src/services/search";

const library = process.env.AOB_REVIEWED_PACK_LIBRARY;

describe.skipIf(!library)("reviewed pack renderer contract", () => {
  it("accepts every edition, book and chapter through the production DTO validators", () => {
    if (!library) throw new Error("A reviewed pack path is required for this contract test.");
    const database = new DatabaseSync(library, { readOnly: true });
    try {
      const editions = database.prepare("SELECT json FROM edition").all();
      expect(editions).toHaveLength(1);
      for (const row of editions) assertEdition(JSON.parse(String(row.json)));
      const books = database.prepare("SELECT json FROM book ORDER BY display_order").all();
      expect(books.length).toBeGreaterThan(0);
      for (const row of books) assertBook(JSON.parse(String(row.json)));
      const chapters = database
        .prepare("SELECT json FROM chapter ORDER BY edition_id,book_code,display_order")
        .all();
      expect(chapters.length).toBeGreaterThan(0);
      for (const row of chapters) assertChapter(JSON.parse(String(row.json)));
    } finally {
      database.close();
    }
  });

  it("matches every indexed verse row to the app's search projection", () => {
    if (!library) throw new Error("A reviewed pack path is required for this contract test.");
    const database = new DatabaseSync(library, { readOnly: true });
    try {
      const rows = database
        .prepare(
          "SELECT v.unit_key AS unit_key,v.text_plain AS source,s.text AS indexed " +
            "FROM verse_unit v JOIN verse_search s ON s.rowid=v.rowid " +
            "ORDER BY v.book_order,v.chapter_order,v.unit_order",
        )
        .iterate();
      let checked = 0;
      for (const row of rows) {
        if (typeof row.source !== "string" || typeof row.indexed !== "string")
          throw new Error("A search projection row is invalid.");
        if (normalizeSearchText(row.source) !== row.indexed)
          throw new Error(`Search projection differs for unit ${String(row.unit_key)}.`);
        checked += 1;
      }
      expect(checked).toBe(database.prepare("SELECT count(*) AS n FROM verse_unit").get()?.n);
      expect(checked).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  });
});
