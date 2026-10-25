import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { createFixtureLibrary } from "../adapters/browser/fixtureLibrary";
import { DEFAULT_PREFERENCES } from "../domain/notes";
import type { AppServices } from "../domain/ports";
import { AppError } from "../domain/scripture";
import { App } from "./App";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("corrupt personal storage at startup", () => {
  it("shows preservation and recovery guidance instead of a content error", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const corrupt = () => {
      throw new AppError("STORAGE_CORRUPT", "The personal database is unreadable.");
    };
    const recover = vi.fn(async () => "/app-data/recovery/corrupt-user-test");
    const services: AppServices = {
      runtime: "browser",
      library: { ...createFixtureLibrary(), listEditions: async () => corrupt() },
      userStore: {
        readSnapshot: async () => corrupt(),
        getDatabaseId: async () => corrupt(),
        readRecoveryBackup: async () => corrupt(),
        replaceSnapshot: async () => corrupt(),
        listBookmarks: async () => corrupt(),
        saveBookmark: async () => corrupt(),
        deleteBookmark: async () => corrupt(),
        listHighlights: async () => corrupt(),
        saveHighlights: async () => corrupt(),
        deleteHighlights: async () => corrupt(),
        listNotes: async () => corrupt(),
        saveNote: async () => corrupt(),
        deleteNote: async () => corrupt(),
        getReadingPosition: async () => corrupt(),
        saveReadingPosition: async () => corrupt(),
        getPreferences: async () => ({ ...DEFAULT_PREFERENCES }),
        savePreferences: async () => corrupt(),
      },
      platform: {
        copyText: async () => {},
        saveBackup: async () => null,
        openBackup: async () => null,
        recoverCorruptDatabase: recover,
      },
    };
    render(<App services={services} />);
    expect(await screen.findByRole("heading", { name: "Personal data unavailable" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("database is unreadable");
    expect(screen.getByText(/preserve the app data folder/u)).toBeTruthy();
    expect(screen.getByText(/app has not reset your records/u)).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: "Archive unreadable data and start fresh" }),
    );
    expect(recover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Archive and create empty database" }));
    expect(await screen.findByRole("dialog", { name: "Personal database ready" })).toBeTruthy();
    expect(recover).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/corrupt-user-test/u)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open backup controls" }));
    expect(await screen.findByRole("dialog", { name: "Make room for reading" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Review backup to restore" })).toBeTruthy();

    cleanup();
    services.library.listEditions = async () => {
      throw new AppError("STORAGE_IN_USE", "Personal data is open in another application window.");
    };
    render(<App services={services} />);
    expect(await screen.findByRole("heading", { name: "Personal data unavailable" })).toBeTruthy();
    expect(screen.getByText(/Close the other application window/u)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Archive unreadable data and start fresh" }),
    ).toBeNull();
  });
});
