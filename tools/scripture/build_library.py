#!/usr/bin/env python3
"""Build an internal, immutable SQLite content candidate from verified USX stages.

This database is deliberately not a distributable pack. The final renderer,
search profile, notices review and content approval remain release gates.
"""

from __future__ import annotations

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile

from usx_projection import ProjectionError, unit_key
from search_projection import SEARCH_PROFILE_VERSION, normalize_search_text


FORMAT_VERSION = 1
IMPORTER_VERSION = "technical-usx-tree-search-v4"


def compact(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def source_metadata(archive_path: Path, expected_hash: str) -> tuple[dict, dict[str, dict], dict]:
    actual_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    if actual_hash != expected_hash:
        raise ProjectionError("The source archive digest differs from the chapter tree.")
    with zipfile.ZipFile(archive_path) as archive:
        names = [name for name in archive.namelist() if name.endswith("/metadata.xml")]
        if len(names) != 1:
            raise ProjectionError("Expected one source metadata.xml.")
        metadata = ET.fromstring(archive.read(names[0]))
    defaults = [item for item in metadata.findall("./publications/publication")
                if item.attrib.get("default") == "true"]
    if len(defaults) != 1:
        raise ProjectionError("Expected exactly one default publication.")
    publication = defaults[0]
    title = publication.findtext("name")
    abbreviation = publication.findtext("abbreviation")
    language = metadata.findtext("./language/iso")
    source_title = metadata.findtext("./identification/name")
    rights_holder = metadata.findtext("./agencies/rightsHolder/name")
    language_name = metadata.findtext("./language/name")
    source_completed_on = metadata.findtext("./identification/dateCompleted")
    if not all((title, abbreviation, language, source_title, rights_holder,
                language_name, source_completed_on)):
        raise ProjectionError("Source edition metadata is incomplete.")
    book_names: dict[str, dict] = {}
    for name in metadata.findall("./names/name"):
        identity = name.attrib.get("id", "")
        if not identity.startswith("book-"):
            continue
        code = identity[5:].upper()
        if code in book_names:
            raise ProjectionError(f"Duplicate source book name for {code}.")
        long = name.findtext("long")
        short = name.findtext("short")
        abbr = name.findtext("abbr")
        if not all((long, short, abbr)):
            raise ProjectionError(f"Incomplete source book name for {code}.")
        book_names[code] = {"long": long, "short": short, "abbr": abbr}
    notices = {}
    for key, path in (("copyright", "./copyright"),
                      ("promotion", "./promotion/promoVersionInfo")):
        element = metadata.find(path)
        if element is None:
            raise ProjectionError(f"Missing {key} notice in source metadata.")
        notices[key] = ET.tostring(element, encoding="unicode")
    copyright_element = metadata.find("./copyright")
    promotion_element = metadata.find("./promotion/promoVersionInfo")
    if copyright_element is None or promotion_element is None:
        raise ProjectionError("Source attribution or license notice is missing.")
    attribution = " ".join(" ".join(copyright_element.itertext()).split())
    license_notice = " ".join(" ".join(promotion_element.itertext()).split())
    return {"title": title, "abbreviation": abbreviation, "languageTag": language,
            "languageName": language_name, "sourceTitle": source_title,
            "rightsHolderName": rights_holder, "sourceCompletedOn": source_completed_on,
            "attribution": attribution, "licenseNotice": license_notice}, book_names, notices


def verify_tree(tree: dict, report: dict) -> str:
    if tree.get("format") != "aob-usx-chapter-tree" or tree.get("version") != 2:
        raise ProjectionError("Unsupported chapter-tree format.")
    raw = compact(tree).encode("utf-8")
    tree_hash = hashlib.sha256(raw).hexdigest()
    if tree_hash != report.get("sha256") or len(tree["books"]) != report.get("bookCount"):
        raise ProjectionError("The chapter tree differs from its verification report.")
    if sum(len(book["chapters"]) for book in tree["books"]) != report.get("chapterCount"):
        raise ProjectionError("The chapter count differs from its verification report.")
    return tree_hash


SCHEMA = """
PRAGMA foreign_keys=ON;
PRAGMA page_size=4096;
CREATE TABLE content_manifest (
  format_version INTEGER NOT NULL CHECK(format_version=1),
  approval_status TEXT NOT NULL CHECK(approval_status='technical_only'),
  importer_version TEXT NOT NULL,
  search_profile_version TEXT NOT NULL,
  source_archive_sha256 TEXT NOT NULL,
  chapter_tree_sha256 TEXT NOT NULL,
  edition_id TEXT NOT NULL,
  versification_id TEXT NOT NULL
);
CREATE TABLE edition (id TEXT PRIMARY KEY, json TEXT NOT NULL);
CREATE TABLE book (
  edition_id TEXT NOT NULL REFERENCES edition(id),
  code TEXT NOT NULL,
  display_order INTEGER NOT NULL UNIQUE,
  json TEXT NOT NULL,
  PRIMARY KEY(edition_id,code)
);
CREATE TABLE book_front_matter (
  edition_id TEXT NOT NULL,
  book_code TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY(edition_id,book_code),
  FOREIGN KEY(edition_id,book_code) REFERENCES book(edition_id,code)
);
CREATE TABLE chapter (
  edition_id TEXT NOT NULL,
  book_code TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY(edition_id,book_code,chapter_label),
  UNIQUE(edition_id,book_code,display_order),
  FOREIGN KEY(edition_id,book_code) REFERENCES book(edition_id,code)
);
CREATE TABLE chapter_provenance (
  edition_id TEXT NOT NULL,
  book_code TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  json TEXT NOT NULL,
  PRIMARY KEY(edition_id,book_code,chapter_label),
  FOREIGN KEY(edition_id,book_code,chapter_label)
    REFERENCES chapter(edition_id,book_code,chapter_label)
);
CREATE TABLE verse_unit (
  unit_key TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL,
  book_code TEXT NOT NULL,
  book_name TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  verse_label TEXT NOT NULL,
  text_plain TEXT NOT NULL,
  text_digest TEXT NOT NULL,
  book_order INTEGER NOT NULL,
  chapter_order INTEGER NOT NULL,
  unit_order INTEGER NOT NULL,
  UNIQUE(edition_id,book_code,chapter_label,verse_label),
  UNIQUE(edition_id,book_code,chapter_label,unit_order),
  FOREIGN KEY(edition_id,book_code,chapter_label)
    REFERENCES chapter(edition_id,book_code,chapter_label)
);
CREATE TABLE verse_provenance (
  unit_key TEXT PRIMARY KEY REFERENCES verse_unit(unit_key),
  json TEXT NOT NULL
);
CREATE TABLE reference_lookup (
  edition_id TEXT NOT NULL,
  book_code TEXT NOT NULL,
  chapter_label TEXT NOT NULL,
  requested_label TEXT NOT NULL,
  target_order INTEGER NOT NULL,
  unit_key TEXT NOT NULL REFERENCES verse_unit(unit_key),
  PRIMARY KEY(edition_id,book_code,chapter_label,requested_label,target_order),
  FOREIGN KEY(edition_id,book_code,chapter_label)
    REFERENCES chapter(edition_id,book_code,chapter_label)
);
CREATE INDEX reference_lookup_target ON reference_lookup(unit_key);
CREATE VIRTUAL TABLE verse_search USING fts5(text,tokenize="ascii tokenchars ''''");
CREATE TABLE source_notice (kind TEXT PRIMARY KEY, source_xml TEXT NOT NULL);
"""


def build_database(tree: dict, metadata: dict, names: dict[str, dict], notices: dict,
                   tree_hash: str, destination: Path, *,
                   schema: str = SCHEMA, approval_status: str = "technical_only",
                   search_profile_version: str = SEARCH_PROFILE_VERSION) -> dict:
    if destination.exists():
        raise ProjectionError("Output database already exists; refusing to overwrite it.")
    edition_id = tree["editionId"]
    scheme = tree["versificationId"]
    counts: Counter[str] = Counter()
    connection = sqlite3.connect(destination)
    try:
        connection.executescript(schema)
        with connection:
            connection.execute(
                "INSERT INTO content_manifest VALUES(?,?,?,?,?,?,?,?)",
                (FORMAT_VERSION, approval_status, IMPORTER_VERSION, search_profile_version,
                 tree["sourceArchiveSha256"], tree_hash, edition_id, scheme),
            )
            edition = {"id": edition_id, "title": metadata["title"],
                       "abbreviation": metadata["abbreviation"],
                       "languageTag": metadata["languageTag"],
                       "languageName": metadata["languageName"],
                       "sourceTitle": metadata["sourceTitle"],
                       "rightsHolderName": metadata["rightsHolderName"],
                       "sourceCompletedOn": metadata["sourceCompletedOn"],
                       "sourceArchiveSha256": tree["sourceArchiveSha256"],
                       "versificationId": scheme, "contentRevision": tree_hash,
                       "canonId": "oocs-2024-default-publication",
                       "isSynthetic": False, "attribution": metadata["attribution"],
                       "licenseNotice": metadata["licenseNotice"]}
            connection.execute("INSERT INTO edition VALUES(?,?)", (edition_id, compact(edition)))
            for order, book in enumerate(tree["books"]):
                code = book["code"]
                if book["order"] != order or code not in names:
                    raise ProjectionError(f"Source book order or name is invalid at {code}.")
                name = names[code]
                summary = {"editionId": edition_id, "code": code, "name": name["long"],
                           "aliases": list(dict.fromkeys((name["long"], name["short"], name["abbr"], code))),
                           "order": order, "chapters": [item["label"] for item in book["chapters"]]}
                connection.execute("INSERT INTO book VALUES(?,?,?,?)",
                                   (edition_id, code, order, compact(summary)))
                connection.execute("INSERT INTO book_front_matter VALUES(?,?,?)",
                                   (edition_id, code, compact(book["frontMatter"])))
                counts["books"] += 1
                for chapter_order, chapter in enumerate(book["chapters"]):
                    label = chapter["label"]
                    chapter_json = {"editionId": edition_id, "bookCode": code,
                                    "chapterLabel": label, "blocks": chapter["blocks"],
                                    "verseUnits": [{field: unit[field] for field in
                                                    ("key", "label", "order", "textPlain", "textDigest")}
                                                   for unit in chapter["verseUnits"]],
                                    "referenceLookup": chapter["referenceLookup"]}
                    connection.execute("INSERT INTO chapter VALUES(?,?,?,?,?)",
                                       (edition_id, code, label, chapter_order, compact(chapter_json)))
                    connection.execute("INSERT INTO chapter_provenance VALUES(?,?,?,?)",
                                       (edition_id, code, label, compact({"sourceStartPath": chapter["startPath"],
                                                                          "sourceEndPath": chapter["endPath"]})))
                    counts["chapters"] += 1
                    keys = set()
                    for unit_order, unit in enumerate(chapter["verseUnits"]):
                        key = unit_key(edition_id, scheme, code, label, unit["label"])
                        if (unit["key"] != key or unit["order"] != unit_order
                                or hashlib.sha256(unit["textPlain"].encode("utf-8")).hexdigest() != unit["textDigest"]):
                            raise ProjectionError(f"{code} {label}: invalid verse unit {unit_order}.")
                        keys.add(key)
                        cursor = connection.execute("INSERT INTO verse_unit VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                                                    (key, edition_id, code, name["long"], label,
                                                     unit["label"], unit["textPlain"], unit["textDigest"],
                                                     order, chapter_order, unit_order))
                        connection.execute("INSERT INTO verse_search(rowid,text) VALUES(?,?)",
                                           (cursor.lastrowid, normalize_search_text(unit["textPlain"])))
                        connection.execute("INSERT INTO verse_provenance VALUES(?,?)",
                                           (key, compact({"startPath": unit["startPath"],
                                                          "endPath": unit["endPath"],
                                                          "textRuns": unit["textRuns"]})))
                        counts["verse_units"] += 1
                        counts["indexed_units"] += 1
                    for requested, targets in chapter["referenceLookup"].items():
                        for target_order, key in enumerate(targets):
                            if key not in keys:
                                raise ProjectionError(f"{code} {label}: lookup target is outside chapter.")
                            connection.execute("INSERT INTO reference_lookup VALUES(?,?,?,?,?,?)",
                                               (edition_id, code, label, requested, target_order, key))
                            counts["reference_lookup_rows"] += 1
            for kind, xml in sorted(notices.items()):
                connection.execute("INSERT INTO source_notice VALUES(?,?)", (kind, xml))
        if connection.execute("PRAGMA foreign_key_check").fetchall():
            raise ProjectionError("Content database has broken references.")
        connection.execute("INSERT INTO verse_search(verse_search) VALUES('integrity-check')")
        integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        if integrity != "ok":
            raise ProjectionError(f"Content database integrity failed: {integrity}.")
        for table, expected in (("book", counts["books"]),
                                ("book_front_matter", counts["books"]),
                                ("chapter", counts["chapters"]),
                                ("chapter_provenance", counts["chapters"]),
                                ("verse_unit", counts["verse_units"]),
                                ("verse_provenance", counts["verse_units"]),
                                ("reference_lookup", counts["reference_lookup_rows"])):
            actual = connection.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
            if actual != expected:
                raise ProjectionError(f"{table}: inserted row count differs.")
        if connection.execute("SELECT count(*) FROM verse_search").fetchone()[0] != counts["indexed_units"]:
            raise ProjectionError("Search index row count differs from verse units.")
        connection.execute("PRAGMA journal_mode=DELETE")
    finally:
        connection.close()
    return dict(sorted(counts.items()))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--chapters-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    if args.out.exists():
        parser.error("--out must name a new directory; existing output is never overwritten")
    tree = json.loads((args.chapters_dir / "chapters.json").read_text(encoding="utf-8"))
    stage_report = json.loads((args.chapters_dir / "report.json").read_text(encoding="utf-8"))
    tree_hash = verify_tree(tree, stage_report)
    metadata, names, notices = source_metadata(args.archive, tree["sourceArchiveSha256"])
    args.out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".technical-pack-", dir=args.out.parent) as temporary:
        work = Path(temporary)
        database = work / "library.sqlite"
        counts = build_database(tree, metadata, names, notices, tree_hash, database)
        database.chmod(0o444)
        report = {"status": "technical_only; not approved or ready for public packaging",
                  "sourceArchiveSha256": tree["sourceArchiveSha256"],
                  "chapterTreeSha256": tree_hash, "importerVersion": IMPORTER_VERSION,
                  "searchProfileVersion": SEARCH_PROFILE_VERSION,
                  "unicodeDatabaseVersion": unicodedata.unidata_version,
                  "sqliteVersion": sqlite3.sqlite_version, "counts": counts,
                  "databaseSha256": hashlib.sha256(database.read_bytes()).hexdigest()}
        (work / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                                          encoding="utf-8")
        work.rename(args.out)
    print(f"Built technical SQLite pack: {counts['books']} books, {counts['verse_units']} units.")


if __name__ == "__main__":
    main()
