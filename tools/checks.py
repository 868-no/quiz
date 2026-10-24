"""Stage B: automated verification of a question revision.

Results are split into
* errors   - the revision cannot proceed to review/publication;
* warnings - a reviewer must look at it (shown in `review show`);
* hazards  - conditions a human must explicitly acknowledge when approving
             (OCR-uncertain source, uncertain printed page, figure-dependent source).

Passing these checks is *not* verification of technical correctness or
originality. It only means nothing automatically detectable is wrong.
"""
from __future__ import annotations

import math
import re
from typing import Any

from . import formulas, richtext, visuals
from .release_check import FORBIDDEN_PATTERNS
from .common import words
from .context import Context
from .questions import DIFFICULTIES, PRIORITIES, STATUSES, STYLES, TYPES, content_hash, open_flags

VERIFIER = "deterministic-v1"
OPTION_ID = re.compile(r"^[a-z0-9][a-z0-9-]{0,11}$")
EN_STOP = {"the", "is", "what", "which", "of", "and", "when", "with", "does", "how", "a", "an", "are", "this", "that"}
NB_HINTS = {"og", "er", "en", "et", "som", "på", "av", "det", "hva", "hvilken", "hvilke", "når", "med", "til",
            "for", "ikke", "den", "de", "blir", "har", "skal", "kan", "i"}
OPENING_POINTER = re.compile(r"(Her|Dette|Denne|Disse|Slik|Som nevnt|Samme|Den samme|Det samme|Ovenfor|Nedenfor)\b")
FIGURE_REF = re.compile(r"\b(figuren|tegningen|skjemaet|bildet ovenfor|tabellen nedenfor|tabellen ovenfor|ovenfor|nedenfor)\b", re.I)
GIVEAWAY = re.compile(r"\b(alle (de )?ovennevnte|ingen av (de )?ovennevnte|begge deler)\b", re.I)
COPY_ERROR_N = 8
COPY_WARN_N = 6


def _norm(text: str) -> str:
    return " ".join(words(text))


def _shingles(text: str, n: int) -> set[tuple[str, ...]]:
    w = words(text)
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


_ANNOTATION = re.compile(r"\[(?:FIGURE|EQUATION|TABLE|FOOTNOTE)[^\]]*\]|```.*?```", re.S)


def source_text_for_similarity(chunk_text: str) -> str:
    """Strip the pipeline's own annotations so they do not count as book text."""
    return _ANNOTATION.sub(" ", chunk_text).replace("[!]", " ")


def public_strings(rev: dict[str, Any]) -> list[str]:
    out: list[str] = []
    for key in ("context", "stem", "explanation"):
        out.append(richtext.plain_text(rev.get(key)))
    for opt in rev.get("options", []) or []:
        out.append(richtext.plain_text([opt.get("content")]) if isinstance(opt, dict) else "")
        if isinstance(opt, dict):
            out.append(richtext.plain_text(opt.get("feedback")))
    if isinstance(rev.get("visual"), dict) and isinstance(rev["visual"].get("caption"), str):
        out.append(rev["visual"]["caption"])
    return [s for s in out if s]


def _rel_close(a: float, b: float, rel: float) -> bool:
    return math.isclose(a, b, rel_tol=rel, abs_tol=1e-15)


def _option_quantities(opt: dict[str, Any]) -> list[dict[str, Any]]:
    return richtext.quantities([opt.get("content")])


def check_revision(ctx: Context, qid: str, rev: dict[str, Any]) -> dict[str, Any]:
    errors: list[str] = []
    warnings: list[str] = []
    hazards: list[dict[str, Any]] = []
    term_ids = set(ctx.glossary)

    # --- structure ------------------------------------------------------------
    if rev.get("status") not in STATUSES:
        errors.append(f"status must be one of {STATUSES}")
    if rev.get("type") not in TYPES:
        errors.append(f"type must be one of {TYPES} (MVP publishes single_choice only)")
    if rev.get("style") not in STYLES:
        errors.append(f"style must be one of {STYLES}")
    if rev.get("difficulty") not in DIFFICULTIES:
        errors.append(f"difficulty must be one of {DIFFICULTIES}")
    if rev.get("priority") not in PRIORITIES:
        errors.append(f"priority must be one of {PRIORITIES}")
    if rev.get("language", "nb-NO") != "nb-NO":
        errors.append("language must be nb-NO")
    if not isinstance(rev.get("learning_objective"), str) or len(rev["learning_objective"]) < 10:
        errors.append("learning_objective: describe what the learner should understand (≥10 characters)")
    for key, required in (("context", False), ("stem", True), ("explanation", True)):
        richtext.check_rich(rev.get(key), key, errors, term_ids, required=required)

    options = rev.get("options")
    correct = rev.get("correct")
    if not isinstance(options, list) or len(options) != 4:
        errors.append("options: single_choice questions need exactly 4 options")
        options = options if isinstance(options, list) else []
    ids = [o.get("id") for o in options if isinstance(o, dict)]
    if len(set(ids)) != len(ids) or not all(isinstance(i, str) and OPTION_ID.match(i) for i in ids):
        errors.append("options: ids must be unique short lowercase identifiers")
    if not isinstance(correct, list) or len(correct) != 1:
        errors.append("correct: exactly one correct option id is required")
        correct = []
    elif correct[0] not in ids:
        errors.append(f"correct: {correct[0]!r} is not an option id")
    norm_texts = []
    for i, o in enumerate(options):
        if not isinstance(o, dict):
            errors.append(f"options[{i}]: expected an object")
            continue
        unknown = set(o) - {"id", "content", "feedback"}
        if unknown:
            errors.append(f"options[{i}]: unknown keys {sorted(unknown)}")
        richtext.check_paragraph(o.get("content"), f"options[{i}].content", errors, term_ids)
        is_correct = o.get("id") in correct
        richtext.check_rich(o.get("feedback"), f"options[{i}].feedback", errors, term_ids, required=not is_correct)
        txt = _norm(richtext.plain_text([o.get("content")])) if o.get("content") else ""
        norm_texts.append(txt)
        if GIVEAWAY.search(txt):
            warnings.append(f"options[{i}]: 'alle/ingen av de ovennevnte' style options weaken the question")
    if len(set(norm_texts)) != len(norm_texts):
        errors.append("options: two options have the same text")

    # --- language -------------------------------------------------------------
    all_text = " ".join(public_strings(rev))
    if "TODO" in all_text or "TODO" in str(rev.get("calculation", "")):
        errors.append("unfinished: replace every TODO placeholder")
    toks = words(all_text)
    if toks:
        en = sum(t in EN_STOP for t in toks) / len(toks)
        nb = sum(t in NB_HINTS for t in toks) / len(toks)
        if en > 0.08 and en > nb:
            errors.append("language: text looks English; questions must be in Norwegian Bokmål")
        elif nb < 0.03:
            warnings.append("language: few Norwegian function words; check that the text is Bokmål")
    if re.search(r"\d\.\d", all_text.replace("…", "")):
        for s in public_strings(rev):
            for m in re.finditer(r"(?<![\d.])\d+\.\d+(?![\d.])", s):
                warnings.append(f"notation: '{m.group()}' uses a decimal point; Norwegian uses a comma")
    if re.search(r"\d\s?(ohm|ohms|Ohm)\b|\d\s?Q\b|\buF\b|\bu[AV]\b|\bmicro", all_text):
        warnings.append("notation: write units with symbols (Ω, µF, µA) – possible OCR-style unit")

    # --- public text the release check would refuse ------------------------------
    # Same patterns as tools/release_check.py, so a question that would stop a build
    # (e.g. any wording about scanning or digitising) is caught when it is written.
    for s in public_strings(rev):
        for rx, what in FORBIDDEN_PATTERNS:
            m = rx.search(s)
            if m:
                errors.append(f"public text: contains {what} ({m.group(0)!r}); the release check would refuse it – reword")

    # --- the question stands on its own -----------------------------------------
    # The question is shown alone, so its opening can't point back at earlier text
    # ("Her er …", "Denne kretsen …"), and only a question with a figure can refer to one.
    opening = richtext.plain_text(rev.get("context") or rev.get("stem") or []).strip()
    m = OPENING_POINTER.match(opening)
    if m:
        warnings.append(f"standalone: the question opens with {m.group(0)!r}, which points at text the learner "
                        "never sees – say what it refers to")
    if not rev.get("visual"):
        for key in ("context", "stem"):
            m = FIGURE_REF.search(richtext.plain_text(rev.get(key) or []))
            if m:
                warnings.append(f"standalone: {key} mentions {m.group(0)!r}, but the question has no figure")

    # --- glossary use ---------------------------------------------------------
    pre_answer_terms: list[str] = []
    for key in ("context", "stem"):
        pre_answer_terms += richtext.term_refs(rev.get(key))
    for o in options:
        if isinstance(o, dict):
            pre_answer_terms += richtext.term_refs([o.get("content")])
    hidden = set(rev.get("glossary_after_answer") or [])
    for t in hidden - set(pre_answer_terms):
        warnings.append(f"glossary_after_answer: {t!r} is not referenced before the answer")
    if len(set(pre_answer_terms)) > 5:
        warnings.append(f"glossary: {len(set(pre_answer_terms))} terms linked before answering; avoid over-highlighting")
    for key in ("context", "stem"):
        refs = richtext.term_refs(rev.get(key))
        dup = {t for t in refs if refs.count(t) > 1}
        if dup:
            warnings.append(f"{key}: glossary terms linked more than once: {sorted(dup)}")
    for node in (n for k in ("context", "stem", "explanation") for n in richtext.iter_inlines(rev.get(k))):
        if isinstance(node, dict) and "term" in node and node["term"] in ctx.glossary:
            forms = [f.lower() for f in ctx.glossary[node["term"]]["nb"]]
            if node["text"].lower() not in forms:
                warnings.append(f"glossary: '{node['text']}' is not a listed form of {node['term']} {forms}")

    # --- answer leakage -------------------------------------------------------
    correct_opt = next((o for o in options if isinstance(o, dict) and o.get("id") in correct), None)
    if correct_opt and correct_opt.get("content"):
        ctext = _norm(richtext.plain_text([correct_opt["content"]]))
        before = _norm(richtext.plain_text(rev.get("context")) + " " + richtext.plain_text(rev.get("stem")))
        if len(ctext) >= 6 and ctext in before and not richtext.quantities([correct_opt["content"]]):
            warnings.append("leak: the correct option's text appears in the question text")
        for t in set(pre_answer_terms) - hidden:
            if t in ctx.glossary:
                d = _norm(ctx.glossary[t]["definition"])
                if len(ctext) >= 6 and ctext in d:
                    warnings.append(f"leak: glossary definition of {t!r} contains the correct answer; "
                                    "add it to glossary_after_answer")
                elif _shingles(ctext, 3) & _shingles(d, 3):
                    warnings.append(f"leak?: glossary definition of {t!r} shares a phrase with the correct answer")
        approx = [any(q.get("approx") for q in richtext.quantities([o.get("content")])) for o in options if isinstance(o, dict)]
        if sum(approx) == 1 and correct_opt and any(q.get("approx") for q in richtext.quantities([correct_opt.get("content")])):
            warnings.append("leak?: only the correct option is marked as approximate (≈)")
        # terms held back until answering are plain text, so they give no visual cue
        linked = [bool(set(richtext.term_refs([o.get("content")])) - hidden) for o in options if isinstance(o, dict)]
        if any(linked) and not all(linked) and set(
                i for i, o in enumerate(options) if isinstance(o, dict) and o.get("id") in correct) == {
                i for i, v in enumerate(linked) if v}:
            warnings.append("leak?: only the correct option has glossary links (underlined terms)")
        lengths = [len(n) for n in norm_texts]
        if lengths and len(ctext) > 1.8 * max([l for l, o in zip(lengths, options) if o.get("id") not in correct] or [1]):
            warnings.append("leak?: the correct option is much longer than all distractors")

    # --- visual ---------------------------------------------------------------
    visual_q_before: dict[str, Any] = {}
    visual_q_after: dict[str, Any] = {}
    if rev.get("visual") is not None:
        verrs, params, after = visuals.validate_visual(ctx.templates, rev["visual"])
        errors += verrs
        if params is not None:
            tid = rev["visual"]["template"]
            visual_q_before = visuals.quantities(tid, params)
            visual_q_after = visuals.quantities(tid, after) if after is not None else visual_q_before

    # --- calculation ----------------------------------------------------------
    calc = rev.get("calculation")
    if rev.get("style") == "calculation" and not calc:
        errors.append("calculation: style 'calculation' requires a calculation block for independent checking")
    if calc:
        try:
            value, unit = formulas.compute(calc)
            sig = calc.get("sig_figs", 3)
            declared, dunit = formulas.parse_quantity(calc["answer"], "calculation.answer")
            rounded = formulas.round_sig(value, sig)
            tol = 0.5 * 10 ** (math.floor(math.log10(abs(rounded))) - sig + 1) if rounded else 1e-12
            if abs(declared - value) > tol * 1.0001:
                errors.append(f"calculation: recomputed {formulas.describe(calc['formula'])} = "
                              f"{richtext.format_number(rounded)} {unit} ({sig} sig. figures), "
                              f"but the declared answer is {richtext.format_number(declared)} {dunit}")
            if correct_opt is not None:
                cq = _option_quantities(correct_opt)
                if not any(q.get("u") is not None and _matches(q, declared, dunit, tol) for q in cq):
                    errors.append("calculation: the correct option does not state the computed answer")
            for o in options:
                if isinstance(o, dict) and o.get("id") not in correct:
                    for q in _option_quantities(o):
                        if q.get("u") is not None and _matches(q, declared, dunit, tol):
                            errors.append(f"calculation: distractor {o['id']} has the same value as the answer")
            if not any(_matches(q, declared, dunit, tol) for q in richtext.quantities(rev.get("explanation"))):
                warnings.append("calculation: the explanation never states the result as a quantity")
            binds = calc.get("visual_bindings") or {}
            if rev.get("visual") is not None and not isinstance(binds, dict):
                errors.append("calculation.visual_bindings must map input names to figure quantities")
                binds = {}
            for k, v in binds.items():
                if visual_q_before and v not in visual_q_before:
                    errors.append(f"calculation.visual_bindings: the figure has no quantity {v!r} "
                                  f"(has {sorted(visual_q_before)})")
            sym = binds.get(calc.get("answer_symbol"), calc.get("answer_symbol"))
            for name, spec in (calc.get("inputs") or {}).items():
                vname = binds.get(name, name)
                if vname in visual_q_before:
                    num, unit = formulas.parse_quantity(spec, name)
                    v_si = num if unit == "" else formulas.to_si(num, unit)[0]
                    if not _rel_close(v_si, visual_q_before[vname]["value"], 1e-9):
                        errors.append(f"visual: {vname} in the figure ({visual_q_before[vname]['value']} "
                                      f"{visual_q_before[vname]['unit']}) differs from the calculation input {name}")
            if sym and sym in visual_q_before:
                if visual_q_before[sym]["shown"]:
                    errors.append(f"leak: the figure shows {sym} (the asked quantity) before answering")
                v_ans = declared if dunit == "" else formulas.to_si(declared, dunit)[0]
                if not _rel_close(v_ans, visual_q_before[sym]["value"], 10 ** (1 - sig)):
                    errors.append(f"visual: the figure's computed {sym} = {visual_q_before[sym]['value']:.6g} "
                                  f"{visual_q_before[sym]['unit']} disagrees with the answer")
        except (ValueError, ZeroDivisionError, KeyError, TypeError) as exc:
            errors.append(f"calculation: {exc}")

    # --- taxonomy, sources and references ------------------------------------
    chapter = rev.get("chapter")
    ch_entry = next((c for c in ctx.registry["chapters"] if c["number"] == chapter), None)
    if ch_entry is None:
        errors.append(f"chapter: {chapter!r} is not in content/chapters/chapters.json")
    for sid in rev.get("section_ids") or []:
        sec = ctx.sections.get(sid)
        if sec is None:
            errors.append(f"section_ids: unknown section {sid!r}")
        elif sec["chapter"] != chapter:
            errors.append(f"section_ids: {sid} belongs to chapter {sec['chapter']}, not {chapter}")
    if not rev.get("section_ids"):
        errors.append("section_ids: map the question to at least one section")
    for tid in rev.get("topic_ids") or []:
        if ctx.topics and tid not in ctx.topics:
            errors.append(f"topic_ids: unknown topic {tid!r} (add it to content/chapters/topics.json)")

    sources = rev.get("sources") or {}
    uids = sources.get("chunk_uids") or []
    ref = rev.get("study_reference") or {}
    if not uids:
        errors.append("sources.chunk_uids: every question must be mapped to the source chunks it is based on")
    if ctx.source is None:
        errors.append("sources: no source import available; references cannot be validated")
    else:
        if sources.get("import_id") and sources["import_id"] != ctx.source["import_id"]:
            warnings.append(f"sources: written against {sources['import_id']}; current import is "
                            f"{ctx.source['import_id']} (checked against current)")
        chunks = []
        for uid in uids:
            c = ctx.chunks.get(uid)
            if c is None:
                errors.append(f"sources: chunk {uid} is not in the current import")
            else:
                chunks.append(c)
        if chunks:
            chs = {c["chapter"] for c in chunks}
            if chs != {chapter}:
                errors.append(f"sources: cited chunks are from chapter(s) {sorted(chs)}, question is chapter {chapter}")
            secs = {c["section_id"] for c in chunks}
            if rev.get("section_ids") and not set(rev["section_ids"]) <= secs:
                warnings.append(f"section_ids {rev['section_ids']} are not all among the cited chunks' sections {sorted(secs)}")
            pages = {p for c in chunks for p in c["printed_pages"]}
            for p in ref.get("printed_pages") or []:
                if p not in pages:
                    errors.append(f"study_reference: printed page {p} is not a page of the cited chunks {sorted(pages)}")
            if ref.get("section_id") and ref["section_id"] not in secs:
                errors.append(f"study_reference.section_id {ref['section_id']} is not a section of the cited chunks")
            marked = any(c["marked_important"] for c in chunks)
            if rev.get("priority") == "exam_important" and not marked:
                errors.append("priority: 'exam_important' but none of the cited chunks carries the book's '!' marker")
            if rev.get("priority") == "normal" and marked:
                warnings.append("priority: a cited chunk is marked exam-important ('!'); consider 'exam_important'")
            ocr = sorted({h for c in chunks for h in c["ocr_hazards"]})
            if ocr or any(c["has_unverified_equation"] for c in chunks):
                hazards.append({"id": "ocr", "detail": "source chunk(s) contain OCR-uncertain content: "
                                + ", ".join(ocr or ["unverified equation"])
                                + ". Check every number, unit and formula against the printed book."})
            uncertain = sorted({u for c in chunks for u in c["page_uncertainty"]
                                if set(c["printed_pages"]) & set(ref.get("printed_pages") or [])})
            if uncertain:
                hazards.append({"id": "pages", "detail": "cited printed page number is uncertain in the source ("
                                + ", ".join(uncertain) + "). Confirm the page in the book."})
            if any(c["requires_visual_context"] for c in chunks):
                hazards.append({"id": "figures", "detail": "source text depends on figures; compare with the "
                                "figure crops (private) and confirm the question does not reproduce a book figure."})
            # near-verbatim copying from the cited chunks *and* the whole import
            src_sh_err, src_sh_warn = _source_shingles(ctx)
            for s in public_strings(rev):
                hit = _shingles(s, COPY_ERROR_N) & src_sh_err
                if hit:
                    errors.append("copy: shares an 8-word passage with the textbook: '" + " ".join(next(iter(hit))) + "'")
                else:
                    hit = _shingles(s, COPY_WARN_N) & src_sh_warn
                    if hit:
                        warnings.append("copy?: shares a 6-word phrase with the textbook: '" + " ".join(next(iter(hit))) + "'")
    if ref:
        if ref.get("chapter") != chapter:
            errors.append("study_reference.chapter must equal the question's chapter")
        if ref.get("section_id") and ref["section_id"] not in ctx.sections:
            errors.append(f"study_reference.section_id {ref['section_id']!r} is unknown")
    else:
        errors.append("study_reference: required (chapter, and section/printed pages where known)")
    if re.search(r"\b(figur|bilde|tabell)\s+\d+-\d+", all_text, re.I):
        warnings.append("text refers to a numbered textbook figure/table; the public site cannot show it")
    if re.search(r"figures/|\.png|\.jpg|chunk-\d+", all_text):
        errors.append("text contains a private file path or chunk id")

    # --- duplicates -----------------------------------------------------------
    mine = set(words(richtext.plain_text(rev.get("stem")) + " " + " ".join(norm_texts)))
    for _, other in ctx.all_questions:
        if other["id"] == qid:
            continue
        orev = max(other["revisions"], key=lambda r: r["revision"])
        if orev.get("status") in ("rejected", "retired"):
            continue
        theirs = set(words(richtext.plain_text(orev.get("stem")) + " " + " ".join(
            richtext.plain_text([o.get("content")]) for o in orev.get("options", []) if isinstance(o, dict))))
        if mine and theirs and len(mine & theirs) / len(mine | theirs) >= 0.75:
            warnings.append(f"duplicate?: very similar to {other['id']}")

    for f in open_flags(rev):
        warnings.append(f"unresolved flag: {f.get('type')} ({f.get('import_id', '')})")

    return {
        "verifier": VERIFIER,
        "content_sha256": content_hash(rev),
        "errors": errors,
        "warnings": sorted(set(warnings), key=warnings.index),
        "hazards": hazards,
        "passed": not errors,
    }


def _source_shingles(ctx: Context) -> tuple[set[tuple[str, ...]], set[tuple[str, ...]]]:
    if "shingles" not in ctx.cache:
        err: set[tuple[str, ...]] = set()
        warn: set[tuple[str, ...]] = set()
        for c in ctx.source["chunks"] if ctx.source else []:
            txt = source_text_for_similarity(c["text"])
            err |= _shingles(txt, COPY_ERROR_N)
            warn |= _shingles(txt, COPY_WARN_N)
        ctx.cache["shingles"] = (err, warn)
    return ctx.cache["shingles"]


def _matches(q: dict[str, Any], value: float, unit: str, tol: float) -> bool:
    try:
        if q.get("u") == unit:
            return abs(q["q"] - value) <= tol * 1.0001
        if unit == "" or q.get("u") == "":
            return False
        a = formulas.to_si(q["q"], q["u"])
        b = formulas.to_si(value, unit)
        return a[1] == b[1] and abs(a[0] - b[0]) <= formulas.to_si(tol, unit)[0] * 1.0001
    except (ValueError, KeyError, TypeError):
        return False
