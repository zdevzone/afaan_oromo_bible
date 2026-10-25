import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("..", import.meta.url));

for (const phase of ["write", "reopen", "edit-links", "verify-relinked"]) {
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn("vp", ["exec", "wdio", "run", "wdio.native.conf.mjs"], {
      cwd,
      env: { ...process.env, AOB_NATIVE_UI_PHASE: phase },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve(signal ? 1 : (code ?? 1)));
  });

  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
