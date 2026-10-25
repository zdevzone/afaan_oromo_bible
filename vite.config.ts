import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { varlockVitePlugin } from "@varlock/vite-integration";
import { checkPublicAssets } from "./tools/check-public-assets.ts";

checkPublicAssets(fileURLToPath(new URL("./public", import.meta.url)));

export default defineConfig({
  define: { __WDIO_TEST__: JSON.stringify(process.env.AOB_WDIO_TEST === "1") },
  plugins: [varlockVitePlugin(), react(), tailwindcss()],
  clearScreen: false,
  cacheDir: ".tooling/vite-cache",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  server: {
    host: "127.0.0.1",
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
  preview: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { target: "es2022" },
  fmt: { ignorePatterns: ["env.d.ts", "content/fixtures/sample.json"] },
  lint: { options: { typeAware: true, typeCheck: true } },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/contracts/**/*.test.ts"],
    clearMocks: true,
  },
});
