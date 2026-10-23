import unittest

from tools import glossary_link
from tools.context import load_context

from .helpers import TempRepo, sample_revision


class GlossaryLinkTest(unittest.TestCase):
    def setUp(self):
        self.repo = TempRepo()
        self.iid = self.repo.import_()["import_id"]
        self.ctx = load_context(self.repo.paths)
        self.ctx.glossary.update({
            "kondensator": {"id": "kondensator", "nb": ["kondensator", "kondensatoren"], "en": ["capacitor"],
                            "definition": "Komponent som lagrer ladning.", "related": [], "status": "approved"},
            "sender": {"id": "sender", "nb": ["sender", "senderen"], "en": ["transmitter"], "no_autolink": ["sender"],
                       "definition": "Apparat som lager et radiosignal.", "related": [], "status": "approved"},
            "ssb": {"id": "ssb", "nb": ["SSB"], "en": ["single sideband"],
                    "definition": "Modulasjon med ett sidebånd.", "related": [], "status": "approved"},
        })

    def tearDown(self):
        self.repo.cleanup()

    def link(self, **over):
        rev = sample_revision(self.iid, **over)
        return glossary_link.link_revision(self.ctx, rev)

    def test_first_occurrence_only_and_text_kept(self):
        new, added = self.link(context=[["Kondensatoren og kondensatoren igjen, ", {"q": 1, "u": "µF"}, "."]])
        par = new["context"][0]
        self.assertEqual(par[0], {"term": "kondensator", "text": "Kondensatoren"})
        self.assertEqual(sum(1 for n in par if isinstance(n, dict) and n.get("term") == "kondensator"), 1)
        self.assertIn("kondensator@before", added)

    def test_math_and_quantities_are_never_touched(self):
        new, _ = self.link(context=[[{"math": ["C", "=", {"text": "kondensator"}]}, " slutt."]])
        self.assertEqual(new["context"][0][0], {"math": ["C", "=", {"text": "kondensator"}]})

    def test_word_boundaries_ambiguous_forms_and_capitals(self):
        new, added = self.link(context=["Den sender ut et signal fra kondensatorbanken. Senderen bruker ssb, ikke SSB."])
        par = new["context"][0]
        terms = [(n["term"], n["text"]) for n in par if isinstance(n, dict)]
        self.assertNotIn(("sender", "sender"), terms)          # verb: excluded form
        self.assertIn(("sender", "Senderen"), terms)
        self.assertIn(("ssb", "SSB"), terms)                    # capitals must match exactly
        self.assertNotIn("kondensator@before", added)           # not inside 'kondensatorbanken'

    def test_existing_links_and_limits(self):
        new, added = self.link()
        before = glossary_link._refs_before(new)
        self.assertLessEqual(len(before), glossary_link.MAX_BEFORE)
        self.assertNotIn("strom@before", added)                 # already linked in the stem


if __name__ == "__main__":
    unittest.main()
