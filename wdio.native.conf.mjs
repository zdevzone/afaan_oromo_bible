import { resolve } from "node:path";

const application =
  process.env.AOB_NATIVE_BINARY ??
  resolve(
    "src-tauri/target/debug/afaan-oromo-bible" + (process.platform === "win32" ? ".exe" : ""),
  );

export const config = {
  runner: "local",
  specs: ["./tests/native/**/*.spec.mjs"],
  maxInstances: 1,
  logLevel: "warn",
  framework: "mocha",
  reporters: ["spec"],
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: application,
        driverProvider: "embedded",
        embeddedPort: Number(process.env.TAURI_WEBDRIVER_PORT ?? 4445),
      },
    ],
  ],
  capabilities: [
    {
      browserName: "tauri",
      "tauri:options": { application },
    },
  ],
  mochaOpts: { timeout: 60_000 },
};
