import { AppError } from "../domain/scripture";
import type { ParsedSearch, SearchClause } from "../domain/scripture";

/** Deliberately bounded Latin fixture profile, not full Unicode case folding. */
export const SEARCH_PROFILE_VERSION = "fixture-latin-v1";

function foldCharacter(character: string): string {
  const point = character.codePointAt(0);
  if (point === undefined) return character;
  if (
    (point >= 0x41 && point <= 0x5a) ||
    (point >= 0xc0 && point <= 0xd6) ||
    (point >= 0xd8 && point <= 0xde)
  )
    return String.fromCodePoint(point + 32);
  if (point === 0x178) return "\u00ff";
  return character === "\u2019" ? "'" : character;
}

export function tokenizeSearchText(value: string): string[] {
  // Iterate code points deliberately: this versioned profile is not grapheme segmentation.
  const folded = Array.from(value.normalize("NFC"), foldCharacter).join("").normalize("NFC");
  return folded.match(/[\p{L}\p{M}\p{N}]+(?:'[\p{L}\p{M}\p{N}]+)*/gu) ?? [];
}

export function normalizeSearchText(value: string): string {
  return tokenizeSearchText(value).join(" ");
}

function queryError(message: string): never {
  throw new AppError("QUERY_INVALID", message);
}

export function parseSearchQuery(input: string): ParsedSearch {
  if (Array.from(input).length > 256) queryError("Use no more than 256 characters in a search.");
  const source = input.trim();
  if (!source) queryError("Enter a word, a quoted phrase, or a prefix such as rea*.");
  const clauses: SearchClause[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/u.test(source[cursor] ?? "")) {
      cursor += 1;
      continue;
    }
    if (source[cursor] === '"') {
      const end = source.indexOf('"', cursor + 1);
      if (end < 0) queryError("Close the double quote around the search phrase.");
      const phrase = source.slice(cursor + 1, end);
      if (phrase.includes("*"))
        queryError("Use a trailing star on an unquoted word, not inside a phrase.");
      const next = source[end + 1];
      if (next !== undefined && !/\s/u.test(next))
        queryError("Separate search terms with a space.");
      const tokens = tokenizeSearchText(phrase);
      if (tokens.length === 0) queryError("A quoted phrase must contain a word.");
      clauses.push({ tokens, prefix: false });
      cursor = end + 1;
    } else {
      const rest = source.slice(cursor);
      const piece = rest.match(/^\S+/u)?.[0] ?? "";
      if (piece.includes('"')) queryError("Start a quoted phrase with a double quote.");
      if (/[:()^+{}[\]\\]/u.test(piece))
        queryError("Use words, quoted phrases, and trailing-star prefixes only.");
      const prefix = piece.endsWith("*");
      const raw = prefix ? piece.slice(0, -1) : piece;
      if (raw.includes("*")) queryError("A prefix has exactly one star at the end.");
      const tokens = tokenizeSearchText(raw);
      if (tokens.length !== 1)
        queryError("Separate words with spaces or put an adjacent phrase in double quotes.");
      if (prefix && Array.from(tokens[0] ?? "").length < 2)
        queryError("Use at least two characters before a prefix star.");
      clauses.push({ tokens, prefix });
      cursor += piece.length;
    }
  }
  const parsed: ParsedSearch = { clauses };
  validateParsedSearch(parsed);
  return parsed;
}

export function validateParsedSearch(value: unknown): asserts value is ParsedSearch {
  if (
    typeof value !== "object" ||
    value === null ||
    !("clauses" in value) ||
    !Array.isArray(value.clauses)
  ) {
    queryError("The search query is invalid.");
  }
  if (value.clauses.length === 0 || value.clauses.length > 20)
    queryError("Use between one and twenty search terms.");
  let total = 0;
  let totalCharacters = 0;
  for (const clause of value.clauses) {
    if (
      typeof clause !== "object" ||
      clause === null ||
      !("tokens" in clause) ||
      !Array.isArray(clause.tokens) ||
      clause.tokens.length === 0 ||
      !("prefix" in clause) ||
      typeof clause.prefix !== "boolean"
    )
      queryError("The search query is invalid.");
    for (const token of clause.tokens) {
      if (
        typeof token !== "string" ||
        token.length === 0 ||
        Array.from(token).length > 256 ||
        normalizeSearchText(token) !== token ||
        tokenizeSearchText(token).length !== 1
      )
        queryError("The search query contains an unsupported token.");
      totalCharacters += Array.from(token).length;
    }
    if (clause.prefix && (clause.tokens.length !== 1 || [...clause.tokens[0]].length < 2)) {
      queryError("Use at least two characters before a prefix star.");
    }
    total += clause.tokens.length;
  }
  if (total > 20) queryError("Use no more than twenty normalized words in a search.");
  if (totalCharacters + total - 1 > 256)
    queryError("Use no more than 256 normalized search characters.");
}

export function matchesSearch(text: string, query: ParsedSearch): boolean {
  const tokens = tokenizeSearchText(text);
  return query.clauses.every((clause) => {
    if (clause.prefix) return tokens.some((token) => token.startsWith(clause.tokens[0] ?? ""));
    return tokens.some((_, start) =>
      clause.tokens.every((term, index) => tokens[start + index] === term),
    );
  });
}
