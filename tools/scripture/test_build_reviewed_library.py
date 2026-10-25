import hashlib
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
import zipfile

from build_library import compact
from build_reviewed_library import build, sha256_file, verify_renderer_contract
from usx_projection import ProjectionError, unit_key


METADATA = """<DBLMetadata>
  <identification><name>Synthetic source</name><dateCompleted>2024-01-01</dateCompleted></identification>
  <agencies><rightsHolder><name>Test authors</name></rightsHolder></agencies>
  <language><iso>en</iso><name>Synthetic language</name></language>
  <publications><publication default="true"><name>Test edition</name><abbreviation>TEST</abbreviation></publication></publications>
  <names><name id="book-TST"><long>Test Book</long><short>Test</short><abbr>TST</abbr></name></names>
  <copyright><p>Test attribution</p></copyright>
  <promotion><promoVersionInfo><p>Test notice</p></promoVersionInfo></promotion>
</DBLMetadata>"""


class ReviewedBuildTests(unittest.TestCase):
    def fixture(self, root: Path):
        archive = root / "synthetic.zip"
        with zipfile.ZipFile(archive, "w") as contents:
            contents.writestr("synthetic/metadata.xml", METADATA)
        source_hash = sha256_file(archive)
        key = unit_key("test-edition", "test-scheme", "TST", "1", "1")
        value = "Synthetic source words."
        tree = {"format": "aob-usx-chapter-tree", "version": 2,
                "sourceArchiveSha256": source_hash,
                "editionId": "test-edition", "versificationId": "test-scheme",
                "books": [{"code": "TST", "order": 0, "sourcePath": "TST.usx", "frontMatter": [],
                           "chapters": [{"label": "1", "startPath": [0], "endPath": [2],
                                         "blocks": [{"kind": "block", "role": "paragraph", "style": "p",
                                                     "content": [{"kind": "verseStart", "unitKey": key},
                                                                 {"kind": "text", "text": value},
                                                                 {"kind": "verseEnd"}]}],
                                         "verseUnits": [{"key": key, "label": "1",
                                             "order": 0, "textPlain": value,
                                             "textDigest": hashlib.sha256(value.encode()).hexdigest(),
                                             "startPath": [1], "endPath": [2],
                                             "textRuns": [{"sourcePath": [1, 0], "text": value}]}],
                                         "referenceLookup": {"1": [key]}}]}]}
        tree_hash = hashlib.sha256(compact(tree).encode()).hexdigest()
        chapters = root / "chapters"
        chapters.mkdir()
        (chapters / "chapters.json").write_text(compact(tree))
        (chapters / "report.json").write_text(json.dumps(
            {"sha256": tree_hash, "bookCount": 1, "chapterCount": 1}))
        review_dir = root / "review"
        review_dir.mkdir()
        evidence = {}
        for kind in ("rights", "presentation", "search"):
            path = review_dir / f"{kind}.txt"
            path.write_text(f"Synthetic {kind} review fixture")
            evidence[kind] = {"file": path.name, "sha256": sha256_file(path)}
        record = {"formatVersion": 1, "decision": "approved-for-v1",
                  "approvalEvidenceId": "synthetic-unit-test-only",
                  "sourceArchiveSha256": source_hash, "chapterTreeSha256": tree_hash,
                  "editionId": "test-edition", "versificationId": "test-scheme",
                  "searchProfileVersion": "reviewed-latin-v1", "evidence": evidence}
        review_path = review_dir / "approval.json"
        review_path.write_text(json.dumps(record))
        return archive, chapters, review_path, record

    def test_rebuilds_synthetic_pack_from_exact_review_inputs(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, chapters, review_path, record = self.fixture(root)
            out = root / "distribution"
            report = build(archive, chapters, review_path, out)
            manifest = json.loads((out / "approved-content.json").read_text())
            self.assertEqual(manifest["librarySha256"], sha256_file(out / "library.sqlite"))
            self.assertEqual(manifest["approvalEvidenceId"], record["approvalEvidenceId"])
            self.assertEqual(report["counts"]["verse_units"], 1)
            with sqlite3.connect(out / "library.sqlite") as connection:
                self.assertEqual(connection.execute("SELECT approval_status,search_profile_version FROM content_manifest").fetchone(),
                                 ("approved", "reviewed-latin-v1"))
                self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            repeated = root / "distribution-repeat"
            build(archive, chapters, review_path, repeated)
            for name in ("library.sqlite", "approved-content.json", "report.json"):
                self.assertEqual((out / name).read_bytes(), (repeated / name).read_bytes(), name)
            with self.assertRaisesRegex(ProjectionError, "Output directory exists"):
                build(archive, chapters, review_path, out)

    def test_rejects_changed_source_or_review_evidence_before_output(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, chapters, review_path, record = self.fixture(root)
            out = root / "distribution"
            record["sourceArchiveSha256"] = "0" * 64
            review_path.write_text(json.dumps(record))
            with self.assertRaisesRegex(ProjectionError, "identity does not match"):
                build(archive, chapters, review_path, out)
            self.assertFalse(out.exists())
            record["sourceArchiveSha256"] = sha256_file(archive)
            review_path.write_text(json.dumps(record))
            (review_path.parent / "search.txt").write_text("altered review")
            with self.assertRaisesRegex(ProjectionError, "search review evidence checksum differs"):
                build(archive, chapters, review_path, out)
            self.assertFalse(out.exists())

    def test_rejects_chapter_that_native_storage_can_read_but_renderer_cannot(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, chapters, review_path, record = self.fixture(root)
            tree_path = chapters / "chapters.json"
            tree = json.loads(tree_path.read_text())
            tree["books"][0]["chapters"][0]["blocks"] = []
            tree_path.write_text(compact(tree))
            tree_hash = hashlib.sha256(compact(tree).encode()).hexdigest()
            (chapters / "report.json").write_text(json.dumps(
                {"sha256": tree_hash, "bookCount": 1, "chapterCount": 1}))
            record["chapterTreeSha256"] = tree_hash
            review_path.write_text(json.dumps(record))
            out = root / "distribution"
            with self.assertRaisesRegex(ProjectionError, "Renderer content contract rejected"):
                build(archive, chapters, review_path, out)
            self.assertFalse(out.exists())

    def test_renderer_contract_rejects_search_index_drift(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            archive, chapters, review_path, _ = self.fixture(root)
            out = root / "distribution"
            build(archive, chapters, review_path, out)
            library = out / "library.sqlite"
            with sqlite3.connect(library) as connection:
                connection.execute("UPDATE verse_search SET text='unrelated' WHERE rowid=1")
            with self.assertRaisesRegex(ProjectionError, "Renderer content contract rejected"):
                verify_renderer_contract(library)


if __name__ == "__main__":
    unittest.main()
