#!/usr/bin/env node
// Inspect the built native renderer before Tauri packages it.
import { readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "../..");
const forbiddenExtensions = new Set([".zip", ".usx", ".usfm", ".sqlite", ".db"]);

function fixtureText(value, found = []) {
  if (Array.isArray(value)) {
    for (const item of value) fixtureText(item, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (key === "textPlain" && typeof item === "string" && item.length >= 24) found.push(item);
      else fixtureText(item, found);
    }
  }
  return found;
}

export function verifyRenderer(directory, fixturePath) {
  const samples = fixtureText(JSON.parse(readFileSync(fixturePath, "utf8")));
  if (!samples.length)
    throw new Error("Native renderer gate: no synthetic fixture samples available");
  let scripts = 0;
  function inspect(path) {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const target = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Native renderer gate: symlink in dist: ${target}`);
      if (entry.isDirectory()) {
        inspect(target);
        continue;
      }
      const extension = extname(entry.name).toLowerCase();
      if (forbiddenExtensions.has(extension))
        throw new Error(`Native renderer gate: source archive or database in dist: ${target}`);
      if (extension !== ".js") continue;
      scripts += 1;
      const code = readFileSync(target, "utf8");
      if (code.includes("indexedDB"))
        throw new Error(`Native renderer gate: browser persistence in dist: ${target}`);
      if (code.includes("wdioTauri") || code.includes("plugin:wdio"))
        throw new Error(`Native renderer gate: test automation bridge in dist: ${target}`);
      if (samples.some((sample) => code.includes(sample)))
        throw new Error(`Native renderer gate: synthetic Scripture in dist: ${target}`);
    }
  }
  inspect(directory);
  if (!scripts) throw new Error("Native renderer gate: no JavaScript bundle found");
  return { scripts, fixtureSamples: samples.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyRenderer(
      resolve(root, "dist"),
      resolve(root, "content/fixtures/sample.json"),
    );
    console.log(
      `Native renderer gate passed: ${result.scripts} scripts, ${result.fixtureSamples} fixture samples checked.`,
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
