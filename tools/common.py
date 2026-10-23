"""Shared paths, JSON I/O and small helpers for the offline tools.

Only the Python standard library is used, so the tools run anywhere Python 3.10+
is installed.
"""
from __future__ import annotations

import datetime as _dt
import hashlib
import json
import os
import re
import sys
import tempfile
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

REPO_ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Paths:
    """All repository locations. Tests construct one around a temporary directory."""

    root: Path

    # Version-controlled, original content
    @property
    def content(self) -> Path:
        return self.root / "content"

    @property
    def questions(self) -> Path:
        return self.content / "questions"

    @property
    def glossary_file(self) -> Path:
        return self.content / "glossary" / "terms.json"

    @property
    def chapters_file(self) -> Path:
        return self.content / "chapters" / "chapters.json"

    @property
    def topics_file(self) -> Path:
        return self.content / "chapters" / "topics.json"

    @property
    def templates_file(self) -> Path:
        return self.content / "visuals" / "templates.json"

    @property
    def config(self) -> Path:
        return self.root / "config"

    # Private: never committed, never deployed
    @property
    def private(self) -> Path:
        return self.root / "private"

    @property
    def imported(self) -> Path:
        return self.private / "imported"

    @property
    def generation(self) -> Path:
        return self.private / "generation"

    @property
    def reviews(self) -> Path:
        return self.private / "reviews"

    @property
    def preview(self) -> Path:
        return self.private / "preview"

    # Public
    @property
    def web(self) -> Path:
        return self.root / "web"

    @property
    def dist(self) -> Path:
        return self.root / "dist"


PATHS = Paths(REPO_ROOT)


def paths_from_env() -> Paths:
    """Allow tests and CI to point the CLI at another tree with RADIOQUIZ_ROOT."""
    root = os.environ.get("RADIOQUIZ_ROOT")
    return Paths(Path(root).resolve()) if root else PATHS


class ToolError(Exception):
    """An expected failure with a message for the operator (exit status 2)."""


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path) -> Any:
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise ToolError(f"{path}: invalid JSON: {exc}") from exc


def read_jsonl(path: Path) -> list[Any]:
    rows = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ToolError(f"{path}:{lineno}: invalid JSON line: {exc}") from exc
    return rows


def dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2) + "\n"


def write_json(path: Path, data: Any) -> None:
    """Write atomically so an interrupted run never leaves a half-written file."""
    write_text(path, dumps(data))


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(text)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def append_jsonl(path: Path, row: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def canonical_hash(data: Any) -> str:
    """Hash of a JSON value independent of key order and formatting."""
    blob = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256_bytes(blob.encode("utf-8"))


_SLUG_MAP = str.maketrans({"æ": "ae", "ø": "o", "å": "a", "Æ": "ae", "Ø": "o", "Å": "a"})


def slugify(text: str, max_len: int = 48) -> str:
    text = text.translate(_SLUG_MAP)
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return text[:max_len].strip("-") or "x"


def eprint(*args: Any) -> None:
    print(*args, file=sys.stderr)


def words(text: str) -> list[str]:
    return re.findall(r"[0-9a-zA-ZæøåÆØÅéÉüÜöÖäÄ]+", text.lower())


def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"


def unique(seq: Iterable[Any]) -> list[Any]:
    seen = set()
    out = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out
