import unittest

from search_projection import normalize_search_text


class SearchProjectionTests(unittest.TestCase):
    def test_bounded_latin_fold_keeps_distinct_apostrophes_and_accents(self):
        self.assertEqual(normalize_search_text("  'WAaqaa' GA’EE CAFE\u0301  "),
                         "waaqaa ga'ee café")
        self.assertEqual(normalize_search_text("gaʼee ga’ee gaee"), "gaʼee ga'ee gaee")
        self.assertEqual(normalize_search_text("aa, bb"), "aa bb")
        self.assertEqual(normalize_search_text("İ Σ Ā"), "İ Σ Ā")

    def test_only_internal_ascii_apostrophes_join_words(self):
        self.assertEqual(normalize_search_text("'aa' a''b a' b"), "aa a b a b")
        self.assertEqual(normalize_search_text("a'b"), "a'b")


if __name__ == "__main__":
    unittest.main()
