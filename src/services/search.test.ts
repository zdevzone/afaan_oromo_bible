import { describe, expect, it } from "vite-plus/test";
import {
  matchesSearch,
  normalizeSearchText,
  parseSearchQuery,
  validateParsedSearch,
} from "./search";

describe("bounded search grammar and Unicode fixture profile", () => {
  it.each([
    ["WAaqaa", "waaqaa", true],
    ["cafe\u0301", "CAFÉ", true],
    ["café", "cafe", false],
    ["aa", "a", false],
    ["bba", "ba", false],
    ["ga\u2019ee", "ga'ee", true],
    ["ga\u02bcee", "ga'ee", false],
    ["gaee", "ga'ee", false],
    ["'aa'", "aa", true],
    ["aa, bb", '"aa bb"', true],
    ["waaqaa", "waa*", true],
    ["careful reading stays local", 'care* "reading stays" local', true],
    ["careful local reading stays", 'care* "reading stays" local', true],
    ["careful reading stays local", '"careful stays"', false],
  ])("matches %s against %s = %s without changing display text", (display, input, expected) => {
    const original = display;
    expect(matchesSearch(display, parseSearchQuery(input))).toBe(expected);
    expect(display).toBe(original);
  });

  it.each(["", "   ", '"aa', "aa**", "*aa", "w*", '"aa*"', '""', "aa:bb", "aa(bb)", '"aa"bb'])(
    "rejects malformed query %j before a storage query",
    (input) => expect(() => parseSearchQuery(input)).toThrow(),
  );

  it("limits code points, clauses and total phrase tokens", () => {
    expect(() => parseSearchQuery("a".repeat(257))).toThrow();
    expect(() => parseSearchQuery(Array.from({ length: 21 }, () => "aa").join(" "))).toThrow();
    expect(() =>
      parseSearchQuery(`"${Array.from({ length: 21 }, () => "aa").join(" ")}"`),
    ).toThrow();
    expect(parseSearchQuery("é".repeat(256)).clauses).toHaveLength(1);
  });

  it("treats FTS-looking words as literal normalized tokens", () => {
    expect(parseSearchQuery("OR NOT")).toEqual({
      clauses: [
        { tokens: ["or"], prefix: false },
        { tokens: ["not"], prefix: false },
      ],
    });
    expect(() =>
      validateParsedSearch({ clauses: [{ tokens: ["aa OR bb"], prefix: false }] }),
    ).toThrow();
    expect(() =>
      validateParsedSearch({ clauses: [{ tokens: ["aa", "bb"], prefix: true }] }),
    ).toThrow();
  });

  it("uses an explicit narrow fold and keeps linguistic distinctions", () => {
    expect(normalizeSearchText("CAFÉ WAaqaa ga’ee")).toBe("café waaqaa ga'ee");
    expect(normalizeSearchText("aa bba gaʼee")).toBe("aa bba gaʼee");
    expect(normalizeSearchText("İ")).toBe("İ"); // Deliberately outside the bounded case-fold table.
  });
});
