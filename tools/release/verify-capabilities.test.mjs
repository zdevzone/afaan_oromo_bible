import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const root = resolve(import.meta.dirname, "../..");
const readJson = (path) => JSON.parse(readFileSync(resolve(root, path), "utf8"));

test("WebDriver capability is available only in the explicit native-test overlay", () => {
  const base = readJson("src-tauri/tauri.conf.json");
  const testOverlay = readJson("src-tauri/tauri.native-test.conf.json");
  const reader = readJson("src-tauri/capabilities/default.json");
  const nativeTest = readJson("src-tauri/capabilities/native-test.json");

  assert.deepEqual(base.app.security.capabilities, ["reader-main"]);
  assert.deepEqual(testOverlay.app.security.capabilities, ["reader-main", "native-test"]);
  assert.equal(reader.identifier, "reader-main");
  assert.equal(
    reader.permissions.some((permission) => permission.startsWith("wdio")),
    false,
  );
  assert.equal(nativeTest.identifier, "native-test");
  assert.deepEqual(nativeTest.permissions, ["wdio-webdriver:default", "wdio:default"]);
});
