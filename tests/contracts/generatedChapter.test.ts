// @vitest-environment node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vite-plus/test";
import { assertChapter, assertEdition } from "../../src/domain/validation";
import { normalizeSearchText } from "../../src/services/search";

const generatedPath = resolve(
  process.cwd(),
  "content/generated/oocs-2024-chapters-v4/chapters.json",
);
const databasePath =
  process.env.AOB_TECHNICAL_PACK_PATH ??
  resolve(process.cwd(), "content/generated/oocs-2024-technical-pack-v4/library.sqlite");
if (process.env.AOB_TECHNICAL_PACK_PATH && !existsSync(databasePath))
  throw new Error("The selected technical pack is missing.");

function record(value: unknown): asserts value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("Generated content is not an object.");
}

describe.skipIf(!existsSync(generatedPath))("local full-corpus chapter contract", () => {
  it("admits every generated chapter without changing verse text", () => {
    const generated: unknown = JSON.parse(readFileSync(generatedPath, "utf8"));
    record(generated);
    if (!Array.isArray(generated.books) || typeof generated.editionId !== "string")
      throw new Error("Generated content has no ordered books.");
    let chapters = 0;
    let units = 0;
    for (const book of generated.books as unknown[]) {
      record(book);
      if (typeof book.code !== "string" || !Array.isArray(book.chapters))
        throw new Error("Generated content has an invalid book.");
      for (const sourceChapter of book.chapters as unknown[]) {
        record(sourceChapter);
        const chapter: unknown = {
          editionId: generated.editionId,
          bookCode: book.code,
          chapterLabel: sourceChapter.label,
          blocks: sourceChapter.blocks,
          verseUnits: sourceChapter.verseUnits,
          referenceLookup: sourceChapter.referenceLookup,
        };
        assertChapter(chapter);
        chapters += 1;
        for (const unit of chapter.verseUnits) {
          expect(createHash("sha256").update(unit.textPlain, "utf8").digest("hex")).toBe(
            unit.textDigest,
          );
          units += 1;
        }
      }
    }
    expect(chapters).toBe(1189);
    expect(units).toBe(31102);
  }, 20_000);
});

describe.skipIf(!existsSync(databasePath))("local full-corpus search contract", () => {
  it("admits exact source identity from the technical pack", () => {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const row = database.prepare("SELECT json FROM edition").get();
      record(row);
      const edition: unknown = JSON.parse(String(row.json));
      assertEdition(edition);
      if (process.env.AOB_TECHNICAL_PACK_PATH) {
        expect(edition.sourceTitle).toBe("Biblica® Open Oromo Contemporary Scriptures 2024");
        expect(edition.rightsHolderName).toBe("Biblica, Inc.");
        expect(edition.languageName).toBe("Oromo, West Central");
        expect(edition.sourceCompletedOn).toBe("2024-07-01");
        expect(edition.sourceArchiveSha256).toBe(
          "ec543152e54faac1112e95ce74bc79ed2f20f26558edeef4b1b64fc96d608106",
        );
      }
    } finally {
      database.close();
    }
  });
  it("matches every indexed projection to the browser profile", () => {
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const status = database
        .prepare("SELECT approval_status,search_profile_version FROM content_manifest")
        .get();
      record(status);
      expect(status.approval_status).toBe("technical_only");
      expect(status.search_profile_version).toBe("technical-latin-v1");
      let count = 0;
      let firstToken = "";
      for (const row of database
        .prepare(
          "SELECT v.text_plain AS source_text,s.text AS indexed_text FROM verse_unit v JOIN verse_search s ON s.rowid=v.rowid ORDER BY v.rowid",
        )
        .iterate()) {
        record(row);
        if (typeof row.source_text !== "string" || typeof row.indexed_text !== "string")
          throw new Error("The search row has invalid text.");
        expect(row.indexed_text).toBe(normalizeSearchText(row.source_text));
        if (!firstToken) firstToken = row.indexed_text.split(" ")[0] ?? "";
        count += 1;
      }
      expect(count).toBe(31102);
      expect(firstToken.length).toBeGreaterThan(0);
      const result = database
        .prepare("SELECT count(*) AS total FROM verse_search WHERE verse_search MATCH ?")
        .get(`"${firstToken}"`);
      record(result);
      expect(Number(result.total)).toBeGreaterThan(0);
    } finally {
      database.close();
    }
  }, 20_000);
});
