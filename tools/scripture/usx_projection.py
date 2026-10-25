#!/usr/bin/env python3
"""Project verse units from a source-preserving USX AST without editing wording.

The output is an internal intermediate, not an approved or distributable pack.
All source nodes remain in the source AST; this stage adds addressable units and
records exactly which source text fragments contributed to each unit.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import tempfile


SOURCE_FORMAT = "aob-usx-source-ast"
PROJECTION_FORMAT = "aob-usx-verse-projection"
ALLOWED_TAGS = {"usx", "book", "chapter", "verse", "para", "char", "note", "ref", "optbreak"}
VERSE_LABEL = re.compile(r"[1-9][0-9]*(?:-[1-9][0-9]*|[a-z])?")
METADATA_PARAGRAPH_STYLES = {"h", "toc1", "toc2", "toc3", "rem"}
HEADING_PARAGRAPH_STYLES = {"cl", "d", "lh", "mr", "ms", "ms1", "mt1", "mt2", "mt3",
                            "qa", "qr", "r", "s1", "s2", "s3", "sp"}
NON_BODY_PARAGRAPH_STYLES = METADATA_PARAGRAPH_STYLES | HEADING_PARAGRAPH_STYLES


class ProjectionError(ValueError):
    pass


def attributes(node: dict) -> dict[str, str]:
    pairs = node.get("attrs")
    if not isinstance(pairs, list) or any(not isinstance(pair, list) or len(pair) != 2
                                              or not all(isinstance(item, str) for item in pair)
                                              for pair in pairs):
        raise ProjectionError("Invalid source attributes.")
    result = dict(pairs)
    if len(result) != len(pairs):
        raise ProjectionError("Duplicate source attributes.")
    return result


def source_text(node: dict) -> str:
    return "".join(part["text"] if "text" in part else source_text(part["node"])
                   for part in node["content"])


def projected_text(runs: list[dict]) -> str:
    """Keep source runs exact; represent a body-block boundary as a line break."""
    parts: list[str] = []
    previous_block: int | None = None
    for run in runs:
        value = run["text"]
        if not value:
            continue
        block = run["sourcePath"][0]
        if previous_block is not None and block != previous_block:
            if not parts[-1].endswith("\n") and not value.startswith("\n"):
                parts.append("\n")
        parts.append(value)
        previous_block = block
    return "".join(parts)


def unit_key(edition: str, scheme: str, book: str, chapter: str, label: str) -> str:
    return json.dumps([edition, scheme, book, chapter, label], ensure_ascii=False,
                      separators=(",", ":"))


def labels_for(source_label: str) -> list[str]:
    if not VERSE_LABEL.fullmatch(source_label):
        raise ProjectionError(f"Unsupported verse label {source_label!r}.")
    if "-" not in source_label:
        return [source_label]
    first, last = map(int, source_label.split("-"))
    if last <= first or last - first > 100:
        raise ProjectionError(f"Invalid verse bridge {source_label!r}.")
    return [source_label, *(str(value) for value in range(first, last + 1))]


def project_book(book: dict, edition: str, scheme: str) -> tuple[dict, dict]:
    code = book["code"]
    root = book["root"]
    if root["tag"] != "usx" or attributes(root).get("version") != "3.0":
        raise ProjectionError(f"{code}: unsupported source root.")
    chapters: list[dict] = []
    chapter: dict | None = None
    active: dict | None = None
    active_sid: str | None = None
    counts: Counter[str] = Counter()
    outside_runs: list[dict] = []

    def visit(node: dict, path: list[int], in_note: bool = False,
              in_non_body: bool = False) -> None:
        nonlocal chapter, active, active_sid
        tag = node.get("tag")
        if tag not in ALLOWED_TAGS:
            raise ProjectionError(f"{code}: unsupported USX node {tag!r} at {path}.")
        attrs = attributes(node)
        counts[tag] += 1
        if (tag == "para" and attrs.get("style") in NON_BODY_PARAGRAPH_STYLES
                and not any(part.get("node", {}).get("tag") == "verse"
                            for part in node.get("content", []))):
            in_non_body = True
        if tag == "chapter":
            if "sid" in attrs:
                label = attrs.get("number", "")
                if chapter is not None or active is not None or attrs["sid"] != f"{code} {label}":
                    raise ProjectionError(f"{code}: invalid chapter start at {path}.")
                chapter = {"label": label, "sourcePath": path, "units": [], "referenceLookup": {},
                           "outsideTextRuns": []}
                chapters.append(chapter)
            elif "eid" in attrs:
                if chapter is None or active is not None or attrs["eid"] != f"{code} {chapter['label']}":
                    raise ProjectionError(f"{code}: invalid chapter end at {path}.")
                chapter = None
            else:
                raise ProjectionError(f"{code}: chapter milestone is missing identity.")
            return
        if tag == "verse":
            if chapter is None or in_note or in_non_body:
                raise ProjectionError(f"{code}: verse outside a chapter at {path}.")
            if "sid" in attrs:
                label = attrs.get("number", "")
                if active is not None or attrs["sid"] != f"{code} {chapter['label']}:{label}":
                    raise ProjectionError(f"{code}: invalid verse start at {path}.")
                key = unit_key(edition, scheme, code, chapter["label"], label)
                if any(unit["key"] == key for unit in chapter["units"]):
                    raise ProjectionError(f"{code}: duplicate verse label at {path}.")
                requested_labels = labels_for(label)
                if any(requested in chapter["referenceLookup"] for requested in requested_labels):
                    raise ProjectionError(f"{code}: overlapping verse label at {path}.")
                active_sid = attrs["sid"]
                active = {"key": key, "label": label, "order": len(chapter["units"]),
                          "startPath": path, "endPath": None, "textRuns": []}
                chapter["units"].append(active)
                for requested in requested_labels:
                    chapter["referenceLookup"].setdefault(requested, []).append(key)
            elif "eid" in attrs:
                if active is None or attrs["eid"] != active_sid:
                    raise ProjectionError(f"{code}: mismatched verse end at {path}.")
                active["endPath"] = path
                active = None
                active_sid = None
            else:
                raise ProjectionError(f"{code}: verse milestone is missing identity.")
            return
        if tag == "note":
            in_note = True
        for index, part in enumerate(node.get("content", [])):
            part_path = [*path, index]
            if "text" in part:
                value = part["text"]
                if not isinstance(value, str):
                    raise ProjectionError(f"{code}: invalid text at {part_path}.")
                if tag == "usx":
                    if value.strip():
                        raise ProjectionError(f"{code}: unexpected root text at {part_path}.")
                    continue
                if active is not None and not in_note and not in_non_body:
                    active["textRuns"].append({"sourcePath": part_path, "text": value})
                elif not in_note and value.strip():
                    target = chapter["outsideTextRuns"] if chapter is not None else outside_runs
                    target.append({"sourcePath": part_path, "text": value})
            elif "node" in part:
                visit(part["node"], part_path, in_note, in_non_body)
            else:
                raise ProjectionError(f"{code}: invalid source part at {part_path}.")

    visit(root, [])
    if chapter is not None or active is not None:
        raise ProjectionError(f"{code}: unclosed chapter or verse.")
    for item in chapters:
        for unit in item["units"]:
            if unit["endPath"] is None:
                raise ProjectionError(f"{code}: unclosed verse {unit['label']}.")
            text = projected_text(unit["textRuns"])
            unit["textPlain"] = text
            unit["textDigest"] = hashlib.sha256(text.encode("utf-8")).hexdigest()
            counts["projected_text_runs"] += len(unit["textRuns"])
            counts["verse_units"] += 1
        counts["chapters"] += 1
    return {"code": code, "order": book["order"], "sourcePath": book["source_path"],
            "sourceTextSha256": hashlib.sha256(source_text(root).encode("utf-8")).hexdigest(),
            "outsideTextRuns": outside_runs, "chapters": chapters}, dict(counts)


def project(source: dict, report: dict, edition: str, scheme: str) -> tuple[dict, dict]:
    if source.get("format") != SOURCE_FORMAT or source.get("version") != 1:
        raise ProjectionError("Unsupported source AST format.")
    if not edition or not scheme:
        raise ProjectionError("Edition and versification IDs are required.")
    books = []
    totals: Counter[str] = Counter()
    if len(source["books"]) != report["book_count"]:
        raise ProjectionError("Source/report book counts differ.")
    for index, (book, recorded) in enumerate(zip(source["books"], report["books"], strict=True)):
        if book["code"] != recorded["code"] or book["order"] != index:
            raise ProjectionError("Source/report book order differs.")
        projected, counts = project_book(book, edition, scheme)
        if projected["sourceTextSha256"] != recorded["mixed_text_sha256"]:
            raise ProjectionError(f"{book['code']}: source text digest differs from report.")
        if len(projected["chapters"]) != recorded["chapter_starts"] or counts["verse_units"] != recorded["verse_starts"]:
            raise ProjectionError(f"{book['code']}: projected milestone counts differ.")
        books.append(projected)
        totals.update(counts)
    output = {"format": PROJECTION_FORMAT, "version": 1,
              "sourceArchiveSha256": report["archive_sha256"],
              "editionId": edition, "versificationId": scheme, "books": books}
    audit = {"status": "technical projection only; no production content approval",
             "sourceArchiveSha256": report["archive_sha256"], "totals": dict(sorted(totals.items())),
             "bookCount": len(books),
             "projectionSha256": hashlib.sha256(json.dumps(output, ensure_ascii=False,
                                                        separators=(",", ":")).encode("utf-8")).hexdigest()}
    return output, audit


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--edition-id", required=True)
    parser.add_argument("--versification-id", required=True)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("--out must name a new directory; existing output is never overwritten")
    source = json.loads((args.source_dir / "source-ast.json").read_text(encoding="utf-8"))
    report = json.loads((args.source_dir / "report.json").read_text(encoding="utf-8"))
    output, audit = project(source, report, args.edition_id, args.versification_id)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".usx-projection-", dir=args.out.parent) as temporary:
        work = Path(temporary)
        (work / "projection.json").write_text(json.dumps(output, ensure_ascii=False,
                                                          separators=(",", ":")), encoding="utf-8")
        (work / "report.json").write_text(json.dumps(audit, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        work.rename(args.out)
    print(f"Projected {audit['totals']['verse_units']} verse units from {audit['bookCount']} books.")


if __name__ == "__main__":
    main()
