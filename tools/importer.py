"""Offline import of the digitization project's exports into private/imported/.

    python3 -m tools import --source "/path/to/digitization/output"

* The source directory is always given explicitly; nothing is hard-coded.
* The actual files are validated (see source_schema.py) before anything is written.
* Each distinct set of source files becomes an immutable snapshot
  private/imported/<import_id>/ (import_id is derived from the file hashes), so
  re-running on unchanged exports is a no-op.
* Changes against the previous snapshot (added/removed/changed/remapped chunks and
  pages) are recorded in diff.json, and question revisions that cite affected chunks
  get a `source_changed` flag. Their content is never rewritten.
* Everything stays under private/, which is git-ignored and never published.
"""
from __future__ import annotations

import re
import shutil
from pathlib import Path
from typing import Any

from . import structure
from .common import (
    Paths, ToolError, canonical_hash, now_iso, read_json, read_jsonl, sha256_bytes, sha256_file,
    write_json, write_text,
)
from .source_schema import (
    CHAPTER_FIELDS, CHUNK_FIELDS, FLAG_FIELDS, MANIFEST_FIELDS, PAGE_FIELDS, RELIABLE_PAGE_STATUSES,
    VISUAL_FIELDS, Diagnostics, check_object, check_records,
)

IMPORTER_VERSION = 1

# file name in source dir -> (key, required)
SOURCE_FILES = {
    "chunks.jsonl": ("chunks", True),
    "manifest.json": ("manifest", True),
    "visuals.jsonl": ("visuals", False),
    "review/qa.json": ("qa", False),
    "review/flags.jsonl": ("flags", False),
    "review/corrections.jsonl": ("corrections", False),
    "qa_report.md": ("qa_report", False),
}

# review_reasons in chunks that make OCR'd content unsafe to rely on without a human check
OCR_HAZARD_REASONS = {
    "equation", "numeric_low_conf", "low_ocr_confidence", "subscript_garbled",
    "sign_ambiguous", "possible_ohm", "table",
}
PRINTED_PAGE_RE = re.compile(r"^\d{1,2}-\d{1,3}$")


def _load_sources(source: Path, diag: Diagnostics) -> dict[str, Any]:
    if not source.is_dir():
        raise ToolError(f"source directory not found: {source}")
    data: dict[str, Any] = {"_files": {}}
    for rel, (key, required) in SOURCE_FILES.items():
        path = source / rel
        if not path.exists():
            (diag.errors if required else diag.warnings).append(
                f"{rel}: not found" + ("" if required else " (optional; related checks are skipped)"))
            continue
        data["_files"][rel] = {"sha256": sha256_file(path), "bytes": path.stat().st_size}
        try:
            if rel.endswith(".jsonl"):
                data[key] = read_jsonl(path)
            elif rel.endswith(".json"):
                data[key] = read_json(path)
            else:
                data[key] = path.read_text(encoding="utf-8")
        except ToolError as exc:
            diag.errors.append(str(exc))
    return data


def validate_sources(data: dict[str, Any], diag: Diagnostics) -> None:
    chunks = data.get("chunks")
    manifest = data.get("manifest")
    if chunks is not None:
        check_records("chunks.jsonl", chunks, CHUNK_FIELDS, diag)
    if manifest is not None:
        check_object("manifest.json", manifest, MANIFEST_FIELDS, diag)
        if isinstance(manifest, dict):
            if isinstance(manifest.get("pages"), list):
                check_records("manifest.pages", manifest["pages"], PAGE_FIELDS, diag)
            if isinstance(manifest.get("chapters"), list):
                check_records("manifest.chapters", manifest["chapters"], CHAPTER_FIELDS, diag)
    if data.get("visuals") is not None:
        check_records("visuals.jsonl", data["visuals"], VISUAL_FIELDS, diag)
    if data.get("flags") is not None:
        check_records("review/flags.jsonl", data["flags"], FLAG_FIELDS, diag)
    if not diag.ok:
        return

    # Semantic checks that only make sense once the shape is right.
    uids = [c["uid"] for c in chunks]
    if len(set(uids)) != len(uids):
        diag.errors.append("chunks.jsonl: duplicate 'uid' values; chunk identity would be ambiguous")
    pages = {p["pdf_page"]: p for p in manifest["pages"]}
    printed = {p.get("printed_page") for p in manifest["pages"]}
    for c in chunks:
        for pp in c["printed_pages"]:
            if not isinstance(pp, str) or not PRINTED_PAGE_RE.match(pp):
                diag.warnings.append(f"chunk {c['id']}: printed page {pp!r} is not in 'chapter-page' form")
            elif pp not in printed:
                diag.warnings.append(f"chunk {c['id']}: printed page {pp} not found in manifest")
        for p in c["pdf_pages"]:
            if p not in pages:
                diag.errors.append(f"chunk {c['id']}: PDF page {p} not in manifest")
    if not any("marked_important" in c for c in chunks):
        diag.warnings.append("chunks.jsonl: no 'marked_important' field; exam-priority markers unavailable")
    if any(c.get("marked_important") and "[!]" not in c["text"] for c in chunks):
        diag.info.append(
            "chunks.jsonl: some chunks are marked_important without a '[!]' paragraph marker; "
            "treated as inherited from a heading or illustration marker (rule documented on printed page 1-2)")


def _page_reliability(manifest: dict[str, Any]) -> dict[int, dict[str, Any]]:
    conflicts = {i.get("pdf_page") for i in manifest.get("page_number_issues", []) if isinstance(i, dict)}
    out = {}
    for p in manifest["pages"]:
        status = p.get("printed_page_status", "unknown")
        reasons = []
        if status not in RELIABLE_PAGE_STATUSES:
            reasons.append(f"printed_page_status={status}")
        if p["pdf_page"] in conflicts:
            reasons.append("page_number_conflict")
        if not p.get("printed_page"):
            reasons.append("no_printed_page")
        out[p["pdf_page"]] = {
            "pdf_page": p["pdf_page"],
            "printed_page": p.get("printed_page"),
            "printed_page_status": status,
            "printed_page_reliable": not reasons,
            "uncertainty": reasons,
            "source_file": p.get("source_file"),
            "source_sha256": p.get("source_sha256"),
            "chapter": p.get("chapter"),
        }
    return out


def normalize(data: dict[str, Any], reg: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    manifest = data["manifest"]
    chunks = data["chunks"]
    pages = _page_reliability(manifest)
    flags_by_element: dict[str, list[dict[str, Any]]] = {}
    for f in data.get("flags") or []:
        if f.get("element"):
            flags_by_element.setdefault(f["element"], []).append(
                {k: f.get(k) for k in ("rule", "severity", "token", "detail")})

    # Sections in reading order, from chunk metadata (what questions actually cite).
    sections: list[dict[str, Any]] = []
    for c in chunks:
        key = (c["chapter_number"], c.get("section"))
        if not sections or (sections[-1]["chapter"], sections[-1]["ocr_title"]) != key:
            ordinal = sum(1 for s in sections if s["chapter"] == key[0])
            sections.append({
                "chapter": key[0], "ordinal": ordinal, "ocr_title": key[1],
                "first_chunk_uid": c["uid"], "chunk_uids": [], "printed_pages": [],
                "marked_important": False,
            })
        sec = sections[-1]
        sec["chunk_uids"].append(c["uid"])
        for pp in c["printed_pages"]:
            if pp not in sec["printed_pages"]:
                sec["printed_pages"].append(pp)
        sec["marked_important"] = sec["marked_important"] or bool(c.get("marked_important"))

    mapping, log = structure.assign_section_ids(reg, sections)
    chunk_section: dict[str, str] = {}
    for sec in sections:
        for uid in sec["chunk_uids"]:
            chunk_section[uid] = mapping[(sec["chapter"], sec["ordinal"])]

    norm_chunks = []
    for c in chunks:
        reasons = list(c.get("review_reasons") or [])
        page_issues = sorted({u for p in c["pdf_pages"] for u in pages[p]["uncertainty"]})
        ocr_flags = [f for e in c.get("element_ids") or [] for f in flags_by_element.get(e, [])]
        paragraph_markers = c["text"].count("[!]")
        marked = bool(c.get("marked_important"))
        norm_chunks.append({
            "uid": c["uid"],
            "id": c["id"],
            "chapter": c["chapter_number"],
            "section_id": chunk_section[c["uid"]],
            "section_ocr": c.get("section"),
            "subsections_ocr": c.get("subsections") or [],
            "printed_pages": c["printed_pages"],
            "pdf_pages": c["pdf_pages"],
            "source_files": c.get("source_files") or [],
            "text_sha256": sha256_bytes(c["text"].encode("utf-8")),
            "char_count": len(c["text"]),
            "marked_important": marked,
            # The export records the marker per chunk but not where it came from.
            "marked_via": ("paragraph_marker" if paragraph_markers
                           else "inherited_or_illustration" if marked else None),
            "paragraph_markers": paragraph_markers,
            "requires_visual_context": bool(c.get("requires_visual_context")),
            "visual_elements": c.get("visual_elements") or [],
            "figure_references": c.get("figure_references") or [],
            "review_reasons": reasons,
            "ocr_hazards": sorted(set(reasons) & OCR_HAZARD_REASONS),
            "ocr_flags": ocr_flags,
            "has_unverified_equation": "[EQUATION" in c["text"] or "equation" in reasons,
            "page_uncertainty": page_issues,
            "printed_pages_reliable": not page_issues,
            "text": c["text"],
        })

    chapters = []
    for ch in manifest["chapters"]:
        chapters.append({
            "number": ch["chapter"],
            "title": ch["title"],
            "pdf_pages": ch.get("pdf_pages"),
            "printed_pages": ch.get("printed_pages"),
        })
        entry = structure.chapter_entry(reg, ch["chapter"])
        if entry is not None:
            if entry.get("title") is None:
                entry["title"] = ch["title"]
                entry["title_status"] = "proposed"
            elif entry.get("title_key") and entry["title_key"] != structure.heading_key(ch["title"]):
                log.append(f"chapter {ch['chapter']}: OCR title changed to {ch['title']!r}; curated title kept")
            entry["title_key"] = structure.heading_key(ch["title"])
            entry["scanned"] = True
            entry["printed_pages"] = ch.get("printed_pages")

    visuals = [
        {k: v.get(k) for k in ("id", "type", "pdf_page", "printed_page", "image", "caption", "status",
                               "chapter", "section")}
        for v in data.get("visuals") or []
    ]
    norm = {
        "importer_version": IMPORTER_VERSION,
        "document": manifest.get("document", {}),
        "numbering_note": manifest.get("numbering_note"),
        "chapters": chapters,
        "pages": list(pages.values()),
        "chunks": norm_chunks,
        "visuals": visuals,
        "qa_status": (data.get("qa") or {}).get("status"),
    }
    return norm, log


def diff_imports(old: dict[str, Any] | None, new: dict[str, Any]) -> dict[str, Any]:
    if old is None:
        return {"previous_import": None, "added": [c["uid"] for c in new["chunks"]], "removed": [],
                "changed": [], "remapped": [], "pages_remapped": []}
    o = {c["uid"]: c for c in old["chunks"]}
    n = {c["uid"]: c for c in new["chunks"]}
    changed, remapped = [], []
    for uid in o.keys() & n.keys():
        if o[uid]["text_sha256"] != n[uid]["text_sha256"]:
            changed.append(uid)
        fields = [f for f in ("chapter", "section_id", "printed_pages", "pdf_pages", "marked_important",
                              "printed_pages_reliable") if o[uid].get(f) != n[uid].get(f)]
        if fields:
            remapped.append({"uid": uid, "fields": fields,
                             "old": {f: o[uid].get(f) for f in fields},
                             "new": {f: n[uid].get(f) for f in fields}})
    op = {p["source_sha256"]: p for p in old["pages"] if p.get("source_sha256")}
    pages_remapped = []
    for p in new["pages"]:
        prev = op.get(p.get("source_sha256"))
        if prev and (prev["printed_page"], prev["pdf_page"]) != (p["printed_page"], p["pdf_page"]):
            pages_remapped.append({"source_file": p["source_file"],
                                   "old": [prev["pdf_page"], prev["printed_page"]],
                                   "new": [p["pdf_page"], p["printed_page"]]})
    return {
        "added": sorted(n.keys() - o.keys()),
        "removed": sorted(o.keys() - n.keys()),
        "changed": sorted(changed),
        "remapped": sorted(remapped, key=lambda r: r["uid"]),
        "pages_remapped": pages_remapped,
    }


def current_import_id(paths: Paths) -> str | None:
    cur = paths.imported / "current.json"
    return read_json(cur)["import_id"] if cur.exists() else None


def load_import(paths: Paths, import_id: str | None = None) -> dict[str, Any] | None:
    import_id = import_id or current_import_id(paths)
    if not import_id:
        return None
    path = paths.imported / import_id / "normalized.json"
    if not path.exists():
        raise ToolError(f"import {import_id} is recorded as current but {path} is missing")
    data = read_json(path)
    data["import_id"] = import_id
    return data


def flag_affected_questions(paths: Paths, diff: dict[str, Any], import_id: str) -> list[str]:
    """Add a source_changed flag to revisions citing affected chunks. Content is untouched."""
    from .questions import iter_question_files, load_question, save_question

    affected_uids: dict[str, str] = {}
    for uid in diff["removed"]:
        affected_uids[uid] = "removed"
    for uid in diff["changed"]:
        affected_uids[uid] = "text_changed"
    for r in diff["remapped"]:
        affected_uids.setdefault(r["uid"], "remapped:" + ",".join(r["fields"]))
    touched = []
    if not affected_uids:
        return touched
    for path in iter_question_files(paths):
        q = load_question(path)
        changed_file = False
        for rev in q["revisions"]:
            if rev.get("status") in ("rejected", "retired"):
                continue
            uids = (rev.get("sources") or {}).get("chunk_uids", [])
            hits = {u: affected_uids[u] for u in uids if u in affected_uids}
            if not hits:
                continue
            flag = {"type": "source_changed", "import_id": import_id, "at": now_iso(),
                    "chunks": hits, "resolved": False}
            if not any(f.get("type") == "source_changed" and f.get("import_id") == import_id
                       for f in rev.setdefault("flags", [])):
                rev["flags"].append(flag)
                changed_file = True
                touched.append(f"{q['id']} r{rev['revision']} ({rev.get('status')})")
        if changed_file:
            save_question(path, q)
    return touched


def _report(meta: dict[str, Any], diag: Diagnostics, norm: dict[str, Any], diff: dict[str, Any],
            log: list[str], touched: list[str]) -> str:
    chunks = norm["chunks"]
    lines = [
        f"# Import {meta['import_id']}", "",
        f"- Imported: {meta['imported_at']}",
        f"- Source directory: `{meta['source_dir']}`",
        f"- Previous import: {meta.get('previous_import') or '—'}",
        f"- Chapters: {', '.join(str(c['number']) for c in norm['chapters'])}",
        f"- Pages: {len(norm['pages'])}; chunks: {len(chunks)}; visual elements: {len(norm['visuals'])}",
        f"- Chunks marked exam-important: {sum(c['marked_important'] for c in chunks)} "
        f"({sum(c['marked_via'] == 'paragraph_marker' for c in chunks)} with a paragraph marker)",
        f"- Chunks with OCR hazards: {sum(bool(c['ocr_hazards']) for c in chunks)}; "
        f"with unverified equations: {sum(c['has_unverified_equation'] for c in chunks)}",
        f"- Pages with uncertain printed numbers: "
        + (", ".join(f"PDF {p['pdf_page']} → {p['printed_page']} ({'; '.join(p['uncertainty'])})"
                     for p in norm["pages"] if not p["printed_page_reliable"]) or "none"),
        "", "## Changes since previous import", "",
        f"- added: {len(diff['added'])}, removed: {len(diff['removed'])}, text changed: {len(diff['changed'])}, "
        f"remapped: {len(diff['remapped'])}, pages remapped: {len(diff['pages_remapped'])}",
        f"- question revisions flagged for re-review: {len(touched)}",
    ]
    lines += [f"  - {t}" for t in touched]
    lines += ["", "## Structure log", ""] + [f"- {x}" for x in log or ["(no changes)"]]
    for title, items in (("Warnings", diag.warnings), ("Info", diag.info)):
        lines += ["", f"## {title}", ""] + [f"- {x}" for x in items or ["(none)"]]
    return "\n".join(lines) + "\n"


def run_import(paths: Paths, source: Path, *, dry_run: bool = False, force: bool = False,
               copy_figures: bool = True) -> dict[str, Any]:
    source = source.resolve()
    if paths.web.resolve() in source.parents or paths.dist.resolve() in source.parents:
        raise ToolError("refusing to import from a public directory (web/ or dist/)")
    diag = Diagnostics()
    data = _load_sources(source, diag)
    if diag.ok:
        validate_sources(data, diag)
    result: dict[str, Any] = {"diagnostics": diag, "dry_run": dry_run}
    if not diag.ok:
        result["status"] = "invalid"
        return result

    fingerprint = canonical_hash({k: v["sha256"] for k, v in sorted(data["_files"].items())}
                                 | {"importer_version": IMPORTER_VERSION})
    import_id = f"imp-{fingerprint[:12]}"
    result["import_id"] = import_id
    target = paths.imported / import_id
    previous_id = current_import_id(paths)
    if target.exists() and not force:
        result["status"] = "unchanged"
        if previous_id != import_id:
            write_json(paths.imported / "current.json", {"import_id": import_id, "selected_at": now_iso()})
            result["status"] = "reselected"
        return result

    reg = structure.load_registry(paths)
    norm, log = normalize(data, reg)
    previous = load_import(paths, previous_id) if previous_id and previous_id != import_id else None
    diff = diff_imports(previous, norm)
    diff["previous_import"] = previous_id if previous else None
    result.update(diff_summary={k: len(v) for k, v in diff.items() if isinstance(v, list)}, log=log)
    if dry_run:
        result["status"] = "dry_run"
        return result

    meta = {
        "import_id": import_id,
        "imported_at": now_iso(),
        "importer_version": IMPORTER_VERSION,
        "source_dir": str(source),
        "source_files": data["_files"],
        "source_processing": (data["manifest"].get("processing") or {}).get("config_sha256"),
        "previous_import": diff["previous_import"],
        "coverage": {"chapters": [c["number"] for c in norm["chapters"]],
                     "printed_pages": [p["printed_page"] for p in norm["pages"]]},
    }
    tmp = paths.imported / f".{import_id}.partial"
    if tmp.exists():
        shutil.rmtree(tmp)
    (tmp / "source").mkdir(parents=True)
    for rel in data["_files"]:
        dest = tmp / "source" / rel
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source / rel, dest)
    if copy_figures and (source / "figures").is_dir():
        shutil.copytree(source / "figures", tmp / "figures")
    write_json(tmp / "normalized.json", norm)
    write_json(tmp / "diff.json", diff)
    write_json(tmp / "import.json", meta)
    if target.exists():
        shutil.rmtree(target)
    tmp.rename(target)

    structure.save_registry(paths, reg)
    touched = flag_affected_questions(paths, diff, import_id) if previous else []
    write_text(target / "import_report.md", _report(meta, diag, norm, diff, log, touched))
    history_path = paths.imported / "index.json"
    history = read_json(history_path) if history_path.exists() else {"imports": []}
    history["imports"].append({k: meta[k] for k in ("import_id", "imported_at", "source_dir", "previous_import")})
    write_json(history_path, history)
    write_json(paths.imported / "current.json", {"import_id": import_id, "selected_at": now_iso()})
    result.update(status="imported", flagged=touched, report=str(target / "import_report.md"))
    return result
