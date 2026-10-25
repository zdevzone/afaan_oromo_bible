import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

from build_library import build_database, compact, source_metadata, verify_tree
from usx_projection import ProjectionError, unit_key


class LibraryBuildTests(unittest.TestCase):
    def test_source_identity_comes_from_metadata(self):
        xml = """<DBLMetadata>
          <identification><name>Synthetic source title</name><dateCompleted>2024-01-01</dateCompleted></identification>
          <agencies><rightsHolder><name>Test authors</name></rightsHolder></agencies>
          <language><iso>en</iso><name>Synthetic language</name></language>
          <publications><publication default="true"><name>Test edition</name><abbreviation>TEST</abbreviation></publication></publications>
          <names><name id="book-TST"><long>Test Book</long><short>Test</short><abbr>TST</abbr></name></names>
          <copyright><p>Test attribution</p></copyright>
          <promotion><promoVersionInfo><p>Test notice</p></promoVersionInfo></promotion>
        </DBLMetadata>"""
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / "source.zip"
            with zipfile.ZipFile(archive, "w") as contents:
                contents.writestr("synthetic/metadata.xml", xml)
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            metadata, names, notices = source_metadata(archive, digest)
        self.assertEqual(metadata["sourceTitle"], "Synthetic source title")
        self.assertEqual(metadata["rightsHolderName"], "Test authors")
        self.assertEqual(metadata["languageName"], "Synthetic language")
        self.assertEqual(metadata["sourceCompletedOn"], "2024-01-01")
        self.assertEqual(names["TST"]["long"], "Test Book")
        self.assertIn("copyright", notices)

    def tree(self):
        key = unit_key("test-edition", "test-scheme", "TST", "1", "2-3")
        value = "Synthetic test words."
        return {
            "format": "aob-usx-chapter-tree", "version": 2,
            "sourceArchiveSha256": "a" * 64,
            "editionId": "test-edition", "versificationId": "test-scheme",
            "books": [{"code": "TST", "order": 0, "sourcePath": "TST.usx", "frontMatter": [],
                       "chapters": [{"label": "1", "startPath": [0], "endPath": [2], "blocks": [],
                                     "verseUnits": [{"key": key, "label": "2-3", "order": 0,
                                                     "textPlain": value,
                                                     "textDigest": hashlib.sha256(value.encode()).hexdigest(),
                                                     "startPath": [1], "endPath": [2],
                                                     "textRuns": [{"sourcePath": [1, 0], "text": value}]}],
                                     "referenceLookup": {"2-3": [key], "2": [key], "3": [key]}}]}],
        }

    def test_deterministic_pack_and_reference_lookup(self):
        tree = self.tree()
        digest = hashlib.sha256(compact(tree).encode("utf-8")).hexdigest()
        self.assertEqual(verify_tree(tree, {"sha256": digest, "bookCount": 1, "chapterCount": 1}), digest)
        metadata = {"title": "Synthetic Test Edition", "abbreviation": "TEST", "languageTag": "en",
                    "languageName": "Synthetic test language", "sourceTitle": "Synthetic test source",
                    "rightsHolderName": "Project test authors", "sourceCompletedOn": "2024-01-01",
                    "attribution": "Synthetic", "licenseNotice": "Test only"}
        names = {"TST": {"long": "Test Book", "short": "Test", "abbr": "TST"}}
        notices = {"copyright": "<copyright>Synthetic</copyright>",
                   "promotion": "<notice>Synthetic</notice>"}
        with tempfile.TemporaryDirectory() as temporary:
            paths = [Path(temporary) / f"pack-{index}.sqlite" for index in range(2)]
            reports = [build_database(tree, metadata, names, notices, digest, path) for path in paths]
            self.assertEqual(reports[0], reports[1])
            self.assertEqual(paths[0].read_bytes(), paths[1].read_bytes())
            with sqlite3.connect(paths[0]) as connection:
                self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                self.assertEqual(connection.execute("PRAGMA foreign_key_check").fetchall(), [])
                self.assertEqual(connection.execute("SELECT approval_status FROM content_manifest").fetchone()[0],
                                 "technical_only")
                self.assertEqual(connection.execute("SELECT search_profile_version FROM content_manifest").fetchone()[0],
                                 "technical-latin-v1")
                self.assertEqual(connection.execute("SELECT text FROM verse_search").fetchone()[0],
                                 "synthetic test words")
                self.assertEqual(connection.execute('SELECT count(*) FROM verse_search WHERE verse_search MATCH ?',
                                                    ('"synthetic test"',)).fetchone()[0], 1)
                self.assertEqual(json.loads(connection.execute("SELECT json FROM book_front_matter").fetchone()[0]), [])
                edition = json.loads(connection.execute("SELECT json FROM edition").fetchone()[0])
                self.assertEqual(edition["isSynthetic"], False)
                self.assertEqual(edition["sourceTitle"], "Synthetic test source")
                self.assertEqual(edition["sourceArchiveSha256"], "a" * 64)
                self.assertEqual(len(edition), 15)
                chapter = json.loads(connection.execute("SELECT json FROM chapter").fetchone()[0])
                self.assertEqual(set(chapter["verseUnits"][0]),
                                 {"key", "label", "order", "textPlain", "textDigest"})
                labels = connection.execute("SELECT requested_label FROM reference_lookup ORDER BY requested_label").fetchall()
                self.assertEqual(labels, [("2",), ("2-3",), ("3",)])

    def test_bad_digest_fails_before_publication(self):
        tree = self.tree()
        tree["books"][0]["chapters"][0]["verseUnits"][0]["textDigest"] = "0" * 64
        with tempfile.TemporaryDirectory() as temporary:
            with self.assertRaisesRegex(ProjectionError, "invalid verse unit"):
                build_database(tree, {"title": "T", "abbreviation": "T", "languageTag": "en",
                                      "languageName": "Test", "sourceTitle": "Test",
                                      "rightsHolderName": "Test", "sourceCompletedOn": "2024-01-01",
                                      "attribution": "Synthetic", "licenseNotice": "Test only"},
                               {"TST": {"long": "T", "short": "T", "abbr": "T"}},
                               {"copyright": "x", "promotion": "y"}, "a" * 64,
                               Path(temporary) / "bad.sqlite")


if __name__ == "__main__":
    unittest.main()
