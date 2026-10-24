"""The glossary, topic titles and figure labels follow config/terminology.json too."""
import json
import re
import unittest
from pathlib import Path

from tools.checks import terminology_issues
from tools.common import PATHS

REPO = Path(__file__).resolve().parents[2]


class TerminologyTest(unittest.TestCase):
    def assertClean(self, where, text):
        self.assertEqual(terminology_issues(PATHS, text), [], f"{where}: {text}")

    def test_glossary(self):
        for t in json.loads((REPO / "content" / "glossary" / "terms.json").read_text())["terms"]:
            for form in t["nb"]:
                self.assertClean(f"glossary {t['id']} form", form)
            # a definition may name the avoided synonyms after "Kalles også", so readers still recognise them
            self.assertClean(f"glossary {t['id']}", re.split(r"Kalles også", t["definition"])[0])

    def test_topics_and_figure_labels(self):
        for t in json.loads((REPO / "content" / "chapters" / "topics.json").read_text())["topics"]:
            self.assertClean(f"topic {t['id']}", t["title"])
        for tpl in json.loads((REPO / "content" / "visuals" / "templates.json").read_text())["templates"]:
            for kind, text in (tpl.get("kind_labels") or {}).items():
                if text:
                    self.assertClean(f"{tpl['id']} label {kind}", text)
            self.assertClean(f"{tpl['id']} assumption", tpl.get("idealised", ""))


if __name__ == "__main__":
    unittest.main()
