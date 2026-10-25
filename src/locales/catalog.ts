import type { Preferences } from "../domain/notes";
import { en, type UiCatalog } from "./en";
import { om } from "./om";

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g)]
    .map((match) => match[1])
    .sort((left, right) => left.localeCompare(right));
}

function usableTranslation(source: string, translated: unknown): translated is string {
  return (
    typeof translated === "string" &&
    translated.trim().length > 0 &&
    JSON.stringify(placeholders(source)) === JSON.stringify(placeholders(translated)) &&
    !/[{}]/.test(translated.replace(/\{[a-zA-Z][a-zA-Z0-9]*\}/g, ""))
  );
}

export function catalogComplete<T extends Record<string, string>>(
  source: T,
  translated: Partial<{ [Key in keyof T]: string }>,
): boolean {
  return (
    Object.keys(translated).length === Object.keys(source).length &&
    Object.keys(source).every((key) =>
      usableTranslation(source[key as keyof T], translated[key as keyof T]),
    )
  );
}

// Missing or malformed Oromo entries use English; Settings declares that fallback.
export const oromoCatalogComplete = catalogComplete(en, om);

export function catalogWithFallback<T extends Record<string, string>>(
  source: T,
  translated: Partial<{ [Key in keyof T]: string }>,
): { [Key in keyof T]: string } {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => {
      const candidate = translated[key as keyof T];
      return [key, usableTranslation(value, candidate) ? candidate : value];
    }),
  ) as { [Key in keyof T]: string };
}

export function catalogFor(locale: Preferences["uiLocale"]): UiCatalog {
  return locale === "om" ? catalogWithFallback(en, om) : en;
}

export function activeUiLanguage(
  preferred: Preferences["uiLocale"],
  complete = oromoCatalogComplete,
): Preferences["uiLocale"] {
  return preferred === "om" && complete ? "om" : "en";
}

export function formatUiDate(
  value: Date | number | string,
  preferred: Preferences["uiLocale"],
  options: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(activeUiLanguage(preferred), options).format(date);
}
