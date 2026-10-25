#!/usr/bin/env node
// Mechanical package gate. Human rights, language and release approvals remain separate.
import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const directory = resolve(root, "content/distribution");
const manifestPath = resolve(directory, "approved-content.json");
const libraryPath = resolve(directory, "library.sqlite");

function fail(message) {
  throw new Error(`Release content gate: ${message}`);
}

function nonempty(value, max = 256) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function hash(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

async function fileHash(path) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest("hex");
}

export async function verifyContentFiles(manifestPath, libraryPath) {
  let manifest;
  try {
    if (statSync(manifestPath).size > 16 * 1024) fail("approval manifest is too large");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    if (error?.message?.startsWith("Release content gate:")) throw error;
    fail("approved-content.json is missing or invalid");
  }
  const fields = [
    "formatVersion",
    "approvalStatus",
    "approvalEvidenceId",
    "librarySha256",
    "sourceArchiveSha256",
    "editionId",
    "contentRevision",
    "searchProfileVersion",
  ];
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    Object.keys(manifest).length !== fields.length ||
    Object.keys(manifest).some((field) => !fields.includes(field)) ||
    manifest.formatVersion !== 1 ||
    manifest.approvalStatus !== "approved" ||
    !nonempty(manifest.approvalEvidenceId) ||
    !nonempty(manifest.editionId) ||
    !nonempty(manifest.contentRevision) ||
    manifest.searchProfileVersion !== "reviewed-latin-v1" ||
    !hash(manifest.librarySha256) ||
    !hash(manifest.sourceArchiveSha256)
  ) {
    fail("approval manifest has unsupported or incomplete fields");
  }
  let actualHash;
  try {
    actualHash = await fileHash(libraryPath);
  } catch {
    fail("library.sqlite is missing or unreadable");
  }
  if (actualHash !== manifest.librarySha256.toLowerCase()) fail("library.sqlite checksum differs");
  let database;
  try {
    database = new DatabaseSync(libraryPath, { readOnly: true });
    const content = database
      .prepare(
        "SELECT format_version,approval_status,search_profile_version,source_archive_sha256,chapter_tree_sha256,edition_id FROM content_manifest",
      )
      .get();
    if (
      !content ||
      content.format_version !== 1 ||
      content.approval_status !== "approved" ||
      content.search_profile_version !== manifest.searchProfileVersion ||
      content.source_archive_sha256 !== manifest.sourceArchiveSha256.toLowerCase() ||
      content.chapter_tree_sha256 !== manifest.contentRevision ||
      content.edition_id !== manifest.editionId
    )
      fail("SQLite content manifest is not approved or does not match");
    const editions = database.prepare("SELECT json FROM edition").all();
    if (editions.length !== 1) fail("pack must contain exactly one edition");
    const edition = JSON.parse(editions[0].json);
    if (
      edition.isSynthetic !== false ||
      edition.technicalReviewOnly !== undefined ||
      edition.id !== manifest.editionId ||
      edition.contentRevision !== manifest.contentRevision ||
      edition.sourceArchiveSha256 !== manifest.sourceArchiveSha256.toLowerCase() ||
      !nonempty(edition.sourceTitle) ||
      !nonempty(edition.rightsHolderName) ||
      !nonempty(edition.attribution, 1024 * 1024) ||
      !nonempty(edition.licenseNotice, 1024 * 1024)
    ) {
      fail("edition identity or notices are incomplete");
    }
    for (const table of ["book", "chapter", "verse_unit", "verse_search", "source_notice"]) {
      if (database.prepare(`SELECT count(*) AS count FROM ${table}`).get().count < 1)
        fail(`${table} has no records`);
    }
    // Use the renderer's production DTO and search projection contracts when
    // validating release bytes, including packs assembled outside this builder.
    const contract = spawnSync("vp", ["test", "tests/contracts/reviewedPack.test.ts"], {
      cwd: root,
      env: { ...process.env, AOB_REVIEWED_PACK_LIBRARY: resolve(libraryPath) },
      encoding: "utf8",
      timeout: 180_000,
    });
    if (contract.error || contract.status !== 0) {
      const detail = (contract.stderr || contract.stdout || contract.error?.message || "").trim();
      fail(`renderer content contract failed${detail ? `: ${detail.slice(-1200)}` : ""}`);
    }
    if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      fail("SQLite integrity check failed");
    if (database.prepare("PRAGMA foreign_key_check").all().length)
      fail("SQLite foreign-key check failed");
  } catch (error) {
    if (error?.message?.startsWith("Release content gate:")) throw error;
    fail("packaged SQLite structure is invalid");
  } finally {
    database?.close();
  }
  console.log(`Release content gate passed for ${manifest.editionId} (${actualHash}).`);
  return { editionId: manifest.editionId, librarySha256: actualHash };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  verifyContentFiles(manifestPath, libraryPath).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
