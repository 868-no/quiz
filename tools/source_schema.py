"""Expected shape of the digitization project's exports.

This describes what was observed in the real exports (see docs/source-import.md),
not a contract the other project promises. Validation therefore separates:

* errors   - a field the importer relies on is missing or has the wrong type
             (the import stops; nothing is written);
* warnings - an optional field is missing, so some feature degrades
             (e.g. no exam markers, no OCR flags);
* info     - fields the importer does not know about (schema drift to look at).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# (field, accepted types, required)
_STR = (str,)
_INT = (int,)
_BOOL = (bool,)
_LIST = (list,)
_DICT = (dict,)
_OPT_STR = (str, type(None))

CHUNK_FIELDS: list[tuple[str, tuple, bool]] = [
    ("id", _STR, True),
    ("uid", _STR, True),
    ("chapter_number", _INT, True),
    ("text", _STR, True),
    ("printed_pages", _LIST, True),
    ("pdf_pages", _LIST, True),
    ("section", _OPT_STR, False),
    ("chapter", _STR, False),
    ("subsections", _LIST, False),
    ("source_files", _LIST, False),
    ("element_ids", _LIST, False),
    ("requires_visual_context", _BOOL, False),
    ("visual_elements", _LIST, False),
    ("figure_references", _LIST, False),
    ("review_required", _BOOL, False),
    ("review_reasons", _LIST, False),
    ("marked_important", _BOOL, False),
    ("char_count", _INT, False),
    ("overlap_element_ids", _LIST, False),
]

MANIFEST_FIELDS: list[tuple[str, tuple, bool]] = [
    ("pages", _LIST, True),
    ("chapters", _LIST, True),
    ("document", _DICT, False),
    ("numbering_note", _STR, False),
    ("page_count", _INT, False),
    ("page_number_issues", _LIST, False),
    ("inventory_issues", _LIST, False),
    ("counts", _DICT, False),
    ("processing", _DICT, False),
]

PAGE_FIELDS: list[tuple[str, tuple, bool]] = [
    ("pdf_page", _INT, True),
    ("printed_page", _OPT_STR, True),
    ("printed_page_status", _STR, False),
    ("printed_page_ocr_raw", _OPT_STR, False),
    ("source_file", _STR, False),
    ("source_sha256", _STR, False),
    ("chapter", (int, type(None)), False),
    ("chapter_title", _OPT_STR, False),
    ("sections_starting_here", _LIST, False),
    ("page_markdown", _STR, False),
    ("preprocessing", _DICT, False),
    ("ocr", _DICT, False),
    ("layout", _DICT, False),
    ("corrections", _INT, False),
    ("flags", _INT, False),
]

CHAPTER_FIELDS: list[tuple[str, tuple, bool]] = [
    ("chapter", _INT, True),
    ("title", _STR, True),
    ("pdf_pages", _LIST, False),
    ("printed_pages", _LIST, False),
    ("sections", _LIST, False),
]

VISUAL_FIELDS: list[tuple[str, tuple, bool]] = [
    ("id", _STR, True),
    ("type", _STR, True),
    ("pdf_page", _INT, False),
    ("printed_page", _OPT_STR, False),
    ("image", _OPT_STR, False),
    ("caption", _OPT_STR, False),
    ("status", _OPT_STR, False),
    ("chapter", (int, type(None)), False),
    ("section", _OPT_STR, False),
]

FLAG_FIELDS: list[tuple[str, tuple, bool]] = [
    ("pdf_page", _INT, False),
    ("element", _OPT_STR, False),
    ("rule", _STR, False),
    ("severity", _STR, False),
    ("token", _OPT_STR, False),
]

# Printed-page statuses that mean the number was read or set by a person.
RELIABLE_PAGE_STATUSES = {"ocr", "manual"}


@dataclass
class Diagnostics:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    info: list[str] = field(default_factory=list)

    def merge(self, other: "Diagnostics") -> None:
        self.errors += other.errors
        self.warnings += other.warnings
        self.info += other.info

    @property
    def ok(self) -> bool:
        return not self.errors


def check_records(
    name: str,
    records: list[Any],
    spec: list[tuple[str, tuple, bool]],
    diag: Diagnostics,
    max_examples: int = 3,
) -> None:
    """Validate a list of dicts and summarise problems per field, not per record."""
    known = {f for f, _, _ in spec}
    missing: dict[str, list[int]] = {}
    wrong_type: dict[str, list[int]] = {}
    unknown: dict[str, int] = {}
    for i, rec in enumerate(records):
        if not isinstance(rec, dict):
            diag.errors.append(f"{name}[{i}]: expected an object, got {type(rec).__name__}")
            continue
        for fname, types, _required in spec:
            if fname not in rec:
                missing.setdefault(fname, []).append(i)
            elif not isinstance(rec[fname], types) or (isinstance(rec[fname], bool) and bool not in types):
                wrong_type.setdefault(fname, []).append(i)
        for key in rec:
            if key not in known:
                unknown[key] = unknown.get(key, 0) + 1
    required = {f for f, _, r in spec if r}
    for fname, idx in missing.items():
        msg = f"{name}: field '{fname}' missing in {len(idx)}/{len(records)} record(s), e.g. #{idx[:max_examples]}"
        (diag.errors if fname in required else diag.warnings).append(msg)
    for fname, idx in wrong_type.items():
        msg = f"{name}: field '{fname}' has an unexpected type in {len(idx)} record(s), e.g. #{idx[:max_examples]}"
        (diag.errors if fname in required else diag.warnings).append(msg)
    for key, n in sorted(unknown.items()):
        diag.info.append(f"{name}: unknown field '{key}' in {n} record(s) (ignored)")


def check_object(name: str, obj: Any, spec: list[tuple[str, tuple, bool]], diag: Diagnostics) -> None:
    if not isinstance(obj, dict):
        diag.errors.append(f"{name}: expected a JSON object")
        return
    check_records(name, [obj], spec, diag)
