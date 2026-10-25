import { describe, expect, it } from "vite-plus/test";
import {
  activeUiLanguage,
  catalogComplete,
  catalogFor,
  catalogWithFallback,
  formatUiDate,
  oromoCatalogComplete,
} from "./catalog";
import { en } from "./en";

describe("interface language fallback", () => {
  it("tags the visible English fallback as English while retaining the Oromo preference", () => {
    expect(oromoCatalogComplete).toBe(false);
    expect(catalogFor("om").chapter).toBe(en.chapter);
    expect(activeUiLanguage("om")).toBe("en");
  });

  it("uses the Oromo language tag once the reviewed catalog is complete", () => {
    expect(activeUiLanguage("om", true)).toBe("om");
    expect(activeUiLanguage("en", true)).toBe("en");
  });

  it("formats dates in the language actually shown, including the English fallback", () => {
    const value = "2026-10-25T10:30:00.000Z";
    const options: Intl.DateTimeFormatOptions = {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    };
    expect(formatUiDate(value, "om", options)).toBe(
      new Intl.DateTimeFormat("en", options).format(new Date(value)),
    );
    expect(formatUiDate(value, "om", options)).not.toBe(
      new Intl.DateTimeFormat("om", options).format(new Date(value)),
    );
  });

  it("requires matching placeholders before treating a draft catalog as complete", () => {
    const source = { reference: "Open {book} {chapter}" };
    expect(catalogComplete(source, { reference: "Open {chapter} {book}" })).toBe(true);
    expect(catalogComplete(source, { reference: "Open {book}" })).toBe(false);
    expect(catalogComplete(source, { reference: "Open {book} {chapter} {chapter}" })).toBe(false);
    expect(catalogComplete(source, { reference: "Open {book} {chapter} {" })).toBe(false);
    expect(catalogWithFallback(source, { reference: "Open {book}" }).reference).toBe(
      source.reference,
    );
    expect(catalogWithFallback(source, { reference: "Open {chapter} {book}" }).reference).toBe(
      "Open {chapter} {book}",
    );
  });
});
