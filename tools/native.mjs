import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const action = process.argv[2];
if (
  action !== "dev" &&
  action !== "check" &&
  action !== "native-test-build" &&
  action !== "release"
) {
  throw new Error("Use native.mjs dev, check, native-test-build, or release.");
}

const args = ["exec", "tauri", action === "dev" ? "dev" : "build"];
if (action !== "release") args.push("--features", "development-content");
if (action === "check") args.push("--debug", "--no-bundle", "--", "--locked");
if (action === "native-test-build") {
  args.splice(args.indexOf("development-content"), 1, "development-content,native-webdriver");
  args.push(
    "--config",
    "src-tauri/tauri.native-test.conf.json",
    "--debug",
    "--no-bundle",
    "--",
    "--locked",
  );
}
if (action === "release")
  args.push("--config", "src-tauri/tauri.release.conf.json", "--", "--locked");

const child = spawn("vp", args, {
  cwd: fileURLToPath(new URL("..", import.meta.url)),
  env: {
    ...process.env,
    APP_TARGET: "tauri",
    AOB_WDIO_TEST: action === "native-test-build" ? "1" : "0",
  },
  stdio: "inherit",
});
child.on("error", (error) => {
  console.error(
    `Could not start Vite+: ${error.message}. Install the global vp CLI and add it to PATH.`,
  );
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
