import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { verifyUiCatalog } from "./verify-ui.mjs";

const english = { action: "Save", warning: "Keep the draft" };
const oromo = { action: "reviewed action", warning: "reviewed warning" };
const bytes = Buffer.from(JSON.stringify(oromo));
const manifest = {
  formatVersion: 1,
  locale: "om",
  reviewEvidenceId: "review-record-1",
  catalogSha256: createHash("sha256").update(bytes).digest("hex"),
};

test("requires complete reviewed catalog bytes for a release candidate", () => {
  assert.equal(verifyUiCatalog(english, oromo, manifest, bytes).count, 2);
  assert.throws(() => verifyUiCatalog(english, { action: "reviewed action" }, manifest, bytes));
  assert.throws(() => verifyUiCatalog(english, { ...oromo, extra: "text" }, manifest, bytes));
  assert.throws(() => verifyUiCatalog(english, { ...oromo, warning: " " }, manifest, bytes));
  assert.throws(() => verifyUiCatalog(english, oromo, manifest, Buffer.from("changed")));
  assert.throws(() =>
    verifyUiCatalog(english, oromo, { ...manifest, reviewEvidenceId: "" }, bytes),
  );
});

test("rejects missing, extra and duplicate interpolation placeholders", () => {
  const english = { reference: "Open {book} {chapter}" };
  const catalog = { reference: "Open {chapter} {book}" };
  const bytes = Buffer.from(JSON.stringify(catalog));
  const review = { ...manifest, catalogSha256: createHash("sha256").update(bytes).digest("hex") };
  assert.equal(verifyUiCatalog(english, catalog, review, bytes).count, 1);
  for (const value of [
    "Open {book}",
    "Open {book} {other}",
    "Open {book} {chapter} {chapter}",
    "Open {book} {chapter} {unknown-name}",
    "Open {book} {chapter} {",
  ]) {
    const invalid = { reference: value };
    assert.throws(
      () => verifyUiCatalog(english, invalid, review, Buffer.from(JSON.stringify(invalid))),
      /placeholder mismatch/,
    );
  }
});
