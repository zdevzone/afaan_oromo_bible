#!/usr/bin/env python3
"""Inspect an authorized USX ZIP into an ignored, source-preserving XML AST.

This is an import stage, not a distributable Bible pack. It does not normalize
wording, infer verse boundaries, or approve a resource for production.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import tempfile
import xml.etree.ElementTree as ET
import zipfile


MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_ENTRIES = 128
MAX_ENTRY_BYTES = 4 * 1024 * 1024
MAX_EXPANDED_BYTES = 32 * 1024 * 1024
MAX_XML_DEPTH = 64
FORBIDDEN_XML_DECLARATION = re.compile(rb"<!\s*(?:DOCTYPE|ENTITY)\b", re.I)


class SourceError(ValueError):
    pass


def inspect_entries(archive: zipfile.ZipFile) -> dict[str, zipfile.ZipInfo]:
    infos = archive.infolist()
    if len(infos) > MAX_ENTRIES:
        raise SourceError("Archive has too many entries.")
    entries: dict[str, zipfile.ZipInfo] = {}
    expanded = 0
    for info in infos:
        name = info.filename
        path = PurePosixPath(name)
        if (not name or name.startswith("/") or "\\" in name or "\x00" in name
                or any(part in {"", ".", ".."} for part in name.split("/"))
                or path.as_posix() != name):
            raise SourceError("Archive has an unsafe entry path.")
        if name in entries:
            raise SourceError("Archive has duplicate entry paths.")
        if info.flag_bits & 1 or stat.S_ISLNK(info.external_attr >> 16):
            raise SourceError("Encrypted entries and links are unsupported.")
        if info.file_size > MAX_ENTRY_BYTES:
            raise SourceError("An archive entry exceeds the size limit.")
        expanded += info.file_size
        if expanded > MAX_EXPANDED_BYTES:
            raise SourceError("Archive expansion exceeds the size limit.")
        entries[name] = info
    return entries


def parse_xml(raw: bytes, source: str) -> ET.Element:
    if FORBIDDEN_XML_DECLARATION.search(raw):
        raise SourceError(f"{source}: DTD/entity declarations are unsupported.")
    try:
        text = raw.decode("utf-8", errors="strict")
        parser = ET.XMLParser(target=ET.TreeBuilder(insert_comments=True, insert_pis=True))
        return ET.fromstring(text, parser=parser)
    except (UnicodeError, ET.ParseError) as error:
        raise SourceError(f"{source}: invalid UTF-8 or XML: {error}") from error


def tag_name(tag: str | object) -> str:
    if tag is ET.Comment:
        return "#comment"
    if tag is ET.ProcessingInstruction:
        return "#processing-instruction"
    if not isinstance(tag, str):
        raise SourceError("An unsupported XML node was found.")
    return tag


def source_ast(element: ET.Element, depth: int = 0) -> dict:
    if depth > MAX_XML_DEPTH:
        raise SourceError("XML nesting exceeds the supported depth.")
    content: list[dict] = []
    if element.text is not None:
        content.append({"text": element.text})
    for child in element:
        content.append({"node": source_ast(child, depth + 1)})
        if child.tail is not None:
            content.append({"text": child.tail})
    return {"tag": tag_name(element.tag), "attrs": list(element.attrib.items()), "content": content}


def ast_text(node: dict) -> str:
    return "".join(part["text"] if "text" in part else ast_text(part["node"])
                   for part in node["content"])


def structure_report(root: ET.Element, book_code: str) -> dict:
    if root.tag != "usx" or root.attrib.get("version") != "3.0":
        raise SourceError(f"{book_code}: expected USX 3.0 root.")
    book = root.find("book")
    if book is None or book.attrib.get("code") != book_code:
        raise SourceError(f"{book_code}: book code differs from publication structure.")
    tags: Counter[str] = Counter()
    styles: Counter[str] = Counter()
    attrs: Counter[str] = Counter()
    chapter = None
    verse = None
    chapters: list[str] = []
    chapter_count = verse_count = continuation_count = 0
    for element in root.iter():
        tag = tag_name(element.tag)
        tags[tag] += 1
        attrs.update(f"{tag}.{key}" for key in element.attrib)
        if "style" in element.attrib:
            styles[f"{tag}.{element.attrib['style']}"] += 1
        if tag == "chapter":
            if "sid" in element.attrib:
                sid = element.attrib["sid"]
                if chapter is not None or verse is not None or sid != f"{book_code} {element.attrib.get('number')}":
                    raise SourceError(f"{book_code}: invalid chapter start {sid!r}.")
                chapter = sid
                chapter_count += 1
                chapters.append(element.attrib["number"])
            elif "eid" in element.attrib:
                if verse is not None or chapter != element.attrib["eid"]:
                    raise SourceError(f"{book_code}: mismatched chapter end.")
                chapter = None
            else:
                raise SourceError(f"{book_code}: chapter lacks a milestone identity.")
        elif tag == "verse":
            if "sid" in element.attrib:
                sid = element.attrib["sid"]
                if chapter is None or verse is not None or sid != f"{chapter}:{element.attrib.get('number')}":
                    raise SourceError(f"{book_code}: invalid verse start {sid!r}.")
                verse = sid
                verse_count += 1
            elif "eid" in element.attrib:
                if verse != element.attrib["eid"]:
                    raise SourceError(f"{book_code}: mismatched verse end.")
                verse = None
            else:
                raise SourceError(f"{book_code}: verse lacks a milestone identity.")
        elif tag == "para" and "vid" in element.attrib:
            if verse != element.attrib["vid"]:
                raise SourceError(f"{book_code}: paragraph continuation has the wrong verse identity.")
            continuation_count += 1
    if chapter is not None or verse is not None or len(chapters) != len(set(chapters)):
        raise SourceError(f"{book_code}: unclosed or duplicate chapter identity.")
    return {
        "chapters": chapters,
        "chapter_starts": chapter_count,
        "verse_starts": verse_count,
        "continuation_paragraphs": continuation_count,
        "tags": dict(sorted(tags.items())),
        "styles": dict(sorted(styles.items())),
        "attributes": dict(sorted(attrs.items())),
    }


def publication_books(metadata: ET.Element, entries: dict[str, zipfile.ZipInfo], metadata_name: str) -> list[tuple[str, str]]:
    defaults = [item for item in metadata.findall("./publications/publication")
                if item.attrib.get("default") == "true"]
    if len(defaults) != 1:
        raise SourceError("Expected exactly one default publication.")
    structure = defaults[0].find("structure")
    if structure is None or not len(structure):
        raise SourceError("Default publication has no ordered structure.")
    prefix = str(PurePosixPath(metadata_name).parent)
    books: list[tuple[str, str]] = []
    seen_codes: set[str] = set()
    seen_paths: set[str] = set()
    for item in structure:
        code = item.attrib.get("role", "")
        src = item.attrib.get("src", "")
        if item.tag != "content" or not re.fullmatch(r"[1-3]?[A-Z]{2,3}", code):
            raise SourceError("Publication has an unsupported book identity.")
        if not src or src.startswith("/") or "\\" in src or any(part in {"", ".", ".."} for part in src.split("/")):
            raise SourceError("Publication has an unsafe book path.")
        path = f"{prefix}/{src}"
        if path not in entries or not path.endswith(f"/{code}.usx") or code in seen_codes or path in seen_paths:
            raise SourceError("Publication has missing or duplicate USX content.")
        books.append((code, path))
        seen_codes.add(code)
        seen_paths.add(path)
    if {name for name in entries if name.endswith(".usx")} != seen_paths:
        raise SourceError("USX archive entries differ from the default publication.")
    return books


def inspect_archive(archive_path: Path, expected_sha256: str) -> tuple[dict, dict]:
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise SourceError("Archive exceeds the compressed size limit.")
    archive_bytes = archive_path.read_bytes()
    actual_hash = hashlib.sha256(archive_bytes).hexdigest()
    if actual_hash != expected_sha256.lower():
        raise SourceError("Archive SHA-256 does not match the registered source.")
    with zipfile.ZipFile(archive_path) as archive:
        entries = inspect_entries(archive)
        metadata_names = [name for name in entries if name.endswith("/metadata.xml")]
        if len(metadata_names) != 1:
            raise SourceError("Archive must contain exactly one metadata.xml.")
        metadata_name = metadata_names[0]
        metadata = parse_xml(archive.read(metadata_name), metadata_name)
        books = publication_books(metadata, entries, metadata_name)
        ast_books = []
        totals: Counter[str] = Counter()
        coverage: Counter[str] = Counter()
        per_book = []
        for order, (code, path) in enumerate(books):
            root = parse_xml(archive.read(path), path)
            ast = source_ast(root)
            source_text = "".join(root.itertext())
            derived_text = ast_text(ast)
            if derived_text != source_text:
                raise SourceError(f"{code}: mixed text order changed during AST conversion.")
            structure = structure_report(root, code)
            totals.update({key: structure[key] for key in
                           ("chapter_starts", "verse_starts", "continuation_paragraphs")})
            coverage.update(structure["styles"])
            per_book.append({
                "code": code,
                "order": order,
                "source_path": path,
                "source_sha256": hashlib.sha256(archive.read(path)).hexdigest(),
                "mixed_text_sha256": hashlib.sha256(source_text.encode("utf-8")).hexdigest(),
                **structure,
            })
            ast_books.append({"code": code, "order": order, "source_path": path, "root": ast})
        report = {
            "status": "technical source AST only; no production content approval",
            "archive_sha256": actual_hash,
            "book_count": len(books),
            "totals": dict(sorted(totals.items())),
            "style_coverage": dict(sorted(coverage.items())),
            "books": per_book,
        }
        return {"format": "aob-usx-source-ast", "version": 1, "books": ast_books}, report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--sha256", required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[0-9a-fA-F]{64}", args.sha256):
        parser.error("--sha256 must contain exactly 64 hexadecimal characters")
    if args.out.exists():
        parser.error("--out must name a new directory; existing output is never overwritten")
    source_ast_data, report = inspect_archive(args.archive, args.sha256)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".usx-spike-", dir=args.out.parent) as temporary:
        work = Path(temporary)
        (work / "source-ast.json").write_text(
            json.dumps(source_ast_data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (work / "report.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        work.rename(args.out)
    print(f"Parsed {report['book_count']} source books; report: {args.out / 'report.json'}")


if __name__ == "__main__":
    main()
