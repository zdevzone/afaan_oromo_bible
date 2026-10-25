import unittest

from compare_content_revisions import compare


def pack(revision: str, units: dict, lookup: dict) -> dict:
    return {
        "identity": {
            "librarySha256": "0" * 64,
            "approvalStatus": "technical_only",
            "sourceArchiveSha256": "1" * 64,
            "contentRevision": revision,
            "editionId": "synthetic-edition",
            "versificationId": "synthetic-scheme",
        },
        "units": units,
        "lookup": lookup,
    }


class ContentRevisionComparisonTests(unittest.TestCase):
    def test_unchanged_text_across_revision_is_distinguished_from_highlight_revision(self):
        units = {"unit-1": ("TST", "1", "1", "a" * 64, 0)}
        lookup = {("TST", "1", "1"): [(0, "unit-1")]}
        result = compare(pack("first", units, lookup), pack("second", units, lookup))
        self.assertEqual(result["status"], "same-addresses-and-text")
        self.assertEqual(result["counts"]["unchangedUnitKeysAndText"], 1)
        self.assertEqual(result["counts"]["potentialHighlightUnitKeysNeedingReanchor"], 1)

    def test_changed_text_order_and_lookup_are_reported_without_text(self):
        old = pack("first", {
            "unit-1": ("TST", "1", "1", "a" * 64, 0),
            "unit-2": ("TST", "1", "2", "b" * 64, 1),
            "unit-3": ("TST", "1", "3", "c" * 64, 2),
        }, {("TST", "1", "1"): [(0, "unit-1")]})
        new = pack("second", {
            "unit-1": ("TST", "1", "1", "d" * 64, 0),
            "unit-2": ("TST", "1", "2", "b" * 64, 2),
            "unit-4": ("TST", "1", "4", "e" * 64, 3),
        }, {("TST", "1", "1"): [(0, "unit-2")]})
        result = compare(old, new)
        self.assertEqual(result["status"], "review-required")
        self.assertEqual(result["counts"]["changedAddressOrText"], 1)
        self.assertEqual(result["counts"]["reorderedWithinChapter"], 1)
        self.assertEqual(result["counts"]["removedUnitKeys"], 1)
        self.assertEqual(result["counts"]["addedUnitKeys"], 1)
        self.assertEqual(result["counts"]["changedReferenceLookups"], 1)

    def test_different_edition_is_not_a_revision(self):
        old = pack("first", {"unit-1": ("TST", "1", "1", "a" * 64, 0)}, {})
        new = pack("second", old["units"], {})
        new["identity"]["editionId"] = "another-edition"
        with self.assertRaisesRegex(ValueError, "Different edition"):
            compare(old, new)


if __name__ == "__main__":
    unittest.main()
