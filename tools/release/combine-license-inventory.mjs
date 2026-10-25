#!/usr/bin/env node
// Create a local metadata worksheet. License texts and release review are separate.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function topLevelNoticeFiles(directory) {
  return readdirSync(directory)
    .filter(
      (name) =>
        /^(license|licence|notice|copying)(?:[._-]|$)/iu.test(name) &&
        statSync(join(directory, name)).isFile(),
    )
    .map((name) => ({ name, sha256: sha256(join(directory, name)) }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function combine(js, rust) {
  const javascript = Object.values(js)
    .flat()
    .flatMap((item) =>
      item.versions.map((version) => ({
        name: item.name,
        version,
        license: item.license ?? null,
        topLevelNoticeFiles: topLevelNoticeFiles(item.paths[0]),
      })),
    )
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    );
  const rustPackages = rust.packages
    .filter((item) => item.id !== rust.resolve.root)
    .map((item) => ({
      name: item.name,
      version: item.version,
      license: item.license ?? null,
      topLevelNoticeFiles: topLevelNoticeFiles(dirname(item.manifest_path)),
    }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`),
    );
  if (!javascript.length || !rustPackages.length)
    throw new Error("Both JavaScript and Rust dependency metadata are required.");
  return { javascript, rust: rustPackages };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [jsPath, rustPath, outputPath] = process.argv.slice(2);
  if (!jsPath || !rustPath || !outputPath || process.argv.length !== 5) {
    console.error(
      "Usage: node tools/release/combine-license-inventory.mjs <pnpm-licenses.json> <cargo-metadata.json> <ignored-output.json>",
    );
    process.exitCode = 2;
  } else {
    try {
      const output = resolve(outputPath);
      const { javascript, rust } = combine(
        JSON.parse(readFileSync(jsPath, "utf8")),
        JSON.parse(readFileSync(rustPath, "utf8")),
      );
      const report = {
        status: "license-file-audit-input",
        sourceLockSha256: {
          pnpm: sha256("pnpm-lock.yaml"),
          cargo: sha256("src-tauri/Cargo.lock"),
        },
        counts: {
          javascript: javascript.length,
          rust: rust.length,
          missingLicenseMetadata: [...javascript, ...rust].filter((item) => !item.license).length,
          noTopLevelNoticeFile: [...javascript, ...rust].filter(
            (item) => item.topLevelNoticeFiles.length === 0,
          ).length,
        },
        javascript,
        rust,
      };
      writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
      console.log(
        `Wrote ${output}: ${javascript.length} JS and ${rust.length} Rust package versions; ${report.counts.missingLicenseMetadata} missing license fields; ${report.counts.noTopLevelNoticeFile} without a top-level notice file. Review actual shipped scope and license texts before release.`,
      );
    } catch (error) {
      console.error(error.message);
      process.exitCode = 1;
    }
  }
}
