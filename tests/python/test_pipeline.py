"""Stages B–D end to end on a temporary repository: verify, review, publish, release check."""
import copy
import json
import re
import unittest

from tools import publish, review
from tools.common import ToolError, read_json
from tools.questions import load_question
from tools.release_check import release_check

from .helpers import SYNTH_TEXT, TempRepo, sample_revision

ACK = ["figures", "ocr", "pages"]


class PipelineTest(unittest.TestCase):
    def setUp(self):
        self.repo = TempRepo()
        self.iid = self.repo.import_()["import_id"]
        self.paths = self.repo.paths
        self.repo.write_question("q-0001", sample_revision(self.iid))

    def tearDown(self):
        self.repo.cleanup()

    def approve(self, qid="q-0001", **kw):
        args = dict(reviewer="Testperson", note="kontrollert", ack=ACK, checklist="all", interactive=False)
        args.update(kw)
        return review.approve(self.paths, qid, **args)

    def bank(self):
        return read_json(self.paths.dist / "data" / "bank.json")

    def test_verify_moves_draft_to_needs_review(self):
        self.assertEqual(review.verify(self.paths, None, quiet=True), 0)
        rev = load_question(self.paths.questions / "q-0001.json")["revisions"][0]
        self.assertEqual(rev["status"], "needs_review")
        self.assertTrue(rev["checks"]["passed"])
        self.assertEqual(rev["review_log"][-1]["actor"], "deterministic-v1")

    def test_failing_checks_keep_draft(self):
        self.repo.write_question("q-0001", sample_revision(self.iid, correct=["zz"]))
        self.assertEqual(review.verify(self.paths, None, quiet=True), 1)
        self.assertEqual(load_question(self.paths.questions / "q-0001.json")["revisions"][0]["status"], "draft")

    def test_approval_requires_review_state_reviewer_checklist_and_acks(self):
        with self.assertRaises(ToolError):  # still draft
            self.approve()
        review.verify(self.paths, None, quiet=True)
        with self.assertRaises(ToolError):
            self.approve(reviewer=None)
        with self.assertRaises(ToolError):
            self.approve(checklist=None)
        res = self.approve(ack=[])  # this question has no hazards: nothing to acknowledge
        self.assertEqual(res["approved"], "q-0001 r1")
        rev = load_question(self.paths.questions / "q-0001.json")["revisions"][0]
        self.assertEqual(rev["status"], "approved")
        self.assertEqual(rev["approval"]["by"], "Testperson")
        audit = (self.paths.reviews / "audit.jsonl").read_text().splitlines()
        self.assertEqual(json.loads(audit[-1])["action"], "approve")

    def test_hazards_must_be_acknowledged(self):
        rev = sample_revision(self.iid)
        rev["sources"]["chunk_uids"] = ["u1", "u2"]
        rev["section_ids"] = ["s2-01", "s2-02"]
        self.repo.write_question("q-0001", rev)
        review.verify(self.paths, None, quiet=True)
        with self.assertRaises(ToolError) as cm:
            self.approve(ack=["ocr"])
        self.assertIn("figures", str(cm.exception))
        self.approve(ack=["ocr", "figures"])

    def test_auto_checks_never_publish(self):
        review.verify(self.paths, None, quiet=True)
        self.repo.approve_templates()
        res = publish.publish(self.paths)
        self.assertEqual(res["questions"], 0)
        self.assertEqual(self.bank()["questions"], [])

    def test_publish_fails_closed_on_unapproved_dependencies(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        with self.assertRaises(publish.PublishError) as cm:
            publish.publish(self.paths)
        self.assertIn("visual template dc-circuit@1 is not approved", str(cm.exception))
        self.assertFalse(self.paths.dist.exists())
        self.repo.approve_templates()
        res = publish.publish(self.paths)
        self.assertEqual(res["questions"], 1)

    def test_published_bank_is_an_allowlisted_projection(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        publish.publish(self.paths)
        bank = self.bank()
        q = bank["questions"][0]
        self.assertEqual(set(q), set(publish.PUBLIC_QUESTION_KEYS))
        blob = json.dumps(bank, ensure_ascii=False)
        for forbidden in ("u1", "chunk_uids", "provenance", "review_log", "Testperson", "learning_objective",
                          "pdf_page", "SYNTETISK TESTDATA"):
            self.assertNotIn(f'"{forbidden}"' if forbidden.isidentifier() else forbidden, blob)
        self.assertEqual(q["ref"], {"chapter": 2, "section": None, "pages": ["2-1"]})  # heading not verified
        self.assertEqual([c["status"] for c in bank["chapters"]][:3], ["upcoming", "available", "upcoming"])
        self.assertEqual(list(bank["glossary"]), ["strom"])
        self.assertEqual(list(bank["templates"]), ["dc-circuit@1"])

    def test_verified_section_title_is_published(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        review.verify_section(self.paths, "s2-01", title="Motstand – Ohms lov", reviewer="T")
        publish.publish(self.paths)
        bank = self.bank()
        self.assertEqual(bank["questions"][0]["ref"]["section"], "s2-01")
        self.assertEqual(bank["sections"]["s2-01"]["title"], "Motstand – Ohms lov")

    def test_editing_after_approval_blocks_publication(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        path = self.paths.questions / "q-0001.json"
        q = load_question(path)
        q["revisions"][0]["correct"] = ["o2"]
        path.write_text(json.dumps(q, ensure_ascii=False))
        with self.assertRaises(publish.PublishError) as cm:
            publish.publish(self.paths)
        self.assertIn("content changed after approval", str(cm.exception))

    def test_new_revision_keeps_old_one_published_until_approved(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        review.new_revision(self.paths, "q-0001", reviewer="T", note="bedre forklaring")
        publish.publish(self.paths)
        self.assertEqual(self.bank()["questions"][0]["rev"], 1)
        review.verify(self.paths, ["q-0001"], quiet=True)
        self.approve()
        publish.publish(self.paths)
        self.assertEqual(self.bank()["questions"][0]["rev"], 2)
        q = load_question(self.paths.questions / "q-0001.json")
        self.assertEqual([r["status"] for r in q["revisions"]], ["retired", "approved"])

    def test_rejected_and_retired_questions_are_not_published(self):
        review.verify(self.paths, None, quiet=True)
        review.set_status(self.paths, "q-0001", "reject", reviewer="T", note="feil")
        self.repo.approve_templates()
        self.assertEqual(publish.publish(self.paths)["questions"], 0)
        review.set_status(self.paths, "q-0001", "reopen", reviewer="T", note="ny vurdering")
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.assertEqual(publish.publish(self.paths)["questions"], 1)
        review.set_status(self.paths, "q-0001", "retire", reviewer="T", note="utgått")
        self.assertEqual(publish.publish(self.paths)["questions"], 0)

    def test_source_change_blocks_publication_until_resolved(self):
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        data = copy.deepcopy(self.repo.data)
        data["chunks"][0]["text"] += " Endret i ny skanning."
        self.repo.import_(data)
        with self.assertRaises(publish.PublishError) as cm:
            publish.publish(self.paths)
        self.assertIn("unresolved flags", str(cm.exception))
        self.assertEqual(publish.publish(self.paths, skip_flagged=True)["questions"], 0)
        review.resolve_flag(self.paths, "q-0001", reviewer="T", note="kontrollert mot ny tekst", demote=False)
        self.assertEqual(publish.publish(self.paths)["questions"], 1)

    def test_preview_includes_drafts_but_never_writes_dist(self):
        res = publish.preview(self.paths)
        self.assertEqual(res["questions"], 1)
        self.assertFalse(self.paths.dist.exists())
        bank = read_json(self.paths.preview / "data" / "bank.json")
        self.assertEqual(bank["mode"], "preview")
        self.assertEqual(bank["questions"][0]["preview_status"], "draft")
        # a preview build must never pass the production release check
        self.assertTrue(release_check(self.paths.preview, self.paths, expect_mode="production")["errors"])

    def test_release_check_catches_leaks(self):
        self.repo.approve_templates()
        publish.publish(self.paths)
        self.assertEqual(release_check(self.paths.dist, self.paths)["errors"], [])
        (self.paths.dist / "scan.png").write_bytes(b"\x89PNG")
        (self.paths.dist / "notes.txt").write_text("see chunk-000123 and private/imported")
        (self.paths.dist / "copy.txt").write_text(SYNTH_TEXT["c4"])
        errs = "\n".join(release_check(self.paths.dist, self.paths)["errors"])
        self.assertIn("scan.png: file type .png", errs)
        self.assertIn("source chunk id", errs)
        self.assertIn("private path", errs)
        self.assertIn("8-word passage", errs)

    def test_release_check_rejects_mentions_of_scanning(self):
        self.repo.approve_templates()
        publish.publish(self.paths)
        (self.paths.dist / "about.txt").write_text("Spørsmålene er laget fra skannede sider.")
        errs = "\n".join(release_check(self.paths.dist, self.paths)["errors"])
        self.assertIn("mention of scanning/OCR", errs)

    def test_offline_copy_lists_every_file_and_detects_stale_copies(self):
        self.repo.approve_templates()
        publish.publish(self.paths)
        sw = (self.paths.dist / "sw.js").read_text(encoding="utf-8")
        self.assertNotIn("PRECACHE = null", sw)
        listed = json.loads(re.search(r"^const PRECACHE = (.*?);$", sw, re.M).group(1))
        self.assertIn("data/bank.json", listed["files"])
        self.assertIn("index.html", listed["files"])
        self.assertNotIn("sw.js", listed["files"])
        self.assertNotIn("CNAME", listed["files"])
        self.assertEqual(release_check(self.paths.dist, self.paths)["errors"], [])
        # a file changed after publish makes the copy stale; a new file is missing from it
        (self.paths.dist / "styles.css").write_text("body{}", encoding="utf-8")
        self.assertIn("stale offline copy", "\n".join(release_check(self.paths.dist, self.paths)["errors"]))
        (self.paths.dist / "extra.js").write_text("", encoding="utf-8")
        self.assertIn("missing ['extra.js']", "\n".join(release_check(self.paths.dist, self.paths)["errors"]))
        # a change to the site gives a new version
        old = listed["version"]
        css = self.paths.web / "styles.css"
        css.write_text(css.read_text(encoding="utf-8") + "\n/* changed */\n", encoding="utf-8")
        publish.publish(self.paths)
        sw2 = (self.paths.dist / "sw.js").read_text(encoding="utf-8")
        self.assertNotEqual(json.loads(re.search(r"^const PRECACHE = (.*?);$", sw2, re.M).group(1))["version"], old)

    def test_unpublished_service_worker_caches_nothing(self):
        sw = (self.paths.web / "sw.js").read_text(encoding="utf-8")
        self.assertIn("const PRECACHE = null;", sw)
        publish.preview(self.paths)
        self.assertIn("const PRECACHE = null;", (self.paths.preview / "sw.js").read_text(encoding="utf-8"))
        self.assertIn("PRECACHE was not filled in",
                      "\n".join(release_check(self.paths.preview, self.paths, expect_mode="production")["errors"]))

    def test_release_check_rejects_non_public_bank_fields(self):
        self.repo.approve_templates()
        review.verify(self.paths, None, quiet=True)
        self.approve()
        publish.publish(self.paths)
        bank = self.bank()
        bank["questions"][0]["sources"] = {"chunk_uids": ["u1"]}
        (self.paths.dist / "data" / "bank.json").write_text(json.dumps(bank))
        errs = "\n".join(release_check(self.paths.dist, self.paths)["errors"])
        self.assertIn("non-public keys", errs)

    def test_publish_without_private_import(self):
        import shutil
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        shutil.rmtree(self.paths.imported)
        with self.assertRaises(ToolError):
            publish.publish(self.paths)
        self.assertEqual(publish.publish(self.paths, require_source=False)["questions"], 1)

    def test_glossary_term_must_be_approved(self):
        rev = sample_revision(self.iid)
        rev["explanation"] = [["Se ", {"term": "resistans", "text": "resistans"}, ": ", {"q": 25.5, "u": "mA"}]]
        self.repo.write_question("q-0001", rev)
        review.verify(self.paths, None, quiet=True)
        self.approve()
        self.repo.approve_templates()
        with self.assertRaises(publish.PublishError) as cm:
            publish.publish(self.paths)
        self.assertIn("glossary term 'resistans' is not approved", str(cm.exception))
        review.approve_terms(self.paths, ["resistans"], reviewer="T", note=None)
        self.assertEqual(publish.publish(self.paths)["questions"], 1)


class DeployTest(unittest.TestCase):
    def setUp(self):
        import subprocess
        self.repo = TempRepo()
        self.repo.import_()
        self.paths = self.repo.paths
        self.remote = self.repo.dir / "site.git"
        subprocess.run(["git", "init", "-q", "--bare", str(self.remote)], check=True)
        self.env_backup = {}

    def tearDown(self):
        self.repo.cleanup()

    def git_files(self, branch="gh-pages"):
        import subprocess
        out = subprocess.run(["git", "--git-dir", str(self.remote), "ls-tree", "-r", "--name-only", branch],
                             capture_output=True, text=True, check=True).stdout
        return set(out.split())

    def test_site_links_are_published_and_validated(self):
        (self.paths.config / "site.json").write_text(json.dumps(
            {"cname": None, "issues_url": "https://github.com/868-no/quiz/issues"}))
        publish.publish(self.paths)
        self.assertEqual(read_json(self.paths.dist / "data" / "bank.json")["site"],
                         {"issues_url": "https://github.com/868-no/quiz/issues"})
        (self.paths.config / "site.json").write_text(json.dumps({"issues_url": "https://evil.example/x"}))
        with self.assertRaises(publish.PublishError):
            publish.publish(self.paths)

    def test_publish_writes_github_pages_files(self):
        (self.paths.config / "site.json").write_text(json.dumps({"cname": "quiz.868.no"}))
        publish.publish(self.paths)
        self.assertEqual((self.paths.dist / "CNAME").read_text(), "quiz.868.no\n")
        self.assertTrue((self.paths.dist / ".nojekyll").exists())
        (self.paths.config / "site.json").write_text(json.dumps({"cname": "not a host"}))
        with self.assertRaises(publish.PublishError):
            publish.publish(self.paths)

    def test_deploy_pushes_only_dist_and_refuses_source_branches(self):
        import os
        import subprocess
        from tools.deploy import deploy
        os.environ.setdefault("GIT_AUTHOR_NAME", "T")
        os.environ.setdefault("GIT_AUTHOR_EMAIL", "t@example.invalid")
        os.environ.setdefault("GIT_COMMITTER_NAME", "T")
        os.environ.setdefault("GIT_COMMITTER_EMAIL", "t@example.invalid")
        (self.paths.config / "site.json").write_text(json.dumps({"cname": "quiz.868.no"}))
        publish.publish(self.paths)
        self.assertEqual(deploy(self.paths, str(self.remote), dry_run=True)["status"], "dry_run")
        self.assertEqual(deploy(self.paths, str(self.remote), yes=True)["status"], "pushed")
        files = self.git_files()
        self.assertIn("index.html", files)
        self.assertIn("CNAME", files)
        self.assertIn("data/bank.json", files)
        self.assertFalse(any(f.startswith(("content/", "tools/", "private/")) for f in files))
        self.assertEqual(deploy(self.paths, str(self.remote), yes=True)["status"], "unchanged")
        # a branch holding source code is never overwritten
        src = self.repo.dir / "src"
        src.mkdir()
        (src / "tools").mkdir()
        (src / "tools" / "x.py").write_text("")
        for cmd in (["init", "-q"], ["checkout", "-q", "-b", "main"], ["add", "-A"], ["commit", "-q", "-m", "src"],
                    ["push", "-q", str(self.remote), "main"]):
            subprocess.run(["git", *cmd], cwd=src, check=True, capture_output=True)
        with self.assertRaises(ToolError):
            deploy(self.paths, str(self.remote), branch="main", yes=True)
        # a build failing the release check is never deployed
        (self.paths.dist / "leak.png").write_bytes(b"x")
        with self.assertRaises(ToolError):
            deploy(self.paths, str(self.remote), yes=True)


class GenerationTest(unittest.TestCase):
    def setUp(self):
        self.repo = TempRepo()
        self.repo.import_()
        self.paths = self.repo.paths

    def tearDown(self):
        self.repo.cleanup()

    def test_manual_skeleton_is_mapped_but_unfinished(self):
        from tools.generate import new_manual
        qid = new_manual(self.paths, ["chunk-000002"], style="calculation", author="T")
        rev = load_question(self.paths.questions / f"{qid}.json")["revisions"][0]
        self.assertEqual(rev["sources"]["chunk_uids"], ["u2"])
        self.assertEqual(rev["priority"], "exam_important")
        self.assertEqual(rev["section_ids"], ["s2-02"])
        self.assertEqual(rev["status"], "draft")
        self.assertEqual(review.verify(self.paths, [qid], quiet=True), 1)
        self.assertTrue(any("TODO" in e for e in load_question(self.paths.questions / f"{qid}.json")["revisions"][0]["checks"]["errors"]))

    def test_generation_is_off_by_default(self):
        from tools.generate import generate
        with self.assertRaises(ToolError) as cm:
            generate(self.paths, ["u1"], count=1, extra=None)
        self.assertIn("disabled", str(cm.exception))

    def test_remote_provider_requires_explicit_opt_in(self):
        from tools.generate import generate
        (self.paths.config / "generation.local.json").write_text(json.dumps(
            {"provider": "openai_compatible", "providers": {"openai_compatible": {"base_url": "https://example.invalid", "model": "m"}}}))
        with self.assertRaises(ToolError) as cm:
            generate(self.paths, ["u1"], count=1, extra=None)
        self.assertIn("allow_external_upload", str(cm.exception))

    def test_command_provider_records_run_and_keeps_source_mapping(self):
        import sys
        from tools.generate import generate
        script = self.repo.dir / "fake_llm.py"
        script.write_text("import sys, json\nsys.stdin.read()\nprint('Svar:', json.dumps([{"
                          "'style': 'concept', 'difficulty': 'easy', 'chapter': 9, 'sources': {'chunk_uids': ['x']},"
                          "'stem': ['Hva er strøm?'], 'correct': ['o1'], 'explanation': ['Ladning per tid.'],"
                          "'options': [{'id': 'o%d' % i, 'content': ['Alternativ %d' % i], 'feedback': ['Nei.']} for i in range(1, 5)]}]))\n")
        (self.paths.config / "generation.local.json").write_text(json.dumps(
            {"provider": "command", "providers": {"command": {"argv": [sys.executable, str(script)], "model": "fake"}}}))
        res = generate(self.paths, ["u1"], count=1, extra=None)
        qid = res["created"][0]
        rev = load_question(self.paths.questions / f"{qid}.json")["revisions"][0]
        self.assertEqual(rev["chapter"], 2)  # from the import, not from the model
        self.assertEqual(rev["sources"]["chunk_uids"], ["u1"])
        self.assertEqual(rev["provenance"]["method"], "llm")
        self.assertEqual(rev["status"], "draft")
        run = self.paths.generation / "runs" / res["run_id"]
        for f in ("prompt.txt", "output.txt", "meta.json", "sources.json"):
            self.assertTrue((run / f).exists(), f)
        self.assertIn("SYNTETISK TESTDATA", (run / "prompt.txt").read_text())


if __name__ == "__main__":
    unittest.main()
