"""Versioned mechanical search projection for internal OOCS corpus checks.

This intentionally limited fold is not a fluent-reviewed production profile.
It must agree with the app's JavaScript and bundled-Rust implementations over
the exact source corpus before a search index can be approved.
"""

from __future__ import annotations

import unicodedata


SEARCH_PROFILE_VERSION = "technical-latin-v1"


def fold_character(character: str) -> str:
    point = ord(character)
    if 0x41 <= point <= 0x5A or 0xC0 <= point <= 0xD6 or 0xD8 <= point <= 0xDE:
        return chr(point + 32)
    if point == 0x178:
        return "\u00ff"
    if point == 0x2019:
        return "'"
    return character


def word_character(character: str) -> bool:
    return unicodedata.category(character)[0] in "LMN"


def normalize_search_text(value: str) -> str:
    folded = unicodedata.normalize(
        "NFC", "".join(map(fold_character, unicodedata.normalize("NFC", value)))
    )
    tokens: list[str] = []
    index = 0
    while index < len(folded):
        if not word_character(folded[index]):
            index += 1
            continue
        start = index
        while index < len(folded) and word_character(folded[index]):
            index += 1
        while (index + 1 < len(folded) and folded[index] == "'"
               and word_character(folded[index + 1])):
            index += 1
            while index < len(folded) and word_character(folded[index]):
                index += 1
        tokens.append(folded[start:index])
    return " ".join(tokens)
