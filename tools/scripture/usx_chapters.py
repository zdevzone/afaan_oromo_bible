#!/usr/bin/env python3
"""Build a typed, source-equivalent chapter tree from the OOCS USX profile.

This internal render model retains source text and marker attributes. It does
not approve content distribution or choose a display whitespace policy.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import tempfile

from usx_projection import (ProjectionError, attributes, source_text, unit_key,
                            projected_text, METADATA_PARAGRAPH_STYLES,
                            HEADING_PARAGRAPH_STYLES)


PARAGRAPH_ROLES = {
    "metadata": METADATA_PARAGRAPH_STYLES,
    "heading": HEADING_PARAGRAPH_STYLES,
    "poetry": {"q1", "q2", "q3", "qc", "qm1", "qm2"},
    "list": {"lf", "li1", "li2", "li3"},
    "paragraph": {"b", "m", "mi", "nb", "p", "pc", "pi1", "pm", "pmc",
                  "pmo", "po", "pr"},
}
PARAGRAPH_STYLES = {style: role for role, styles in PARAGRAPH_ROLES.items()
                    for style in styles}
CHARACTER_STYLES = {"fq", "fqa", "fr", "ft", "it", "nd", "rq", "tl", "wj", "xt"}
SOURCE_LOCATION = re.compile(r"([1-3]?[A-Z]{2,3}) ([0-9]+)(?::([0-9]+))?(?:-([0-9]+)(?::([0-9]+))?)?")


def flat_text(content: list[dict]) -> str:
    return "".join(item["text"] if item["kind"] == "text" else
                   flat_text(item.get("content", [])) for item in content)


def reference_target(location: str, books: dict[str, dict[str, dict]]) -> dict | None:
    match = SOURCE_LOCATION.fullmatch(location)
    if match is None:
        return None
    code, chapter_label, verse_label, range_tail, range_verse = match.groups()
    book = books.get(code, {})
    chapter = book.get(chapter_label)
    if chapter is None or (verse_label and verse_label not in chapter["referenceLookup"]):
        return None
    target: dict = {"bookCode": code, "chapterLabel": chapter_label}
    if verse_label:
        target["verseLabel"] = verse_label
    if range_tail:
        end_chapter_label = range_tail if range_verse or not verse_label else chapter_label
        end_verse_label = range_verse or (range_tail if verse_label else None)
        end_chapter = book.get(end_chapter_label)
        if end_chapter is None or (end_verse_label and end_verse_label not in end_chapter["referenceLookup"]):
            return None
        if list(book).index(end_chapter_label) < list(book).index(chapter_label):
            return None
        if end_chapter_label == chapter_label and verse_label and end_verse_label:
            starts = chapter["referenceLookup"][verse_label]
            ends = end_chapter["referenceLookup"][end_verse_label]
            ordered = [unit["key"] for unit in chapter["verseUnits"]]
            if ordered.index(starts[0]) > ordered.index(ends[-1]):
                return None
        target["end"] = {"bookCode": code, "chapterLabel": end_chapter_label}
        if end_verse_label:
            target["end"]["verseLabel"] = end_verse_label
    return target


def build_book(source_book: dict, projected_book: dict, edition: str,
               scheme: str) -> tuple[dict, dict]:
    code = source_book["code"]
    root = source_book["root"]
    if code != projected_book["code"] or root["tag"] != "usx":
        raise ProjectionError(f"{code}: source/projection book differs.")
    chapters: list[dict] = []
    front_matter: list[dict] = []
    current: dict | None = None
    counts: Counter[str] = Counter()

    def convert(node: dict, path: list[int], chapter_label: str | None) -> dict:
        tag = node["tag"]
        attrs = attributes(node)
        if tag == "para":
            style = attrs.get("style")
            if style not in PARAGRAPH_STYLES or set(attrs) - {"style", "vid"}:
                raise ProjectionError(f"{code}: unsupported paragraph at {path}: {attrs!r}.")
            result = {"kind": "block", "role": PARAGRAPH_STYLES[style], "style": style,
                      "sourcePath": path, "sourceAttributes": node["attrs"]}
        elif tag == "book":
            if attrs.get("code") != code or attrs.get("style") != "id":
                raise ProjectionError(f"{code}: invalid book marker at {path}.")
            result = {"kind": "bookTitle", "sourcePath": path, "sourceAttributes": node["attrs"]}
        elif tag == "verse":
            if chapter_label is None:
                raise ProjectionError(f"{code}: verse before chapter at {path}.")
            if "sid" in attrs:
                label = attrs.get("number", "")
                if attrs["sid"] != f"{code} {chapter_label}:{label}":
                    raise ProjectionError(f"{code}: invalid verse start at {path}.")
                result = {"kind": "verseStart", "sourcePath": path,
                          "unitKey": unit_key(edition, scheme, code, chapter_label, label),
                          "sourceAttributes": node["attrs"]}
            elif "eid" in attrs:
                result = {"kind": "verseEnd", "sourcePath": path,
                          "sourceAttributes": node["attrs"]}
            else:
                raise ProjectionError(f"{code}: invalid verse milestone at {path}.")
        elif tag == "char":
            if attrs.get("style") not in CHARACTER_STYLES or set(attrs) - {"style", "closed"}:
                raise ProjectionError(f"{code}: unsupported character style at {path}: {attrs!r}.")
            result = {"kind": "character", "style": attrs["style"], "sourcePath": path,
                      "sourceAttributes": node["attrs"]}
        elif tag == "note":
            if (attrs.get("style") != "f" or not attrs.get("caller")
                    or set(attrs) - {"style", "caller", "category"}):
                raise ProjectionError(f"{code}: unsupported note at {path}: {attrs!r}.")
            result = {"kind": "footnote", "sourcePath": path,
                      "sourceAttributes": node["attrs"]}
        elif tag == "ref":
            if set(attrs) != {"loc"}:
                raise ProjectionError(f"{code}: unsupported reference at {path}: {attrs!r}.")
            result = {"kind": "reference", "sourcePath": path,
                      "sourceAttributes": node["attrs"]}
        elif tag == "optbreak":
            if attrs or node["content"]:
                raise ProjectionError(f"{code}: unsupported optional break at {path}.")
            result = {"kind": "optionalBreak", "sourcePath": path}
        else:
            raise ProjectionError(f"{code}: unsupported nested marker {tag!r} at {path}.")
        counts[result["kind"]] += 1
        content: list[dict] = []
        for index, part in enumerate(node["content"]):
            part_path = [*path, index]
            if "text" in part:
                content.append({"kind": "text", "text": part["text"], "sourcePath": part_path})
                counts["text"] += 1
            elif "node" in part:
                content.append(convert(part["node"], part_path, chapter_label))
            else:
                raise ProjectionError(f"{code}: unsupported mixed content at {part_path}.")
        if content:
            result["content"] = content
        if flat_text(content) != source_text(node):
            raise ProjectionError(f"{code}: source text changed at {path}.")
        return result

    for index, part in enumerate(root["content"]):
        if "text" in part:
            if part["text"].strip():
                raise ProjectionError(f"{code}: unexpected root text at {[index]}.")
            counts["root_layout_runs"] += 1
            continue
        if "node" not in part:
            raise ProjectionError(f"{code}: invalid root part at {[index]}.")
        node = part["node"]
        if node["tag"] == "chapter":
            attrs = attributes(node)
            if "sid" in attrs:
                label = attrs.get("number", "")
                if current is not None or attrs["sid"] != f"{code} {label}":
                    raise ProjectionError(f"{code}: invalid chapter start at {[index]}.")
                current = {"label": label, "startPath": [index], "endPath": None, "blocks": []}
                chapters.append(current)
            elif "eid" in attrs:
                if current is None or attrs["eid"] != f"{code} {current['label']}":
                    raise ProjectionError(f"{code}: invalid chapter end at {[index]}.")
                current["endPath"] = [index]
                current = None
            else:
                raise ProjectionError(f"{code}: unrecognized chapter at {[index]}.")
            counts["chapter_milestones"] += 1
        else:
            converted = convert(node, [index], current["label"] if current else None)
            (current["blocks"] if current else front_matter).append(converted)
    if current is not None:
        raise ProjectionError(f"{code}: unclosed chapter.")
    if len(chapters) != len(projected_book["chapters"]):
        raise ProjectionError(f"{code}: chapter count differs from projection.")
    for chapter, projected in zip(chapters, projected_book["chapters"], strict=True):
        if chapter["label"] != projected["label"]:
            raise ProjectionError(f"{code}: chapter order differs from projection.")
        starts: list[str] = []
        extracted: dict[str, list[dict]] = {}
        active_key: str | None = None

        def collect(nodes: list[dict]) -> None:
            nonlocal active_key
            for item in nodes:
                if item["kind"] == "verseStart":
                    if active_key is not None:
                        raise ProjectionError(f"{code} {chapter['label']}: overlapping verses.")
                    starts.append(item["unitKey"])
                    active_key = item["unitKey"]
                    extracted[active_key] = []
                elif item["kind"] == "verseEnd":
                    if active_key is None:
                        raise ProjectionError(f"{code} {chapter['label']}: unmatched verse end.")
                    active_key = None
                elif item["kind"] == "text" and active_key is not None:
                    extracted[active_key].append({"sourcePath": item["sourcePath"],
                                                  "text": item["text"]})
                if (item["kind"] == "block" and item["role"] in {"metadata", "heading"}
                        and not any(part["kind"] in {"verseStart", "verseEnd"}
                                    for part in item.get("content", []))):
                    continue
                if item["kind"] != "footnote":
                    collect(item.get("content", []))
        collect(chapter["blocks"])
        if active_key is not None:
            raise ProjectionError(f"{code} {chapter['label']}: unclosed verse.")
        if starts != [unit["key"] for unit in projected["units"]]:
            raise ProjectionError(f"{code} {chapter['label']}: verse order differs from projection.")
        for unit in projected["units"]:
            observed = projected_text(extracted[unit["key"]])
            if observed != unit["textPlain"]:
                raise ProjectionError(f"{code} {chapter['label']}: body text differs from projection at {unit['label']}.")
        chapter["verseUnits"] = projected["units"]
        chapter["referenceLookup"] = projected["referenceLookup"]
    return {"code": code, "order": source_book["order"], "sourcePath": source_book["source_path"],
            "frontMatter": front_matter, "chapters": chapters}, dict(counts)


def build(source: dict, projection: dict) -> tuple[dict, dict]:
    if source.get("format") != "aob-usx-source-ast" or projection.get("format") != "aob-usx-verse-projection":
        raise ProjectionError("Unsupported source or projection format.")
    if len(source["books"]) != len(projection["books"]):
        raise ProjectionError("Source and projection book counts differ.")
    books = []
    counts: Counter[str] = Counter()
    for source_book, projected_book in zip(source["books"], projection["books"], strict=True):
        book, book_counts = build_book(source_book, projected_book,
                                       projection["editionId"], projection["versificationId"])
        books.append(book)
        counts.update(book_counts)
    lookup = {book["code"]: {chapter["label"]: chapter for chapter in book["chapters"]}
              for book in books}

    unresolved_references: list[dict] = []

    def resolve_references(value: dict | list, code: str) -> None:
        if isinstance(value, list):
            for item in value:
                if isinstance(item, (dict, list)):
                    resolve_references(item, code)
            return
        if value.get("kind") == "reference":
            location = dict(value["sourceAttributes"])["loc"]
            target = reference_target(location, lookup)
            value["target"] = target
            counts["resolved_references" if target else "unresolved_references"] += 1
            if target is None:
                unresolved_references.append({"bookCode": code,
                                              "sourcePath": value["sourcePath"],
                                              "location": location})
            elif "end" not in target:
                counts["single_verse_references" if "verseLabel" in target
                       else "whole_chapter_references"] += 1
            elif target["end"]["chapterLabel"] != target["chapterLabel"]:
                counts["cross_chapter_verse_ranges" if "verseLabel" in target
                       else "chapter_ranges"] += 1
            else:
                counts["same_chapter_verse_ranges"] += 1
        for child in value.values():
            if isinstance(child, (dict, list)):
                resolve_references(child, code)

    for book in books:
        resolve_references(book, book["code"])
    output = {"format": "aob-usx-chapter-tree", "version": 2,
              "sourceArchiveSha256": projection["sourceArchiveSha256"],
              "editionId": projection["editionId"], "versificationId": projection["versificationId"],
              "books": books}
    serialized = json.dumps(output, ensure_ascii=False, separators=(",", ":"))
    report = {"status": "internal render model; content approval and whitespace policy pending",
              "sourceArchiveSha256": output["sourceArchiveSha256"],
              "counts": dict(sorted(counts.items())),
              "unresolvedReferences": unresolved_references,
              "bookCount": len(books),
              "chapterCount": sum(len(book["chapters"]) for book in books),
              "sha256": hashlib.sha256(serialized.encode("utf-8")).hexdigest()}
    return output, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--projection-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("--out must name a new directory; existing output is never overwritten")
    source = json.loads((args.source_dir / "source-ast.json").read_text(encoding="utf-8"))
    projection = json.loads((args.projection_dir / "projection.json").read_text(encoding="utf-8"))
    output, report = build(source, projection)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".usx-chapters-", dir=args.out.parent) as temporary:
        work = Path(temporary)
        (work / "chapters.json").write_text(json.dumps(output, ensure_ascii=False,
                                                        separators=(",", ":")), encoding="utf-8")
        (work / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        work.rename(args.out)
    print(f"Built {report['chapterCount']} source-equivalent chapter trees.")


if __name__ == "__main__":
    main()
