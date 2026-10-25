"""Validation and plain-text extraction for structured rich text.

The same format is rendered by web/js/render/richtext.js. It is deliberately
small and contains no HTML: every node type is allowlisted.

Rich text  := string | [Block, ...]
Block      := string                       (a paragraph of plain text)
            | [Inline, ...]                (a paragraph)
            | {"steps": [Paragraph, ...]}  (numbered working, e.g. a calculation)
            | {"note": Paragraph}          (an aside, e.g. idealised assumptions)
Inline     := string
            | {"term": "<glossary id>", "text": "<visible form>"}
            | {"math": [MathToken, ...]}
            | {"q": <number>, "u": "<unit>", "digits"?: <int>, "approx"?: bool}
            | {"em": "<text>"} | {"strong": "<text>"}
MathToken  := "<identifier/number/operator>" | {"q":…} | {"frac": [[…], […]]}
            | {"sqrt": […]} | {"paren": […]} | {"text": "<upright text>"} | {"unit": "<unit>"}
"""
from __future__ import annotations

import re
from typing import Any, Callable, Iterator

UNITS = {
    "V", "mV", "µV", "kV", "A", "mA", "µA", "mΩ", "Ω", "kΩ", "MΩ", "W", "mW", "kW", "Hz", "kHz", "MHz", "GHz",
    "F", "mF", "µF", "nF", "pF", "H", "mH", "µH", "nH", "s", "ms", "µs", "ns", "m", "cm", "mm", "km",
    "dB", "dBm", "dBW", "%", "°", "°C", "C", "J", "Wh", "kWh", "Ah", "mAh", "h", "min", "S", "mS",
    "V/m", "mV/m", "µV/m",
}
OPERATORS = {"=", "≈", "+", "−", "-", "·", "×", "/", "(", ")", "≠", "<", ">", "≤", "≥", "→", ",", "…", "%", "²", "³", "±"}
# identifier or number, optional _subscript, optional ^superscript
MATH_ATOM = re.compile(
    r"^(?P<base>[A-Za-zÀ-ÖØ-öø-ÿΑ-Ωα-ωµ]+|\d+(?:[.,]\d+)?)"
    r"(?:_(?P<sub>[A-Za-z0-9α-ωæøå]+|\{[^{}]{1,16}\}))?"
    r"(?:\^(?P<sup>[−-]?[0-9A-Za-z]+|\{[^{}]{1,8}\}))?$"
)
HTMLISH = re.compile(r"<\s*/?\s*[a-zA-Z!]|&[a-zA-Z#][a-zA-Z0-9]*;|javascript:", re.I)

INLINE_KEYS = {
    "term": {"term", "text"},
    "math": {"math"},
    "q": {"q", "u", "digits", "approx"},
    "em": {"em"},
    "strong": {"strong"},
}


class RichError(ValueError):
    pass


def _check_string(s: str, where: str, errors: list[str]) -> None:
    if HTMLISH.search(s):
        errors.append(f"{where}: markup/HTML is not allowed in text ({s[:40]!r})")
    if "\u0000" in s:
        errors.append(f"{where}: NUL character")


def _check_quantity(node: dict[str, Any], where: str, errors: list[str]) -> None:
    if not isinstance(node.get("q"), (int, float)) or isinstance(node.get("q"), bool):
        errors.append(f"{where}: quantity 'q' must be a number")
    if node.get("u") not in UNITS and node.get("u") not in ("", None):
        errors.append(f"{where}: unknown unit {node.get('u')!r}")
    if "digits" in node and (not isinstance(node["digits"], int) or not 0 <= node["digits"] <= 6):
        errors.append(f"{where}: 'digits' must be an integer 0-6")


def check_math(tokens: Any, where: str, errors: list[str]) -> None:
    if not isinstance(tokens, list) or not tokens:
        errors.append(f"{where}: math must be a non-empty list of tokens")
        return
    for i, tok in enumerate(tokens):
        w = f"{where}[{i}]"
        if isinstance(tok, str):
            if tok not in OPERATORS and not MATH_ATOM.match(tok):
                errors.append(f"{w}: unrecognised math token {tok!r}")
        elif isinstance(tok, dict):
            keys = set(tok)
            if "q" in keys:
                _check_quantity(tok, w, errors)
            elif keys == {"frac"}:
                if not (isinstance(tok["frac"], list) and len(tok["frac"]) == 2):
                    errors.append(f"{w}: frac needs [numerator, denominator]")
                else:
                    check_math(tok["frac"][0], w + ".num", errors)
                    check_math(tok["frac"][1], w + ".den", errors)
            elif keys in ({"sqrt"}, {"paren"}):
                check_math(tok[next(iter(keys))], w, errors)
            elif keys == {"text"} and isinstance(tok["text"], str):
                _check_string(tok["text"], w, errors)
            elif keys == {"unit"}:
                if tok["unit"] not in UNITS:
                    errors.append(f"{w}: unknown unit {tok['unit']!r}")
            else:
                errors.append(f"{w}: unknown math node {sorted(keys)}")
        else:
            errors.append(f"{w}: invalid math token type {type(tok).__name__}")


def check_inline(node: Any, where: str, errors: list[str], term_ids: set[str] | None) -> None:
    if isinstance(node, str):
        _check_string(node, where, errors)
        return
    if not isinstance(node, dict):
        errors.append(f"{where}: invalid inline node {type(node).__name__}")
        return
    kind = next((k for k in INLINE_KEYS if k in node), None)
    if kind is None or set(node) - INLINE_KEYS[kind]:
        errors.append(f"{where}: unknown inline node {sorted(node)}")
        return
    if kind == "term":
        if not isinstance(node.get("text"), str) or not node["text"].strip():
            errors.append(f"{where}: term needs visible 'text'")
        else:
            _check_string(node["text"], where, errors)
        if term_ids is not None and node["term"] not in term_ids:
            errors.append(f"{where}: unknown glossary term {node['term']!r}")
    elif kind == "math":
        check_math(node["math"], where, errors)
    elif kind == "q":
        _check_quantity(node, where, errors)
    else:
        if not isinstance(node[kind], str):
            errors.append(f"{where}: {kind} must be a string")
        else:
            _check_string(node[kind], where, errors)


def check_paragraph(par: Any, where: str, errors: list[str], term_ids: set[str] | None) -> None:
    if isinstance(par, str):
        if not par.strip():
            errors.append(f"{where}: empty paragraph")
        _check_string(par, where, errors)
    elif isinstance(par, list):
        if not par:
            errors.append(f"{where}: empty paragraph")
        for i, node in enumerate(par):
            check_inline(node, f"{where}[{i}]", errors, term_ids)
    else:
        errors.append(f"{where}: paragraph must be a string or a list of inline nodes")


def check_rich(value: Any, where: str, errors: list[str], term_ids: set[str] | None = None,
               required: bool = True) -> None:
    if value is None or value == [] or value == "":
        if required:
            errors.append(f"{where}: required")
        return
    blocks = [value] if isinstance(value, str) else value
    if not isinstance(blocks, list):
        errors.append(f"{where}: must be a string or a list of blocks")
        return
    for i, block in enumerate(blocks):
        w = f"{where}[{i}]"
        if isinstance(block, dict) and set(block) == {"steps"}:
            if not isinstance(block["steps"], list) or not block["steps"]:
                errors.append(f"{w}: steps must be a non-empty list")
            else:
                for j, p in enumerate(block["steps"]):
                    check_paragraph(p, f"{w}.steps[{j}]", errors, term_ids)
        elif isinstance(block, dict) and set(block) == {"note"}:
            check_paragraph(block["note"], f"{w}.note", errors, term_ids)
        else:
            check_paragraph(block, w, errors, term_ids)


# --- traversal helpers -------------------------------------------------------

def _iter_paragraphs(value: Any) -> Iterator[Any]:
    if value is None:
        return
    blocks = [value] if isinstance(value, str) else value
    for block in blocks:
        if isinstance(block, dict) and "steps" in block:
            yield from block["steps"]
        elif isinstance(block, dict) and "note" in block:
            yield block["note"]
        else:
            yield block


def iter_inlines(value: Any) -> Iterator[Any]:
    """Yield every inline node of a rich-text value or a single paragraph."""
    for par in _iter_paragraphs(value):
        if isinstance(par, str):
            yield par
        else:
            yield from par


def format_number(x: float, digits: int | None = None) -> str:
    if digits is not None:
        s = f"{x:.{digits}f}"
    else:
        s = f"{x:.6g}"
        if "e" in s:
            s = f"{x:f}".rstrip("0").rstrip(".")
    s = s.replace("-", "−").replace(".", ",")
    return s


def _math_text(tokens: list[Any]) -> str:
    out = []
    for tok in tokens:
        if isinstance(tok, str):
            m = MATH_ATOM.match(tok)
            if m:
                t = m["base"]
                if m["sub"]:
                    t += m["sub"].strip("{}")
                if m["sup"]:
                    t += "^" + m["sup"].strip("{}")
                out.append(t)
            else:
                out.append(tok)
        elif "q" in tok:
            out.append(quantity_text(tok))
        elif "frac" in tok:
            out.append(f"({_math_text(tok['frac'][0])})/({_math_text(tok['frac'][1])})")
        elif "sqrt" in tok:
            out.append(f"√({_math_text(tok['sqrt'])})")
        elif "paren" in tok:
            out.append(f"({_math_text(tok['paren'])})")
        elif "text" in tok:
            out.append(tok["text"])
        elif "unit" in tok:
            out.append(tok["unit"])
    return " ".join(out)


def quantity_text(node: dict[str, Any]) -> str:
    s = format_number(node["q"], node.get("digits"))
    if node.get("approx"):
        s = "≈ " + s
    return f"{s} {node['u']}".strip() if node.get("u") else s


def inline_text(node: Any) -> str:
    if isinstance(node, str):
        return node
    if "term" in node:
        return node["text"]
    if "math" in node:
        return _math_text(node["math"])
    if "q" in node:
        return quantity_text(node)
    for k in ("em", "strong"):
        if k in node:
            return node[k]
    return ""


def plain_text(value: Any) -> str:
    """Readable plain text for checks, CLI review and similarity tests."""
    pars = []
    for par in _iter_paragraphs(value):
        if isinstance(par, str):
            pars.append(par)
        else:
            pars.append("".join(inline_text(n) for n in par))
    return "\n".join(pars)


def term_refs(value: Any) -> list[str]:
    return [n["term"] for n in iter_inlines(value) if isinstance(n, dict) and "term" in n]


def quantities(value: Any) -> list[dict[str, Any]]:
    out = []

    def walk_math(tokens: list[Any]) -> None:
        for t in tokens:
            if isinstance(t, dict):
                if "q" in t:
                    out.append(t)
                for k in ("sqrt", "paren"):
                    if k in t:
                        walk_math(t[k])
                if "frac" in t:
                    walk_math(t["frac"][0])
                    walk_math(t["frac"][1])

    for n in iter_inlines(value):
        if isinstance(n, dict) and "q" in n:
            out.append(n)
        elif isinstance(n, dict) and "math" in n:
            walk_math(n["math"])
    return out


def map_strings(value: Any, fn: Callable[[str], None]) -> None:
    """Call fn on every human-readable string (used by copy/similarity checks)."""
    for n in iter_inlines(value):
        fn(inline_text(n))
