import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { createTauriServices } from "./createTauriServices";

const native = vi.hoisted(() => ({
  isTauri: vi.fn(() => false),
  createTauriLibrary: vi.fn(() => ({})),
  createTauriUserStore: vi.fn(() => ({})),
  createTauriWindow: vi.fn(async () => ({})),
  nativeBackupFiles: {},
  writeText: vi.fn(async () => {}),
  createFixtureLibrary: vi.fn(() => ({})),
  createIndexedDbUserStore: vi.fn(() => ({})),
  browserBackupFiles: vi.fn(() => ({})),
}));

vi.mock("@tauri-apps/api/core", () => ({ isTauri: native.isTauri }));
vi.mock("../adapters/tauri/library", () => ({
  createTauriLibrary: native.createTauriLibrary,
}));
vi.mock("../adapters/tauri/userStore", () => ({
  createTauriUserStore: native.createTauriUserStore,
}));
vi.mock("../adapters/tauri/window", () => ({ createTauriWindow: native.createTauriWindow }));
vi.mock("../adapters/tauri/backupFiles", () => ({ nativeBackupFiles: native.nativeBackupFiles }));
vi.mock("@tauri-apps/plugin-clipboard-manager", () => ({ writeText: native.writeText }));
vi.mock("../adapters/browser/fixtureLibrary", () => ({
  createFixtureLibrary: native.createFixtureLibrary,
}));
vi.mock("../adapters/browser/indexedDbUserStore", () => ({
  createIndexedDbUserStore: native.createIndexedDbUserStore,
}));
vi.mock("../adapters/browser/backupFiles", () => ({
  browserBackupFiles: native.browserBackupFiles,
}));

beforeEach(() => {
  native.isTauri.mockReset().mockReturnValue(false);
  native.createTauriLibrary.mockClear();
  native.createTauriUserStore.mockClear();
  native.createTauriWindow.mockReset().mockResolvedValue({});
  native.writeText.mockClear();
  native.createFixtureLibrary.mockClear();
  native.createIndexedDbUserStore.mockClear();
  native.browserBackupFiles.mockClear();
});

describe("runtime service composition", () => {
  it("fails a desktop-target build outside Tauri without constructing browser adapters", async () => {
    await expect(createTauriServices()).rejects.toMatchObject({ code: "NATIVE_UNAVAILABLE" });

    expect(native.createFixtureLibrary).not.toHaveBeenCalled();
    expect(native.createIndexedDbUserStore).not.toHaveBeenCalled();
    expect(native.browserBackupFiles).not.toHaveBeenCalled();
  });

  it("does not fall back to browser storage when native window initialization fails", async () => {
    native.isTauri.mockReturnValue(true);
    native.createTauriWindow.mockRejectedValue(new Error("native window unavailable"));

    await expect(createTauriServices()).rejects.toThrow("native window unavailable");

    expect(native.createFixtureLibrary).not.toHaveBeenCalled();
    expect(native.createIndexedDbUserStore).not.toHaveBeenCalled();
    expect(native.browserBackupFiles).not.toHaveBeenCalled();
  });
});
