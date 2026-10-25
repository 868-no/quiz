"""Shared question text, layout, and option-order helpers for flashcard PDFs."""
from __future__ import annotations

import hashlib
from typing import Any, Callable

from .common import Paths
from .questions import latest, load_all, variant_revisions
from .richtext import plain_text

PAGE_W, PAGE_H = 210 * 72 / 25.4, 297 * 72 / 25.4
MARGIN = 8 * 72 / 25.4
COLS, ROWS = 2, 4
FRONT_SHARE = 0.5
PAD = 5.0
HEAD_H = 13.0
OPTION_COLUMN_GAP = 5.0

_ASCII = (
    "278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 "
    "556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 "
    "667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 "
    "278 278 278 469 556 333 "
    "556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 "
    "334 260 334 584"
).split()
WIDTH = {chr(32 + i): int(width) for i, width in enumerate(_ASCII)}
WIDTH.update({"Æ": 1000, "æ": 889, "Ø": 778, "ø": 611, "Å": 667, "å": 556, "Ö": 778, "Ä": 667,
              "°": 400, "²": 333, "³": 333, "·": 278, "×": 584, "±": 584, "–": 556, "—": 1000})

SYMBOL = {
    "Ω": (0x57, 768), "\u2126": (0x57, 768), "−": (0x2D, 549), "≈": (0xBB, 549), "≤": (0xA3, 549),
    "≥": (0xB3, 549), "≠": (0xB9, 549), "→": (0xAE, 987), "←": (0xAC, 987), "√": (0xD6, 549),
    "Δ": (0x44, 612), "Σ": (0x53, 592), "Φ": (0x46, 763), "Θ": (0x51, 741), "Λ": (0x4C, 686),
    "π": (0x70, 549), "α": (0x61, 631), "β": (0x62, 549), "γ": (0x67, 411), "δ": (0x64, 494),
    "ε": (0x65, 439), "η": (0x68, 603), "θ": (0x71, 521), "λ": (0x6C, 549), "μ": (0x6D, 576),
    "ρ": (0x72, 549), "σ": (0x73, 603), "τ": (0x74, 439), "φ": (0x66, 521), "ω": (0x77, 686),
}
BOLD_FACTOR = 1.06
Glyph = tuple[bool, bytes, int]
GlyphMeasure = Callable[[list[Glyph], float, str], float]


def glyph(char: str) -> Glyph:
    """Encode one character for the legacy PDF font metrics and text stream."""
    if char in SYMBOL:
        code, width = SYMBOL[char]
        return True, bytes([code]), width
    try:
        encoded = char.encode("cp1252")
    except UnicodeEncodeError:
        return False, b"?", 556
    return False, encoded, WIDTH.get(char, 556)


def glyph_width(glyphs: list[Glyph], size: float, style: str) -> float:
    """Estimate a glyph run's width in PDF points for the selected text style."""
    factor = BOLD_FACTOR if style == "b" else 1
    return sum(item[2] for item in glyphs) * size / 1000 * factor


class Block:
    """A paragraph or paired answer-option row used by card-panel layout."""

    def __init__(self, text: str, style: str = "r", prefix: str = "", gap: float = 0.5,
                 scale: float = 1.0, gray: bool = False, right: str | None = None,
                 right_prefix: str = "", prefix_style: str | None = None,
                 right_prefix_style: str | None = None,
                 prefix_color: tuple[float, float, float] | None = None,
                 right_prefix_color: tuple[float, float, float] | None = None):
        """Store text, styling, indentation, spacing, and optional right-column content."""
        self.text, self.style, self.prefix, self.gap, self.scale, self.gray, self.right = \
            text, style, prefix, gap, scale, gray, right
        self.right_prefix = right_prefix
        self.prefix_style = prefix_style or style
        self.right_prefix_style = right_prefix_style or self.prefix_style
        self.prefix_color = prefix_color
        self.right_prefix_color = right_prefix_color or prefix_color


def _wrap(words: list[list[Glyph]], width: float, size: float, style: str,
          measure: GlyphMeasure = glyph_width) -> list[list[Glyph]]:
    """Wrap encoded words to a width, splitting words that cannot fit on one line."""
    lines: list[list[Glyph]] = []
    current: list[Glyph] = []
    space = glyph(" ")
    for word in words:
        while measure(word, size, style) > width and width > 0:
            length = 1
            while length < len(word) and measure(word[:length + 1], size, style) <= width:
                length += 1
            if current:
                lines.append(current)
                current = []
            lines.append(word[:length])
            word = word[length:]
        if not word:
            continue
        trial = current + [space] + word if current else word
        if current and measure(trial, size, style) > width:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines or [[]]


def layout(blocks: list[Block], width: float, size: float, measure: GlyphMeasure = glyph_width):
    """Lay blocks out as positioned glyph lines and return their total height."""
    lines = []
    height = 0.0
    for index, block in enumerate(blocks):
        current_size = size * block.scale
        if index:
            height += size * block.gap
        if block.right is not None:
            left_words = [[glyph(char) for char in word] for word in block.text.split()]
            right_words = [[glyph(char) for char in word] for word in block.right.split()]
            column_width = max(0.0, (width - OPTION_COLUMN_GAP) / 2)
            right_offset = column_width + OPTION_COLUMN_GAP
            left_prefix = [glyph(char) for char in block.prefix]
            right_prefix = [glyph(char) for char in block.right_prefix]
            left_label_width = measure(left_prefix, current_size, block.prefix_style) + (2.0 if left_prefix else 0.0)
            right_label_width = measure(right_prefix, current_size, block.right_prefix_style) + (2.0 if right_prefix else 0.0)
            left_lines = _wrap(left_words, column_width - left_label_width, current_size, block.style, measure)
            right_lines = _wrap(right_words, column_width - right_label_width, current_size, block.style, measure)
            for line_index in range(max(len(left_lines), len(right_lines))):
                if line_index < len(left_lines):
                    if line_index == 0 and left_prefix:
                        lines.append((0.0, left_prefix, block, current_size, height + current_size,
                                      block.prefix_style, block.prefix_color))
                    lines.append((left_label_width, left_lines[line_index], block, current_size,
                                  height + current_size, block.style, None))
                if line_index < len(right_lines):
                    if line_index == 0 and right_prefix:
                        lines.append((right_offset, right_prefix, block, current_size, height + current_size,
                                      block.right_prefix_style, block.right_prefix_color))
                    lines.append((right_offset + right_label_width, right_lines[line_index], block,
                                  current_size, height + current_size, block.style, None))
                height += current_size * 1.2
            continue
        prefix = [glyph(char) for char in block.prefix]
        prefix_style = block.prefix_style if prefix else block.style
        hanging = measure(prefix, current_size, prefix_style) + (2.0 if prefix else 0.0)
        words = [[glyph(char) for char in word] for word in block.text.split()]
        wrapped = _wrap(words, width - hanging, current_size, block.style, measure)
        for line_index, line in enumerate(wrapped):
            if line_index == 0 and prefix:
                lines.append((0.0, prefix, block, current_size, height + current_size,
                              prefix_style, block.prefix_color))
            lines.append((hanging, line, block, current_size, height + current_size, block.style, None))
            height += current_size * 1.2
    return lines, height


def centered_line_offsets(lines, width: float, measure: GlyphMeasure = glyph_width) -> dict[tuple[int, float], float]:
    """Return horizontal shifts that center each block line, including separate prefix runs."""
    bounds: dict[tuple[int, float], tuple[float, float]] = {}
    for x, glyphs, block, size, y, style, _ in lines:
        key = (id(block), y)
        right = x + measure(glyphs, size, style)
        left, current_right = bounds.get(key, (x, right))
        bounds[key] = (min(left, x), max(current_right, right))
    return {
        key: (width - (right - left)) / 2 - left
        for key, (left, right) in bounds.items()
    }


def fit(blocks: list[Block], width: float, height: float, max_size: float, min_size: float,
    measure: GlyphMeasure = glyph_width):
    """Find the largest font size that fits, or return visible lines at the minimum."""
    size = max_size
    while size >= min_size - 1e-9:
        lines, total_height = layout(blocks, width, size, measure)
        if total_height <= height:
            return size, lines, True
        size -= 0.25
    lines, _ = layout(blocks, width, min_size, measure)
    return min_size, [line for line in lines if line[4] <= height], False


def _paragraphs(value: Any) -> list[str]:
    """Convert structured rich text into nonempty plain-text paragraphs."""
    return [paragraph for paragraph in plain_text(value).split("\n") if paragraph.strip()] if value else []


def ordered_options(qid: str, options: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return a stable per-question option order that is unaffected by other questions."""
    return sorted(options, key=lambda option: hashlib.sha256(
        f"{qid}\0{option['id']}".encode("utf-8")).digest())


def front_blocks(qid: str, revision: dict[str, Any]) -> list[Block]:
    """Build the question panel's context, stem, shuffled choices, and visual note."""
    blocks = [Block(paragraph, "i", gap=0.5) for paragraph in _paragraphs(revision.get("context"))]
    blocks += [Block(paragraph, "b", gap=0.7) for paragraph in _paragraphs(revision.get("stem"))]
    options = ordered_options(qid, revision.get("options", []))
    key_style = "b"
    key_color = (0.12, 0.29, 0.48)
    for index in range(0, len(options), 2):
        left = plain_text([options[index]["content"]])
        has_right = index + 1 < len(options)
        right = plain_text([options[index + 1]["content"]]) if has_right else None
        blocks.append(Block(
            left, gap=0.7 if index == 0 else 0.35, prefix=f"{chr(65 + index)}) ", right=right,
            right_prefix=f"{chr(66 + index)}) " if has_right else "",
            prefix_style=key_style, right_prefix_style=key_style,
            prefix_color=key_color, right_prefix_color=key_color,
        ))
    if revision.get("visual", {}).get("after_only"):
        blocks.append(Block("(Figuren vises etter svar i quizen)", "i", gap=0.7, gray=True))
    return blocks


def back_blocks(qid: str, revision: dict[str, Any]) -> list[Block]:
    """Build answer-panel blocks with the correct choice's shuffled option letter."""
    options = ordered_options(qid, revision.get("options", []))
    option_ids = [option["id"] for option in options]
    blocks: list[Block] = []
    for correct_id in revision.get("correct", []):
        index = option_ids.index(correct_id) if correct_id in option_ids else -1
        option = options[index] if index >= 0 else {"content": correct_id}
        answer = plain_text([option["content"]])
        paragraphs = [paragraph for paragraph in answer.split("\n") if paragraph.strip()]
        for paragraph_index, paragraph in enumerate(paragraphs):
            prefix = f"{chr(65 + index)}) " if index >= 0 and paragraph_index == 0 else ""
            blocks.append(Block(
                paragraph, prefix=prefix, gap=0.6 if paragraph_index == 0 else 0.25,
                prefix_style="b", prefix_color=(0.12, 0.29, 0.48),
            ))
    return blocks


def block_text(block: Block) -> str:
    """Return a block's complete text for the shortened-content appendix."""
    text = f"{block.prefix}{block.text}" if block.prefix else block.text
    right = f"{block.right_prefix}{block.right}" if block.right is not None else ""
    return f"{text}\n{right}" if block.right is not None else text


def select_revisions(paths: Paths, chapter: int | None, approved_only: bool,
                     include_variants: bool = True) -> list[tuple[str, dict[str, Any]]]:
    """Select question forms for export, expanding calculation variants by default."""
    chosen: list[tuple[str, dict[str, Any]]] = []
    for _, question in load_all(paths):
        revisions = [revision for revision in question["revisions"] if revision["status"] == "approved"] if approved_only else \
                    [latest(question)] if latest(question)["status"] not in ("retired", "rejected") else []
        if not revisions:
            continue
        revision = max(revisions, key=lambda item: item["revision"])
        if chapter is not None and revision.get("chapter") != chapter:
            continue
        variants = variant_revisions(revision) if include_variants else []
        forms = [("1", revision)]
        if include_variants:
            forms.extend((variant_id.removeprefix("v"), form) for variant_id, form in variants)
        for variant_number, form in forms:
            card_id = f"{question['id']}-{variant_number}" if variants else question["id"]
            chosen.append((card_id, form))
    return chosen
