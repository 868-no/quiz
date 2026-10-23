import copy
import unittest

from tools import checks
from tools.context import load_context

from .helpers import SYNTH_TEXT, TempRepo, sample_revision


class ChecksTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo = TempRepo()
        cls.iid = cls.repo.import_()["import_id"]
        cls.ctx = load_context(cls.repo.paths)

    @classmethod
    def tearDownClass(cls):
        cls.repo.cleanup()

    def run_checks(self, **over):
        rev = sample_revision(self.iid, **over)
        return checks.check_revision(self.ctx, "q-0001", rev)

    def mutate(self, fn):
        rev = sample_revision(self.iid)
        fn(rev)
        return checks.check_revision(self.ctx, "q-0001", rev)

    def assertError(self, result, text):
        self.assertTrue(any(text in e for e in result["errors"]), f"expected error containing {text!r}: {result['errors']}")

    def assertWarning(self, result, text):
        self.assertTrue(any(text in w for w in result["warnings"]), f"expected warning containing {text!r}: {result['warnings']}")

    def test_valid_question_passes(self):
        r = self.run_checks()
        self.assertTrue(r["passed"], r["errors"])
        self.assertEqual(r["warnings"], [])

    def test_option_count_and_unique_correct_key(self):
        self.assertError(self.mutate(lambda r: r["options"].pop()), "exactly 4 options")
        self.assertError(self.run_checks(correct=["o1", "o2"]), "exactly one correct")
        self.assertError(self.run_checks(correct=["zz"]), "is not an option id")

    def test_duplicate_options(self):
        def dup(r):
            r["options"][1]["content"] = [{"q": 39.2, "u": "mA"}]
        self.assertError(self.mutate(dup), "same text")

    def test_wrong_option_needs_feedback(self):
        def nofb(r):
            r["options"][2]["feedback"] = []
        self.assertError(self.mutate(nofb), "options[2].feedback: required")

    def test_html_is_rejected(self):
        self.assertError(self.run_checks(stem=["Hva er <b>strøm</b>?"]), "markup/HTML")

    def test_english_text_is_rejected(self):
        self.assertError(self.run_checks(stem=["What is the current that flows through the resistor when the voltage is applied?"],
                                         context=[], explanation=["The current is the voltage divided by the resistance which is 25.5 mA."]),
                         "looks English")

    def test_decimal_point_warning(self):
        self.assertWarning(self.run_checks(explanation=[["Svaret er 25.5 mA, altså ", {"q": 25.5, "u": "mA"}, "."]]), "decimal point")

    def test_unknown_glossary_term(self):
        self.assertError(self.run_checks(stem=[["Hva er ", {"term": "finnes-ikke", "text": "x"}, "?"]]), "unknown glossary term")

    def test_wrong_declared_answer_is_caught_by_recomputation(self):
        def wrong(r):
            r["calculation"]["answer"] = [26.5, "mA"]
        self.assertError(self.mutate(wrong), "recomputed")

    def test_correct_option_must_state_the_answer(self):
        def swap(r):
            r["correct"] = ["o2"]
            r["options"][0]["feedback"] = ["x"]
        res = self.mutate(swap)
        self.assertError(res, "correct option does not state")
        self.assertError(res, "distractor o1 has the same value")

    def test_visual_must_not_show_the_answer_before_feedback(self):
        def leak(r):
            r["visual"]["params"]["ammeter"]["show_reading"] = True
        self.assertError(self.mutate(leak), "shows I")

    def test_visual_values_must_match_calculation(self):
        def mismatch(r):
            r["visual"]["params"]["resistors"][0]["ohms"] = 560
        res = self.mutate(mismatch)
        self.assertError(res, "R1 in the figure")
        self.assertError(res, "disagrees with the answer")

    def test_invalid_visual_params(self):
        def bad(r):
            r["visual"]["params"]["topology"] = "triangle"
        self.assertError(self.mutate(bad), "is not one of")

    def test_unknown_formula(self):
        def bad(r):
            r["calculation"]["formula"] = "magic"
        self.assertError(self.mutate(bad), "unknown formula")

    def test_calculation_style_requires_block(self):
        self.assertError(self.mutate(lambda r: r.pop("calculation")), "requires a calculation block")

    def test_exam_priority_needs_source_marker(self):
        def unmarked(r):
            r["sources"]["chunk_uids"] = ["u3"]
            r["section_ids"] = ["s2-03"]
            r["study_reference"] = {"chapter": 2, "section_id": "s2-03", "printed_pages": ["2-3"]}
        self.assertError(self.mutate(unmarked), "'exam_important' but none")

    def test_printed_page_must_come_from_cited_chunks(self):
        self.assertError(self.run_checks(study_reference={"chapter": 2, "section_id": "s2-01",
                                                          "printed_pages": ["2-7"]}), "printed page 2-7")

    def test_missing_chunk_and_chapter_mismatch(self):
        def missing(r):
            r["sources"]["chunk_uids"] = ["nope"]
        self.assertError(self.mutate(missing), "not in the current import")

        def other_chapter(r):
            r["sources"]["chunk_uids"] = ["u4"]
        self.assertError(self.mutate(other_chapter), "from chapter(s) [6]")

    def test_ocr_and_page_hazards_require_acknowledgement(self):
        def hazardous(r):
            r["sources"]["chunk_uids"] = ["u2"]
            r["section_ids"] = ["s2-02"]
            r["study_reference"] = {"chapter": 2, "section_id": "s2-02", "printed_pages": ["2-2"]}
        ids = {h["id"] for h in self.mutate(hazardous)["hazards"]}
        self.assertEqual(ids, {"ocr", "figures"})

        def uncertain_page(r):
            r["sources"]["chunk_uids"] = ["u3"]
            r["priority"] = "normal"
            r["section_ids"] = ["s2-03"]
            r["study_reference"] = {"chapter": 2, "section_id": "s2-03", "printed_pages": ["2-3"]}
        self.assertIn("pages", {h["id"] for h in self.mutate(uncertain_page)["hazards"]})

    def test_near_verbatim_copy_is_an_error(self):
        copied = SYNTH_TEXT["c3"].split(". ", 1)[1]
        self.assertError(self.run_checks(explanation=[copied, ["Svaret er ", {"q": 25.5, "u": "mA"}, "."]]), "8-word passage")

    def test_pipeline_annotations_do_not_count_as_book_text(self):
        txt = checks.source_text_for_similarity("[EQUATION a-1 – OCR text below is unverified]\n```text\nU=RI\n```\n[!] Tekst")
        self.assertNotIn("EQUATION", txt)
        self.assertNotIn("[!]", txt)

    def test_answer_leak_through_glossary_definition(self):
        ctx = copy.copy(self.ctx)
        ctx.glossary = dict(self.ctx.glossary)
        ctx.glossary["strom"] = dict(ctx.glossary["strom"], definition="Strøm i denne kretsen er 25,5 mA og flyter rundt.")
        rev = sample_revision(self.iid)
        rev["options"][0]["content"] = ["25,5 mA og flyter rundt"]
        rev.pop("calculation")
        rev["style"] = "concept"
        res = checks.check_revision(ctx, "q-0001", rev)
        self.assertTrue(any("glossary definition of 'strom'" in w for w in res["warnings"]), res["warnings"])

    def test_unresolved_flags_are_reported(self):
        res = self.run_checks(flags=[{"type": "source_changed", "resolved": False}])
        self.assertWarning(res, "unresolved flag")


if __name__ == "__main__":
    unittest.main()
