#!/usr/bin/env python3
"""Compare technical FTS results with the specified whole-token search rules.

The report records hashes and counts, not source words or Scripture text.
This is a technical diagnostic; fluent query relevance remains a separate gate.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sqlite3

from search_projection import normalize_search_text


def audit(database: Path) -> dict:
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    try:
        manifest = connection.execute(
            "SELECT approval_status,source_archive_sha256,search_profile_version FROM content_manifest"
        ).fetchone()
        if manifest is None or manifest[0] != "technical_only":
            raise ValueError("Expected an internal technical-only pack.")
        rows = [(key, normalize_search_text(body).split()) for key, body in connection.execute(
            "SELECT unit_key,text_plain FROM verse_unit ORDER BY book_order,chapter_order,unit_order"
        )]
        frequency = Counter(token for _, tokens in rows for token in set(tokens))
        ranked = [token for token, _ in frequency.most_common(100)]
        frequent = ranked[:25]
        phrases: list[tuple[str, str]] = []
        for _, tokens in rows:
            for pair in zip(tokens, tokens[1:]):
                if pair[0] in frequent[:15] and pair[1] in frequent[:15] and pair not in phrases:
                    phrases.append(pair)
                    if len(phrases) == 12:
                        break
            if len(phrases) == 12:
                break
        prefixes = list(dict.fromkeys(token[:3] for token in ranked if len(token) >= 4))[:15]
        modifiers = list(dict.fromkeys(
            token for _, tokens in rows for token in tokens if "\u02bc" in token
        ))[:6]
        cases: list[tuple[str, str | tuple[str, str]]] = (
            [("term", token) for token in frequent + modifiers]
            + [("phrase", pair) for pair in phrases]
            + [("prefix", prefix) for prefix in prefixes]
        )
        if len(rows) < 1 or len(frequent) < 25 or len(phrases) < 12 or len(prefixes) < 15 or len(modifiers) < 6:
            raise ValueError("The technical corpus lacks the planned query coverage.")
        mismatches = []
        counts = Counter()
        for index, (kind, query) in enumerate(cases):
            counts[kind] += 1
            if kind == "term":
                expected = [key for key, tokens in rows if query in tokens]
                expression = f'"{query}"'
            elif kind == "phrase":
                expected = [key for key, tokens in rows if any(
                    tokens[offset:offset + 2] == list(query) for offset in range(len(tokens) - 1)
                )]
                expression = '"' + " ".join(query) + '"'
            else:
                expected = [key for key, tokens in rows if any(
                    token.startswith(query) for token in tokens
                )]
                expression = f'"{query}"*'
            actual = [row[0] for row in connection.execute(
                "SELECT v.unit_key FROM verse_search JOIN verse_unit v "
                "ON v.rowid=verse_search.rowid WHERE verse_search MATCH ? "
                "ORDER BY v.book_order,v.chapter_order,v.unit_order", (expression,)
            )]
            if expected != actual:
                mismatches.append({"caseIndex": index, "kind": kind,
                                   "expectedCount": len(expected), "actualCount": len(actual)})
        return {
            "scope": "technical pack; exact ordered whole-token, adjacent phrase and three-code-point prefix results",
            "sourceArchiveSha256": manifest[1],
            "databaseSha256": hashlib.sha256(database.read_bytes()).hexdigest(),
            "searchProfileVersion": manifest[2],
            "verseUnits": len(rows),
            "querySetSha256": hashlib.sha256(json.dumps(cases, ensure_ascii=False).encode()).hexdigest(),
            "caseCounts": dict(counts),
            "mismatchCount": len(mismatches),
            "mismatches": mismatches,
        }
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Output already exists; choose a new report path.")
    report = audit(args.database)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Audited {sum(report['caseCounts'].values())} queries across "
          f"{report['verseUnits']} units: {report['mismatchCount']} mismatches; {args.out}")
    if report["mismatchCount"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
