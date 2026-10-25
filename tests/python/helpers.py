"""Test helpers: a temporary repository tree and a SYNTHETIC digitization export.

The synthetic export imitates the *shape* of the real exports (see
docs/source-import.md). Its text is invented for tests and is clearly labelled.
"""
from __future__ import annotations

import copy
import json
import shutil
import tempfile
from pathlib import Path

from tools.common import Paths
from tools.context import term_hash

REPO = Path(__file__).resolve().parents[2]

SYNTH_TEXT = {
    "c1": "SYNTETISK TESTDATA. Ohms lov sier at gjennomstrømmet leder har en spenning som er produktet av strøm og resistans i testkretsen her.",
    "c2": "[!] SYNTETISK TESTDATA. Parallelle motstander deler strømmen mellom grenene mens spenningen er felles for alle grenene i testen.",
    "c3": "SYNTETISK TESTDATA. Kondensatorer i parallell gir summen av kapasitansene, og denne setningen finnes bare i testdataene.",
    "c4": "SYNTETISK TESTDATA. Blanderen i mottakeren lager sum og differanse av frekvensene i et oppdiktet eksempel for testing.",
}


def synthetic_export() -> dict:
    pages = []
    for i, (pp, status, ch) in enumerate([("2-1", "ocr", 2), ("2-2", "ocr", 2), ("2-3", "inferred", 2), ("6-1", "ocr", 6)], 1):
        pages.append({
            "pdf_page": i, "source_file": f"img{i}.jpg", "source_sha256": f"{i:064x}", "printed_page": pp,
            "printed_page_status": status, "printed_page_ocr_raw": pp, "chapter": ch,
            "chapter_title": {2: "Grunnleggende elektronikk", 6: "Mottakeren"}[ch],
            "sections_starting_here": [], "page_markdown": f"pages/page-{i:04d}.md",
        })
    chunks = [
        {"id": "chunk-000001", "uid": "u1", "chapter": "Kapittel 2: Grunnleggende elektronikk", "chapter_number": 2,
         "section": "TESTAVSNITT OHM", "subsections": [], "text": SYNTH_TEXT["c1"], "pdf_pages": [1],
         "printed_pages": ["2-1"], "source_files": ["img1.jpg"], "element_ids": ["e1"], "requires_visual_context": False,
         "visual_elements": [], "figure_references": [], "review_required": False, "review_reasons": [],
         "marked_important": True, "char_count": 10, "overlap_element_ids": []},
        {"id": "chunk-000002", "uid": "u2", "chapter": "Kapittel 2: Grunnleggende elektronikk", "chapter_number": 2,
         "section": "TESTAVSNITT PARALLELL", "subsections": [], "text": SYNTH_TEXT["c2"], "pdf_pages": [2],
         "printed_pages": ["2-2"], "source_files": ["img2.jpg"], "element_ids": ["e2"], "requires_visual_context": True,
         "visual_elements": ["e2"], "figure_references": [], "review_required": True, "review_reasons": ["equation"],
         "marked_important": True, "char_count": 10, "overlap_element_ids": []},
        {"id": "chunk-000003", "uid": "u3", "chapter": "Kapittel 2: Grunnleggende elektronikk", "chapter_number": 2,
         "section": "TESTAVSNITT KONDENSATOR", "subsections": [], "text": SYNTH_TEXT["c3"], "pdf_pages": [3],
         "printed_pages": ["2-3"], "source_files": ["img3.jpg"], "element_ids": ["e3"], "requires_visual_context": False,
         "visual_elements": [], "figure_references": [], "review_required": False, "review_reasons": [],
         "marked_important": False, "char_count": 10, "overlap_element_ids": []},
        {"id": "chunk-000004", "uid": "u4", "chapter": "Kapittel 6: Mottakeren", "chapter_number": 6,
         "section": "9 QX ,; Ø ZZK", "subsections": [], "text": SYNTH_TEXT["c4"], "pdf_pages": [4],
         "printed_pages": ["6-1"], "source_files": ["img4.jpg"], "element_ids": ["e4"], "requires_visual_context": False,
         "visual_elements": [], "figure_references": [], "review_required": False, "review_reasons": [],
         "marked_important": False, "char_count": 10, "overlap_element_ids": []},
    ]
    manifest = {
        "document": {"title": "Syntetisk testbok", "language": "nb-NO"},
        "numbering_note": "synthetic",
        "page_count": 4,
        "chapters": [
            {"chapter": 2, "title": "Grunnleggende elektronikk", "pdf_pages": [1, 3], "printed_pages": ["2-1", "2-3"], "sections": []},
            {"chapter": 6, "title": "Mottakeren", "pdf_pages": [4, 4], "printed_pages": ["6-1", "6-1"], "sections": []},
        ],
        "pages": pages,
        "page_number_issues": [{"type": "page_number_conflict", "pdf_page": 3, "detail": "synthetic"}],
        "inventory_issues": [],
        "counts": {},
        "processing": {"config_sha256": "synthetic"},
    }
    visuals = [{"id": "e2", "type": "figure", "pdf_page": 2, "printed_page": "2-2", "image": "figures/e2.png",
                "caption": None, "status": "needs_visual_review", "chapter": 2, "section": "TESTAVSNITT PARALLELL"}]
    flags = [{"pdf_page": 2, "element": "e2", "rule": "possible_ohm", "severity": "warning", "token": "10Q"}]
    return {"chunks": chunks, "manifest": manifest, "visuals": visuals, "flags": flags,
            "qa": {"status": "SYNTHETIC"}}


def write_export(root: Path, data: dict) -> Path:
    root.mkdir(parents=True, exist_ok=True)
    (root / "review").mkdir(exist_ok=True)
    (root / "figures").mkdir(exist_ok=True)
    (root / "figures" / "e2.png").write_bytes(b"\x89PNG synthetic")
    with open(root / "chunks.jsonl", "w", encoding="utf-8") as fh:
        for c in data["chunks"]:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")
    (root / "manifest.json").write_text(json.dumps(data["manifest"], ensure_ascii=False))
    with open(root / "visuals.jsonl", "w", encoding="utf-8") as fh:
        for v in data["visuals"]:
            fh.write(json.dumps(v) + "\n")
    with open(root / "review" / "flags.jsonl", "w", encoding="utf-8") as fh:
        for f in data["flags"]:
            fh.write(json.dumps(f) + "\n")
    (root / "review" / "qa.json").write_text(json.dumps(data["qa"]))
    return root


def doc_collections() -> dict:
    """The chapter PDFs and the extra documents of a collections export: chapter 2 is
    also scanned (its PDF text is reference only), chapter 9 exists only as a PDF."""
    def chunk(uid, ch, section, text, coll, doc, pages):
        return {"id": f"{coll}-{uid}", "uid": uid, "chapter_number": ch, "section": section, "subsections": [],
                "text": text, "printed_pages": pages, "source_pages": [1], "document": doc, "collection": coll,
                "marked_important": False}
    book = [
        chunk("b1", 2, "TESTAVSNITT OHMS", "Syntetisk tekst om spenning.", "book", "kap2.pdf", ["2-1"]),
        chunk("b2", 9, "BØLGER I LUFTA", "Syntetisk tekst om bølger.", "book", "kap9.pdf", []),
        chunk("b3", 9, "REFLEKSJON FRA BAKKEN", "Syntetisk tekst om refleksjon.", "book", "kap9.pdf", []),
    ]
    extras = [chunk("x1", None, "Q-KODER", "Syntetisk tekst om koder.", "extras", "qkoder.pdf", [])]
    return {
        "book": {"chunks": book, "manifest": {"documents": [
            {"chapter": 2, "title": "Grunnleggende elektronikk"}, {"chapter": 9, "title": "Bølgeutbredelse"}]}},
        "extras": {"chunks": extras, "manifest": {"documents": [{"chapter": None, "title": "Q-koder"}]}},
    }


def write_collections_export(root: Path, data: dict, docs: dict) -> Path:
    write_export(root / "scans", data)
    for coll, d in docs.items():
        (root / coll).mkdir(parents=True, exist_ok=True)
        with open(root / coll / "chunks.jsonl", "w", encoding="utf-8") as fh:
            for c in d["chunks"]:
                fh.write(json.dumps(c, ensure_ascii=False) + "\n")
        (root / coll / "manifest.json").write_text(json.dumps(d["manifest"], ensure_ascii=False))
    return root


class TempRepo:
    """A throwaway repository with the real config, templates, glossary schema and web app."""

    def __init__(self, with_content: bool = False):
        self.dir = Path(tempfile.mkdtemp(prefix="radioquiz-test-"))
        self.root = self.dir / "repo"
        (self.root / "content" / "questions").mkdir(parents=True)
        (self.root / "content" / "glossary").mkdir(parents=True)
        (self.root / "content" / "chapters").mkdir(parents=True)
        shutil.copytree(REPO / "content" / "visuals", self.root / "content" / "visuals")
        tpl = self.root / "content" / "visuals" / "templates.json"
        data = json.loads(tpl.read_text())
        for t in data["templates"]:  # tests start from unreviewed templates, whatever the repo state
            t["status"] = "needs_review"
            t["review_log"] = []
        tpl.write_text(json.dumps(data, ensure_ascii=False))
        shutil.copytree(REPO / "config", self.root / "config")
        shutil.copytree(REPO / "web", self.root / "web")
        (self.root / "content" / "chapters" / "chapters.json").write_text(json.dumps({
            "book": {"title": "Syntetisk testbok", "total_chapters": 8, "total_chapters_source": "test"},
            "chapters": []}))
        (self.root / "content" / "chapters" / "topics.json").write_text(json.dumps({"topics": [
            {"id": "ohms-lov", "title": "Ohms lov", "chapter": 2},
            {"id": "motstandskoblinger", "title": "Motstander", "chapter": 2},
            {"id": "mellomfrekvens", "title": "Mellomfrekvens", "chapter": 6}]}))
        terms = [
            {"id": "strom", "nb": ["strøm", "strømmen"], "en": ["current"],
             "definition": "Elektrisk ladning som flyter per tidsenhet.", "related": [], "status": "approved"},
            {"id": "resistans", "nb": ["resistans"], "en": ["resistance"],
             "definition": "Hvor sterkt en leder hindrer strøm, målt i ohm.", "related": ["strom"], "status": "needs_review"},
        ]
        terms[0]["approved_sha256"] = term_hash(terms[0])
        (self.root / "content" / "glossary" / "terms.json").write_text(json.dumps({"terms": terms}, ensure_ascii=False))
        self.paths = Paths(self.root)
        self.export_dir = self.dir / "export"
        self.data = synthetic_export()

    def export(self, data: dict | None = None) -> Path:
        if data is not None:
            self.data = data
        if self.export_dir.exists():
            shutil.rmtree(self.export_dir)
        return write_export(self.export_dir, self.data)

    def import_(self, data: dict | None = None, **kw):
        from tools.importer import run_import
        return run_import(self.paths, self.export(data), **kw)

    def approve_templates(self) -> None:
        p = self.root / "content" / "visuals" / "templates.json"
        d = json.loads(p.read_text())
        for t in d["templates"]:
            t["status"] = "approved"
        p.write_text(json.dumps(d, ensure_ascii=False))

    def approve_terms(self) -> None:
        p = self.root / "content" / "glossary" / "terms.json"
        d = json.loads(p.read_text())
        for t in d["terms"]:
            t["status"] = "approved"
            t["approved_sha256"] = term_hash(t)
        p.write_text(json.dumps(d, ensure_ascii=False))

    def write_question(self, qid: str, rev: dict) -> Path:
        path = self.root / "content" / "questions" / f"{qid}.json"
        path.write_text(json.dumps({"id": qid, "revisions": [rev]}, ensure_ascii=False, indent=1))
        return path

    def cleanup(self) -> None:
        shutil.rmtree(self.dir, ignore_errors=True)


def sample_revision(import_id: str, **over) -> dict:
    """A valid calculation question about the synthetic chunk u1 (chapter 2)."""
    rev = {
        "revision": 1, "status": "draft", "language": "nb-NO", "type": "single_choice", "style": "calculation",
        "difficulty": "easy", "chapter": 2, "section_ids": ["s2-01"], "topic_ids": ["ohms-lov"],
        "learning_objective": "Bruke Ohms lov til å finne strømmen.", "priority": "exam_important",
        "context": [["En motstand på ", {"q": 470, "u": "Ω"}, " er koblet til en kilde på ", {"q": 12, "u": "V"}, "."]],
        "stem": [["Hvor stor ", {"term": "strom", "text": "strøm"}, " går det i kretsen?"]],
        "options": [
            {"id": "o1", "content": [{"q": 25.5, "u": "mA"}], "feedback": []},
            {"id": "o2", "content": [{"q": 2.55, "u": "mA"}], "feedback": ["Kommaet er flyttet ett sted."]},
            {"id": "o3", "content": [{"q": 39.2, "u": "mA"}], "feedback": ["Her er brøken snudd."]},
            {"id": "o4", "content": [{"q": 255, "u": "mA"}], "feedback": ["Dette er ti ganger for mye."]},
        ],
        "correct": ["o1"],
        "explanation": [["Strømmen er spenningen delt på resistansen, som gir ", {"q": 25.5, "u": "mA"}, "."]],
        "glossary_after_answer": [],
        "visual": {"template": "dc-circuit", "version": 1,
                   "params": {"topology": "series", "source": {"voltage_v": 12}, "resistors": [{"ohms": 470}],
                              "ammeter": {"branch": "main"}},
                   "params_after": {"ammeter": {"show_reading": True}}},
        "calculation": {"formula": "ohms_law_current", "inputs": {"U": [12, "V"], "R": [470, "Ω"]},
                        "answer": [25.5, "mA"], "answer_symbol": "I", "sig_figs": 3, "visual_bindings": {"R": "R1"}},
        "study_reference": {"chapter": 2, "section_id": "s2-01", "printed_pages": ["2-1"]},
        "sources": {"import_id": import_id, "chunk_uids": ["u1"]},
        "tags": [], "provenance": {"method": "manual", "author": "test"}, "flags": [], "review_log": [],
    }
    for k, v in over.items():
        rev[k] = v
    return copy.deepcopy(rev)


def sample_variant(**over) -> dict:
    """A variant of sample_revision with other values: 9 V across 220 Ω gives 40,9 mA."""
    v = {
        "id": "v2",
        "context": [["En motstand på ", {"q": 220, "u": "Ω"}, " er koblet til en kilde på ", {"q": 9, "u": "V"}, "."]],
        "options": [
            {"id": "o1", "content": [{"q": 40.9, "u": "mA"}], "feedback": []},
            {"id": "o2", "content": [{"q": 4.09, "u": "mA"}], "feedback": ["Kommaet er flyttet ett sted."]},
            {"id": "o3", "content": [{"q": 24.4, "u": "mA"}], "feedback": ["Her er brøken snudd."]},
            {"id": "o4", "content": [{"q": 409, "u": "mA"}], "feedback": ["Dette er ti ganger for mye."]},
        ],
        "explanation": [["Strømmen er spenningen delt på resistansen, som gir ", {"q": 40.9, "u": "mA"}, "."]],
        "visual": {"template": "dc-circuit", "version": 1,
                   "params": {"topology": "series", "source": {"voltage_v": 9}, "resistors": [{"ohms": 220}],
                              "ammeter": {"branch": "main"}},
                   "params_after": {"ammeter": {"show_reading": True}}},
        "calculation": {"formula": "ohms_law_current", "inputs": {"U": [9, "V"], "R": [220, "Ω"]},
                        "answer": [40.9, "mA"], "answer_symbol": "I", "sig_figs": 3, "visual_bindings": {"R": "R1"}},
    }
    v.update(over)
    return copy.deepcopy(v)
