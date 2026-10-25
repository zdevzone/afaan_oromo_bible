#!/usr/bin/env python3
"""Build a fresh V1 content pack only from a reviewed source and review record.

The review record is an input supplied by the content/release owners. Checking
its hashes cannot establish the truth or legal sufficiency of their decisions.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import sqlite3
import subprocess
import tempfile
import unicodedata

from build_library import (FORMAT_VERSION, IMPORTER_VERSION, SCHEMA, build_database,
                           source_metadata, verify_tree)
from usx_projection import ProjectionError


REVIEWED_PROFILE = "reviewed-latin-v1"
EVIDENCE_KINDS = ("rights", "presentation", "search")
REVIEW_FIELDS = {"formatVersion", "decision", "approvalEvidenceId",
                 "sourceArchiveSha256", "chapterTreeSha256", "editionId",
                 "versificationId", "searchProfileVersion", "evidence"}
HASH = re.compile(r"[0-9a-f]{64}")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_review(path: Path, tree: dict, tree_hash: str) -> dict:
    if path.stat().st_size > 16 * 1024:
        raise ProjectionError("Review record exceeds the size limit.")
    record = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(record, dict) or set(record) != REVIEW_FIELDS:
        raise ProjectionError("Review record fields are incomplete or unsupported.")
    evidence_id = record["approvalEvidenceId"]
    if (type(record["formatVersion"]) is not int or record["formatVersion"] != 1
            or record["decision"] != "approved-for-v1"
            or not isinstance(evidence_id, str) or not 1 <= len(evidence_id) <= 256
            or not evidence_id.strip()
            or record["sourceArchiveSha256"] != tree["sourceArchiveSha256"]
            or record["chapterTreeSha256"] != tree_hash
            or record["editionId"] != tree["editionId"]
            or record["versificationId"] != tree["versificationId"]
            or record["searchProfileVersion"] != REVIEWED_PROFILE):
        raise ProjectionError("Review decision or content/profile identity does not match.")
    evidence = record["evidence"]
    if not isinstance(evidence, dict) or set(evidence) != set(EVIDENCE_KINDS):
        raise ProjectionError("Rights, presentation and search evidence are required.")
    for kind in EVIDENCE_KINDS:
        entry = evidence[kind]
        if not isinstance(entry, dict) or set(entry) != {"file", "sha256"}:
            raise ProjectionError(f"{kind} evidence fields are invalid.")
        name, expected = entry["file"], entry["sha256"]
        if (not isinstance(name, str) or name in {"", ".", ".."}
                or Path(name).name != name or not isinstance(expected, str)
                or not HASH.fullmatch(expected)):
            raise ProjectionError(f"{kind} evidence name or checksum is invalid.")
        evidence_path = path.parent / name
        if (not evidence_path.is_file() or evidence_path.stat().st_size == 0
                or sha256_file(evidence_path) != expected):
            raise ProjectionError(f"{kind} review evidence checksum differs.")
    return record


def verify_renderer_contract(library_path: Path) -> None:
    project_root = Path(__file__).resolve().parents[2]
    environment = dict(os.environ, AOB_REVIEWED_PACK_LIBRARY=str(library_path.resolve()))
    try:
        result = subprocess.run(
            ["vp", "test", "tests/contracts/reviewedPack.test.ts"],
            cwd=project_root, env=environment, capture_output=True, text=True, timeout=180,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ProjectionError(f"Renderer content contract could not run: {error}") from error
    if result.returncode != 0:
        raise ProjectionError("Renderer content contract rejected the generated pack: "
                              + (result.stderr or result.stdout)[-1200:])


def build(archive: Path, chapters_dir: Path, review_path: Path, out: Path) -> dict:
    if out.exists():
        raise ProjectionError("Output directory exists; refusing to overwrite it.")
    tree = json.loads((chapters_dir / "chapters.json").read_text(encoding="utf-8"))
    stage_report = json.loads((chapters_dir / "report.json").read_text(encoding="utf-8"))
    tree_hash = verify_tree(tree, stage_report)
    review = load_review(review_path, tree, tree_hash)
    metadata, names, notices = source_metadata(archive, tree["sourceArchiveSha256"])
    approved_schema = SCHEMA.replace("CHECK(approval_status='technical_only')",
                                     "CHECK(approval_status='approved')")
    if approved_schema == SCHEMA:
        raise ProjectionError("Approved schema could not be derived from the current importer.")
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".reviewed-pack-", dir=out.parent) as temporary:
        work = Path(temporary)
        library_path = work / "library.sqlite"
        counts = build_database(tree, metadata, names, notices, tree_hash, library_path,
                                schema=approved_schema, approval_status="approved",
                                search_profile_version=REVIEWED_PROFILE)
        verify_renderer_contract(library_path)
        library_hash = sha256_file(library_path)
        manifest = {"formatVersion": FORMAT_VERSION, "approvalStatus": "approved",
                    "approvalEvidenceId": review["approvalEvidenceId"],
                    "librarySha256": library_hash,
                    "sourceArchiveSha256": tree["sourceArchiveSha256"],
                    "editionId": tree["editionId"], "contentRevision": tree_hash,
                    "searchProfileVersion": REVIEWED_PROFILE}
        (work / "approved-content.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        report = {"status": "built-from-review-record; separate release-owner validation required",
                  "approvalEvidenceId": review["approvalEvidenceId"],
                  "reviewRecordSha256": sha256_file(review_path),
                  "evidenceSha256": {kind: review["evidence"][kind]["sha256"]
                                     for kind in EVIDENCE_KINDS},
                  "sourceArchiveSha256": tree["sourceArchiveSha256"],
                  "chapterTreeSha256": tree_hash, "librarySha256": library_hash,
                  "importerVersion": IMPORTER_VERSION,
                  "searchProfileVersion": REVIEWED_PROFILE,
                  "pythonVersion": platform.python_version(),
                  "sqliteVersion": sqlite3.sqlite_version,
                  "unicodeDatabaseVersion": unicodedata.unidata_version,
                  "rendererContract": "passed", "counts": counts}
        (work / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        work.rename(out)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--chapters-dir", type=Path, required=True)
    parser.add_argument("--review-record", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    report = build(args.archive, args.chapters_dir, args.review_record, args.out)
    print(f"Built reviewed-profile SQLite pack: {report['counts']['books']} books, "
          f"{report['counts']['verse_units']} units. Release-owner validation remains required.")


if __name__ == "__main__":
    main()
