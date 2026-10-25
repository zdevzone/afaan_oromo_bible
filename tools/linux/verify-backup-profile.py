#!/usr/bin/env python3
"""Compare an installed app profile read-only with its portable backup."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sqlite3
from typing import Any


TABLES = ("note", "bookmark", "highlight", "preference", "reading_position")


def canonical(records: list[dict[str, Any]]) -> list[str]:
    return sorted(json.dumps(record, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                  for record in records)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument("database", type=Path)
    args = parser.parse_args()

    backup = json.loads(args.backup.read_text(encoding="utf-8"))
    if backup.get("format") != "afaan-oromo-bible-user-backup" or backup.get("formatVersion") != 1:
        raise SystemExit("Backup format is not supported by this verification tool.")
    expected_data = backup["data"]
    anchor_by_id = {anchor["id"]: anchor for anchor in expected_data["anchors"]}
    expected: dict[str, list[dict[str, Any]]] = {
        "note": [], "bookmark": [], "highlight": [],
        "preference": expected_data["preferences"],
        "reading_position": expected_data["readingPositions"],
    }
    for table, backup_name in (("note", "notes"), ("bookmark", "bookmarks"), ("highlight", "highlights")):
        for exported in expected_data[backup_name]:
            record = dict(exported)
            anchor_id = record.pop("anchorId")
            record["anchor"] = anchor_by_id.get(anchor_id) if anchor_id else None
            expected[table].append(record)

    with sqlite3.connect(args.database.resolve().as_uri() + "?mode=ro", uri=True) as connection:
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        actual = {
            table: [json.loads(row[0]) for row in connection.execute(f"SELECT json FROM {table}")]
            for table in TABLES
        }
    if integrity != "ok":
        raise SystemExit(f"User database integrity check failed: {integrity}")
    for table in TABLES:
        if canonical(actual[table]) != canonical(expected[table]):
            raise SystemExit(f"Installed profile differs from backup in table {table}.")

    print(json.dumps({
        "status": "passed",
        "integrity": integrity,
        "record_counts": {table: len(actual[table]) for table in TABLES},
        "anchor_count": len(anchor_by_id),
        "exact_backup_match": True,
    }, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
