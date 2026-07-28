"""
SSB WAT Word Bank — Loads words from SSB_WAT_3000_Words.txt and SSB_WAT_3000_Words_New.txt
Parses categories (Positive, Negative, Neutral) and deduplicates.
"""

import os
import re
import random

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

WORD_FILES = [
    os.path.join(BASE_DIR, "SSB_WAT_3000_Words.txt"),
    os.path.join(BASE_DIR, "SSB_WAT_3000_Words_New.txt"),
]

# Parsed word storage
WORDS = {"positive": [], "negative": [], "neutral": []}
ALL_WORDS = []
WORD_CATEGORY_MAP = {}


def _parse_file(filepath):
    """Parse a word bank text file and return words by category."""
    words = {"positive": set(), "negative": set(), "neutral": set()}
    current_cat = None

    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                upper = line.upper()
                if "POSITIVE" in upper and "WORDS" in upper:
                    current_cat = "positive"
                    continue
                elif "NEGATIVE" in upper and "WORDS" in upper:
                    current_cat = "negative"
                    continue
                elif "NEUTRAL" in upper and "WORDS" in upper:
                    current_cat = "neutral"
                    continue

                # Skip header lines
                if line.startswith("=") or line.startswith("-") or line.startswith("SSB"):
                    continue

                if current_cat:
                    # Strip the _N suffix to get the base word
                    base = re.sub(r"_\d+$", "", line)
                    # Convert SelfControl → Self Control
                    base = re.sub(r"([a-z])([A-Z])", r"\1 \2", base)
                    base = base.strip()
                    if base:
                        words[current_cat].add(base)
    except FileNotFoundError:
        pass

    return words


def _load_all_words():
    """Load and merge words from all text files."""
    global WORDS, ALL_WORDS, WORD_CATEGORY_MAP

    merged = {"positive": set(), "negative": set(), "neutral": set()}

    for filepath in WORD_FILES:
        parsed = _parse_file(filepath)
        for cat in merged:
            merged[cat].update(parsed[cat])

    # Convert to sorted lists
    for cat in merged:
        WORDS[cat] = sorted(list(merged[cat]))

    # Build lookup structures
    ALL_WORDS.clear()
    WORD_CATEGORY_MAP.clear()
    for category, word_list in WORDS.items():
        for word in word_list:
            if word not in WORD_CATEGORY_MAP:
                ALL_WORDS.append(word)
                WORD_CATEGORY_MAP[word] = category


# Load on import
_load_all_words()


def get_words(category="random", count=10):
    """Get words by category."""
    if category == "random":
        pool = ALL_WORDS.copy()
        random.shuffle(pool)
        selected = pool[:count]
    elif category in WORDS:
        pool = WORDS[category].copy()
        random.shuffle(pool)
        selected = pool[:count]
    else:
        selected = []

    return [{"word": w, "category": WORD_CATEGORY_MAP.get(w, "neutral")} for w in selected]


def get_word_category(word):
    """Get the category of a specific word."""
    return WORD_CATEGORY_MAP.get(word, "neutral")


def get_all_categories():
    """Return all available categories with word counts."""
    return {cat: len(words) for cat, words in WORDS.items()}
