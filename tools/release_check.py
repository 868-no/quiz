"""Release check: scan a deployable directory for anything that must not be public.

    python3 -m tools release-check [dist]

Checks
* only web file types (no images from the source, PDFs, JSONL, Markdown, archives);
  PNG only for the site's own icons and preview image in brand/ (small files);
* no oversized files;
* no symlinks;
* no private markers (chunk ids/uids, private paths, OCR annotations, review data);
* bank.json uses exactly the public allowlisted fields and is a production bank;
* sw.js (offline copy) lists exactly the files of this build, with a matching version;
* absolute URLs in index.html (canonical, link previews) use the configured domain;
* no 8-word passage shared with the imported textbook text (when an import exists).
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from .common import Paths, words

ALLOWED_SUFFIXES = {".html", ".css", ".js", ".mjs", ".json", ".svg", ".txt", ".ico", ".webmanifest", ".woff2"}
HOST_FILES = {"CNAME", ".nojekyll"}  # GitHub Pages control files, checked separately
MAX_BYTES = 1_500_000
BRAND_PNG_DIR = "brand"         # the only place PNG files may be: app icons, link preview image
BRAND_PNG_MAX_BYTES = 300_000
FORBIDDEN_PATTERNS = [
    (re.compile(r"chunk-\d{6}"), "source chunk id"),
    (re.compile(r"\"(uid|chunk_uids|source_files|pdf_pages?|review_log|provenance|approval|sources|"
                r"import_id|text_sha256|ocr_hazards|learning_objective|checks)\""), "private field name"),
    (re.compile(r"private/|figures/[0-9a-f]{8}-\d+|img\d+\.jpe?g", re.I), "private path"),
    (re.compile(r"\[(EQUATION|FIGURE|TABLE|FOOTNOTE)\b"), "OCR annotation"),
    # the public site does not describe how the source material was obtained
    (re.compile(r"skann|scann|\bscan|\bOCR\b|digitali[sz]", re.I), "mention of scanning/OCR"),
    (re.compile(r"curriculum\.(pdf|md)|chunks\.jsonl|visuals\.jsonl|manifest\.json"), "source export file name"),
    (re.compile(r"(api[_-]?key|secret|password)\s*[:=]\s*\S{8,}", re.I), "credential"),
    (re.compile(r"\bsk-[A-Za-z0-9]{20,}"), "credential"),
]
BANK_TOP = {"schema", "mode", "built_at", "bank_id", "book", "site", "chapters", "sections", "topics", "glossary",
            "templates", "questions"}
QUESTION_KEYS = {"id", "rev", "chapter", "sections", "topics", "difficulty", "style", "priority", "context",
                 "stem", "options", "correct", "explanation", "visual", "glossary_after_answer", "ref"}
SHINGLE = 8
SW_FILE = "sw.js"
SW_PLACEHOLDER = "const PRECACHE = null; // filled in by `python3 -m tools publish`"
SW_LINE = re.compile(r"^const PRECACHE = (.*?);(?: //.*)?$", re.M)


def precache(root: Path) -> dict[str, Any]:
    """The offline copy of a build: every site file except the host files and sw.js itself,
    and a version that changes whenever any of them does."""
    files = sorted(str(f.relative_to(root).as_posix()) for f in root.rglob("*")
                   if f.is_file() and str(f.relative_to(root)) not in HOST_FILES | {SW_FILE})
    h = hashlib.sha256()
    for rel in files:
        h.update(rel.encode() + b"\0" + hashlib.sha256((root / rel).read_bytes()).digest())
    return {"version": h.hexdigest()[:16], "files": files}


def _check_site_urls(root: Path, paths: Paths) -> list[str]:
    """Absolute site URLs in index.html (canonical, link previews) must use the configured domain."""
    index = root / "index.html"
    cfg = paths.config / "site.json"
    if not index.exists() or not cfg.exists():
        return []
    cname = json.loads(cfg.read_text(encoding="utf-8")).get("cname")
    if not cname:
        return []
    errors = []
    for url in re.findall(r'(?:href|content)="(https?://[^"]+)"', index.read_text(encoding="utf-8")):
        host = re.match(r"https?://([^/]+)", url).group(1)
        if host != cname:
            errors.append(f"index.html: {url} does not use the site's domain {cname} (config/site.json)")
        elif not url.startswith("https://"):
            errors.append(f"index.html: {url} must use https")
    return errors


def _check_sw(root: Path, expect_mode: str) -> list[str]:
    sw = root / SW_FILE
    if not sw.exists():
        return [f"{SW_FILE} is missing (offline copy)"] if expect_mode == "production" else []
    m = SW_LINE.search(sw.read_text(encoding="utf-8"))
    if not m:
        return [f"{SW_FILE}: no PRECACHE line"]
    try:
        listed = json.loads(m.group(1))
    except json.JSONDecodeError:
        return [f"{SW_FILE}: PRECACHE is not valid JSON"]
    if listed is None:
        return [f"{SW_FILE}: PRECACHE was not filled in by publish"] if expect_mode == "production" else []
    want = precache(root)
    errors = []
    if not isinstance(listed, dict) or sorted(listed.get("files") or []) != want["files"]:
        missing = sorted(set(want["files"]) - set((listed or {}).get("files") or []))
        extra = sorted(set((listed or {}).get("files") or []) - set(want["files"]))
        errors.append(f"{SW_FILE}: file list does not match the build (missing {missing}, extra {extra})")
    elif listed.get("version") != want["version"]:
        errors.append(f"{SW_FILE}: version does not match the files (stale offline copy)")
    return errors


def _source_shingles(paths: Paths) -> set[tuple[str, ...]] | None:
    from .checks import source_text_for_similarity
    from .importer import load_import
    try:
        src = load_import(paths)
    except Exception:
        return None
    if not src:
        return None
    out: set[tuple[str, ...]] = set()
    for c in src["chunks"]:
        w = words(source_text_for_similarity(c["text"]))
        out |= {tuple(w[i:i + SHINGLE]) for i in range(len(w) - SHINGLE + 1)}
    return out


def release_check(root: Path, paths: Paths, *, expect_mode: str = "production") -> dict[str, Any]:
    errors: list[str] = []
    notes: list[str] = []
    if not root.is_dir():
        return {"errors": [f"{root} does not exist"], "notes": notes}
    root_res = root.resolve()
    if paths.private.resolve() in root_res.parents or root_res == paths.private.resolve():
        if expect_mode == "production":
            errors.append(f"{root} is inside private/; it must not be deployed")
    shingles = _source_shingles(paths)
    if shingles is None:
        notes.append("no source import available: textbook-overlap scan skipped")
    files = 0
    for f in sorted(root.rglob("*")):
        rel = f.relative_to(root)
        if f.is_symlink():
            errors.append(f"{rel}: symlinks are not allowed")
            continue
        if f.is_dir():
            continue
        files += 1
        if str(rel) in HOST_FILES:
            if f.name == "CNAME" and not re.fullmatch(r"[a-z0-9.-]+\n?", f.read_text(encoding="utf-8")):
                errors.append("CNAME: must contain a single host name")
            elif f.name == ".nojekyll" and f.stat().st_size:
                errors.append(".nojekyll: must be empty")
            continue
        if f.suffix.lower() == ".png":
            if rel.parts[0] != BRAND_PNG_DIR or len(rel.parts) != 2:
                errors.append(f"{rel}: PNG files are only allowed directly in {BRAND_PNG_DIR}/ (site icons)")
            elif f.stat().st_size > BRAND_PNG_MAX_BYTES:
                errors.append(f"{rel}: {f.stat().st_size} bytes is larger than {BRAND_PNG_MAX_BYTES} for an icon")
            elif not f.read_bytes().startswith(b"\x89PNG\r\n\x1a\n"):
                errors.append(f"{rel}: not a PNG file")
            continue
        if f.suffix.lower() not in ALLOWED_SUFFIXES:
            errors.append(f"{rel}: file type {f.suffix or '(none)'} is not allowed in the public build")
            continue
        size = f.stat().st_size
        if size > MAX_BYTES:
            errors.append(f"{rel}: {size} bytes is larger than {MAX_BYTES}")
        try:
            text = f.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            if f.suffix != ".woff2":
                errors.append(f"{rel}: not UTF-8 text")
            continue
        for rx, what in FORBIDDEN_PATTERNS:
            m = rx.search(text)
            if m:
                errors.append(f"{rel}: contains {what} ({m.group(0)[:40]!r})")
        if shingles:
            w = words(text)
            for i in range(len(w) - SHINGLE + 1):
                if tuple(w[i:i + SHINGLE]) in shingles:
                    errors.append(f"{rel}: shares an 8-word passage with the textbook: "
                                  f"'{' '.join(w[i:i + SHINGLE])}'")
                    break
    bank_path = root / "data" / "bank.json"
    if not bank_path.exists():
        errors.append("data/bank.json is missing")
    else:
        try:
            bank = json.loads(bank_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            errors.append(f"data/bank.json: invalid JSON ({exc})")
        else:
            if set(bank) != BANK_TOP:
                errors.append(f"data/bank.json: unexpected top-level keys {sorted(set(bank) ^ BANK_TOP)}")
            if bank.get("mode") != expect_mode:
                errors.append(f"data/bank.json: mode is {bank.get('mode')!r}, expected {expect_mode!r}")
            allowed = QUESTION_KEYS | ({"preview_status"} if expect_mode == "preview" else set())
            for q in bank.get("questions", []):
                if not QUESTION_KEYS <= set(q) <= allowed:
                    errors.append(f"data/bank.json: question {q.get('id')} has non-public keys "
                                  f"{sorted(set(q) ^ allowed)}")
                ids = [o.get("id") for o in q.get("options", [])]
                if len(q.get("correct", [])) != 1 or q["correct"][0] not in ids:
                    errors.append(f"data/bank.json: question {q.get('id')} has an invalid correct key")
    errors += _check_sw(root, expect_mode)
    errors += _check_site_urls(root, paths)
    notes.append(f"{files} file(s) scanned")
    return {"errors": errors, "notes": notes}
