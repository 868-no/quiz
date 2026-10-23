"""Automatic glossary linking.

    python3 -m tools glossary suggest [ids]           report unlinked glossary words
    python3 -m tools glossary autolink [ids] [--apply] link them (new draft revisions)

Rules, so that popovers help without cluttering the text:
* a term is linked at most once before answering (context, then stem; never in the
  answer options, where underlining could hint at the answer) and at most once after answering (explanation, then option feedback),
  and only if it is not linked there already;
* at most MAX_BEFORE distinct terms before answering; longer (more specific) forms
  are preferred, very basic terms come last;
* only plain text segments are touched: never math, quantities, or existing links;
* matching respects word boundaries; lower-case forms match any capitalisation,
  forms with capitals (SSB, MF …) must match exactly; the visible text is kept as
  written;
* after linking, the leak checks run, and a term whose definition gives away the
  answer is added to `glossary_after_answer` (shown as plain text until answered).

Approved revisions are never edited in place: linking creates a new draft revision,
which must be verified and approved like any other change.
"""
from __future__ import annotations

import copy
import re
from typing import Any

from . import checks, richtext
from .common import Paths, now_iso
from .context import Context, load_context
from .questions import latest, save_question

MAX_BEFORE = 5
MAX_AFTER = 4
# basic quantities: still linked, but only when there is room
BASIC = {"spenning", "strom", "frekvens", "effekt", "motstand", "resistans"}
WORD = r"[\wæøåÆØÅ]"


def _patterns(ctx: Context) -> list[tuple[str, re.Pattern]]:
    forms = []
    for tid, t in ctx.glossary.items():
        if t.get("status") == "retired":
            continue
        for f in t["nb"]:
            if f in t.get("no_autolink", []):
                continue  # ambiguous form (e.g. also a verb): link by hand only
            flags = 0 if any(c.isupper() for c in f) else re.IGNORECASE
            forms.append((len(f), tid, re.compile(rf"(?<!{WORD})({re.escape(f)})(?!{WORD})", flags)))
    forms.sort(key=lambda x: -x[0])
    return [(tid, rx) for _, tid, rx in forms]


def _link_paragraph(par: Any, tid: str, rx: re.Pattern) -> tuple[Any, bool]:
    """Link the first match of rx in the plain strings of one paragraph."""
    inl = [par] if isinstance(par, str) else list(par)
    for i, node in enumerate(inl):
        if not isinstance(node, str):
            continue
        m = rx.search(node)
        if not m:
            continue
        before, text, after = node[:m.start()], m.group(1), node[m.end():]
        new = ([before] if before else []) + [{"term": tid, "text": text}] + ([after] if after else [])
        return inl[:i] + new + inl[i + 1:], True
    return par, False


def _link_rich(value: Any, tid: str, rx: re.Pattern) -> tuple[Any, bool]:
    if value in (None, "", []):
        return value, False
    blocks = [value] if isinstance(value, str) else list(value)
    for bi, block in enumerate(blocks):
        if isinstance(block, dict) and "steps" in block:
            for si, p in enumerate(block["steps"]):
                np, ok = _link_paragraph(p, tid, rx)
                if ok:
                    steps = list(block["steps"])
                    steps[si] = np
                    blocks[bi] = {"steps": steps}
                    return blocks, True
        elif isinstance(block, dict) and "note" in block:
            np, ok = _link_paragraph(block["note"], tid, rx)
            if ok:
                blocks[bi] = {"note": np}
                return blocks, True
        else:
            np, ok = _link_paragraph(block, tid, rx)
            if ok:
                blocks[bi] = np
                return blocks, True
    return value, False


def _refs_before(rev: dict[str, Any]) -> set[str]:
    out = set(richtext.term_refs(rev.get("context"))) | set(richtext.term_refs(rev.get("stem")))
    for o in rev.get("options", []):
        out |= set(richtext.term_refs([o.get("content")]))
    return out


def _refs_after(rev: dict[str, Any]) -> set[str]:
    out = set(richtext.term_refs(rev.get("explanation")))
    for o in rev.get("options", []):
        out |= set(richtext.term_refs(o.get("feedback")))
    return out


def link_revision(ctx: Context, rev: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Return (linked copy, list of 'term@before/after' added)."""
    new = copy.deepcopy(rev)
    added: list[str] = []
    pats = _patterns(ctx)
    # specific terms first, basic ones last
    pats.sort(key=lambda p: p[0] in BASIC)
    before = _refs_before(new)
    for tid, rx in pats:
        if tid in before or len(before) >= MAX_BEFORE:
            continue
        for key in ("context", "stem"):
            val, ok = _link_rich(new.get(key), tid, rx)
            if ok:
                new[key] = val
                break
        else:
            # Never inside answer options: links (underlines) in some options but not
            # others would hint at the answer.
            ok = False
        if ok:
            before.add(tid)
            added.append(f"{tid}@before")
    after = _refs_after(new)
    hidden = set(new.get("glossary_after_answer") or [])
    n_after = 0
    for tid, rx in pats:
        # already clickable before answering (and not held back): no second link needed
        if tid in after or (tid in before and tid not in hidden) or n_after >= MAX_AFTER:
            continue
        val, ok = _link_rich(new.get("explanation"), tid, rx)
        if ok:
            new["explanation"] = val
        else:
            for o in new.get("options", []):
                if o.get("feedback"):
                    val, ok = _link_rich(o["feedback"], tid, rx)
                    if ok:
                        o["feedback"] = val
                        break
        if ok:
            after.add(tid)
            n_after += 1
            added.append(f"{tid}@after")
    return new, added


_LEAK = re.compile(r"glossary definition of '([^']+)'")


def hold_back_leaks(ctx: Context, qid: str, rev: dict[str, Any]) -> list[str]:
    """Move terms whose definitions leak the answer to glossary_after_answer."""
    held = []
    for w in checks.check_revision(ctx, qid, rev)["warnings"]:
        m = _LEAK.search(w)
        if m and m.group(1) not in rev.setdefault("glossary_after_answer", []):
            rev["glossary_after_answer"].append(m.group(1))
            held.append(m.group(1))
    return held


def suggest(paths: Paths, qids: list[str] | None) -> str:
    ctx = load_context(paths)
    lines = []
    for _, q in ctx.all_questions:
        if qids and q["id"] not in qids:
            continue
        rev = latest(q)
        if rev.get("status") in ("rejected", "retired"):
            continue
        _, added = link_revision(ctx, rev)
        if added:
            lines.append(f"{q['id']}: {', '.join(added)}")
    return "\n".join(lines) or "nothing to link"


def autolink(paths: Paths, qids: list[str] | None, *, apply: bool, actor: str) -> dict[str, Any]:
    from .review import _log
    ctx = load_context(paths)
    changed, held_total = [], {}
    for path, q in ctx.all_questions:
        if qids and q["id"] not in qids:
            continue
        cur = latest(q)
        if cur.get("status") in ("rejected", "retired"):
            continue
        new, added = link_revision(ctx, cur)
        if not added:
            continue
        if cur.get("status") == "approved":
            new = {k: v for k, v in new.items() if k not in ("approval", "checks", "review_log", "flags")}
            new.update(revision=cur["revision"] + 1, status="draft", flags=[], review_log=[],
                       provenance={"method": "autolink", "author": actor, "based_on": cur["revision"], "at": now_iso()})
            target = new
        else:
            cur.update({k: new[k] for k in ("context", "stem", "options", "explanation")})
            cur.pop("checks", None)
            if cur.get("status") == "needs_review":
                cur["status"] = "draft"
            target = cur
        held = hold_back_leaks(ctx, q["id"], target)
        if held:
            held_total[q["id"]] = held
        if apply:
            if target is not cur:
                _log(paths, q["id"], target, actor, "autolink", "draft",
                     f"glossary links added ({len(added)}); based on r{cur['revision']}")
                q["revisions"].append(target)
            save_question(path, q)
        changed.append((q["id"], added))
    return {"changed": changed, "held_back": held_total, "applied": apply}
