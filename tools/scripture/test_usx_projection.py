import hashlib
import json
import unittest

from usx_projection import ProjectionError, labels_for, project_book


def node(tag, attrs=None, content=None):
    return {"tag": tag, "attrs": [list(pair) for pair in (attrs or {}).items()], "content": content or []}


def child(value):
    return {"node": value}


def text(value):
    return {"text": value}


class ProjectionTests(unittest.TestCase):
    def sample(self):
        return {"code": "TST", "order": 0, "source_path": "TST.usx", "root": node("usx", {"version": "3.0"}, [
            child(node("book", {"code": "TST", "style": "id"}, [text("Test book")])),
            child(node("chapter", {"number": "1", "sid": "TST 1"})),
            child(node("para", {"style": "p"}, [
                text("\n  "), child(node("verse", {"number": "2-3", "sid": "TST 1:2-3"})),
                text("A "), child(node("char", {"style": "wj"}, [text("B")])),
                child(node("note", {"style": "f", "caller": "a"}, [text("not body")])),
            ])),
            text("\n  "),
            child(node("para", {"style": "q1", "vid": "TST 1:2-3"}, [
                text(" C"), child(node("verse", {"eid": "TST 1:2-3"})),
            ])),
            child(node("chapter", {"eid": "TST 1"})),
        ])}

    def test_bridge_nested_style_note_and_continuation(self):
        book, counts = project_book(self.sample(), "edition", "scheme")
        chapter = book["chapters"][0]
        verse = chapter["units"][0]
        self.assertEqual(verse["textPlain"], "A B\n C")
        self.assertEqual(verse["textDigest"], hashlib.sha256(b"A B\n C").hexdigest())
        self.assertEqual(len(verse["textRuns"]), 3)
        self.assertEqual(chapter["referenceLookup"]["2"], [verse["key"]])
        self.assertEqual(chapter["referenceLookup"]["3"], [verse["key"]])
        self.assertEqual(chapter["referenceLookup"]["2-3"], [verse["key"]])
        self.assertEqual(counts["note"], 1)
        self.assertEqual(book["outsideTextRuns"][0]["text"], "Test book")
        self.assertEqual(json.loads(verse["key"]), ["edition", "scheme", "TST", "1", "2-3"])

    def test_unknown_node_and_bad_milestone_fail(self):
        book = self.sample()
        book["root"]["content"].insert(1, child(node("mystery")))
        with self.assertRaisesRegex(ProjectionError, "unsupported USX node"):
            project_book(book, "edition", "scheme")
        book = self.sample()
        book["root"]["content"][4]["node"]["content"][1]["node"]["attrs"] = [["eid", "TST 1:4"]]
        with self.assertRaisesRegex(ProjectionError, "mismatched verse end"):
            project_book(book, "edition", "scheme")

    def test_bridge_label_limit(self):
        self.assertEqual(labels_for("5a"), ["5a"])
        with self.assertRaises(ProjectionError):
            labels_for("5-5")
        with self.assertRaises(ProjectionError):
            labels_for("1-200")

    def test_duplicate_verse_label_fails_before_indexing(self):
        book = self.sample()
        duplicate = node("para", {"style": "p"}, [
            child(node("verse", {"number": "2-3", "sid": "TST 1:2-3"})),
            text("Different invented text"),
            child(node("verse", {"eid": "TST 1:2-3"})),
        ])
        book["root"]["content"].insert(-1, child(duplicate))
        with self.assertRaisesRegex(ProjectionError, "duplicate verse label"):
            project_book(book, "edition", "scheme")

    def test_bridge_and_single_verse_overlap_fails_before_indexing(self):
        book = self.sample()
        overlapping = node("para", {"style": "p"}, [
            child(node("verse", {"number": "3", "sid": "TST 1:3"})),
            text("Different invented text"),
            child(node("verse", {"eid": "TST 1:3"})),
        ])
        book["root"]["content"].insert(-1, child(overlapping))
        with self.assertRaisesRegex(ProjectionError, "overlapping verse label"):
            project_book(book, "edition", "scheme")

    def test_heading_between_body_blocks_is_not_verse_text(self):
        book = self.sample()
        book["root"]["content"].insert(4, child(node("para", {"style": "s1"}, [text("Heading")])))
        projected, _ = project_book(book, "edition", "scheme")
        verse = projected["chapters"][0]["units"][0]
        self.assertEqual(verse["textPlain"], "A B\n C")
        self.assertEqual([run["text"] for run in verse["textRuns"]], ["A ", "B", " C"])


if __name__ == "__main__":
    unittest.main()
