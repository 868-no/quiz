"""Loads everything the checks, review and publish steps need, once."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from . import importer, questions, structure, visuals
from .common import Paths, ToolError, read_json

GLOSSARY_STATUSES = ("needs_review", "approved", "retired")


@dataclass
class Context:
    paths: Paths
    glossary: dict[str, dict[str, Any]]
    topics: dict[str, dict[str, Any]]
    registry: dict[str, Any]
    sections: dict[str, dict[str, Any]]
    templates: dict[str, dict[str, Any]]
    source: dict[str, Any] | None
    chunks: dict[str, dict[str, Any]] = field(default_factory=dict)
    all_questions: list[tuple[Path, dict[str, Any]]] = field(default_factory=list)
    cache: dict[str, Any] = field(default_factory=dict)


def load_glossary(paths: Paths) -> dict[str, dict[str, Any]]:
    if not paths.glossary_file.exists():
        return {}
    data = read_json(paths.glossary_file)
    out = {}
    for t in data.get("terms", []):
        if t["id"] in out:
            raise ToolError(f"glossary: duplicate id {t['id']}")
        out[t["id"]] = t
    return out


def validate_glossary(glossary: dict[str, dict[str, Any]]) -> list[str]:
    errors = []
    for tid, t in glossary.items():
        if not isinstance(t.get("nb"), list) or not t["nb"] or not all(isinstance(x, str) and x for x in t["nb"]):
            errors.append(f"glossary {tid}: 'nb' must list at least one Norwegian form")
        if not isinstance(t.get("en"), list) or not t["en"]:
            errors.append(f"glossary {tid}: 'en' must list at least one English equivalent")
        if not isinstance(t.get("definition"), str) or not 10 <= len(t["definition"]) <= 400:
            errors.append(f"glossary {tid}: 'definition' must be 10–400 characters")
        for r in t.get("related", []):
            if r not in glossary:
                errors.append(f"glossary {tid}: related term {r!r} does not exist")
        if t.get("status") not in GLOSSARY_STATUSES:
            errors.append(f"glossary {tid}: status must be one of {GLOSSARY_STATUSES}")
        for s in [t.get("definition", "")] + t.get("nb", []) + t.get("en", []):
            if any(c in s for c in "<>&"):
                errors.append(f"glossary {tid}: characters < > & are not allowed")
    return errors


def load_topics(paths: Paths) -> dict[str, dict[str, Any]]:
    if not paths.topics_file.exists():
        return {}
    return {t["id"]: t for t in read_json(paths.topics_file).get("topics", [])}


def load_context(paths: Paths, *, need_source: bool = False) -> Context:
    registry = structure.load_registry(paths)
    source = importer.load_import(paths)
    if need_source and source is None:
        raise ToolError("no source import found; run `python3 -m tools import --source <export dir>` first")
    ctx = Context(
        paths=paths,
        glossary=load_glossary(paths),
        topics=load_topics(paths),
        registry=registry,
        sections=structure.all_sections(registry),
        templates=visuals.load_templates(paths) if paths.templates_file.exists() else {},
        source=source,
        all_questions=questions.load_all(paths),
    )
    if source:
        ctx.chunks = {c["uid"]: c for c in source["chunks"]}
    return ctx
