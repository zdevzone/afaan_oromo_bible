import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { verifyRenderer } from "./verify-renderer.mjs";

test("native renderer rejects source bytes and browser storage code", () => {
  const directory = mkdtempSync(join(tmpdir(), "aob-renderer-gate-"));
  try {
    const dist = join(directory, "dist");
    mkdirSync(dist);
    const fixture = join(directory, "fixture.json");
    const sample = "Synthetic invented passage used only in a test.";
    writeFileSync(fixture, JSON.stringify({ textPlain: sample }));
    const bundle = join(dist, "main.js");
    writeFileSync(bundle, "const app = 'native';");
    assert.deepEqual(verifyRenderer(dist, fixture), { scripts: 1, fixtureSamples: 1 });
    writeFileSync(bundle, `const passage = ${JSON.stringify(sample)};`);
    assert.throws(() => verifyRenderer(dist, fixture), /synthetic Scripture/);
    writeFileSync(bundle, "indexedDB.open('user');");
    assert.throws(() => verifyRenderer(dist, fixture), /browser persistence/);
    writeFileSync(bundle, "window.wdioTauri = {}; /* plugin:wdio */");
    assert.throws(() => verifyRenderer(dist, fixture), /test automation bridge/);
    writeFileSync(bundle, "const app = 'native';");
    const archive = join(dist, "source.zip");
    writeFileSync(archive, "test source");
    assert.throws(() => verifyRenderer(dist, fixture), /source archive or database/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
