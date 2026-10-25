#!/usr/bin/env node
// Export the English UI catalog for fluent review without creating an approved catalog.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { en } from "../../src/locales/en.ts";

const output = resolve(process.argv[2] ?? ".tooling/review/afaan-oromo-ui-worksheet.csv");
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
const entries = Object.entries(en);
const rows = [
  ["key", "english", "required_placeholders", "oromo_reviewed", "reviewer_note"],
  ...entries.map(([key, english]) => [
    key,
    english,
    [...english.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
      .map((match) => match[1])
      .sort()
      .join(" "),
    "",
    "",
  ]),
];
const csv = `${rows.map((row) => row.map(quote).join(",")).join("\r\n")}\r\n`;
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `\uFEFF${csv}`, "utf8");
const sourceHash = createHash("sha256").update(JSON.stringify(en)).digest("hex");
console.log(
  `Exported ${entries.length} English UI strings to ${output}; source catalog SHA-256 ${sourceHash}.`,
);
