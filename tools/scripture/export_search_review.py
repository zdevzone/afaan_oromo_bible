#!/usr/bin/env python3
"""Export local real-source apostrophe cases for fluent search review.

This packet is a review aid, not a production search profile or approval.
Keep it in the ignored review directory because it contains source words.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
from pathlib import Path
import sqlite3

from search_projection import normalize_search_text


MARKS = ("\u02bc", "\u2019")


def source_token(text: str, mark: str) -> str | None:
    for token in text.split():
        if mark in token:
            return token.strip(".,;:!?()[]\"“”")
    return None


def count_matches(connection: sqlite3.Connection, query: str, edition: str) -> int:
    normalized = normalize_search_text(query)
    if len(normalized.split()) != 1:
        raise ValueError("Review query is not one normalized token.")
    expression = '"' + normalized.replace('"', '""') + '"'
    return connection.execute(
        "SELECT count(*) FROM verse_search CROSS JOIN verse_unit v "
        "ON v.rowid=verse_search.rowid WHERE verse_search MATCH ? AND v.edition_id=?",
        (expression, edition),
    ).fetchone()[0]


def export(database: Path, output: Path) -> int:
    if output.exists():
        raise ValueError("Review output already exists; choose a new path.")
    connection = sqlite3.connect(f"file:{database.resolve()}?mode=ro", uri=True)
    try:
        manifest = connection.execute(
            "SELECT approval_status,edition_id,source_archive_sha256,search_profile_version "
            "FROM content_manifest"
        ).fetchone()
        if manifest is None or manifest[0] != "technical_only":
            raise ValueError("Expected an internal technical-only pack.")
        rows = []
        for mark in MARKS:
            seen = set()
            for book, chapter, verse, body in connection.execute(
                "SELECT book_code,chapter_label,verse_label,text_plain FROM verse_unit "
                "WHERE instr(text_plain,?)>0 ORDER BY book_order,chapter_order,unit_order",
                (mark,),
            ):
                token = source_token(body, mark)
                if token is None:
                    continue
                if mark == "\u2019" and not token.endswith(mark):
                    continue
                normalized = normalize_search_text(token)
                if len(normalized.split()) != 1 or mark not in token or normalized in seen:
                    continue
                seen.add(normalized)
                typed = token.replace(mark, "'")
                rows.append((
                    "internal modifier apostrophe" if mark == "\u02bc" else "boundary curly quote",
                    f"U+{ord(mark):04X}", book, chapter, verse, token, typed,
                    count_matches(connection, token, manifest[1]),
                    count_matches(connection, typed, manifest[1]), "", "",
                ))
                if len(seen) == 6:
                    break
            if len(seen) < 6:
                raise ValueError(f"Insufficient source examples for U+{ord(mark):04X}.")
        output.parent.mkdir(parents=True, exist_ok=True)
        with output.open("w", encoding="utf-8-sig", newline="") as stream:
            writer = csv.writer(stream)
            writer.writerow(("case_kind", "source_mark", "book", "chapter", "verse", "source_word",
                             "typed_ascii_apostrophe", "source_query_hits", "ascii_query_hits",
                             "expected_behavior_reviewed", "reviewer_note"))
            writer.writerows(rows)
        print(f"Exported {len(rows)} technical search cases to {output}; "
              f"source SHA-256 {manifest[2]}; pack SHA-256 "
              f"{hashlib.sha256(database.read_bytes()).hexdigest()}; "
              f"profile {manifest[3]}. Counts are diagnostic, not approved expectations.")
        return len(rows)
    finally:
        connection.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    export(args.database, args.out)


if __name__ == "__main__":
    main()
