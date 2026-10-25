import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { verifyContentFiles } from "./verify-content.mjs";

const sourceHash = "a".repeat(64);
const revision = "b".repeat(64);

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "aob-content-gate-"));
  const library = join(directory, "library.sqlite");
  const manifestPath = join(directory, "approved-content.json");
  const database = new DatabaseSync(library);
  database.exec(`
    CREATE TABLE content_manifest (
      format_version INTEGER, approval_status TEXT, search_profile_version TEXT,
      source_archive_sha256 TEXT, chapter_tree_sha256 TEXT, edition_id TEXT
    );
    INSERT INTO content_manifest VALUES (1, 'approved', 'reviewed-latin-v1',
      '${sourceHash}', '${revision}', 'fixture-edition');
    CREATE TABLE edition (id TEXT PRIMARY KEY, json TEXT NOT NULL);
    CREATE TABLE book (edition_id TEXT, code TEXT, display_order INTEGER, json TEXT);
    CREATE TABLE chapter (edition_id TEXT, book_code TEXT, chapter_label TEXT,
      display_order INTEGER, json TEXT);
    CREATE TABLE verse_unit (unit_key TEXT, text_plain TEXT, book_order INTEGER,
      chapter_order INTEGER, unit_order INTEGER);
    CREATE VIRTUAL TABLE verse_search USING fts5(text);
    CREATE TABLE source_notice (id INTEGER);
    INSERT INTO source_notice VALUES (1);
  `);
  const key = "GEN.1.1";
  database.prepare("INSERT INTO edition VALUES (?,?)").run(
    "fixture-edition",
    JSON.stringify({
      id: "fixture-edition",
      title: "Fixture",
      abbreviation: "FX",
      languageTag: "en",
      versificationId: "fixture",
      canonId: "fixture",
      isSynthetic: false,
      contentRevision: revision,
      sourceArchiveSha256: sourceHash,
      sourceTitle: "Invented test edition",
      rightsHolderName: "Test holder",
      attribution: "Synthetic contract fixture",
      licenseNotice: "Synthetic contract fixture",
    }),
  );
  database.prepare("INSERT INTO book VALUES (?,?,?,?)").run(
    "fixture-edition",
    "GEN",
    0,
    JSON.stringify({
      editionId: "fixture-edition",
      code: "GEN",
      name: "Genesis",
      aliases: ["Genesis"],
      chapters: ["1"],
      order: 0,
    }),
  );
  const chapter = {
    editionId: "fixture-edition",
    bookCode: "GEN",
    chapterLabel: "1",
    verseUnits: [{ key, label: "1", order: 0, textPlain: "hello", textDigest: "c".repeat(64) }],
    blocks: [
      {
        kind: "block",
        role: "paragraph",
        style: "p",
        content: [
          { kind: "verseStart", unitKey: key },
          { kind: "text", text: "hello" },
          { kind: "verseEnd" },
        ],
      },
    ],
    referenceLookup: { 1: [key] },
  };
  database
    .prepare("INSERT INTO chapter VALUES (?,?,?,?,?)")
    .run("fixture-edition", "GEN", "1", 0, JSON.stringify(chapter));
  database.prepare("INSERT INTO verse_unit VALUES (?,?,?,?,?)").run(key, "hello", 0, 0, 0);
  database.prepare("INSERT INTO verse_search(rowid,text) VALUES(1,?)").run("hello");
  database.close();
  const manifest = {
    formatVersion: 1,
    approvalStatus: "approved",
    approvalEvidenceId: "mechanical-test-only",
    librarySha256: createHash("sha256").update(readFileSync(library)).digest("hex"),
    sourceArchiveSha256: sourceHash,
    editionId: "fixture-edition",
    contentRevision: revision,
    searchProfileVersion: "reviewed-latin-v1",
  };
  const save = () => writeFileSync(manifestPath, JSON.stringify(manifest));
  save();
  return { directory, library, manifestPath, manifest, save };
}

function refreshLibraryDigest(input) {
  input.manifest.librarySha256 = createHash("sha256")
    .update(readFileSync(input.library))
    .digest("hex");
  input.save();
}

test("release content gate validates exact bytes and database identity", async () => {
  const input = fixture();
  try {
    assert.deepEqual(await verifyContentFiles(input.manifestPath, input.library), {
      editionId: "fixture-edition",
      librarySha256: input.manifest.librarySha256,
    });
    input.manifest.sourceArchiveSha256 = "c".repeat(64);
    input.save();
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /SQLite content manifest is not approved or does not match/,
    );
    input.manifest.sourceArchiveSha256 = sourceHash;
    input.manifest.searchProfileVersion = "technical-latin-v1";
    input.save();
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /approval manifest has unsupported or incomplete fields/,
    );
    input.manifest.searchProfileVersion = "reviewed-unimplemented-v2";
    input.save();
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /approval manifest has unsupported or incomplete fields/,
    );
    input.manifest.searchProfileVersion = "reviewed-latin-v1";
    input.save();
    writeFileSync(input.library, "tampered");
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /library.sqlite checksum differs/,
    );
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});

test("release content gate rejects missing input files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "aob-content-gate-missing-"));
  try {
    await assert.rejects(
      verifyContentFiles(join(directory, "missing.json"), join(directory, "missing.sqlite")),
      /approved-content.json is missing or invalid/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("release content gate rejects development review labels inside a candidate pack", async () => {
  const input = fixture();
  try {
    const database = new DatabaseSync(input.library);
    const edition = JSON.parse(database.prepare("SELECT json FROM edition").get().json);
    database
      .prepare("UPDATE edition SET json=?")
      .run(JSON.stringify({ ...edition, technicalReviewOnly: true }));
    database.close();
    refreshLibraryDigest(input);
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /edition identity or notices are incomplete/,
    );
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});

test("release content gate rejects hash-consistent malformed renderer records", async () => {
  const input = fixture();
  try {
    const database = new DatabaseSync(input.library);
    const chapter = JSON.parse(database.prepare("SELECT json FROM chapter").get().json);
    chapter.blocks = [];
    database.prepare("UPDATE chapter SET json=?").run(JSON.stringify(chapter));
    database.close();
    refreshLibraryDigest(input);
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /renderer content contract failed/,
    );
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});

test("release content gate rejects hash-consistent mismatched search projections", async () => {
  const input = fixture();
  try {
    const database = new DatabaseSync(input.library);
    database.prepare("UPDATE verse_search SET text='wrong'").run();
    database.close();
    refreshLibraryDigest(input);
    await assert.rejects(
      verifyContentFiles(input.manifestPath, input.library),
      /renderer content contract failed/,
    );
  } finally {
    rmSync(input.directory, { recursive: true, force: true });
  }
});
