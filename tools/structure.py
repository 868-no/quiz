"""Chapter/section registry (content/chapters/chapters.json).

The registry owns the stable section identifiers. Imports only *add* chapters and
sections or annotate them; they never overwrite a curated title. A section title
is shown publicly only after a person has verified it (`title_status: verified`),
because OCR'd headings in the source are sometimes garbled or split across lines.
"""
from __future__ import annotations

import re
from typing import Any

from .common import Paths, ToolError, read_json, sha256_bytes, write_json

_ACRONYMS = {
    "AM", "FM", "SSB", "CW", "RF", "LO", "MF", "LF", "HF", "VHF", "UHF", "SHF", "FET", "LC", "LR",
    "RC", "RMS", "ALC", "SWR", "PLL", "DDS", "AB", "B", "C", "Q", "AGC", "IC", "DC", "AC",
    "ATU", "SDR", "DSP", "EMC", "EMK", "CEPT", "IARU", "NRRL", "NKOM", "ITU", "QSL", "QSO", "DX",
    "RTTY", "SSTV", "PSK", "FSK", "AFSK", "PEP", "ERP", "EIRP", "MUF", "LUF", "PTT", "VOX", "RIT",
    "BNC", "UTC", "CQ", "RST", "LED", "NPN", "PNP", "PN", "JFET", "MOSFET", "VFO", "BFO", "DMR",
    "APRS", "FT8", "WSPR", "RDS", "DAB", "TV", "GPS", "USB", "LSB", "AFC", "VSWR", "QRP", "QRO",
}
_PROPER = {"OHMS": "Ohms", "OHM": "Ohm", "YAGI": "Yagi", "UDA": "Uda"}
_UNITS = {"DB": "dB", "DBV": "dBV", "DBM": "dBm", "DBI": "dBi", "DBD": "dBd"}
_TRAILING_SPLIT = {"OG", "AV", "ELLER", "TIL", "ET", "EN", "FOR", "UTENFOR", "MED", "I", "SOM"}
_ALLOWED_CHARS = re.compile(r"^[A-ZÆØÅ0-9 ()\-–—,/:.?!]+$")
_VOWELS = set("AEIOUYÆØÅ")


def assess_ocr_title(title: str | None) -> list[str]:
    """Return reasons why an OCR'd heading may be unreliable (empty list = looks fine)."""
    if title is None:
        return ["no_heading"]
    issues = []
    t = title.strip()
    if not _ALLOWED_CHARS.match(t):
        issues.append("unexpected_characters")
    if t[:1] and not t[:1].isalnum():
        issues.append("leading_punctuation")
    if t[:1].islower():
        issues.append("leading_lowercase")
    tokens = re.findall(r"[A-ZÆØÅa-zæøå0-9]+", t)
    last = tokens[-1].upper() if tokens else ""
    if t.endswith(("-", "—", "–")) or last in _TRAILING_SPLIT:
        issues.append("possibly_split_heading")
    for tok in tokens:
        up = tok.upper()
        if up in _ACRONYMS or tok.isdigit():
            continue
        if len(tok) >= 2 and not (set(up) & _VOWELS):
            issues.append("implausible_word")
            break
    short_ok = _ACRONYMS | {"OG", "I", "PÅ", "AV", "EN", "ET", "TIL", "OM"}
    if len(tokens) >= 2 and sum(len(x) <= 2 and x.upper() not in short_ok for x in tokens) / len(tokens) > 0.5:
        issues.append("mostly_fragments")
    return sorted(set(issues))


def propose_title(ocr_title: str | None) -> str | None:
    """Sentence-case an all-caps heading as a *proposal* for a human to verify."""
    if not ocr_title:
        return None
    out = []
    for i, tok in enumerate(re.split(r"(\s+|[-–—/(),:])", ocr_title.strip())):
        if not tok or not re.search(r"[A-ZÆØÅa-zæøå]", tok):
            out.append(tok)
            continue
        up = tok.upper()
        core = up.rstrip("?!.")
        if core in _ACRONYMS and (len(core) > 1 or "".join(out).strip()):
            out.append(up)
        elif core in _UNITS:
            out.append(_UNITS[core] + tok[len(core):])
        elif up in _PROPER:
            out.append(_PROPER[up])
        elif not "".join(out).strip():
            out.append(tok[:1].upper() + tok[1:].lower())
        else:
            out.append(tok.lower())
    return re.sub(r"\s+", " ", "".join(out)).strip()


def norm_title(title: str | None) -> str:
    return re.sub(r"\s+", " ", (title or "").strip().upper())


def empty_registry(total_chapters: int | None = None) -> dict[str, Any]:
    return {
        "book": {
            "title": None,
            "total_chapters": total_chapters,
            "total_chapters_source": None,
        },
        "chapters": [],
    }


def load_registry(paths: Paths) -> dict[str, Any]:
    if not paths.chapters_file.exists():
        return empty_registry()
    reg = read_json(paths.chapters_file)
    if not isinstance(reg, dict) or not isinstance(reg.get("chapters"), list):
        raise ToolError(f"{paths.chapters_file}: expected an object with a 'chapters' list")
    return reg


def save_registry(paths: Paths, reg: dict[str, Any]) -> None:
    reg["chapters"].sort(key=lambda c: c["number"])
    write_json(paths.chapters_file, reg)


def chapter_entry(reg: dict[str, Any], number: int) -> dict[str, Any] | None:
    return next((c for c in reg["chapters"] if c["number"] == number), None)


def all_sections(reg: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {s["id"]: dict(s, chapter=c["number"]) for c in reg["chapters"] for s in c.get("sections", [])}


def heading_key(title: str | None) -> str | None:
    """A hash of the OCR'd heading, used to recognise a section on re-import without
    storing book text in the repository."""
    return sha256_bytes(norm_title(title).encode("utf-8"))[:16] if title else None


def ocr_titles(source: dict[str, Any] | None) -> dict[str, str | None]:
    """Section id -> OCR'd heading, read from the PRIVATE import (never stored in content/)."""
    out: dict[str, str | None] = {}
    for c in (source or {}).get("chunks", []):
        out.setdefault(c["section_id"], c.get("section_ocr"))
    return out


def _heading_norm(t: str | None) -> str:
    return re.sub(r"[^A-ZÆØÅ0-9]+", " ", (t or "").upper()).strip()


def book_heading_titles(reg: dict[str, Any], chunks: list[dict[str, Any]]) -> list[str]:
    """Give sections their heading from the chapter PDFs (exact text from the PDF
    bookmarks, not OCR). Chapters cited from the PDFs get their headings as is; in
    scanned chapters an OCR heading is replaced when it matches a PDF heading of the
    same chapter closely. Curated (already verified) titles are never touched.
    Returns a log (private: it quotes headings)."""
    import difflib

    log: list[str] = []
    pdf_heads: dict[int, list[str]] = {}
    for c in chunks:
        if c.get("collection") != "book":
            continue
        for h in [c.get("section_ocr")] + list(c.get("subsections_ocr") or []):
            if h and h not in pdf_heads.setdefault(c["chapter"], []):
                pdf_heads[c["chapter"]].append(h)
    first: dict[str, dict[str, Any]] = {}
    for c in chunks:
        if c.get("section_id") and c["section_id"] not in first:
            first[c["section_id"]] = c
    for ch in reg["chapters"]:
        for sec in ch.get("sections", []):
            c = first.get(sec["id"])
            if c is None or sec.get("title_status") == "verified" or not c.get("section_ocr"):
                continue
            heading = None
            if c.get("collection") == "book":
                heading = c["section_ocr"]
            else:
                cands = pdf_heads.get(ch["number"], [])
                best = max(cands, key=lambda h: difflib.SequenceMatcher(
                    None, _heading_norm(c["section_ocr"]), _heading_norm(h)).ratio(), default=None)
                if best and difflib.SequenceMatcher(None, _heading_norm(c["section_ocr"]), _heading_norm(best)).ratio() >= 0.85:
                    heading = best
            if heading:
                joined = re.sub(r"(\w)- (?!(?:OG|ELLER)\b)(\w)", r"\1\2", heading)
                sec["title"] = propose_title(joined.lstrip("* ").strip())
                sec["title_status"] = "verified"
                sec["title_source"] = "book-pdf"
                log.append(f"section {sec['id']}: heading from the PDF: {sec['title']!r}")
    return log


def assign_section_ids(
    reg: dict[str, Any], sections: list[dict[str, Any]]
) -> tuple[dict[tuple[int, int], str], list[str]]:
    """Map imported sections (in reading order) to registry ids, creating new ones.

    `sections` items: {chapter, ordinal, ocr_title, first_chunk_uid, chunk_uids, printed_pages}.
    The registry is version-controlled, so it stores no heading text: ids are neutral
    (`s2-07`), headings are matched by hash, and a section only gets a `title` when a
    person verifies it. Matching order: same chapter + same heading hash, then shared
    chunk uid (the heading was re-OCR'd differently). Returns ({(chapter, ordinal): id}, log).
    The log mentions OCR headings; it is only written to the private import report.
    """
    log: list[str] = []
    mapping: dict[tuple[int, int], str] = {}
    used: set[str] = set()
    for sec in sections:
        ch = chapter_entry(reg, sec["chapter"])
        if ch is None:
            ch = {"number": sec["chapter"], "title": None, "title_status": "proposed", "scanned": True, "sections": []}
            reg["chapters"].append(ch)
        existing = ch.setdefault("sections", [])
        key = heading_key(sec["ocr_title"])
        match = next((s for s in existing if s["id"] not in used and s.get("heading_key") == key), None)
        if match is None:
            match = next(
                (s for s in existing if s["id"] not in used and set(s.get("chunk_uids", [])) & set(sec["chunk_uids"])),
                None,
            )
            if match is not None:
                log.append(f"section {match['id']}: OCR heading changed to {sec['ocr_title']!r}; id kept")
                match["heading_key"] = key
                if match.get("title_status") == "verified":
                    match.setdefault("notes", []).append("OCR heading changed after verification; re-check")
        if match is None:
            nums = [int(x["id"].rsplit("-", 1)[1]) for x in existing if re.fullmatch(r"s\d+-\d+", x["id"])]
            new_id = f"s{sec['chapter']}-{(max(nums) + 1 if nums else 1):02d}"
            match = {"id": new_id, "title": None, "title_status": "proposed", "heading_key": key}
            existing.append(match)
            log.append(f"section {new_id}: added ({sec['ocr_title']!r})")
        issues = assess_ocr_title(sec["ocr_title"])
        match["ocr_quality"] = "suspect" if issues else "ok"
        match["ocr_issues"] = issues
        match["printed_pages"] = sec["printed_pages"]
        match["chunk_uids"] = sec["chunk_uids"]
        match["marked_important"] = sec["marked_important"]
        match.pop("missing_from_import", None)
        mapping[(sec["chapter"], sec["ordinal"])] = match["id"]
        used.add(match["id"])
    # Sections that disappeared from the source are kept (questions may cite them) but flagged.
    for ch in reg["chapters"]:
        for s in ch.get("sections", []):
            if s["id"] not in used and ch.get("scanned"):
                if not s.get("missing_from_import"):
                    log.append(f"section {s['id']}: no longer present in the import; kept and flagged")
                s["missing_from_import"] = True
    return mapping, log
