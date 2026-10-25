import assert from "node:assert/strict";
import { test } from "node:test";
import { candidateFromRows, parseCsv } from "./prepare-candidate.mjs";

const en = { first: "Open {book}", second: "Save, close" };
const worksheet = [
  ["key", "english", "required_placeholders", "oromo_reviewed", "reviewer_note"],
  ["first", "Open {book}", "book", "", ""],
  ["second", "Save, close", "", "", ""],
];

test("CSV intake handles quoted commas, escaped quotes, newlines and BOM", () => {
  assert.deepEqual(parseCsv('\uFEFF"a","b,b","c""d","line\nnext"\r\n'), [
    ["a", "b,b", 'c"d', "line\nnext"],
  ]);
  assert.throws(() => parseCsv('"unfinished'), /inside a quoted/);
  assert.throws(() => parseCsv('"closed"oops'), /Invalid CSV quoting/);
});

test("blank worksheet cannot become a candidate", () => {
  assert.throws(() => candidateFromRows(worksheet, en), /wording is missing/);
});

test("complete rows pass mechanical intake, while stale source and placeholders fail", () => {
  const rows = worksheet.map((row) => [...row]);
  for (const row of rows.slice(1)) row[3] = row[1];
  assert.deepEqual(candidateFromRows(rows, en), en);
  const stale = rows.map((row) => [...row]);
  stale[1][1] += " changed";
  assert.throws(() => candidateFromRows(stale, en), /English source/);
  const broken = rows.map((row) => [...row]);
  const placeholderRow = broken.slice(1).find((row) => row[2]);
  placeholderRow[3] = placeholderRow[3].replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/u, "");
  assert.throws(() => candidateFromRows(broken, en), /placeholders differ/);
  const extra = rows.map((row) => [...row]);
  extra.push([...extra[1]]);
  assert.throws(() => candidateFromRows(extra, en), /Expected/);
});
