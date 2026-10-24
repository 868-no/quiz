"""Regression tests for shared flashcard layout and deterministic choices."""

import json
import tempfile
from pathlib import Path
import unittest

from tools.common import Paths
from tools.flashcard_core import (
    OPTION_COLUMN_GAP, Block, back_blocks, centered_line_offsets, glyph_width, layout,
    ordered_options, select_revisions,
)
from tools.flashcard import _study_reference, _verification_status


class FlashcardOptionOrderTest(unittest.TestCase):
    """Exercise stable option shuffling and answer-letter correspondence."""

    def setUp(self):
        """Create a small question whose first source option is correct."""
        self.options = [{"id": f"o{letter}", "content": letter} for letter in "abcd"]
        self.revision = {"options": self.options, "correct": ["oa"]}

    def test_order_is_deterministic_and_independent_of_input_order(self):
        """The same question keeps its order when input ordering changes."""
        order = ordered_options("q-0014", self.options)
        self.assertEqual(order, ordered_options("q-0014", list(reversed(self.options))))
        self.assertEqual(order, ordered_options("q-0014", self.options))

    def test_correct_letter_matches_shuffled_position(self):
        """The answer panel's letter matches the option's shuffled location."""
        correct_positions = set()
        for number in range(1, 25):
            qid = f"q-{number:04d}"
            ordered = ordered_options(qid, self.options)
            expected = chr(65 + next(i for i, option in enumerate(ordered) if option["id"] == "oa"))
            correct_positions.add(expected)
            self.assertEqual(back_blocks(qid, self.revision)[0].prefix, f"{expected}) ")
        self.assertGreater(len(correct_positions), 1)

    def test_paired_options_have_a_visible_gutter(self):
        """The right option starts after the left column plus the fixed gutter."""
        width = 200.0
        block = Block("first choice", prefix="A) ", right="second choice", right_prefix="B) ",
                  prefix_style="b", right_prefix_style="b", prefix_color=(0.1, 0.2, 0.3))
        lines, _ = layout([block], width, 7.0)
        right_offsets = [line[0] for line in lines if line[0] > 0 and line[5] == "b"]
        self.assertEqual(right_offsets, [(width - OPTION_COLUMN_GAP) / 2 + OPTION_COLUMN_GAP])
        self.assertEqual(b"".join(glyph[1] for glyph in lines[0][1]).decode("cp1252"), "A) ")
        self.assertEqual(lines[0][5], "b")
        self.assertEqual(lines[0][6], (0.1, 0.2, 0.3))
        self.assertEqual(lines[1][5], "r")

    def test_centering_keeps_answer_key_attached_to_answer_text(self):
        """A centered answer row centers its bold key and regular text as one group."""
        block = Block("answer", prefix="C) ", prefix_style="b", prefix_color=(0.12, 0.29, 0.48))
        width = 120.0
        lines, _ = layout([block], width, 7.0)
        shifts = centered_line_offsets(lines, width)
        key_line, answer_line = lines
        key_x = key_line[0] + shifts[(id(block), key_line[4])]
        answer_x = answer_line[0] + shifts[(id(block), answer_line[4])]
        key_width = glyph_width(key_line[1], key_line[3], key_line[5])
        self.assertGreaterEqual(answer_x - key_x - key_width, 1.9)
        total_width = answer_x + glyph_width(answer_line[1], answer_line[3], answer_line[5]) - key_x
        self.assertAlmostEqual(key_x + total_width / 2, width / 2)


class FlashcardStudyReferenceTest(unittest.TestCase):
    """Check concise learning-location labels on answer cards."""

    def test_pages_replace_chapter_and_section_titles(self):
        revision = {"study_reference": {"chapter": 6, "section_id": "s6-13", "printed_pages": ["6-7"]}}
        sections = {"s6-13": {"title": "Lokaloscillatoren", "printed_pages": ["6-7"]}}
        self.assertEqual(_study_reference(revision, sections), "Kap. 6; side 6-7")

    def test_section_title_is_used_when_page_numbers_are_missing(self):
        revision = {"study_reference": {"chapter": 13, "section_id": "s13-10", "printed_pages": []}}
        sections = {"s13-10": {"title": "Lyn og torden", "printed_pages": []}}
        self.assertEqual(_study_reference(revision, sections), "Kap. 13; Lyn og torden")


class FlashcardVerificationStatusTest(unittest.TestCase):
    """Ensure card marks reflect stored machine and human review metadata."""

    def test_missing_approval_is_unverified(self):
        self.assertEqual(_verification_status({}), (False, False))

    def test_machine_approval_sets_only_robot_mark(self):
        revision = {"approval": {"machine_verified": True}}
        self.assertEqual(_verification_status(revision), (True, False))

    def test_human_confirmation_sets_both_marks_after_machine_approval(self):
        revision = {"approval": {
            "machine_verified": True,
            "human_verified": {"by": "Reviewer"},
        }}
        self.assertEqual(_verification_status(revision), (True, True))

    def test_person_approval_sets_only_human_mark(self):
        revision = {"approval": {"machine_verified": False}}
        self.assertEqual(_verification_status(revision), (False, True))


class FlashcardVariantSelectionTest(unittest.TestCase):
    """Ensure variants expand into running-numbered cards by default."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.paths = Paths(Path(self.temp.name))
        self.paths.questions.mkdir(parents=True)
        questions = {
            "q-0349": {
                "revision": 2,
                "status": "approved",
                "chapter": 8,
                "context": "base",
                "variants": [
                    {"id": "v2", "context": "second"},
                    {"id": "v3", "context": "third"},
                ],
            },
            "q-0350": {
                "revision": 1,
                "status": "approved",
                "chapter": 8,
                "context": "next question",
            },
        }
        for qid, revision in questions.items():
            record = {"id": qid, "revisions": [revision]}
            (self.paths.questions / f"{qid}.json").write_text(json.dumps(record), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_default_includes_base_and_all_variants_with_variant_q_codes(self):
        selected = select_revisions(self.paths, None, False)
        self.assertEqual(
            [qid for qid, _ in selected],
            ["q-0349-1", "q-0349-2", "q-0349-3", "q-0350"],
        )
        self.assertEqual([revision["context"] for _, revision in selected],
                         ["base", "second", "third", "next question"])

    def test_variants_can_be_disabled(self):
        selected = select_revisions(self.paths, None, False, include_variants=False)
        self.assertEqual([qid for qid, _ in selected], ["q-0349", "q-0350"])


if __name__ == "__main__":
    unittest.main()
