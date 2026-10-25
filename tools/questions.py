"""Question records: one JSON file per question identity with a list of revisions.

    content/questions/q-0001.json
    {"id": "q-0001", "revisions": [{"revision": 1, "status": "approved", ...}, ...]}

Identity (`id`) never changes. Each revision is a full, self-contained version of
the question. Once a revision has been approved its content is frozen: the
approval stores a hash of the content and publication refuses a revision whose
content no longer matches. Changing an approved question means creating a new
revision (`python3 -m tools review edit`), which must be reviewed again.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Iterator

from .common import Paths, ToolError, canonical_hash, read_json, write_json

STATUSES = ("draft", "needs_review", "approved", "rejected", "retired")
STYLES = ("recall", "concept", "scenario", "calculation")
DIFFICULTIES = ("easy", "medium", "hard")
TYPES = ("single_choice",)  # future: multiple_choice, numeric, visual_identification
PRIORITIES = ("exam_important", "normal")
QUESTION_ID = re.compile(r"^q-\d{4,6}$")

# Fields that make up the question as a learner sees it, plus its source mapping.
# Review metadata (status, checks, flags, review_log, approval) is excluded so that
# recording a review does not change the hash.
CONTENT_FIELDS = (
    "type", "style", "difficulty", "chapter", "section_ids", "topic_ids", "learning_objective",
    "priority", "context", "stem", "options", "correct", "explanation", "visual",
    "glossary_after_answer", "calculation", "study_reference", "sources", "tags", "variants",
)

# Allowed status transitions and the command that performs them.
TRANSITIONS = {
    ("draft", "needs_review"): "verify",
    ("needs_review", "draft"): "verify/request-changes",
    ("needs_review", "approved"): "review approve",
    ("needs_review", "rejected"): "review reject",
    ("draft", "rejected"): "review reject",
    ("approved", "retired"): "review retire",
    ("approved", "needs_review"): "import (source changed) / review reopen",
}


# A calculation question can come in variants: other values for the same calculation.
# A variant replaces these fields of the question (the option ids and the correct
# option stay the same); the question itself is the first variant.
VARIANT_KEYS = ("context", "stem", "options", "explanation", "visual", "calculation")
VARIANT_ID = re.compile(r"^v([2-9]|1\d)$")


def content_hash(rev: dict[str, Any]) -> str:
    # "variants" is left out when absent, so questions without variants keep their hash
    return canonical_hash({k: rev.get(k) for k in CONTENT_FIELDS if k != "variants" or rev.get("variants")})


def variant_revisions(rev: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """Each variant as a whole revision: the question with the variant's fields replaced."""
    out = []
    for v in rev.get("variants") or []:
        if isinstance(v, dict):
            merged = {k: val for k, val in rev.items() if k != "variants"}
            merged.update({k: v[k] for k in VARIANT_KEYS if k in v})
            out.append((str(v.get("id")), merged))
    return out


def iter_question_files(paths: Paths) -> Iterator[Path]:
    if paths.questions.exists():
        yield from sorted(paths.questions.glob("q-*.json"))


def load_question(path: Path) -> dict[str, Any]:
    q = read_json(path)
    if not isinstance(q, dict) or not isinstance(q.get("revisions"), list) or not q["revisions"]:
        raise ToolError(f"{path}: expected {{'id': ..., 'revisions': [...]}} with at least one revision")
    if q.get("id") != path.stem:
        raise ToolError(f"{path}: id {q.get('id')!r} does not match file name")
    return q


def save_question(path: Path, q: dict[str, Any]) -> None:
    q["revisions"].sort(key=lambda r: r["revision"])
    write_json(path, q)


def load_all(paths: Paths) -> list[tuple[Path, dict[str, Any]]]:
    return [(p, load_question(p)) for p in iter_question_files(paths)]


def question_path(paths: Paths, qid: str) -> Path:
    if not QUESTION_ID.match(qid):
        raise ToolError(f"invalid question id {qid!r} (expected q-0001)")
    return paths.questions / f"{qid}.json"


def get_question(paths: Paths, qid: str) -> tuple[Path, dict[str, Any]]:
    path = question_path(paths, qid)
    if not path.exists():
        raise ToolError(f"question {qid} not found ({path})")
    return path, load_question(path)


def latest(q: dict[str, Any]) -> dict[str, Any]:
    return max(q["revisions"], key=lambda r: r["revision"])


def get_revision(q: dict[str, Any], revision: int | None) -> dict[str, Any]:
    if revision is None:
        return latest(q)
    for r in q["revisions"]:
        if r["revision"] == revision:
            return r
    raise ToolError(f"{q['id']} has no revision {revision}")


def publishable_revision(q: dict[str, Any]) -> dict[str, Any] | None:
    """The newest approved revision, or None. Retiring a question retires all approved revisions."""
    approved = [r for r in q["revisions"] if r.get("status") == "approved"]
    return max(approved, key=lambda r: r["revision"]) if approved else None


def next_question_id(paths: Paths) -> str:
    nums = [int(p.stem.split("-")[1]) for p in iter_question_files(paths)]
    return f"q-{(max(nums) + 1 if nums else 1):04d}"


def human_verified(rev: dict[str, Any]) -> bool:
    """An approved revision that a person has checked: approved by a person, or approved by
    AI models (`machine_verified`) and later confirmed with `review human-verify`."""
    appr = rev.get("approval") or {}
    return bool(appr) and (not appr.get("machine_verified") or bool(appr.get("human_verified")))


def open_flags(rev: dict[str, Any]) -> list[dict[str, Any]]:
    return [f for f in rev.get("flags", []) if not f.get("resolved")]
