"""Stage D: build the public site from approved content only.

    python3 -m tools publish            -> dist/            (production; approved only; fail closed)
    python3 -m tools preview            -> private/preview/ (all current drafts; never deploy)

The public bank is an *allowlisted projection*: each field copied into it is named
below. Source mappings, chunk ids, provenance, checks, review logs, notes and
anything else are left behind by construction.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

from . import checks, richtext, visuals
from .common import Paths, ToolError, canonical_hash, now_iso, read_json, write_json
from .context import Context, load_context, validate_glossary
from .questions import content_hash, latest, open_flags, publishable_revision
from .release_check import SW_FILE, SW_PLACEHOLDER, precache, release_check

BANK_SCHEMA = 1
PUBLIC_QUESTION_KEYS = ("id", "rev", "chapter", "sections", "topics", "difficulty", "style", "priority",
                        "context", "stem", "options", "correct", "explanation", "visual",
                        "glossary_after_answer", "ref")
PUBLIC_TERM_KEYS = ("id", "nb", "en", "definition", "related")
PUBLIC_TEMPLATE_KEYS = ("id", "version", "title", "idealised", "params", "kind_labels")


class PublishError(ToolError):
    pass


def _terms_used(rev: dict[str, Any]) -> set[str]:
    out = set()
    for k in ("context", "stem", "explanation"):
        out |= set(richtext.term_refs(rev.get(k)))
    for o in rev.get("options", []):
        out |= set(richtext.term_refs([o.get("content")])) | set(richtext.term_refs(o.get("feedback")))
    return out


def project_question(q: dict[str, Any], rev: dict[str, Any], ctx: Context) -> dict[str, Any]:
    ref = rev.get("study_reference") or {}
    sec = ctx.sections.get(ref.get("section_id") or "")
    out = {
        "id": q["id"],
        "rev": rev["revision"],
        "chapter": rev["chapter"],
        "sections": list(rev.get("section_ids") or []),
        "topics": list(rev.get("topic_ids") or []),
        "difficulty": rev["difficulty"],
        "style": rev["style"],
        "priority": rev["priority"],
        "context": rev.get("context") or [],
        "stem": rev["stem"],
        "options": [{"id": o["id"], "content": o["content"], "feedback": o.get("feedback") or []}
                    for o in rev["options"]],
        "correct": list(rev["correct"]),
        "explanation": rev["explanation"],
        "visual": ({k: rev["visual"][k] for k in ("template", "version", "params", "params_after", "caption", "animation", "after_only")
                    if k in rev["visual"]} if rev.get("visual") else None),
        "glossary_after_answer": list(rev.get("glossary_after_answer") or []),
        "ref": {
            "chapter": rev["chapter"],
            # Only human-verified headings are shown; otherwise the reference stays at chapter/page level.
            "section": ref.get("section_id") if sec and sec.get("title_status") == "verified" else None,
            "pages": list(ref.get("printed_pages") or []),
        },
    }
    assert set(out) == set(PUBLIC_QUESTION_KEYS)
    return out


def build_bank(paths: Paths, *, mode: str, skip_flagged: bool = False,
               require_source: bool = True) -> tuple[dict[str, Any], list[str], list[str]]:
    """Return (bank, problems, notes). In production any problem aborts the build."""
    ctx = load_context(paths, need_source=require_source)
    problems: list[str] = []
    notes: list[str] = []
    problems += validate_glossary(ctx.glossary)
    selected: list[tuple[dict[str, Any], dict[str, Any]]] = []
    for _, q in ctx.all_questions:
        if mode == "production":
            rev = publishable_revision(q)
            if rev is None:
                continue
            appr = rev.get("approval") or {}
            if appr.get("content_sha256") != content_hash(rev):
                problems.append(f"{q['id']} r{rev['revision']}: content changed after approval")
                continue
            if open_flags(rev):
                msg = f"{q['id']} r{rev['revision']}: unresolved flags {[f.get('type') for f in open_flags(rev)]}"
                if skip_flagged:
                    notes.append("skipped " + msg)
                    continue
                problems.append(msg + " (resolve, or pass --skip-flagged to leave it out)")
                continue
        else:
            rev = latest(q)
            if rev.get("status") in ("rejected", "retired"):
                continue
        result = checks.check_revision(ctx, q["id"], rev)
        if ctx.source is None and not require_source:
            # Explicitly publishing without the private import: source checks were done at approval time.
            result["errors"] = [e for e in result["errors"] if not e.startswith("sources: no source import")]
            result["passed"] = not result["errors"]
        if not result["passed"]:
            if mode == "production":
                problems += [f"{q['id']} r{rev['revision']}: {e}" for e in result["errors"]]
                continue
            notes.append(f"{q['id']}: {len(result['errors'])} check error(s) (preview only)")
        selected.append((q, rev))

    public_qs = []
    used_terms: set[str] = set()
    used_templates: set[str] = set()
    for q, rev in selected:
        pq = project_question(q, rev, ctx)
        if mode != "production":
            pq["preview_status"] = rev.get("status")
        public_qs.append(pq)
        for t in _terms_used(rev) | set(rev.get("glossary_after_answer") or []):
            used_terms.add(t)
            term = ctx.glossary.get(t)
            if term is None:
                problems.append(f"{q['id']}: glossary term {t!r} does not exist")
            elif mode == "production" and term.get("status") != "approved":
                problems.append(f"{q['id']}: glossary term {t!r} "
                                + ("was changed after it was approved; approve it again"
                                   if term.get("changed_since_approval") else "is not approved"))
        if rev.get("visual"):
            key = f"{rev['visual'].get('template')}@{rev['visual'].get('version')}"
            used_templates.add(key)
            tpl = ctx.templates.get(key)
            if tpl is None:
                problems.append(f"{q['id']}: unknown visual template {key}")
            elif mode == "production" and tpl.get("status") != "approved":
                problems.append(f"{q['id']}: visual template {key} is not approved")
            else:
                errs, _, _ = visuals.validate_visual(ctx.templates, rev["visual"])
                problems += [f"{q['id']}: {e}" for e in errs]
        ch = next((c for c in ctx.registry["chapters"] if c["number"] == rev["chapter"]), None)
        if ch is None or not ch.get("scanned"):
            problems.append(f"{q['id']}: chapter {rev['chapter']} is not an available (scanned) chapter")

    # Related terms are only linked when they are part of this bank anyway.
    glossary = {}
    for t in sorted(used_terms):
        term = ctx.glossary.get(t)
        if term:
            glossary[t] = {k: term.get(k) for k in PUBLIC_TERM_KEYS if k in term}
            glossary[t]["related"] = [r for r in term.get("related", []) if r in used_terms]

    counts: dict[int, int] = {}
    for pq in public_qs:
        counts[pq["chapter"]] = counts.get(pq["chapter"], 0) + 1
    book = ctx.registry.get("book", {})
    total = book.get("total_chapters") or max([c["number"] for c in ctx.registry["chapters"]] or [0])
    chapters = []
    for n in range(1, total + 1):
        c = next((x for x in ctx.registry["chapters"] if x["number"] == n), None)
        scanned = bool(c and c.get("scanned"))
        chapters.append({
            "number": n,
            "title": c.get("title") if c else None,
            # a chapter marked "quiz": false in the registry (the exam syllabus) gets no questions and
            # is left out of the chapter list and the dial
            "status": "available" if counts.get(n) else (
                "not_in_quiz" if c and c.get("quiz") is False else "no_questions" if scanned else "upcoming"),
            "questions": counts.get(n, 0),
        })
    sections = {
        sid: {"chapter": s["chapter"], "title": s["title"]}
        for sid, s in ctx.sections.items()
        if s.get("title_status") == "verified" and any(sid == pq["ref"]["section"] for pq in public_qs)
    }
    topics = {tid: {"title": t["title"]} for tid, t in ctx.topics.items()
              if any(tid in pq["topics"] for pq in public_qs)}
    templates = {}
    for key in sorted(used_templates):
        if key in ctx.templates:
            templates[key] = {k: ctx.templates[key][k] for k in PUBLIC_TEMPLATE_KEYS if k in ctx.templates[key]}

    public_qs.sort(key=lambda x: x["id"])
    bank = {
        "schema": BANK_SCHEMA,
        "mode": mode,
        "built_at": now_iso(),
        "bank_id": canonical_hash([[q["id"], q["rev"]] for q in public_qs])[:16],
        "book": {"title": book.get("title")},
        "site": public_site_links(paths),
        "chapters": chapters,
        "sections": sections,
        "topics": topics,
        "glossary": glossary,
        "templates": templates,
        "questions": public_qs,
    }
    return bank, problems, notes


def _copy_web(paths: Paths, out: Path) -> None:
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(paths.web, out, ignore=shutil.ignore_patterns("*.map", ".*", "__pycache__"))


def site_config(paths: Paths) -> dict[str, Any]:
    path = paths.config / "site.json"
    return read_json(path) if path.exists() else {}


def public_site_links(paths: Paths) -> dict[str, Any]:
    """Links to the public repository and its issue tracker, shown on the site."""
    cfg = site_config(paths)
    out = {}
    for key in ("repo_url", "issues_url"):
        url = cfg.get(key)
        if url is not None:
            if not re.fullmatch(r"https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(/issues)?", url):
                raise PublishError(f"config/site.json: {key} must be a https://github.com/OWNER/REPO URL")
            out[key] = url
    return out


def _write_host_files(paths: Paths, out: Path) -> None:
    """GitHub Pages: custom domain (CNAME) and no Jekyll processing (.nojekyll)."""
    cname = site_config(paths).get("cname")
    if cname:
        if not re.fullmatch(r"(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", cname):
            raise PublishError(f"config/site.json: cname {cname!r} is not a valid host name")
        (out / "CNAME").write_text(cname + "\n", encoding="utf-8")
    (out / ".nojekyll").write_text("", encoding="utf-8")


def _write_precache(out: Path) -> None:
    """Fill in the service worker's file list and version (last step: it covers every file)."""
    sw = out / SW_FILE
    text = sw.read_text(encoding="utf-8")
    if text.count(SW_PLACEHOLDER) != 1:
        raise PublishError(f"web/{SW_FILE}: PRECACHE placeholder line not found")
    line = f"const PRECACHE = {json.dumps(precache(out), separators=(',', ':'))};"
    sw.write_text(text.replace(SW_PLACEHOLDER, line), encoding="utf-8")


def publish(paths: Paths, *, skip_flagged: bool = False, require_source: bool = True,
            out: Path | None = None) -> dict[str, Any]:
    bank, problems, notes = build_bank(paths, mode="production", skip_flagged=skip_flagged,
                                       require_source=require_source)
    if problems:
        raise PublishError("publication refused (nothing was written):\n  " + "\n  ".join(problems))
    out = out or paths.dist
    staging = out.with_name(out.name + ".staging")
    _copy_web(paths, staging)
    write_json(staging / "data" / "bank.json", bank)
    _write_host_files(paths, staging)
    _write_precache(staging)
    report = release_check(staging, paths, expect_mode="production")
    if report["errors"]:
        shutil.rmtree(staging)
        raise PublishError("release check failed (nothing was written):\n  " + "\n  ".join(report["errors"]))
    if out.exists():
        shutil.rmtree(out)
    staging.rename(out)
    return {"out": str(out), "questions": len(bank["questions"]), "notes": notes,
            "release_check": report, "chapters": bank["chapters"]}


def preview(paths: Paths) -> dict[str, Any]:
    bank, problems, notes = build_bank(paths, mode="preview", require_source=False)
    out = paths.preview
    _copy_web(paths, out)
    write_json(out / "data" / "bank.json", bank)
    return {"out": str(out), "questions": len(bank["questions"]), "problems": problems, "notes": notes}
