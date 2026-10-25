"""Generate printable A4 flashcards with ReportLab and cached figure snapshots."""
from __future__ import annotations

import importlib
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .common import Paths, ToolError, eprint, read_json
from .flashcard_core import (
    COLS, FRONT_SHARE, HEAD_H, MARGIN, PAGE_H, PAGE_W, PAD, ROWS,
    Block, Glyph, SYMBOL, back_blocks, block_text, centered_line_offsets, fit,
    front_blocks, layout, select_revisions,
)
from .flashcard_images import cached_visual_paths
from .questions import human_verified


def _reportlab():
    """Load ReportLab, register its bundled fonts, and return the drawing APIs."""
    try:
        reportlab = importlib.import_module("reportlab")
        pdfmetrics = importlib.import_module("reportlab.pdfbase.pdfmetrics")
        TTFont = importlib.import_module("reportlab.pdfbase.ttfonts").TTFont
        Canvas = importlib.import_module("reportlab.pdfgen.canvas").Canvas
        simple_split = importlib.import_module("reportlab.lib.utils").simpleSplit
    except ImportError as exc:
        raise ToolError("flashcard requires ReportLab; install it with `.venv/bin/pip install -r requirements-flashcard.txt`") from exc

    font_dir = Path(reportlab.__file__).parent / "fonts"
    fonts = {
        "r": ("FlashVera", "Vera.ttf"),
        "b": ("FlashVera-Bold", "VeraBd.ttf"),
        "i": ("FlashVera-Italic", "VeraIt.ttf"),
    }
    registered = set(pdfmetrics.getRegisteredFontNames())
    for name, filename in fonts.values():
        if name not in registered:
            pdfmetrics.registerFont(TTFont(name, str(font_dir / filename)))
    return Canvas, pdfmetrics, {style: values[0] for style, values in fonts.items()}, simple_split


def _glyph_text(glyphs: list[Glyph]) -> str:
    """Convert legacy glyph records to Unicode text for the embedded TTF font."""
    symbol_chars: dict[int, str] = {}
    for char, (code, _) in SYMBOL.items():
        symbol_chars.setdefault(code, char)
    parts: list[str] = []
    for is_symbol, data, _ in glyphs:
        if is_symbol:
            parts.extend(symbol_chars.get(code, "?") for code in data)
        else:
            parts.append(data.decode("cp1252", errors="replace"))
    return "".join(parts)


def _png_size(path: Path) -> tuple[int, int]:
    """Read a cached PNG's dimensions from its header without decoding pixels."""
    try:
        with path.open("rb") as image:
            header = image.read(24)
    except OSError as exc:
        raise ToolError(f"cannot read cached figure {path.name}: {exc}") from exc
    if not header.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ToolError(f"cached figure is not a PNG: {path.name}")
    return int.from_bytes(header[16:20], "big"), int.from_bytes(header[20:24], "big")


def _study_reference(revision: dict[str, Any], sections: dict[str, dict[str, Any]]) -> str:
    """Show chapter and pages, or the chapter and section title when pages are absent."""
    reference = revision.get("study_reference") or {}
    chapter_number = reference.get("chapter")
    section_id = reference.get("section_id")
    section = sections.get(section_id, {}) if isinstance(section_id, str) else {}
    parts = []
    pages = reference.get("printed_pages") or section.get("printed_pages") or []
    if pages:
        if chapter_number is not None:
            parts.append(f"Kap. {chapter_number}")
        parts.append("side " + ", ".join(str(page) for page in pages))
    else:
        if chapter_number is not None:
            parts.append(f"Kap. {chapter_number}")
        if section.get("title"):
            parts.append(section["title"])
        elif section_id:
            parts.append(f"avsnitt {section_id}")
    return "; ".join(parts) if parts else "referanse ikke oppgitt"


def _verification_status(revision: dict[str, Any]) -> tuple[bool, bool]:
    """Return machine and human verification marks from the revision's review data."""
    approval = revision.get("approval") or {}
    return approval.get("machine_verified") is True, human_verified(revision)


def _draw_intro_page(pdf: Any, pdfmetrics: Any, fonts: dict[str, str], simple_split: Any,
                     human_verified_count: int, question_count: int) -> None:
    """Draw the framed first page with print instructions, source, links, and issue reporting."""
    left = MARGIN + 26
    right = PAGE_W - MARGIN - 26
    max_width = right - left
    frame_x, frame_y = MARGIN, MARGIN
    frame_w, frame_h = PAGE_W - 2 * MARGIN, PAGE_H - 2 * MARGIN

    pdf.setStrokeColorRGB(0.12, 0.29, 0.48)
    pdf.setLineWidth(1.5)
    pdf.roundRect(frame_x, frame_y, frame_w, frame_h, 8, stroke=1, fill=0)
    pdf.setStrokeColorRGB(0.65, 0.72, 0.79)
    pdf.setLineWidth(0.4)
    pdf.roundRect(frame_x + 5, frame_y + 5, frame_w - 10, frame_h - 10, 6, stroke=1, fill=0)

    pdf.setFillColorRGB(0.12, 0.29, 0.48)
    pdf.setFont(fonts["b"], 22)
    pdf.drawString(left, PAGE_H - MARGIN - 58, "Repetisjonskort til radioamatørprøven")

    pdf.setStrokeColorRGB(0.65, 0.72, 0.79)
    pdf.setLineWidth(0.7)
    pdf.line(left, PAGE_H - MARGIN - 78, right, PAGE_H - MARGIN - 78)

    def paragraph(text: str, y: float, size: float = 10, leading: float = 14,
                  style: str = "r") -> float:
        pdf.setFont(fonts[style], size)
        pdf.setFillColorRGB(0.1, 0.12, 0.12)
        for line in simple_split(text, fonts[style], size, max_width):
            pdf.drawString(left, y, line)
            y -= leading
        return y - 9

    def heading(title: str, y: float) -> float:
        pdf.setFont(fonts["b"], 12)
        pdf.setFillColorRGB(0.12, 0.29, 0.48)
        pdf.drawString(left, y, title)
        return y - 18

    def section(title: str, text: str, y: float) -> float:
        return paragraph(text, heading(title, y))

    def legend_row(kind: str, text: str, y: float) -> float:
        ink = (0.12, 0.29, 0.48)
        pdf.setStrokeColorRGB(*ink)
        pdf.setFillColorRGB(*ink)
        pdf.setLineWidth(0.7)
        if kind == "robot":
            pdf.roundRect(left, y + 1, 8, 5.5, 1, stroke=1, fill=0)
            pdf.line(left + 4, y + 6.5, left + 4, y + 8)
            pdf.circle(left + 4, y + 8.8, 0.45, stroke=1, fill=1)
            pdf.circle(left + 2.2, y + 3.7, 0.4, stroke=1, fill=1)
            pdf.circle(left + 5.8, y + 3.7, 0.4, stroke=1, fill=1)
        else:
            pdf.circle(left + 4, y + 6.5, 1.6, stroke=1, fill=0)
            pdf.line(left + 1, y + 0.5, left + 2.5, y + 3)
            pdf.line(left + 2.5, y + 3, left + 5.5, y + 3)
            pdf.line(left + 5.5, y + 3, left + 7, y + 0.5)

        pdf.setFont(fonts["r"], 10)
        pdf.setFillColorRGB(0.1, 0.12, 0.12)
        for line in simple_split(text, fonts["r"], 10, max_width - 14):
            pdf.drawString(left + 14, y, line)
            y -= 14
        return y - 2

    def book_reference(y: float) -> float:
        text = "Bokikonet på FASIT-siden av kortene viser til relevante kapitler og sidetall i læreboka."
        size = 10
        font = fonts["r"]
        icon_x = left
        icon_y = y + 0.7
        ink = (0.12, 0.29, 0.48)
        pdf.setStrokeColorRGB(*ink)
        pdf.setFillColorRGB(1, 1, 1)
        pdf.setLineWidth(0.8)
        left_page = pdf.beginPath()
        left_page.moveTo(icon_x, icon_y)
        left_page.lineTo(icon_x, icon_y + 5.8)
        left_page.lineTo(icon_x + 3.2, icon_y + 5.8)
        left_page.lineTo(icon_x + 3.8, icon_y + 5.1)
        left_page.lineTo(icon_x + 3.8, icon_y)
        left_page.lineTo(icon_x + 3.2, icon_y + 0.2)
        left_page.close()
        pdf.drawPath(left_page, stroke=1, fill=1)
        right_page = pdf.beginPath()
        right_page.moveTo(icon_x + 3.8, icon_y)
        right_page.lineTo(icon_x + 3.8, icon_y + 5.1)
        right_page.lineTo(icon_x + 4.4, icon_y + 5.8)
        right_page.lineTo(icon_x + 7.6, icon_y + 5.8)
        right_page.lineTo(icon_x + 7.6, icon_y)
        right_page.lineTo(icon_x + 4.4, icon_y + 0.2)
        right_page.close()
        pdf.drawPath(right_page, stroke=1, fill=1)
        pdf.setStrokeColorRGB(*ink)
        pdf.setLineWidth(0.6)
        for line_y in (icon_y + 1.6, icon_y + 3.5):
            pdf.line(icon_x + 0.6, line_y, icon_x + 3.1, line_y + 0.15)
            pdf.line(icon_x + 4.5, line_y + 0.15, icon_x + 7, line_y)

        text_x = icon_x + 14
        lines = simple_split(text, font, size, max_width - 14)
        pdf.setFont(font, size)
        pdf.setFillColorRGB(0.1, 0.12, 0.12)
        for index, line in enumerate(lines):
            pdf.drawString(text_x if index == 0 else left, y - index * 14, line)
        return y - len(lines) * 14 - 9

    def link(text: str, url: str, y: float) -> float:
        size = 10
        label_font = fonts["i"]
        url_font = fonts["r"]
        label_width = pdfmetrics.stringWidth(text, label_font, size)
        url_width = pdfmetrics.stringWidth(url, url_font, size)
        pdf.setFont(label_font, size)
        pdf.setFillColorRGB(0.1, 0.12, 0.12)
        pdf.drawString(left, y, text)

        def draw_url_line(line: str, x: float, baseline: float) -> None:
            width = pdfmetrics.stringWidth(line, url_font, size)
            pdf.setFont(url_font, size)
            pdf.setFillColorRGB(0.12, 0.29, 0.48)
            pdf.drawString(x, baseline, line)
            pdf.linkURL(url, (x, baseline - 2, x + width, baseline + size + 2), relative=0)

        if label_width + 4 + url_width <= max_width:
            draw_url_line(url, left + label_width + 4, y)
            return y - 19

        y -= 14
        url_parts = url.split("/")
        tokens = [part + ("/" if index < len(url_parts) - 1 else "")
                  for index, part in enumerate(url_parts)]
        lines: list[str] = []
        current = ""
        for token in tokens:
            if current and pdfmetrics.stringWidth(current + token, url_font, size) > max_width:
                lines.append(current)
                current = token
            else:
                current += token
        if current:
            lines.append(current)
        for line in lines:
            draw_url_line(line, left, y)
            y -= 14
        return y - 5

    y = PAGE_H - MARGIN - 106
    y = section(
        "Slik bruker du denne PDFen",
        "Kortene er ment som repetisjonshjelp for å øve til eksamen for den norske radioamatørlisens-eksamen. "
        "Spørsmålene er inspirert av fagstoffet i læreboken «Veien til internasjonal radioamatørlisens» "
        "og formulert med egne ord.", y)
    y = paragraph(
        "Skriv ut arkene i 100 % størrelse på papir eller tynn papp. Klipp langs de tykke prikkede "
        "linjene og brett langs de tynne. Lim eller teip kortene sammen. Bland kortene. Les spørsmålet "
        "først, velg ett svar, og snu kortet for å se fasiten. Repeter til du består eksamen.", y)
    y = link("Kjøp «Veien til internasjonal radioamatørlisens» hos NRRL:",
             "https://nrrl.no/nettbutikk/produkt/veien-til-internasjonal-radioamatorlisens/", y)
    y = heading("Ikonografi", y - 10)
    y = book_reference(y)
    y = paragraph(
        "På spørsmåls-siden viser symbolene status og kvalitet på spørsmål og svar:", y)
    y = legend_row("robot", "Robotikonet viser maskinverifisering (V = maskinverifisert, X = ikke maskinverifisert).", y)
    y = legend_row("person", "Personikonet viser menneskelig verifikasjon (V = verifisert, X = ikke verifisert).", y)
    y = heading("Spørsmål og henvisninger og mer hjelp", y - 10)
    y = paragraph(
        "Kortene bruker de samme spørsmålene som quiz.868.no, et nettbasert øvingsverktøy for samme "
        "pensum. Dersom du ønsker en grundigere forklaring på et svar, kan du bruke lenken «Gå til et "
        "bestemt spørsmål» på nettsiden. Der får du ofte en grundigere forklaring enn det er plass til "
        "på kortet.", y)
    y = paragraph("Repetisjonskortene bruker løpende nummer i overskriften. For å slå opp et "
        "spesifikt spørsmål, bruk q-koden som står med liten skrift i øvre høyre hjørne av kortet, "
        "for eksempel q-0349 eller "
        "q-0349-2 for en variant.", y)
    y = link("Besøk quiz.868.no:", "https://quiz.868.no/", y)
    y = heading("Vil du bidra til å kvalitetssikre spørsmål og svar?", y - 10)
    y = paragraph(
        f"Enn så lenge er {human_verified_count} av {question_count} spørsmål kvalitetssikret av ett menneske.", y)
    y = link("Dersom du ønsker å bidra, sjekk ut", "https://github.com/868-no/quiz#verifying-questions", y)
    y = section(
        "Fant du en feil?",
        "Feil i spørsmål, svar eller illustrasjoner?", y - 10)
    link("Opprett en sak på GitHub:", "https://github.com/868-no/quiz/issues", y)


def build_flashcard(paths: Paths, out: Path, chapter: int | None = None,
                    approved_only: bool = False,
                    include_variants: bool = True) -> dict[str, Any]:
    """Build the fast ReportLab PDF using validated cached images and selected questions."""
    cards = select_revisions(paths, chapter, approved_only, include_variants)
    if not cards:
        raise ToolError("no questions selected")
    image_paths = cached_visual_paths(paths, cards)
    chapter_data = read_json(paths.chapters_file)
    sections = {section["id"]: section for chapter in chapter_data.get("chapters", [])
                for section in chapter.get("sections", [])}
    Canvas, pdfmetrics, fonts, simple_split = _reportlab()
    cell_w = (PAGE_W - 2 * MARGIN) / COLS
    cell_h = (PAGE_H - 2 * MARGIN) / ROWS
    per_page = COLS * ROWS
    card_pages = math.ceil(len(cards) / per_page)
    warnings: list[str] = []
    overflow: list[tuple[int, str, str, str]] = []
    overflow_seen: set[tuple[int, str, str, str]] = set()
    out.parent.mkdir(parents=True, exist_ok=True)
    pdf = Canvas(str(out), pagesize=(PAGE_W, PAGE_H), pageCompression=1, invariant=1)
    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    pdf.setTitle(f"Repetisjonskort til radioamatørprøven, generated at {generated_at}")
    human_verified_count = sum(_verification_status(revision)[1] for _, revision in cards)
    _draw_intro_page(pdf, pdfmetrics, fonts, simple_split, human_verified_count, len(cards))
    pdf.showPage()

    def record_overflow(card_number: int, card_id: str, panel: str, block: Block) -> None:
        """Deduplicate complete text blocks omitted from a compact card panel."""
        text = block_text(block).strip()
        item = (card_number, card_id, panel, text)
        if text and item not in overflow_seen:
            overflow_seen.add(item)
            overflow.append(item)

    def text_width(text: str, style: str, size: float) -> float:
        """Measure rendered text with the active ReportLab font."""
        return pdfmetrics.stringWidth(text, fonts[style], size)

    def measure_glyphs(glyphs: list[Glyph], size: float, style: str) -> float:
        """Measure wrapped glyphs using the same Vera font that ReportLab draws."""
        return text_width(_glyph_text(glyphs), style, size)

    def label(x: float, y: float, text: str, style: str = "r", size: float = 7,
              color: tuple[float, float, float] | None = None, align: str = "l") -> None:
        """Draw a left-, center-, or right-aligned label at the supplied baseline."""
        width = text_width(text, style, size)
        if align == "c":
            x -= width / 2
        elif align == "r":
            x -= width
        pdf.setFont(fonts[style], size)
        pdf.setFillColorRGB(*(color or (0, 0, 0)))
        pdf.drawString(x, y, text)

    def verification_marks(x: float, baseline: float, automated_ok: bool, human_ok: bool) -> None:
        """Draw robot/person pictograms followed by V for passed or X for not passed."""
        ink = (0.12, 0.29, 0.48)

        def robot_icon(left: float) -> None:
            pdf.setStrokeColorRGB(*ink)
            pdf.setFillColorRGB(*ink)
            pdf.setLineWidth(0.65)
            pdf.roundRect(left, baseline, 7, 5, 1, stroke=1, fill=0)
            pdf.line(left + 3.5, baseline + 5, left + 3.5, baseline + 6.5)
            pdf.circle(left + 3.5, baseline + 7, 0.55, stroke=1, fill=1)
            pdf.circle(left + 2, baseline + 2.6, 0.45, stroke=1, fill=1)
            pdf.circle(left + 5, baseline + 2.6, 0.45, stroke=1, fill=1)

        def person_icon(left: float) -> None:
            pdf.setStrokeColorRGB(*ink)
            pdf.setLineWidth(0.65)
            pdf.circle(left + 3.5, baseline + 5.5, 1.6, stroke=1, fill=0)
            pdf.arc(left, baseline - 3, left + 7, baseline + 4, 0, 180)

        robot_icon(x)
        label(x + 9, baseline, "V" if automated_ok else "X", "b", 6,
              (0.16, 0.43, 0.24) if automated_ok else (0.65, 0.16, 0.12))
        person_x = x + 19
        person_icon(person_x)
        label(person_x + 9, baseline, "V" if human_ok else "X", "b", 6,
              (0.16, 0.43, 0.24) if human_ok else (0.65, 0.16, 0.12))

    def book_icon(x: float, baseline: float) -> None:
        """Draw an open-book pictogram as vector paths, independent of installed fonts."""
        y = baseline - 1
        pdf.setStrokeColorRGB(0.12, 0.29, 0.48)
        pdf.setFillColorRGB(1, 1, 1)
        pdf.setLineWidth(0.8)
        left_page = pdf.beginPath()
        left_page.moveTo(x, y + 0.4)
        left_page.lineTo(x, y + 5.8)
        left_page.lineTo(x + 3.2, y + 5.8)
        left_page.lineTo(x + 3.8, y + 5.1)
        left_page.lineTo(x + 3.8, y + 0.4)
        left_page.lineTo(x + 3.2, y + 0.5)
        left_page.close()
        pdf.drawPath(left_page, stroke=1, fill=1)
        right_page = pdf.beginPath()
        right_page.moveTo(x + 3.8, y + 0.4)
        right_page.lineTo(x + 3.8, y + 5.1)
        right_page.lineTo(x + 4.4, y + 5.8)
        right_page.lineTo(x + 7.6, y + 5.8)
        right_page.lineTo(x + 7.6, y + 0.4)
        right_page.lineTo(x + 4.4, y + 0.5)
        right_page.close()
        pdf.drawPath(right_page, stroke=1, fill=1)
        pdf.setStrokeColorRGB(0.12, 0.29, 0.48)
        pdf.setLineWidth(0.6)
        for line_y in (y + 2, y + 3.8):
            pdf.line(x + 0.6, line_y, x + 3.1, line_y + 0.15)
            pdf.line(x + 4.5, line_y + 0.15, x + 7, line_y)

    def draw_panel(x: float, top: float, height: float, title: str, qid: str,
                   attempts: list[list[Block]], card_number: int, center: bool = False,
                   image: Path | None = None, verification: tuple[bool, bool] | None = None,
                   study_text: str | None = None) -> None:
        """Fit and draw one question/answer panel, reserving 40% width for a figure."""
        label(x + PAD, top - PAD - 7, title, "b", 8, (0.12, 0.29, 0.48))
        label(x + cell_w - PAD, top - PAD - 6, qid, "r", 5, (0.5, 0.5, 0.5), "r")
        if study_text:
            reference_x = x + PAD + text_width(title, "b", 8) + 5
            reference_baseline = top - PAD - 6.25
            book_icon(reference_x, reference_baseline)
            reference_x += 12
            qid_left = x + cell_w - PAD - text_width(qid, "r", 5)
            available = qid_left - reference_x - 4
            reference_size = 5.5
            while reference_size > 3.5 and text_width(study_text, "i", reference_size) > available:
                reference_size -= 0.25
            label(reference_x, reference_baseline, study_text, "i", reference_size, (0.3, 0.3, 0.3))
        if verification:
            title_end = x + PAD + text_width(title, "b", 8) + 4
            verification_marks(title_end, top - PAD - 7, *verification)

        pdf.setStrokeColorRGB(0.65, 0.72, 0.79)
        pdf.setLineWidth(0.3)
        pdf.setDash()
        pdf.line(x + PAD, top - HEAD_H - 2, x + cell_w - PAD, top - HEAD_H - 2)

        width = cell_w - 2 * PAD
        text_height = height - HEAD_H - 2 * PAD - 2
        figure_area = width * 0.4 if image else 0.0
        figure_width = 0.0
        figure_height = 0.0
        if image:
            image_px_w, image_px_h = _png_size(image)
            figure_width = min(figure_area, max(0.0, (text_height - 2) * image_px_w / image_px_h))
            figure_height = figure_width * image_px_h / image_px_w
        text_area = width - figure_area - (5.0 if image else 0.0)

        for attempt, blocks in enumerate(attempts):
            max_size = 7.0
            min_size = (4.5 if image else 6.5) if center else (4.5 if attempt < len(attempts) - 1 else 3.5)
            size, lines, fits = fit(blocks, text_area, text_height, max_size, min_size, measure_glyphs)
            if fits:
                break
        all_lines, total_height = layout(blocks, text_area, size, measure_glyphs)
        drawn = {
            (dx, tuple(glyphs), id(block), line_size, y, line_style, line_color)
            for dx, glyphs, block, line_size, y, line_style, line_color in lines
        }
        if not fits:
            warnings.append(f"{qid}: {title.split()[0]} does not fit and was truncated")
        elif attempt:
            warnings.append(f"{qid}: {title.split()[0]} explanation shortened to fit")
        for dx, glyphs, block, line_size, y, line_style, line_color in all_lines:
            key = (dx, tuple(glyphs), id(block), line_size, y, line_style, line_color)
            if key not in drawn:
                record_overflow(card_number, qid, title.split()[0], block)
        for block in attempts[0]:
            if not any(line[2] is block for line in lines):
                record_overflow(card_number, qid, title.split()[0], block)

        vertical_offset = max(0.0, (text_height - total_height) / 2) if center else 0.0
        horizontal_offsets = centered_line_offsets(lines, text_area, measure_glyphs) if center else {}
        for dx, glyphs, block, size, y, line_style, line_color in lines:
            text = _glyph_text(glyphs)
            if center:
                dx += horizontal_offsets[(id(block), y)]
            pdf.setFont(fonts[line_style], size)
            if line_color:
                pdf.setFillColorRGB(*line_color)
            else:
                pdf.setFillColorRGB(0.45, 0.45, 0.45) if block.gray else pdf.setFillColorRGB(0, 0, 0)
            pdf.drawString(x + PAD + dx, top - HEAD_H - PAD - y - vertical_offset, text)

        if image:
            image_x = x + PAD + text_area + 5.0 + (figure_area - figure_width) / 2
            image_y = top - HEAD_H - PAD - (text_height + figure_height) / 2
            pdf.drawImage(str(image), image_x, image_y, figure_width, figure_height,
                          preserveAspectRatio=True, anchor="c", mask="auto")

    for page_index in range(card_pages):
        page_cards = cards[page_index * per_page:(page_index + 1) * per_page]
        for slot, (qid, revision) in enumerate(page_cards):
            row, col = divmod(slot, COLS)
            x = MARGIN + col * cell_w
            card_top = PAGE_H - MARGIN - row * cell_h
            front_height = cell_h * FRONT_SHARE
            back_height = cell_h - front_height
            number = page_index * per_page + slot + 1
            verification = _verification_status(revision)
            draw_panel(x, card_top, front_height, f"SPØRSMÅL {number}", qid,
                       [front_blocks(qid, revision)], number, image=image_paths.get(f"{qid}:before"),
                       verification=verification)
            draw_panel(x, card_top - front_height, back_height, f"FASIT {number}", qid,
                       [back_blocks(qid, revision)], number, center=True,
                       image=image_paths.get(f"{qid}:after"),
                       study_text=_study_reference(revision, sections))

        for slot in range(len(page_cards)):
            row, col = divmod(slot, COLS)
            sx = MARGIN + col * cell_w
            sy = PAGE_H - MARGIN - row * cell_h
            pdf.setStrokeColorRGB(0.45, 0.54, 0.64)
            pdf.setLineWidth(0.7)
            pdf.setDash(2, 2)
            pdf.line(sx, sy, sx + cell_w, sy)
            pdf.line(sx, sy - cell_h, sx + cell_w, sy - cell_h)
            pdf.line(sx, sy, sx, sy - cell_h)
            pdf.line(sx + cell_w, sy, sx + cell_w, sy - cell_h)
            pdf.setStrokeColorRGB(0.65, 0.72, 0.79)
            pdf.setLineWidth(0.3)
            mid = sy - cell_h * FRONT_SHARE
            pdf.setDash(3, 2.5)
            pdf.line(sx + PAD, mid, sx + cell_w - PAD - 20, mid)
        pdf.setDash()
        label(PAGE_W / 2, MARGIN / 2 - 2,
              f"Kortark {page_index + 1}", "r", 6, (0.5, 0.5, 0.5), "c")
        pdf.showPage()

    appendix_pages = 0
    if overflow:
        appendix_bottom = MARGIN + 20

        def start_appendix(page_number: int) -> float:
            """Draw an overflow page heading and return its starting text baseline."""
            label(MARGIN, PAGE_H - MARGIN - 12, "FULL TEKST FOR FORKORTEDE SVAR", "b", 13,
                  (0.12, 0.29, 0.48))
            label(MARGIN, PAGE_H - MARGIN - 27, "Kortnummer, kort-ID og hele svartekster som ikke fikk plass på kortet.",
                  "r", 8, (0.35, 0.35, 0.35))
            label(PAGE_W - MARGIN, MARGIN + 5, f"Tekstvedlegg {page_number}", "r", 7,
                  (0.5, 0.5, 0.5), "r")
            return PAGE_H - MARGIN - 42

        appendix_pages = 1
        appendix_top = start_appendix(appendix_pages)
        for number, card_id, panel, content in overflow:
            item_title = f"{panel} {number} ({card_id})"
            if appendix_top - 13 < appendix_bottom:
                pdf.showPage()
                appendix_pages += 1
                appendix_top = start_appendix(appendix_pages)
            label(MARGIN, appendix_top - 9, item_title, "b", 9)
            appendix_top -= 17
            for dx, glyphs, block, size, y, line_style, line_color in layout(
                    [Block(content)], PAGE_W - 2 * MARGIN, 9, measure_glyphs)[0]:
                if appendix_top - size < appendix_bottom:
                    pdf.showPage()
                    appendix_pages += 1
                    appendix_top = start_appendix(appendix_pages)
                    label(MARGIN, appendix_top - 9, f"{item_title} (forts.)", "b", 9)
                    appendix_top -= 17
                pdf.setFont(fonts[line_style], size)
                pdf.setFillColorRGB(*(line_color or (0, 0, 0)))
                pdf.drawString(MARGIN + dx, appendix_top - size, _glyph_text(glyphs))
                appendix_top -= size * 1.2
            appendix_top -= 6
    pdf.save()
    return {"cards": len(cards), "pages": 1 + card_pages + appendix_pages, "out": out,
            "warnings": warnings, "overflow_entries": len(overflow)}


def cmd_flashcard(paths: Paths, args) -> int:
    """Generate the singular `flashcard` CLI PDF and report fit warnings."""
    output = Path(args.out) if args.out else paths.private / "flashcard.pdf"
    result = build_flashcard(paths, output, chapter=args.chapter, approved_only=args.approved_only,
                             include_variants=args.include_variants)
    for warning in result["warnings"]:
        eprint("warning " + warning)
    print(f"{result['cards']} flashcard(s) on {result['pages']} page(s): {result['out']}")
    return 0
