"""Synthetic USX importer checks; no publisher text or archive is committed."""

from io import BytesIO
import unittest
import warnings
import zipfile

from usx_spike import (
    SourceError, ast_text, inspect_entries, parse_xml, source_ast, structure_report,
)


SYNTHETIC_USX = b'''<usx version="3.0"><book code="TST" style="id"/>
<chapter number="1" style="c" sid="TST 1"/>
<para style="p"><verse number="2-3" style="v" sid="TST 1:2-3"/>Invented A
<char style="bd">invented B<note style="f" caller="+">invented note</note> invented C</char>
 invented D</para><para style="q1" vid="TST 1:2-3">invented continuation
<verse eid="TST 1:2-3"/></para><chapter eid="TST 1"/></usx>'''


class UsxSpikeTests(unittest.TestCase):
    def test_mixed_text_and_bridge_milestones_survive_nested_nodes(self):
        root = parse_xml(SYNTHETIC_USX, "synthetic.usx")
        converted = source_ast(root)
        self.assertEqual(ast_text(converted), "".join(root.itertext()))
        report = structure_report(root, "TST")
        self.assertEqual(report["chapters"], ["1"])
        self.assertEqual(report["verse_starts"], 1)
        self.assertEqual(report["continuation_paragraphs"], 1)
        self.assertEqual(report["styles"]["char.bd"], 1)
        self.assertEqual(report["styles"]["note.f"], 1)

    def test_rejects_dtd_invalid_utf8_and_malformed_milestones(self):
        with self.assertRaises(SourceError):
            parse_xml(b'<!DOCTYPE usx [<!ENTITY x "invented">]><usx>&x;</usx>', "unsafe.usx")
        with self.assertRaises(SourceError):
            parse_xml(b'<usx>\xff</usx>', "invalid.usx")
        root = parse_xml(SYNTHETIC_USX.replace(b'TST 1:2-3"/></para>', b'TST 1:9"/></para>'), "bad.usx")
        with self.assertRaises(SourceError):
            structure_report(root, "TST")

    def test_rejects_unsafe_archive_entries_before_reading_content(self):
        for name in ("../outside.usx", "/absolute.usx", "book\\path.usx"):
            with self.subTest(name=name):
                data = BytesIO()
                with zipfile.ZipFile(data, "w") as archive:
                    archive.writestr(name, SYNTHETIC_USX)
                data.seek(0)
                with zipfile.ZipFile(data) as archive, self.assertRaises(SourceError):
                    inspect_entries(archive)

    def test_rejects_truncated_archive_and_duplicate_entry_names(self):
        data = BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("TST.usx", SYNTHETIC_USX)
        with self.assertRaises(zipfile.BadZipFile):
            zipfile.ZipFile(BytesIO(data.getvalue()[:-22]))

        with zipfile.ZipFile(BytesIO(data.getvalue())) as archive:
            self.assertEqual(list(inspect_entries(archive)), ["TST.usx"])
        data = BytesIO()
        with zipfile.ZipFile(data, "w") as archive:
            archive.writestr("TST.usx", SYNTHETIC_USX)
            with warnings.catch_warnings():
                warnings.simplefilter("ignore", UserWarning)
                archive.writestr("TST.usx", SYNTHETIC_USX)
        with zipfile.ZipFile(BytesIO(data.getvalue())) as archive, self.assertRaisesRegex(SourceError, "duplicate"):
            inspect_entries(archive)


if __name__ == "__main__":
    unittest.main()
