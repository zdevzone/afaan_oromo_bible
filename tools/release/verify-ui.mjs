#!/usr/bin/env node
// Mechanical UI gate; a matching manifest does not replace fluent human review.
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const oromoPath = resolve(root, "src/locales/om.json");
const manifestPath = resolve(root, "content/distribution/approved-ui.json");

function fail(message) {
  throw new Error(`Release UI gate: ${message}`);
}

function verifyCoverage(english, oromo) {
  const expectedKeys = Object.keys(english).sort();
  if (
    !oromo ||
    typeof oromo !== "object" ||
    Array.isArray(oromo) ||
    JSON.stringify(Object.keys(oromo).sort()) !== JSON.stringify(expectedKeys) ||
    expectedKeys.some((key) => typeof oromo[key] !== "string" || !oromo[key].trim())
  )
    fail("Afaan Oromo catalog is incomplete or has unsupported entries");
  for (const key of expectedKeys) {
    const placeholders = (value) =>
      [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
        .map((match) => match[1])
        .sort((left, right) => left.localeCompare(right));
    if (
      JSON.stringify(placeholders(oromo[key])) !== JSON.stringify(placeholders(english[key])) ||
      /[{}]/.test(oromo[key].replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/g, ""))
    )
      fail(`Afaan Oromo catalog placeholder mismatch: ${key}`);
  }
  return expectedKeys.length;
}

export function verifyUiCatalog(english, oromo, manifest, oromoBytes) {
  const fields = ["formatVersion", "locale", "reviewEvidenceId", "catalogSha256"];
  const count = verifyCoverage(english, oromo);
  if (
    !manifest ||
    typeof manifest !== "object" ||
    Array.isArray(manifest) ||
    JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(fields.sort()) ||
    manifest.formatVersion !== 1 ||
    manifest.locale !== "om" ||
    typeof manifest.reviewEvidenceId !== "string" ||
    !manifest.reviewEvidenceId.trim() ||
    manifest.reviewEvidenceId.length > 256 ||
    typeof manifest.catalogSha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(manifest.catalogSha256)
  )
    fail("review manifest has unsupported or incomplete fields");
  const actualHash = createHash("sha256").update(oromoBytes).digest("hex");
  if (actualHash !== manifest.catalogSha256) fail("reviewed catalog checksum differs");
  return { count, hash: actualHash };
}

async function main() {
  const { en } = await import("../../src/locales/en.ts");
  let bytes;
  let oromo;
  try {
    if (statSync(oromoPath).size > 256 * 1024) fail("Oromo catalog is too large");
    bytes = readFileSync(oromoPath);
    oromo = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    if (error?.message?.startsWith("Release UI gate:")) throw error;
    fail("Oromo catalog is missing or invalid");
  }
  verifyCoverage(en, oromo);
  let manifest;
  try {
    if (statSync(manifestPath).size > 16 * 1024) fail("review manifest is too large");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    if (error?.message?.startsWith("Release UI gate:")) throw error;
    fail("approved-ui.json is missing or invalid");
  }
  const result = verifyUiCatalog(en, oromo, manifest, bytes);
  console.log(`Release UI gate passed: ${result.count} Oromo strings (${result.hash}).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
