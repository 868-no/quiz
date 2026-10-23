import copy
import json
import unittest

from tools import importer, structure
from tools.common import ToolError, read_json
from tools.questions import load_question

from .helpers import TempRepo, sample_revision


class ImporterTest(unittest.TestCase):
    def setUp(self):
        self.repo = TempRepo()

    def tearDown(self):
        self.repo.cleanup()

    def test_import_creates_private_versioned_snapshot(self):
        res = self.repo.import_()
        self.assertEqual(res["status"], "imported", res["diagnostics"].errors)
        iid = res["import_id"]
        snap = self.repo.paths.imported / iid
        for name in ("normalized.json", "diff.json", "import.json", "import_report.md", "source/chunks.jsonl",
                     "figures/e2.png"):
            self.assertTrue((snap / name).exists(), name)
        self.assertEqual(read_json(self.repo.paths.imported / "current.json")["import_id"], iid)
        # everything lands under private/
        self.assertIn(self.repo.paths.private, snap.parents)

    def test_repeat_import_is_a_noop(self):
        first = self.repo.import_()
        second = self.repo.import_()
        self.assertEqual(second["status"], "unchanged")
        self.assertEqual(first["import_id"], second["import_id"])
        self.assertEqual(len(read_json(self.repo.paths.imported / "index.json")["imports"]), 1)

    def test_missing_required_field_refuses_import(self):
        data = self.repo.data
        del data["chunks"][1]["uid"]
        res = self.repo.import_(data)
        self.assertEqual(res["status"], "invalid")
        self.assertTrue(any("'uid' missing" in e for e in res["diagnostics"].errors))
        self.assertFalse(self.repo.paths.imported.exists())

    def test_missing_optional_file_is_a_warning(self):
        self.repo.export()
        (self.repo.export_dir / "visuals.jsonl").unlink()
        res = importer.run_import(self.repo.paths, self.repo.export_dir)
        self.assertEqual(res["status"], "imported")
        self.assertTrue(any("visuals.jsonl" in w for w in res["diagnostics"].warnings))

    def test_unknown_fields_are_reported_as_info(self):
        data = self.repo.data
        data["chunks"][0]["new_field"] = 1
        res = self.repo.import_(data)
        self.assertTrue(any("new_field" in i for i in res["diagnostics"].info))

    def test_markers_pages_and_hazards_are_preserved(self):
        res = self.repo.import_()
        norm = importer.load_import(self.repo.paths, res["import_id"])
        by = {c["uid"]: c for c in norm["chunks"]}
        self.assertEqual(by["u1"]["marked_via"], "inherited_or_illustration")  # marked, no [!] in text
        self.assertEqual(by["u2"]["marked_via"], "paragraph_marker")
        self.assertIsNone(by["u3"]["marked_via"])
        self.assertIn("equation", by["u2"]["ocr_hazards"])
        self.assertTrue(by["u2"]["has_unverified_equation"])
        self.assertEqual(by["u2"]["ocr_flags"][0]["rule"], "possible_ohm")
        # PDF page 3 is 'inferred' and has a page-number conflict: printed page unreliable
        self.assertFalse(by["u3"]["printed_pages_reliable"])
        self.assertIn("page_number_conflict", by["u3"]["page_uncertainty"])
        # printed pages and PDF pages are kept apart
        self.assertEqual(by["u3"]["printed_pages"], ["2-3"])
        self.assertEqual(by["u3"]["pdf_pages"], [3])

    def test_garbled_heading_is_flagged_and_no_heading_text_is_stored(self):
        res = self.repo.import_()
        reg = structure.load_registry(self.repo.paths)
        secs = structure.all_sections(reg)
        norm = importer.load_import(self.repo.paths, res["import_id"])
        garbled_id = next(c["section_id"] for c in norm["chunks"] if c["uid"] == "u4")
        self.assertEqual(garbled_id, "s6-01")
        self.assertEqual(secs[garbled_id]["ocr_quality"], "suspect")
        self.assertTrue(all(s["title"] is None and s["title_status"] == "proposed" for s in secs.values()))
        self.assertEqual(sorted(secs), ["s2-01", "s2-02", "s2-03", "s6-01"])
        # the version-controlled registry contains no heading text from the source
        stored = self.repo.paths.chapters_file.read_text(encoding="utf-8")
        for c in self.repo.data["chunks"]:
            self.assertNotIn(c["section"], stored)
        self.assertEqual(structure.ocr_titles(norm)["s2-01"], "TESTAVSNITT OHM")

    def test_section_ids_are_stable_when_heading_ocr_changes(self):
        self.repo.import_()
        key_before = structure.all_sections(structure.load_registry(self.repo.paths))["s2-02"]["heading_key"]
        data = copy.deepcopy(self.repo.data)
        data["chunks"][1]["section"] = "TESTAVSNIT PARALLELL"  # re-OCR'd differently
        self.repo.import_(data)
        secs = structure.all_sections(structure.load_registry(self.repo.paths))
        self.assertEqual(sorted(secs), ["s2-01", "s2-02", "s2-03", "s6-01"])
        self.assertNotEqual(secs["s2-02"]["heading_key"], key_before)

    def test_changed_source_flags_questions_without_rewriting_them(self):
        res = self.repo.import_()
        rev = sample_revision(res["import_id"])
        rev["status"] = "approved"
        path = self.repo.write_question("q-0001", rev)
        before = load_question(path)["revisions"][0]["stem"]
        data = copy.deepcopy(self.repo.data)
        data["chunks"][0]["text"] += " Endret."
        data["chunks"].pop(2)  # u3 removed
        res2 = self.repo.import_(data)
        self.assertEqual(res2["status"], "imported")
        diff = read_json(self.repo.paths.imported / res2["import_id"] / "diff.json")
        self.assertEqual(diff["changed"], ["u1"])
        self.assertEqual(diff["removed"], ["u3"])
        q = load_question(path)
        r = q["revisions"][0]
        self.assertEqual(r["stem"], before)
        self.assertEqual(r["status"], "approved")
        self.assertEqual(r["flags"][0]["type"], "source_changed")
        self.assertEqual(r["flags"][0]["chunks"], {"u1": "text_changed"})
        self.assertFalse(r["flags"][0]["resolved"])

    def test_remapped_page_is_detected(self):
        self.repo.import_()
        data = copy.deepcopy(self.repo.data)
        data["chunks"][0]["printed_pages"] = ["2-2"]
        data["manifest"]["pages"][0]["printed_page"] = "2-9"
        data["chunks"][0]["printed_pages"] = ["2-9"]
        res = self.repo.import_(data)
        diff = read_json(self.repo.paths.imported / res["import_id"] / "diff.json")
        self.assertEqual(diff["remapped"][0]["uid"], "u1")
        self.assertIn("printed_pages", diff["remapped"][0]["fields"])
        self.assertEqual(diff["pages_remapped"][0]["new"], [1, "2-9"])

    def test_refuses_public_directories_as_source(self):
        with self.assertRaises(ToolError):
            importer.run_import(self.repo.paths, self.repo.paths.web / "js")


if __name__ == "__main__":
    unittest.main()
