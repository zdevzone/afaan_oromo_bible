#!/usr/bin/env node
// Mechanical intake for a fluent review worksheet. Never approves or installs it.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { en } from "../../src/locales/en.ts";

const HEADERS = ["key", "english", "required_placeholders", "oromo_reviewed", "reviewer_note"];

export function parseCsv(input) {
  const source = input.replace(/^\uFEFF/u, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  let closed = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        closed = true;
      } else {
        field += character;
      }
    } else if (character === '"' && !field && !closed) {
      quoted = true;
    } else if (character === "," || character === "\n" || character === "\r") {
      row.push(field);
      field = "";
      closed = false;
      if (character !== ",") {
        if (character === "\r" && source[index + 1] === "\n") index += 1;
        rows.push(row);
        row = [];
      }
    } else if (closed || character === '"') {
      throw new Error(`Invalid CSV quoting near character ${index}.`);
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error("The worksheet ends inside a quoted CSV field.");
  if (row.length || field || closed) rows.push([...row, field]);
  return rows;
}

function placeholders(value) {
  return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/gu)]
    .map((match) => match[1])
    .sort((left, right) => left.localeCompare(right));
}

export function candidateFromRows(rows, sourceCatalog) {
  if (JSON.stringify(rows[0]) !== JSON.stringify(HEADERS))
    throw new Error("The worksheet header or column order has changed.");
  const keys = Object.keys(sourceCatalog);
  if (rows.length !== keys.length + 1)
    throw new Error(`Expected ${keys.length} catalog rows; found ${rows.length - 1}.`);
  const candidate = {};
  for (const [index, key] of keys.entries()) {
    const row = rows[index + 1];
    if (!row || row.length !== HEADERS.length || row[0] !== key)
      throw new Error(`Worksheet row ${index + 2} has a missing, extra or reordered key.`);
    const [_, english, required, translated] = row;
    const expected = sourceCatalog[key];
    if (english !== expected || required !== placeholders(expected).join(" "))
      throw new Error(
        `The English source or placeholder list changed for ${key}; export a fresh worksheet.`,
      );
    if (!translated?.trim()) throw new Error(`Afaan Oromo wording is missing for ${key}.`);
    if (
      JSON.stringify(placeholders(translated)) !== JSON.stringify(placeholders(expected)) ||
      /[{}]/u.test(translated.replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/gu, ""))
    )
      throw new Error(`Afaan Oromo placeholders differ for ${key}.`);
    candidate[key] = translated;
  }
  return candidate;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const inputPath = process.argv[2];
  if (!inputPath || process.argv.length !== 3) {
    console.error(
      "Usage: node tools/locales/prepare-candidate.mjs <completed-review-worksheet.csv>",
    );
    process.exitCode = 2;
  } else {
    try {
      const bytes = readFileSync(inputPath);
      if (bytes.length > 1024 * 1024) throw new Error("The worksheet exceeds 1 MiB.");
      const candidate = candidateFromRows(parseCsv(bytes.toString("utf8")), en);
      const output = resolve(".tooling/review/om-candidate.json");
      const body = `${JSON.stringify(candidate, null, 2)}\n`;
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, body, "utf8");
      const hash = createHash("sha256").update(body).digest("hex");
      console.log(
        `Mechanically validated ${Object.keys(candidate).length} strings at ${output}; candidate SHA-256 ${hash}. Fluent approval remains required.`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
