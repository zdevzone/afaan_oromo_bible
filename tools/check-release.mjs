import { readFile } from "node:fs/promises";

// This deliberately blocks public packaging until the real pipeline/rights gate exists.
// An arbitrary local manifest cannot stand in for recorded permission and integrity review.
const roadmap = new URL("../docs/ROADMAP.md", import.meta.url);
await readFile(roadmap, "utf8");
throw new Error(
  "Public production packaging is blocked: no authorized edition or approved content pipeline exists yet. " +
    "Complete the Phase 2 content and licensing gates. Use desktop:dev or desktop:check only for labeled internal fixtures.",
);
