"""Stages B (verify command) and C (human editorial review), local CLI only.

Every state change appends to the revision's `review_log` (version-controlled)
and to private/reviews/audit.jsonl. Approval records the reviewer, the
acknowledged hazards, the checklist and the content hash; publication refuses a
revision whose content no longer matches that hash.
"""
from __future__ import annotations

import copy
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from . import checks, richtext, visuals
from .common import Paths, ToolError, append_jsonl, now_iso, read_json, write_json
from .context import Context, load_context
from .questions import (
    CONTENT_FIELDS, content_hash, get_question, get_revision, latest, open_flags, save_question,
)

CHECKLIST = {
    "one_correct": "Nøyaktig ett alternativ er faglig forsvarlig riktig, og distraktorene er entydig feil.",
    "technical": "Fagstoff, tall, enheter, avrunding og utregning er kontrollert uavhengig.",
    "no_leak": "Spørsmålet, figuren og ordforklaringene røper ikke svaret før det er avgitt.",
    "original": "Tekst og figur er selvstendig skrevet/tegnet og ikke kopiert eller nær-kopiert fra boka.",
    "reference": "Studiehenvisningen (kapittel, seksjon, trykt side) er kontrollert mot boka.",
    "language": "Språket er klart og korrekt bokmål, uten unødvendig vanskelighetsgrad.",
}


def _reviewer(name: str | None) -> str:
    name = name or os.environ.get("RADIOQUIZ_REVIEWER")
    if not name or not name.strip():
        raise ToolError("a reviewer name is required (--reviewer NAME or RADIOQUIZ_REVIEWER)")
    return name.strip()


def _log(paths: Paths, qid: str, rev: dict[str, Any], actor: str, action: str, to_status: str | None,
         note: str | None, **extra: Any) -> None:
    entry = {
        "at": now_iso(), "actor": actor, "action": action,
        "from_status": rev.get("status"), "to_status": to_status or rev.get("status"),
        "content_sha256": content_hash(rev), "note": note,
    } | extra
    rev.setdefault("review_log", []).append(entry)
    if to_status:
        rev["status"] = to_status
    append_jsonl(paths.reviews / "audit.jsonl", {"question": qid, "revision": rev["revision"]} | entry)


# --- Stage B: verify ------------------------------------------------------------

def verify(paths: Paths, qids: list[str] | None, *, quiet: bool = False) -> int:
    ctx = load_context(paths)
    targets = [(p, q) for p, q in ctx.all_questions if not qids or q["id"] in qids]
    if qids:
        missing = set(qids) - {q["id"] for _, q in targets}
        if missing:
            raise ToolError(f"unknown question(s): {', '.join(sorted(missing))}")
    failures = 0
    for path, q in targets:
        rev = latest(q)
        if rev.get("status") in ("rejected", "retired"):
            continue
        result = checks.check_revision(ctx, q["id"], rev)
        result["at"] = now_iso()
        rev["checks"] = result
        write_json(paths.reviews / "checks" / f"{q['id']}-r{rev['revision']}.json", result)
        if result["passed"] and rev["status"] == "draft":
            _log(paths, q["id"], rev, checks.VERIFIER, "verify", "needs_review", "automated checks passed")
        elif not result["passed"] and rev["status"] == "needs_review":
            _log(paths, q["id"], rev, checks.VERIFIER, "verify", "draft", "automated checks failed")
        save_question(path, q)
        failures += not result["passed"]
        if not quiet:
            mark = "OK  " if result["passed"] else "FAIL"
            print(f"{mark} {q['id']} r{rev['revision']} [{rev['status']}] "
                  f"{len(result['errors'])} error(s), {len(result['warnings'])} warning(s), "
                  f"{len(result['hazards'])} hazard(s)")
            for e in result["errors"]:
                print(f"     ✗ {e}")
            for w in result["warnings"]:
                print(f"     ! {w}")
            for h in result["hazards"]:
                print(f"     ⚠ [{h['id']}] {h['detail']}")
    if rev_approved_with_errors := [q["id"] for _, q in targets
                                    if latest(q).get("status") == "approved" and not latest(q)["checks"]["passed"]]:
        print("\nApproved revisions that now FAIL checks (publication will refuse them): "
              + ", ".join(rev_approved_with_errors))
    return failures


# --- Stage C: show ----------------------------------------------------------------

def _fmt_rich(value: Any, indent: str = "    ") -> str:
    return "\n".join(indent + line for line in richtext.plain_text(value).splitlines())


def show(paths: Paths, qid: str, revision: int | None = None, *, with_source: bool = True) -> str:
    ctx = load_context(paths)
    _, q = get_question(paths, qid)
    rev = get_revision(q, revision)
    out = [f"{qid} revision {rev['revision']}  status={rev['status']}  style={rev.get('style')}  "
           f"difficulty={rev.get('difficulty')}  priority={rev.get('priority')}",
           f"chapter {rev.get('chapter')}  sections {rev.get('section_ids')}  topics {rev.get('topic_ids')}",
           f"objective: {rev.get('learning_objective')}",
           f"provenance: {rev.get('provenance')}", ""]
    if rev.get("context"):
        out += ["CONTEXT (before answering):", _fmt_rich(rev["context"]), ""]
    out += ["QUESTION:", _fmt_rich(rev.get("stem")), ""]
    for o in rev.get("options", []):
        mark = "✓" if o["id"] in rev.get("correct", []) else " "
        out.append(f"  [{mark}] {o['id']}: {richtext.plain_text([o['content']])}")
        if o.get("feedback"):
            out.append(_fmt_rich(o["feedback"], "        → "))
    out += ["", "EXPLANATION:", _fmt_rich(rev.get("explanation")), ""]
    if rev.get("calculation"):
        out.append(f"CALCULATION: {rev['calculation']}")
    if rev.get("visual"):
        v = rev["visual"]
        errs, params, after = visuals.validate_visual(ctx.templates, v)
        out.append(f"VISUAL: {v.get('template')}@{v.get('version')}  params={v.get('params')}")
        if v.get("params_after"):
            out.append(f"        after answer: {v['params_after']}")
        if params:
            for k, qv in visuals.quantities(v["template"], params).items():
                out.append(f"        {k} = {qv['value']:.6g} {qv['unit']} {'(shown)' if qv['shown'] else ''}")
        out += [f"        ✗ {e}" for e in errs]
        out.append("        Preview the drawing: python3 -m tools preview && python3 -m tools serve --preview")
    terms = sorted({t for k in ("context", "stem", "explanation") for t in richtext.term_refs(rev.get(k))}
                   | {t for o in rev.get("options", []) for t in richtext.term_refs([o.get("content")])})
    for t in terms:
        g = ctx.glossary.get(t)
        out.append(f"TERM {t}: " + (f"{g['nb']} = {g['en']} — {g['definition']} [{g['status']}]" if g else "MISSING"))
    out += ["", f"STUDY REFERENCE: {rev.get('study_reference')}"]
    c = rev.get("checks")
    if c:
        stale = c.get("content_sha256") != content_hash(rev)
        out += ["", f"CHECKS ({c.get('verifier')}, {c.get('at')}){' — STALE, re-run verify' if stale else ''}:"]
        out += [f"  ✗ {e}" for e in c["errors"]] + [f"  ! {w}" for w in c["warnings"]]
        out += [f"  ⚠ [{h['id']}] {h['detail']}" for h in c["hazards"]]
    else:
        out += ["", "CHECKS: not run (python3 -m tools verify " + qid + ")"]
    for f in open_flags(rev):
        out.append(f"FLAG: {f}")
    if with_source and ctx.source:
        out += ["", "=" * 30 + " PRIVATE SOURCE CONTEXT (do not copy) " + "=" * 30]
        for uid in (rev.get("sources") or {}).get("chunk_uids", []):
            ch = ctx.chunks.get(uid)
            if not ch:
                out.append(f"[{uid}] MISSING from current import")
                continue
            out.append(f"[{uid} / {ch['id']}] section={ch['section_id']} printed={ch['printed_pages']} "
                       f"pdf={ch['pdf_pages']} marked={ch['marked_important']} ({ch['marked_via']}) "
                       f"hazards={ch['ocr_hazards']} page_uncertainty={ch['page_uncertainty']}")
            out.append(_indent(ch["text"]))
            for vid in ch["visual_elements"]:
                img = paths.imported / ctx.source["import_id"] / "figures" / f"{vid}.png"
                out.append(f"    figure crop: {img}" + ("" if img.exists() else " (not copied)"))
    out += ["", "History:"] + [f"  {e['at']} {e['actor']}: {e['action']} {e['from_status']}→{e['to_status']} "
                               f"{e.get('note') or ''}" for e in rev.get("review_log", [])]
    return "\n".join(out)


def _indent(text: str) -> str:
    return "\n".join("    " + line for line in text.splitlines())


# --- Stage C: decisions ------------------------------------------------------------

def _confirm_checklist(checklist: str | None, interactive: bool) -> dict[str, bool]:
    if checklist == "all":
        return {k: True for k in CHECKLIST}
    if not interactive:
        raise ToolError("confirm the review checklist interactively, or pass --checklist all after "
                        "checking every item:\n" + "\n".join(f"  - {v}" for v in CHECKLIST.values()))
    result = {}
    for key, text in CHECKLIST.items():
        ans = input(f"{text} [j/N] ").strip().lower()
        if ans not in ("j", "ja", "y", "yes"):
            raise ToolError(f"checklist item not confirmed: {key}; not approved")
        result[key] = True
    return result


def approve(paths: Paths, qid: str, *, reviewer: str | None, note: str | None, ack: list[str],
            checklist: str | None, interactive: bool | None = None) -> dict[str, Any]:
    who = _reviewer(reviewer)
    ctx = load_context(paths, need_source=True)
    path, q = get_question(paths, qid)
    rev = latest(q)
    if rev["status"] != "needs_review":
        raise ToolError(f"{qid} r{rev['revision']} is '{rev['status']}'; only 'needs_review' can be approved "
                        "(run verify first)")
    result = checks.check_revision(ctx, qid, rev)
    if not result["passed"]:
        raise ToolError(f"{qid}: automated checks fail now:\n  " + "\n  ".join(result["errors"]))
    if open_flags(rev):
        raise ToolError(f"{qid}: unresolved flags {open_flags(rev)}; review them and run `review resolve-flag`")
    needed = {h["id"] for h in result["hazards"]}
    missing = needed - set(ack)
    if missing:
        raise ToolError(f"{qid}: acknowledge after checking: --ack {','.join(sorted(missing))}\n  "
                        + "\n  ".join(h["detail"] for h in result["hazards"] if h["id"] in missing))
    unapproved = _dependencies_unapproved(ctx, rev)
    confirmed = _confirm_checklist(checklist, sys.stdin.isatty() if interactive is None else interactive)
    rev["checks"] = result | {"at": now_iso()}
    rev["approval"] = {"by": who, "at": now_iso(), "content_sha256": content_hash(rev),
                       "acknowledged_hazards": sorted(needed), "checklist": confirmed,
                       "verifier": result["verifier"]}
    _log(paths, qid, rev, who, "approve", "approved", note, acknowledged=sorted(needed))
    # A newer approved revision supersedes older ones.
    for old in q["revisions"]:
        if old is not rev and old.get("status") == "approved":
            _log(paths, qid, old, who, "superseded", "retired", f"superseded by r{rev['revision']}")
    save_question(path, q)
    return {"approved": f"{qid} r{rev['revision']}", "dependencies_not_approved": unapproved}


def _dependencies_unapproved(ctx: Context, rev: dict[str, Any]) -> list[str]:
    out = []
    terms = set()
    for k in ("context", "stem", "explanation"):
        terms |= set(richtext.term_refs(rev.get(k)))
    for o in rev.get("options", []):
        terms |= set(richtext.term_refs([o.get("content")])) | set(richtext.term_refs(o.get("feedback")))
    for t in sorted(terms):
        if ctx.glossary.get(t, {}).get("status") != "approved":
            out.append(f"glossary term {t}")
    v = rev.get("visual")
    if v:
        key = f"{v['template']}@{v['version']}"
        if ctx.templates.get(key, {}).get("status") != "approved":
            out.append(f"visual template {key}")
    return out


def set_status(paths: Paths, qid: str, action: str, *, reviewer: str | None, note: str | None) -> str:
    who = _reviewer(reviewer)
    if not note and action in ("reject", "request-changes", "retire"):
        raise ToolError(f"{action} needs --note explaining why")
    path, q = get_question(paths, qid)
    rev = latest(q)
    allowed = {
        "reject": ({"draft", "needs_review"}, "rejected"),
        "request-changes": ({"needs_review"}, "draft"),
        "reopen": ({"rejected"}, "draft"),
    }
    if action == "retire":
        targets = [r for r in q["revisions"] if r.get("status") == "approved"]
        if not targets:
            raise ToolError(f"{qid} has no approved revision to retire")
        for r in targets:
            _log(paths, qid, r, who, "retire", "retired", note)
        save_question(path, q)
        return f"{qid}: retired {', '.join('r' + str(r['revision']) for r in targets)}"
    froms, to = allowed[action]
    if rev["status"] not in froms:
        raise ToolError(f"{qid} r{rev['revision']} is '{rev['status']}'; {action} applies to {sorted(froms)}")
    _log(paths, qid, rev, who, action, to, note)
    save_question(path, q)
    return f"{qid} r{rev['revision']}: {action} → {to}"


def new_revision(paths: Paths, qid: str, *, reviewer: str | None, note: str | None,
                 base: dict[str, Any] | None = None) -> dict[str, Any]:
    """Create revision N+1 (draft) as a copy of the latest; the old one stays untouched."""
    who = _reviewer(reviewer)
    path, q = get_question(paths, qid)
    cur = latest(q)
    if cur["status"] in ("draft",) and base is None:
        raise ToolError(f"{qid} r{cur['revision']} is already a draft; edit it directly")
    rev = {k: copy.deepcopy(cur.get(k)) for k in CONTENT_FIELDS if k in cur}
    if base:
        rev.update({k: v for k, v in base.items() if k in CONTENT_FIELDS})
    rev.update(revision=cur["revision"] + 1, status="draft", language="nb-NO",
               provenance={"method": "edit", "author": who, "based_on": cur["revision"], "at": now_iso()},
               flags=[], review_log=[])
    rev = {"revision": rev.pop("revision"), "status": rev.pop("status"), **rev}
    _log(paths, qid, rev, who, "new_revision", "draft", note or f"based on r{cur['revision']}")
    q["revisions"].append(rev)
    save_question(path, q)
    return rev


def edit(paths: Paths, qid: str, *, reviewer: str | None, note: str | None) -> str:
    """Open the editable revision in $EDITOR; approved revisions are copied to a new draft first."""
    path, q = get_question(paths, qid)
    rev = latest(q)
    if rev["status"] != "draft":
        rev = new_revision(paths, qid, reviewer=reviewer, note=note)
        path, q = get_question(paths, qid)
        rev = latest(q)
    editor = os.environ.get("VISUAL") or os.environ.get("EDITOR") or "nano"
    editable = {k: rev.get(k) for k in CONTENT_FIELDS if k in rev}
    with tempfile.NamedTemporaryFile("w", suffix=f"-{qid}.json", delete=False, encoding="utf-8") as fh:
        fh.write(__import__("json").dumps(editable, ensure_ascii=False, indent=2))
        tmp = Path(fh.name)
    try:
        subprocess.run(shlex.split(editor) + [str(tmp)], check=True)
        changed = read_json(tmp)
    finally:
        tmp.unlink(missing_ok=True)
    for k in CONTENT_FIELDS:
        if k in changed:
            rev[k] = changed[k]
        else:
            rev.pop(k, None)
    rev.pop("checks", None)
    _log(paths, qid, rev, _reviewer(reviewer), "edit", None, note)
    save_question(path, q)
    return f"{qid} r{rev['revision']} saved as draft; run `python3 -m tools verify {qid}`"


def resolve_flag(paths: Paths, qid: str, *, reviewer: str | None, note: str | None, demote: bool) -> str:
    """Mark source-change flags as reviewed. With --demote an approved revision goes back to review."""
    who = _reviewer(reviewer)
    if not note:
        raise ToolError("resolve-flag needs --note describing what was checked")
    path, q = get_question(paths, qid)
    touched = 0
    for rev in q["revisions"]:
        for f in open_flags(rev):
            f.update(resolved=True, resolved_by=who, resolved_at=now_iso(), resolution=note)
            touched += 1
            _log(paths, qid, rev, who, "resolve_flag", "needs_review" if demote and rev["status"] == "approved"
                 else None, note, flag=f.get("type"))
    save_question(path, q)
    return f"{qid}: resolved {touched} flag(s)"


# --- glossary, templates and sections -----------------------------------------

def approve_terms(paths: Paths, ids: list[str], *, reviewer: str | None, note: str | None) -> list[str]:
    who = _reviewer(reviewer)
    data = read_json(paths.glossary_file)
    by_id = {t["id"]: t for t in data["terms"]}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise ToolError(f"unknown glossary term(s): {missing}")
    from .context import validate_glossary
    errs = [e for e in validate_glossary(by_id) if any(f" {i}:" in e for i in ids)]
    if errs:
        raise ToolError("\n".join(errs))
    for i in ids:
        t = by_id[i]
        t["status"] = "approved"
        t.setdefault("review_log", []).append({"at": now_iso(), "actor": who, "action": "approve", "note": note})
    write_json(paths.glossary_file, data)
    return ids


def approve_template(paths: Paths, key: str, *, reviewer: str | None, note: str | None,
                     checklist: str | None) -> str:
    who = _reviewer(reviewer)
    if checklist != "all":
        raise ToolError("approving a visual template requires --checklist all, confirming that you have "
                        "checked the rendering in the preview (symbols, polarity, labels, units, computed "
                        "values, accessibility text, reduced-motion fallback) and that it is original")
    data = read_json(paths.templates_file)
    for t in data["templates"]:
        if f"{t['id']}@{t['version']}" == key:
            t["status"] = "approved"
            t.setdefault("review_log", []).append({"at": now_iso(), "actor": who, "action": "approve", "note": note})
            write_json(paths.templates_file, data)
            return key
    raise ToolError(f"unknown visual template {key}")


def verify_section(paths: Paths, section_id: str, *, title: str | None, reviewer: str | None) -> str:
    from . import structure
    who = _reviewer(reviewer)
    reg = structure.load_registry(paths)
    for ch in reg["chapters"]:
        for s in ch.get("sections", []):
            if s["id"] == section_id:
                if not title:
                    from .importer import load_import
                    proposal = structure.propose_title(structure.ocr_titles(load_import(paths)).get(section_id))
                    raise ToolError(f"give the heading exactly as printed in the book with --title "
                                    f"(OCR proposal: {proposal!r})")
                s["title"] = title
                s["title_status"] = "verified"
                s["verified_by"], s["verified_at"] = who, now_iso()
                structure.save_registry(paths, reg)
                return f"{section_id}: '{s['title']}' verified"
    raise ToolError(f"unknown section {section_id}")


def verify_chapter(paths: Paths, number: int, *, title: str | None, reviewer: str | None) -> str:
    from . import structure
    who = _reviewer(reviewer)
    reg = structure.load_registry(paths)
    ch = structure.chapter_entry(reg, number)
    if ch is None:
        raise ToolError(f"unknown chapter {number}")
    if title:
        ch["title"] = title
    ch["title_status"] = "verified"
    ch["verified_by"], ch["verified_at"] = who, now_iso()
    structure.save_registry(paths, reg)
    return f"chapter {number}: '{ch['title']}' verified"
