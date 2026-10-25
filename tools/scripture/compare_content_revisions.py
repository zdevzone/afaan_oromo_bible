#!/usr/bin/env python3
"""Compare two immutable content packs before replacing one edition revision.

The report contains identities, hashes and references, never Scripture text or
personal records. It is a review input, not authorization to distribute a pack.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sqlite3


def digest(path: Path) -> str:
    checksum = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            checksum.update(chunk)
    return checksum.hexdigest()


def read_pack(path: Path) -> dict:
    checksum = digest(path)
    with sqlite3.connect(f"file:{path.resolve()}?mode=ro", uri=True) as database:
        if database.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError(f"SQLite integrity failed for {path}")
        if database.execute("PRAGMA foreign_key_check").fetchone() is not None:
            raise ValueError(f"SQLite foreign keys failed for {path}")
        manifest = database.execute(
            "SELECT format_version,approval_status,source_archive_sha256,chapter_tree_sha256,"
            "edition_id,versification_id FROM content_manifest"
        ).fetchall()
        if len(manifest) != 1 or manifest[0][0] != 1:
            raise ValueError(f"Invalid content manifest in {path}")
        format_version, approval, source_hash, revision, edition, scheme = manifest[0]
        units = {}
        for key, book, chapter, label, text, text_digest, order in database.execute(
            "SELECT unit_key,book_code,chapter_label,verse_label,text_plain,text_digest,unit_order "
            "FROM verse_unit"
        ):
            if key in units:
                raise ValueError(f"Duplicate verse unit key in {path}")
            if json.loads(key) != [edition, scheme, book, chapter, label]:
                raise ValueError(f"Invalid verse unit identity in {path}")
            if hashlib.sha256(text.encode("utf-8")).hexdigest() != text_digest:
                raise ValueError(f"Verse text digest mismatch in {path}")
            units[key] = (book, chapter, label, text_digest, order)
        lookup = {}
        for book, chapter, requested, order, key in database.execute(
            "SELECT book_code,chapter_label,requested_label,target_order,unit_key "
            "FROM reference_lookup ORDER BY book_code,chapter_label,requested_label,target_order"
        ):
            lookup.setdefault((book, chapter, requested), []).append((order, key))
        if not units or not lookup:
            raise ValueError(f"Content addresses are empty in {path}")
        return {
            "identity": {
                "librarySha256": checksum,
                "approvalStatus": approval,
                "sourceArchiveSha256": source_hash,
                "contentRevision": revision,
                "editionId": edition,
                "versificationId": scheme,
            },
            "units": units,
            "lookup": lookup,
        }


def compare(old: dict, new: dict) -> dict:
    before = old["identity"]
    after = new["identity"]
    if (before["editionId"], before["versificationId"]) != (
        after["editionId"], after["versificationId"]
    ):
        raise ValueError("Different edition or versification identities cannot be revision-compared")
    old_units, new_units = old["units"], new["units"]
    shared = old_units.keys() & new_units.keys()
    changed = sorted(
        key for key in shared if old_units[key][:4] != new_units[key][:4]
    )
    reordered = sorted(
        key for key in shared if old_units[key][:4] == new_units[key][:4]
        and old_units[key][4] != new_units[key][4]
    )
    removed = sorted(old_units.keys() - new_units.keys())
    added = sorted(new_units.keys() - old_units.keys())
    old_lookup, new_lookup = old["lookup"], new["lookup"]
    changed_lookups = sorted(
        key for key in old_lookup.keys() & new_lookup.keys()
        if old_lookup[key] != new_lookup[key]
    )
    return {
        "status": "review-required" if (changed or reordered or removed or added
                                        or changed_lookups or old_lookup.keys() != new_lookup.keys())
                  else "same-addresses-and-text",
        "scope": "Whole-pack address inventory; no personal-record census or visual/wording approval",
        "old": before,
        "new": after,
        "counts": {
            "oldUnits": len(old_units),
            "newUnits": len(new_units),
            "unchangedUnitKeysAndText": len(shared) - len(changed) - len(reordered),
            "changedAddressOrText": len(changed),
            "reorderedWithinChapter": len(reordered),
            "removedUnitKeys": len(removed),
            "addedUnitKeys": len(added),
            "removedReferenceLookups": len(old_lookup.keys() - new_lookup.keys()),
            "addedReferenceLookups": len(new_lookup.keys() - old_lookup.keys()),
            "changedReferenceLookups": len(changed_lookups),
            "potentialHighlightUnitKeysNeedingReanchor": len(old_units) if
                before["contentRevision"] != after["contentRevision"] else 0,
        },
        "examples": {
            "changedUnitKeys": changed[:20],
            "reorderedUnitKeys": reordered[:20],
            "removedUnitKeys": removed[:20],
            "addedUnitKeys": added[:20],
            "changedReferenceLookups": [list(key) for key in changed_lookups[:20]],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--old", type=Path, required=True)
    parser.add_argument("--new", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("Output already exists; choose a new report path")
    report = compare(read_pack(args.old), read_pack(args.new))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {args.out}: {report['status']}")


if __name__ == "__main__":
    main()
