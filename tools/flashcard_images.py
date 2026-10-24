"""Render private flashcard visual snapshots with Inkscape."""
from __future__ import annotations

import hashlib
import json
import shutil
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path
from typing import Any

from PIL import Image

from .common import Paths, ToolError, read_json


def _requests(cards: list[tuple[str, dict[str, Any]]]) -> dict[str, tuple[str, str, dict[str, Any]]]:
    """Map each question visual phase needed by the two card panels to its config."""
    requests = {}
    for qid, rev in cards:
        visual = rev.get("visual")
        if not visual:
            continue
        phases = ("after",) if visual.get("after_only") else ("before", "after")
        for phase in phases:
            key = f"{qid}:{phase}"
            requests[key] = (qid, phase, visual)
    return requests


def _visual_hash(visual: dict[str, Any]) -> str:
    """Hash a canonical visual config so cached snapshots can be invalidated safely."""
    canonical = json.dumps(visual, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def render_to_cache(paths: Paths, cards: list[tuple[str, dict[str, Any]]]) -> int:
    """Render selected before/after SVGs with the quiz renderer and cache trimmed PNGs."""
    requests = _requests(cards)
    if not requests:
        return 0
    node = shutil.which("node")
    inkscape = shutil.which("inkscape")
    if not node or not inkscape:
        raise ToolError("rendering flashcard images requires Node.js and Inkscape")

    script = """
import fs from 'node:fs';
import { IMPLEMENTATIONS, resolveParams } from './web/js/visuals/registry.js';
import { toString } from './web/js/render/vnode.js';
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const templates = Object.fromEntries(input.templates.map(t => [`${t.id}@${t.version}`, t]));
const output = {};
for (const { key, phase, visual } of input.visuals) {
  const templateKey = `${visual.template}@${visual.version}`;
  const { errors, params, impl } = resolveParams(visual, templates[templateKey], phase);
  if (errors.length || !impl) throw new Error(`${key}: ${errors.join('; ') || `missing renderer ${templateKey}`}`);
  output[key] = toString(impl.render(params, templates[templateKey]).svg)
      .replaceAll('var(--fig-bg)', '#ffffff').replaceAll('currentColor', '#18211e');
}
process.stdout.write(JSON.stringify(output));
"""
    visual_inputs = [
        {"key": key, "phase": phase, "visual": visual}
        for key, (_, phase, visual) in requests.items()
    ]
    payload = {"visuals": visual_inputs, "templates": read_json(paths.templates_file).get("templates", [])}
    try:
        result = subprocess.run(
            [node, "--input-type=module", "-e", script], cwd=paths.root,
            input=json.dumps(payload), capture_output=True, text=True, check=True, timeout=120)
        svg_by_key = json.loads(result.stdout)
    except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
        stderr = exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) and exc.stderr else str(exc)
        raise ToolError(f"could not generate flashcard SVGs: {stderr}") from exc

    paths.flashcard_images.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="flashcard-svg-") as temp_dir:
        temp = Path(temp_dir)
        svg_paths = []
        output_names = {}
        for key, svg in svg_by_key.items():
            qid, phase, _ = requests[key]
            name = f"{qid}-{phase}"
            svg_path = temp / f"{name}.svg"
            svg_path.write_text(svg, encoding="utf-8")
            svg_paths.append(str(svg_path))
            output_names[key] = name
        try:
            subprocess.run(
                [inkscape, "--export-type=png", "--export-area-drawing", "--export-width=1200",
                 "--export-background-opacity=0", *svg_paths],
                capture_output=True, text=True, check=True, timeout=180)
        except (OSError, subprocess.SubprocessError) as exc:
            stderr = exc.stderr.strip() if isinstance(exc, subprocess.CalledProcessError) and exc.stderr else str(exc)
            raise ToolError(f"Inkscape could not render flashcard images: {stderr}") from exc
        for key, name in output_names.items():
            rendered = temp / f"{name}.png"
            if not rendered.is_file():
                raise ToolError(f"Inkscape did not create {rendered.name}")
            try:
                with Image.open(rendered) as image:
                    bounds = image.getchannel("A").getbbox()
                    if bounds and bounds != (0, 0, image.width, image.height):
                        trimmed = temp / f"{name}-trimmed.png"
                        image.crop(bounds).save(trimmed, format="PNG", optimize=True)
                        trimmed.replace(rendered)
            except OSError as exc:
                raise ToolError(f"could not trim transparent space from {rendered.name}: {exc}") from exc
            (paths.flashcard_images / rendered.name).write_bytes(rendered.read_bytes())

    manifest = {
        "version": 1,
        "visuals": {
            key: {"file": f"{output_names[key]}.png", "sha256": _visual_hash(requests[key][2])}
            for key in requests
        },
    }
    manifest_path = paths.flashcard_images / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return len(requests)


def _paeth(a: int, b: int, c: int) -> int:
    """Return the PNG Paeth predictor for the three neighboring channel bytes."""
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    return a if pa <= pb and pa <= pc else b if pb <= pc else c


def _png_rgb(data: bytes) -> tuple[int, int, bytes]:
    """Decode an 8-bit RGB/RGBA PNG and composite transparency onto white."""
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("not a PNG image")
    offset = 8
    width = height = bit_depth = color_type = interlace = 0
    compressed = bytearray()
    while offset + 12 <= len(data):
        length = struct.unpack_from(">I", data, offset)[0]
        kind = data[offset + 4:offset + 8]
        start, end = offset + 8, offset + 8 + length
        if end + 4 > len(data):
            raise ValueError("truncated PNG chunk")
        if kind == b"IHDR":
            width, height, bit_depth, color_type, _, _, interlace = struct.unpack(">IIBBBBB", data[start:end])
        elif kind == b"IDAT":
            compressed.extend(data[start:end])
        elif kind == b"IEND":
            break
        offset = end + 4
    channels = {2: 3, 6: 4}.get(color_type)
    if not width or not height or bit_depth != 8 or channels is None or interlace:
        raise ValueError("unsupported PNG pixel format")
    stride = width * channels
    raw = zlib.decompress(compressed)
    if len(raw) != height * (stride + 1):
        raise ValueError("incomplete PNG pixel data")

    rgb = bytearray(width * height * 3)
    previous = bytearray(stride)
    src = dst = 0
    for _ in range(height):
        filter_type = raw[src]
        src += 1
        scanline = bytearray(raw[src:src + stride])
        src += stride
        for i, value in enumerate(scanline):
            left = scanline[i - channels] if i >= channels else 0
            above = previous[i]
            upper_left = previous[i - channels] if i >= channels else 0
            if filter_type == 1:
                scanline[i] = (value + left) & 0xff
            elif filter_type == 2:
                scanline[i] = (value + above) & 0xff
            elif filter_type == 3:
                scanline[i] = (value + (left + above) // 2) & 0xff
            elif filter_type == 4:
                scanline[i] = (value + _paeth(left, above, upper_left)) & 0xff
            elif filter_type != 0:
                raise ValueError(f"unsupported PNG filter {filter_type}")
        for i in range(0, stride, channels):
            alpha = scanline[i + 3] if channels == 4 else 255
            for channel in range(3):
                rgb[dst] = (scanline[i + channel] * alpha + 255 * (255 - alpha) + 127) // 255
                dst += 1
        previous = scanline
    return width, height, bytes(rgb)


def load_cached_visuals(paths: Paths, cards: list[tuple[str, dict[str, Any]]]) -> dict[str, tuple[int, int, bytes]]:
    """Load verified cached images as RGB pixels for the original PDF backend."""
    cached = cached_visual_paths(paths, cards)
    images = {}
    for key, image_path in cached.items():
        try:
            images[key] = _png_rgb(image_path.read_bytes())
        except (OSError, ValueError, zlib.error, struct.error) as exc:
            raise ToolError(f"cannot load cached flashcard figure {image_path.name}: {exc}") from exc
    return images


def cached_visual_paths(paths: Paths, cards: list[tuple[str, dict[str, Any]]]) -> dict[str, Path]:
    """Validate cache hashes and return PNG paths for direct ReportLab embedding."""
    requests = _requests(cards)
    if not requests:
        return {}
    manifest_path = paths.flashcard_images / "manifest.json"
    if not manifest_path.is_file():
        raise ToolError("flashcard figure cache missing; run `python3 -m tools flashcard-images` first")
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolError(f"cannot read flashcard figure cache manifest: {exc}") from exc

    images = {}
    for key, (qid, _, visual) in requests.items():
        entry = manifest.get("visuals", {}).get(key)
        if not entry or entry.get("sha256") != _visual_hash(visual):
            raise ToolError(f"flashcard figure cache is missing or stale for {key}; rerun `python3 -m tools flashcard-images`")
        image_path = paths.flashcard_images / entry["file"]
        if not image_path.is_file():
            raise ToolError(f"cached flashcard figure is missing: {image_path.name}; rerun `python3 -m tools flashcard-images`")
        images[key] = image_path
    return images
