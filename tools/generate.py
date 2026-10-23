"""Stage A: candidate generation (LLM, local by default) and manual authoring skeletons.

Nothing here runs on the public request path. Generated candidates are untrusted
drafts: they are written with status `draft` and must pass `verify` and a human
`review approve` before they can be published.

Every LLM run is recorded under private/generation/runs/<run_id>/ (prompt, the
exact source chunks used, raw output, provider/model/parameters).
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import urllib.error
import urllib.request
from typing import Any
from urllib.parse import urlparse

from .common import Paths, ToolError, now_iso, read_json, sha256_bytes, write_json, write_text
from .context import Context, load_context
from .questions import CONTENT_FIELDS, get_question, latest, next_question_id, question_path, save_question

LOCAL_HOSTS = {"127.0.0.1", "localhost", "::1"}


def load_config(paths: Paths) -> dict[str, Any]:
    cfg = read_json(paths.config / "generation.json")
    local = paths.config / "generation.local.json"
    if local.exists():
        over = read_json(local)
        for k, v in over.items():
            if k == "providers":
                for name, pv in v.items():
                    cfg["providers"].setdefault(name, {}).update(pv)
            else:
                cfg[k] = v
    return cfg


# --- source helpers ------------------------------------------------------------

def resolve_chunks(ctx: Context, refs: list[str]) -> list[dict[str, Any]]:
    by_id = {c["id"]: c for c in ctx.chunks.values()}
    out = []
    for r in refs:
        c = ctx.chunks.get(r) or by_id.get(r)
        if c is None:
            raise ToolError(f"chunk {r!r} not found in the current import (use uid or chunk id)")
        out.append(c)
    return out


def list_sources(paths: Paths, chapter: int | None, important: bool) -> str:
    ctx = load_context(paths, need_source=True)
    covered: dict[str, int] = {}
    for _, q in ctx.all_questions:
        for uid in (latest(q).get("sources") or {}).get("chunk_uids", []):
            covered[uid] = covered.get(uid, 0) + 1
    lines = []
    for c in ctx.source["chunks"]:
        if chapter is not None and c["chapter"] != chapter:
            continue
        if important and not c["marked_important"]:
            continue
        flags = "".join([
            "!" if c["marked_important"] else " ",
            "E" if c["has_unverified_equation"] else " ",
            "O" if c["ocr_hazards"] else " ",
            "P" if c["page_uncertainty"] else " ",
            "F" if c["requires_visual_context"] else " ",
        ])
        lines.append(f"{c['uid']}  {c['id']}  [{flags}]  p.{','.join(c['printed_pages']):<9} "
                     f"{c['section_id']:<40} q={covered.get(c['uid'], 0)}")
    lines.append("flags: ! exam-important  E unverified equation  O OCR hazard  P uncertain printed page  "
                 "F depends on a figure;  q = questions citing the chunk")
    return "\n".join(lines)


def show_source(paths: Paths, ref: str) -> str:
    ctx = load_context(paths, need_source=True)
    c = resolve_chunks(ctx, [ref])[0]
    meta = {k: v for k, v in c.items() if k != "text"}
    return json.dumps(meta, ensure_ascii=False, indent=2) + "\n\n" + c["text"]


# --- manual authoring ------------------------------------------------------------

def _skeleton(ctx: Context, chunks: list[dict[str, Any]], style: str) -> dict[str, Any]:
    chapter = chunks[0]["chapter"]
    if any(c["chapter"] != chapter for c in chunks):
        raise ToolError("all source chunks of one question must be from the same chapter")
    sections = list(dict.fromkeys(c["section_id"] for c in chunks))
    pages = [p for c in chunks if c["printed_pages_reliable"] for p in c["printed_pages"]]
    rev: dict[str, Any] = {
        "revision": 1,
        "status": "draft",
        "language": "nb-NO",
        "type": "single_choice",
        "style": style,
        "difficulty": "medium",
        "chapter": chapter,
        "section_ids": sections,
        "topic_ids": [],
        "learning_objective": "",
        "priority": "exam_important" if any(c["marked_important"] for c in chunks) else "normal",
        "context": [],
        "stem": ["TODO"],
        "options": [{"id": f"o{i}", "content": ["TODO"], "feedback": ["TODO"]} for i in range(1, 5)],
        "correct": ["o1"],
        "explanation": ["TODO"],
        "glossary_after_answer": [],
        "study_reference": {"chapter": chapter, "section_id": sections[0],
                            "printed_pages": list(dict.fromkeys(pages))},
        "sources": {"import_id": ctx.source["import_id"], "chunk_uids": [c["uid"] for c in chunks]},
        "tags": [],
        "flags": [],
        "review_log": [],
    }
    if style == "calculation":
        rev["calculation"] = {"formula": "TODO", "inputs": {}, "answer": [0, "V"], "answer_symbol": "", "sig_figs": 3}
    return rev


def new_manual(paths: Paths, chunk_refs: list[str], *, style: str, author: str | None) -> str:
    ctx = load_context(paths, need_source=True)
    chunks = resolve_chunks(ctx, chunk_refs)
    qid = next_question_id(paths)
    rev = _skeleton(ctx, chunks, style)
    rev["provenance"] = {"method": "manual", "author": author or os.environ.get("RADIOQUIZ_REVIEWER") or "unknown",
                         "at": now_iso()}
    save_question(question_path(paths, qid), {"id": qid, "revisions": [rev]})
    return qid


# --- LLM generation ---------------------------------------------------------------

PROMPT_HEADER = """Du lager øvingsspørsmål til den norske radioamatørlisensen (lisenspensum).

KRAV
- Skriv på korrekt norsk bokmål. Skriv ALT med egne ord. Ikke kopier setninger, eksempler,
  figurtekster eller tallverdier fra kildeteksten; kildeteksten er kun faglig grunnlag.
- Kildeteksten er OCR og kan inneholde feil. Tekst merket [EQUATION …] og tall i formler er
  UVERIFISERT. Ikke bygg spørsmål på tall eller formler du ikke kan begrunne med standard fagkunnskap.
- Hvert spørsmål: ett entydig riktig svar og tre plausible, tydelig gale alternativer.
- Spørsmålsteksten skal gi nødvendige forutsetninger og enheter, men ikke røpe svaret.
- Forklar hvorfor riktig svar er riktig, og hvorfor hvert galt alternativ er galt.
- Regneoppgaver: vis utregningen med enheter og avrunding, og fyll ut "calculation".
- Bruk desimalkomma og SI-symboler (Ω, µF, kHz).

SVARFORMAT: kun en JSON-liste, uten annen tekst. Hvert element:
{
  "style": "recall|concept|scenario|calculation",
  "difficulty": "easy|medium|hard",
  "learning_objective": "kort beskrivelse på norsk",
  "context": ["valgfri bakgrunn før svaret, uten å røpe svaret"],
  "stem": ["selve spørsmålet"],
  "options": [{"id": "o1", "content": ["…"], "feedback": ["hvorfor riktig/galt"]}, … 4 stk],
  "correct": ["o1"],
  "explanation": ["forklaring", {"steps": ["trinn 1", "trinn 2"]}],
  "calculation": {"formula": "<navn>", "inputs": {"U": [12, "V"]}, "answer": [2.4, "A"], "answer_symbol": "I", "sig_figs": 2}
}
Tall med enhet i tekst kan skrives som {"q": 2.4, "u": "A"}. Tilgjengelige formelnavn: {formulas}.
"""


def build_prompt(chunks: list[dict[str, Any]], count: int, extra: str | None) -> str:
    from .formulas import FORMULAS
    head = PROMPT_HEADER.replace("{formulas}", ", ".join(sorted(FORMULAS)))
    parts = [head, f"Lag {count} spørsmål basert på kildeteksten under."]
    if extra:
        parts.append(f"Tilleggsinstruks: {extra}")
    for c in chunks:
        parts.append(f"\n--- KILDE (kapittel {c['chapter']}, trykt side {', '.join(c['printed_pages'])}) ---\n{c['text']}")
    return "\n".join(parts)


def _call_provider(cfg: dict[str, Any], prompt: str) -> tuple[str, dict[str, Any]]:
    name = cfg["provider"]
    pc = cfg["providers"].get(name) or {}
    meta = {"provider": name, "model": pc.get("model"), "temperature": cfg.get("temperature")}
    timeout = cfg.get("timeout_s", 300)
    if name == "none":
        raise ToolError("LLM generation is disabled (config/generation.json provider='none'). Author questions "
                        "with `python3 -m tools new --chunk …`, or configure a local provider in "
                        "config/generation.local.json.")
    if name == "ollama":
        host = urlparse(pc["url"]).hostname
        if host not in LOCAL_HOSTS and not pc.get("allow_external_upload"):
            raise ToolError(f"ollama url {pc['url']} is not local; set allow_external_upload only if sending "
                            "the source text there is permitted")
        body = {"model": pc["model"], "prompt": prompt, "stream": False,
                "options": {"temperature": cfg.get("temperature", 0.4)}}
        req = urllib.request.Request(pc["url"].rstrip("/") + "/api/generate", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
        return data.get("response", ""), meta
    if name == "command":
        argv = pc.get("argv")
        if not argv:
            raise ToolError("providers.command.argv is not configured")
        res = subprocess.run(argv, input=prompt, capture_output=True, text=True, timeout=timeout, check=False)
        if res.returncode != 0:
            raise ToolError(f"generation command failed ({res.returncode}): {res.stderr[:500]}")
        return res.stdout, meta
    if name == "openai_compatible":
        if not pc.get("allow_external_upload"):
            raise ToolError("openai_compatible sends copyrighted source text to a remote service. Set "
                            "providers.openai_compatible.allow_external_upload=true in config/generation.local.json "
                            "only after deciding this is permitted.")
        key = os.environ.get(pc.get("api_key_env") or "", "")
        if not key or not pc.get("base_url") or not pc.get("model"):
            raise ToolError("openai_compatible needs base_url, model and the API key in $" + str(pc.get("api_key_env")))
        body = {"model": pc["model"], "temperature": cfg.get("temperature", 0.4),
                "messages": [{"role": "user", "content": prompt}]}
        req = urllib.request.Request(pc["base_url"].rstrip("/") + "/chat/completions", data=json.dumps(body).encode(),
                                     headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read())
        return data["choices"][0]["message"]["content"], meta
    raise ToolError(f"unknown provider {name!r}")


def parse_candidates(raw: str) -> list[dict[str, Any]]:
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        raise ValueError("no JSON list found in the model output")
    data = json.loads(m.group(0))
    if not isinstance(data, list):
        raise ValueError("model output is not a list")
    allowed = set(CONTENT_FIELDS)
    return [{k: v for k, v in item.items() if k in allowed} for item in data if isinstance(item, dict)]


def generate(paths: Paths, chunk_refs: list[str], *, count: int | None, extra: str | None,
             question: str | None = None) -> dict[str, Any]:
    cfg = load_config(paths)
    ctx = load_context(paths, need_source=True)
    if question:
        _, q = get_question(paths, question)
        chunk_refs = chunk_refs or (latest(q).get("sources") or {}).get("chunk_uids", [])
        count = 1
    chunks = resolve_chunks(ctx, chunk_refs)
    count = count or cfg.get("candidates_per_request", 2)
    prompt = build_prompt(chunks, count, extra)
    run_id = f"run-{now_iso().replace(':', '').replace('+0000', 'Z')}-{sha256_bytes(prompt.encode())[:8]}"
    run_dir = paths.generation / "runs" / run_id
    write_text(run_dir / "prompt.txt", prompt)
    write_json(run_dir / "sources.json", [{k: c[k] for k in ("uid", "id", "printed_pages", "text_sha256")}
                                          for c in chunks])
    try:
        raw, meta = _call_provider(cfg, prompt)
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        raise ToolError(f"provider call failed: {exc}") from exc
    meta |= {"run_id": run_id, "at": now_iso(), "import_id": ctx.source["import_id"]}
    write_text(run_dir / "output.txt", raw)
    write_json(run_dir / "meta.json", meta)
    try:
        candidates = parse_candidates(raw)
    except (ValueError, json.JSONDecodeError) as exc:
        raise ToolError(f"could not parse model output ({exc}); raw output kept in {run_dir}") from exc

    created = []
    for cand in candidates:
        base = _skeleton(ctx, chunks, cand.get("style") or "concept")
        # Source mapping and taxonomy always come from the import, never from the model.
        base.update({k: v for k, v in cand.items()
                     if k not in ("chapter", "section_ids", "priority", "study_reference", "sources", "type")})
        base["provenance"] = {"method": "llm"} | meta
        if question:
            path, q = get_question(paths, question)
            cur = latest(q)
            base["revision"] = cur["revision"] + 1
            q["revisions"].append(base)
            save_question(path, q)
            created.append(f"{question} r{base['revision']}")
        else:
            qid = next_question_id(paths)
            save_question(question_path(paths, qid), {"id": qid, "revisions": [base]})
            created.append(qid)
    return {"run_id": run_id, "created": created}

