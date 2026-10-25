import unittest

from usx_chapters import build, build_book, reference_target
from usx_projection import ProjectionError, project_book


def node(tag, attrs=None, content=None):
    return {"tag": tag, "attrs": [list(pair) for pair in (attrs or {}).items()], "content": content or []}


def child(value):
    return {"node": value}


def text(value):
    return {"text": value}


class ChapterTreeTests(unittest.TestCase):
    def source(self):
        return {"code": "TST", "order": 0, "source_path": "TST.usx", "root": node("usx", {"version": "3.0"}, [
            text("\n  "),
            child(node("book", {"code": "TST", "style": "id"}, [text("Test title")])),
            child(node("para", {"style": "mt1"}, [text("Introduction")])),
            child(node("chapter", {"number": "1", "sid": "TST 1"})),
            child(node("para", {"style": "q1"}, [
                text("\n  "), child(node("verse", {"number": "1", "sid": "TST 1:1"})),
                text("A "), child(node("char", {"style": "wj"}, [text("B")])),
                child(node("optbreak")),
                child(node("note", {"style": "f", "caller": "a"}, [
                    child(node("char", {"style": "ft"}, [text("Source note")]))])),
                child(node("ref", {"loc": "TST 1:1"}, [text("reference text")])),
                child(node("verse", {"eid": "TST 1:1"})),
            ])),
            child(node("chapter", {"eid": "TST 1"})),
        ])}

    def test_styles_notes_references_and_text_are_preserved(self):
        source = self.source()
        projected, _ = project_book(source, "edition", "scheme")
        book, counts = build_book(source, projected, "edition", "scheme")
        self.assertEqual(len(book["frontMatter"]), 2)
        block = book["chapters"][0]["blocks"][0]
        self.assertEqual((block["role"], block["style"]), ("poetry", "q1"))
        self.assertEqual([item["kind"] for item in block["content"]],
                         ["text", "verseStart", "text", "character", "optionalBreak",
                          "footnote", "reference", "verseEnd"])
        self.assertEqual(block["content"][5]["content"][0]["content"][0]["text"], "Source note")
        self.assertEqual(block["content"][6]["content"][0]["text"], "reference text")
        self.assertEqual(book["chapters"][0]["verseUnits"][0]["textPlain"], "A Breference text")
        self.assertEqual(counts["root_layout_runs"], 1)

    def test_unknown_style_fails_without_dropping_source(self):
        source = self.source()
        projected, _ = project_book(source, "edition", "scheme")
        source["root"]["content"][4]["node"]["attrs"] = [["style", "unknown"]]
        with self.assertRaisesRegex(ProjectionError, "unsupported paragraph"):
            build_book(source, projected, "edition", "scheme")

    def test_malformed_note_fails_chapter_build(self):
        source = self.source()
        projected, _ = project_book(source, "edition", "scheme")
        note = source["root"]["content"][4]["node"]["content"][5]["node"]
        note["attrs"] = [["style", "f"]]
        with self.assertRaisesRegex(ProjectionError, "unsupported note"):
            build_book(source, projected, "edition", "scheme")

    def test_source_reference_targets_keep_ranges_and_unresolved_text(self):
        source = self.source()
        projected, _ = project_book(source, "edition", "scheme")
        tree, report = build(
            {"format": "aob-usx-source-ast", "books": [source]},
            {"format": "aob-usx-verse-projection", "sourceArchiveSha256": "test",
             "editionId": "edition", "versificationId": "scheme", "books": [projected]},
        )
        chapter = tree["books"][0]["chapters"][0]
        reference = chapter["blocks"][0]["content"][6]
        self.assertEqual(reference["target"],
                         {"bookCode": "TST", "chapterLabel": "1", "verseLabel": "1"})
        self.assertEqual(report["counts"]["resolved_references"], 1)
        self.assertEqual(report["counts"]["single_verse_references"], 1)
        self.assertEqual(report["unresolvedReferences"], [])
        lookup = {"TST": {"1": chapter, "2": {"referenceLookup": {"1": ["other"]},
                                             "verseUnits": [{"key": "other"}]}}}
        self.assertEqual(reference_target("TST 1:1-2:1", lookup),
                         {"bookCode": "TST", "chapterLabel": "1", "verseLabel": "1",
                          "end": {"bookCode": "TST", "chapterLabel": "2", "verseLabel": "1"}})
        self.assertEqual(reference_target("TST 1-2", lookup),
                         {"bookCode": "TST", "chapterLabel": "1",
                          "end": {"bookCode": "TST", "chapterLabel": "2"}})
        self.assertIsNone(reference_target("TST 1:99", lookup))

        source["root"]["content"][4]["node"]["content"][6]["node"]["attrs"] = [["loc", "TST 1:99"]]
        unresolved_tree, unresolved_report = build(
            {"format": "aob-usx-source-ast", "books": [source]},
            {"format": "aob-usx-verse-projection", "sourceArchiveSha256": "test",
             "editionId": "edition", "versificationId": "scheme", "books": [projected]},
        )
        self.assertIsNone(unresolved_tree["books"][0]["chapters"][0]["blocks"][0]["content"][6]["target"])
        self.assertEqual(unresolved_report["unresolvedReferences"], [
            {"bookCode": "TST", "sourcePath": [4, 6], "location": "TST 1:99"},
        ])

    def test_heading_inside_open_verse_is_preserved_outside_body(self):
        source = self.source()
        content = source["root"]["content"]
        content[4]["node"]["content"] = content[4]["node"]["content"][:-1]
        content.insert(5, child(node("para", {"style": "s1"}, [text("Heading")])))
        content.insert(6, child(node("para", {"style": "q2"}, [
            text(" C"), child(node("verse", {"eid": "TST 1:1"}))])))
        projected, _ = project_book(source, "edition", "scheme")
        book, _ = build_book(source, projected, "edition", "scheme")
        chapter = book["chapters"][0]
        self.assertEqual(chapter["verseUnits"][0]["textPlain"], "A Breference text\n C")
        self.assertEqual([block["role"] for block in chapter["blocks"]],
                         ["poetry", "heading", "poetry"])


if __name__ == "__main__":
    unittest.main()
