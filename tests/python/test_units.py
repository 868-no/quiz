"""Formulas, rich text, visual templates (shared cases with JS), structure heuristics and repository content."""
import json
import math
import re
import unittest

from tools import formulas, richtext, structure, visuals
from tools.checks import check_revision
from tools.common import PATHS
from tools.context import load_context, validate_glossary
from tools.questions import load_all

from .helpers import REPO

CASES = json.loads((REPO / "tests" / "fixtures" / "visual-cases.json").read_text())["cases"]


class FormulaTest(unittest.TestCase):
    def calc(self, formula, inputs, unit):
        return formulas.compute({"formula": formula, "inputs": inputs, "answer": [0, unit]})[0]

    def test_known_values(self):
        self.assertAlmostEqual(self.calc("ohms_law_current", {"U": [12, "V"], "R": [470, "Ω"]}, "mA"), 25.5319, 3)
        self.assertAlmostEqual(self.calc("parallel_resistance", {"a": [100, "Ω"], "b": [150, "Ω"]}, "Ω"), 60)
        self.assertAlmostEqual(self.calc("series_capacitance", {"a": [10, "µF"], "b": [10, "µF"]}, "µF"), 5)
        self.assertAlmostEqual(self.calc("capacitive_reactance", {"f": [10, "kHz"], "C": [100, "nF"]}, "Ω"), 159.155, 2)
        self.assertAlmostEqual(self.calc("resonance_frequency", {"L": [10, "µH"], "C": [100, "pF"]}, "MHz"), 5.0329, 3)
        self.assertAlmostEqual(self.calc("charge", {"I": [2, "A"], "t": [3, "h"]}, "C"), 21600)
        self.assertAlmostEqual(self.calc("image_frequency_high_lo", {"f_RF": [144.5, "MHz"], "f_IF": [10.7, "MHz"]}, "MHz"), 165.9)
        self.assertAlmostEqual(self.calc("db_power_ratio", {"P1": [1, "W"], "P2": [100, "W"]}, "dB"), 20)
        self.assertAlmostEqual(self.calc("modulation_index", {"deviation": [75, "kHz"], "f_mod": [15, "kHz"]}, ""), 5)

    def test_unit_handling(self):
        self.assertEqual(formulas.to_si(4.7, "kΩ"), (4700.0, "Ω"))
        self.assertAlmostEqual(formulas.to_si(100, "pF")[0], 1e-10)
        self.assertEqual(formulas.to_si(2, "min"), (120.0, "s"))
        with self.assertRaises(ValueError):
            formulas.to_si(1, "furlong")
        with self.assertRaises(ValueError):  # answer unit of the wrong dimension
            formulas.compute({"formula": "ohms_law_current", "inputs": {"U": [1, "V"], "R": [1, "Ω"]}, "answer": [1, "V"]})
        with self.assertRaises(ValueError):
            formulas.compute({"formula": "ohms_law_current", "inputs": {"U": [1, "V"]}, "answer": [1, "A"]})

    def test_round_sig(self):
        self.assertEqual(formulas.round_sig(0.025531, 3), 0.0255)
        self.assertEqual(formulas.round_sig(21600, 3), 21600)
        self.assertEqual(formulas.round_sig(159.15, 3), 159)


class RichTextTest(unittest.TestCase):
    def errors(self, value):
        e = []
        richtext.check_rich(value, "x", e, {"strom"})
        return e

    def test_small_numbers_keep_their_digits(self):
        # written out in full like the site does, not cut at six decimals
        self.assertEqual(richtext.format_number(4.7e-6), "0,0000047")
        self.assertEqual(richtext.format_number(25.5), "25,5")
        self.assertEqual(richtext.format_number(-0.5), "−0,5")

    def test_valid_structures(self):
        self.assertEqual(self.errors(["Tekst.", ["Med ", {"term": "strom", "text": "strøm"}, " og ",
                                                 {"math": ["X_C", "=", {"frac": [["1"], ["2", "π", "f", "C"]]}]},
                                                 " og ", {"q": 1.5, "u": "kΩ"}]]), [])
        self.assertEqual(self.errors([{"steps": ["a", "b"]}, {"note": "c"}]), [])

    def test_rejections(self):
        self.assertTrue(self.errors(["<script>alert(1)</script>"]))
        self.assertTrue(self.errors([[{"html": "<b>x</b>"}]]))
        self.assertTrue(self.errors([[{"q": 1, "u": "furlong"}]]))
        self.assertTrue(self.errors([[{"math": ["X_C", "=", "1/(2πfC)"]}]]))
        self.assertTrue(self.errors([[{"term": "other", "text": "x"}]]))
        self.assertTrue(self.errors([]))

    def test_plain_text(self):
        self.assertEqual(richtext.plain_text([["I = ", {"q": 25.5, "u": "mA"}]]), "I = 25,5 mA")


class VisualSharedCasesTest(unittest.TestCase):
    """Same cases as tests/js/visuals.test.mjs."""

    def test_cases(self):
        templates = visuals.load_templates(PATHS)
        for case in CASES:
            with self.subTest(case["name"]):
                errs, params, _ = visuals.validate_visual(templates, case["visual"])
                if case["valid"]:
                    self.assertEqual(errs, [])
                    q = visuals.quantities(case["visual"]["template"], params)
                    # a case without quantities or shown values has nothing more to check
                    for k, v in case.get("quantities", {}).items():
                        self.assertTrue(math.isclose(q[k]["value"], v, rel_tol=1e-9), (k, q[k], v))
                    for k, v in case.get("shown", {}).items():
                        self.assertEqual(q[k]["shown"], v, k)
                else:
                    self.assertTrue(errs)
                    self.assertTrue(any(case["error"] in e for e in errs), errs)

    def test_every_template_has_a_js_implementation(self):
        registry = (REPO / "web" / "js" / "visuals" / "registry.js").read_text()
        for key, tpl in visuals.load_templates(PATHS).items():
            module = REPO / "web" / "js" / "visuals" / f"{tpl['id']}.js"
            self.assertTrue(module.exists(), key)
            src = module.read_text()
            self.assertIn(f"id: '{tpl['id']}', version: {tpl['version']}", src)
            self.assertRegex(registry, re.escape(f"./{tpl['id']}.js"))


class StructureTest(unittest.TestCase):
    def test_heading_assessment(self):
        self.assertEqual(structure.assess_ocr_title("MÅLING AV TESTSIGNAL"), [])
        self.assertEqual(structure.assess_ocr_title("OVERFØRING PÅ FM"), [])
        self.assertIn("unexpected_characters", structure.assess_ocr_title("TEST@LINJE"))
        self.assertIn("possibly_split_heading", structure.assess_ocr_title("MÅLING AV TEST- ELLER"))
        self.assertIn("implausible_word", structure.assess_ocr_title("QWRT XZ PLK TS"))
        self.assertIn("leading_lowercase", structure.assess_ocr_title("i TESTAVSNITT KLASSE C"))

    def test_proposed_title(self):
        self.assertEqual(structure.propose_title("TESTAVSNITT - OHMS LOV"), "Testavsnitt - Ohms lov")
        self.assertEqual(structure.propose_title("ENKEL TEST (SSB)"), "Enkel test (SSB)")
        self.assertEqual(structure.propose_title("TESTAVSNITT KLASSE C"), "Testavsnitt klasse C")


class RepositoryContentTest(unittest.TestCase):
    """The committed content must be structurally valid even without the private import."""

    @classmethod
    def setUpClass(cls):
        cls.ctx = load_context(PATHS)
        cls.ctx.source = None
        cls.ctx.chunks = {}

    def test_glossary_is_valid(self):
        self.assertEqual(validate_glossary(self.ctx.glossary), [])

    def test_questions_are_valid_apart_from_source_checks(self):
        qs = load_all(PATHS)
        self.assertGreater(len(qs), 0)
        for _, q in qs:
            rev = max(q["revisions"], key=lambda r: r["revision"])
            if rev["status"] in ("rejected", "retired"):
                continue  # never published or checked
            with self.subTest(q["id"]):
                res = check_revision(self.ctx, q["id"], rev)
                self.assertEqual([e for e in res["errors"] if not e.startswith("sources: no source import")], [])

    def test_nothing_is_approved_by_the_assistant(self):
        for _, q in load_all(PATHS):
            for rev in q["revisions"]:
                if rev["status"] == "approved":
                    self.assertNotIn("AI", rev["approval"]["by"])


if __name__ == "__main__":
    unittest.main()
