"""Tests for the private Inkscape snapshot cache and PNG decoding."""

import binascii
import json
import struct
import tempfile
import unittest
import zlib
from pathlib import Path

from tools.common import Paths, ToolError
from tools.flashcard_images import _png_rgb, cached_visual_paths, load_cached_visuals, _visual_hash


def png_chunk(kind, content):
    """Encode one PNG chunk with its length and CRC for compact test fixtures."""
    checksum = binascii.crc32(kind + content) & 0xffffffff
    return struct.pack(">I", len(content)) + kind + content + struct.pack(">I", checksum)


def one_pixel_png(color):
    """Build a minimal one-pixel RGB PNG used by cache tests."""
    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
            + png_chunk(b"IDAT", zlib.compress(b"\x00" + bytes(color)))
            + png_chunk(b"IEND", b""))


class FlashcardImageCacheTest(unittest.TestCase):
    """Test cached-image decoding, path validation, and stale-config detection."""

    def test_png_rgb_decodes_pixels(self):
        """RGB decoding preserves the source PNG's pixel values."""
        self.assertEqual(_png_rgb(one_pixel_png((12, 34, 56))), (1, 1, bytes((12, 34, 56))))

    def test_cache_loads_matching_images_and_rejects_stale_config(self):
        """Valid snapshots load, while changed visual parameters invalidate them."""
        visual = {"template": "example", "version": 1, "params": {"value": 1}}
        cards = [("q-0001", {"visual": visual})]
        with tempfile.TemporaryDirectory() as temp_dir:
            paths = Paths(Path(temp_dir))
            paths.flashcard_images.mkdir(parents=True)
            (paths.flashcard_images / "q-0001-before.png").write_bytes(one_pixel_png((1, 2, 3)))
            (paths.flashcard_images / "q-0001-after.png").write_bytes(one_pixel_png((4, 5, 6)))
            manifest = {
                "version": 1,
                "visuals": {
                    f"q-0001:{phase}": {
                        "file": f"q-0001-{phase}.png",
                        "sha256": _visual_hash(visual),
                    }
                    for phase in ("before", "after")
                },
            }
            (paths.flashcard_images / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

            image_paths = cached_visual_paths(paths, cards)
            self.assertEqual(image_paths["q-0001:before"], paths.flashcard_images / "q-0001-before.png")
            images = load_cached_visuals(paths, cards)
            self.assertEqual(images["q-0001:before"], (1, 1, bytes((1, 2, 3))))
            self.assertEqual(images["q-0001:after"], (1, 1, bytes((4, 5, 6))))

            cards[0][1]["visual"]["params"]["value"] = 2
            with self.assertRaisesRegex(ToolError, "stale"):
                load_cached_visuals(paths, cards)


if __name__ == "__main__":
    unittest.main()
