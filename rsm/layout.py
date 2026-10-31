"""The frame chrome: subreddit header, title card, scrims.

Rendered once as a transparent 1080x1920 overlay and pasted onto every frame,
which is why the video renders at ~30 fps instead of ~4.
"""

from __future__ import annotations

import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1920
CARD = (17, 18, 22, 214)
CARD_EDGE = (255, 255, 255, 26)
TEXT = (247, 248, 250)
MUTED = (166, 172, 186)

AVATAR_COLOURS = [
    (255, 69, 0),
    (0, 149, 235),
    (46, 160, 67),
    (146, 87, 220),
    (219, 68, 55),
]


def chrome(
    subreddit: str,
    author: str,
    title: str,
    upvotes: int = 0,
    comments: int = 0,
    font_dir: str | None = None,
) -> Image.Image:
    base = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    _scrim(base)

    bold = _font(font_dir, "Bold")
    regular = _font(font_dir, "Regular")

    # ---- header card ------------------------------------------------------
    card = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(card)
    draw.rounded_rectangle((36, 84, W - 36, 272), radius=34, fill=CARD, outline=CARD_EDGE, width=2)

    colour = AVATAR_COLOURS[sum(map(ord, subreddit)) % len(AVATAR_COLOURS)]
    draw.ellipse((76, 122, 172, 218), fill=colour)
    letter = (subreddit[:1] or "r").upper()
    lb = bold.getbbox(letter)
    draw.text(
        (124 - (lb[2] + lb[0]) / 2, 170 - (lb[3] + lb[1]) / 2),
        letter,
        font=bold,
        fill=(255, 255, 255),
    )

    draw.text((198, 126), f"r/{subreddit}", font=bold, fill=TEXT)

    parts = [f"u/{author}"]
    if upvotes:
        parts.append(f"{_count(upvotes)} upvotes")
    if comments:
        parts.append(f"{_count(comments)} comments")
    limit = W - 36 - 198 - 28
    size_meta = 30
    meta = "   ·   ".join(parts)
    while draw.textlength(meta, font=regular) > limit and len(parts) > 1:
        parts.pop()
        meta = "   ·   ".join(parts)
    while draw.textlength(meta, font=regular) > limit and size_meta > 20:
        size_meta -= 2
        regular = _font(font_dir, "Regular", size_meta)
    draw.text((198, 186), meta, font=regular, fill=MUTED)

    # ---- title card -------------------------------------------------------
    size = 54
    wrapped = textwrap.wrap(title, width=26)[:5]
    title_font = _font(font_dir, "Bold", size)
    while max((draw.textlength(line, font=title_font) for line in wrapped), default=0) > W - 160:
        size -= 4
        title_font = _font(font_dir, "Bold", size)
        wrapped = textwrap.wrap(title, width=26)[:5]

    line_h = int(size * 1.32)
    pad = 40
    box_h = line_h * len(wrapped) + pad * 2
    draw.rounded_rectangle(
        (36, 300, W - 36, 300 + box_h), radius=32, fill=CARD, outline=CARD_EDGE, width=2
    )
    y = 300 + pad
    for line in wrapped:
        draw.text((70, y), line, font=title_font, fill=TEXT)
        y += line_h

    base.alpha_composite(card)
    return base


def _scrim(img: Image.Image) -> None:
    """Darken top and bottom so white text survives any footage underneath."""
    draw = ImageDraw.Draw(img)
    for y in range(0, 720):
        draw.line((0, y, W, y), fill=(0, 0, 0, int(210 * (1 - y / 720) ** 1.4)))
    for y in range(1120, H):
        draw.line((0, y, W, y), fill=(0, 0, 0, int(225 * ((y - 1120) / (H - 1120)) ** 1.25)))


def _count(n: int) -> str:
    return f"{n / 1000:.1f}k".replace(".0k", "k") if n >= 1000 else str(n)


def _font(font_dir: str | None, weight: str, size: int | None = None):
    from .captions import _default_font

    path = None
    if font_dir:
        candidate = Path(font_dir) / f"DejaVuSans{'-Bold' if weight == 'Bold' else ''}.ttf"
        if candidate.exists():
            path = str(candidate)
    path = path or _default_font(bold=weight == "Bold")
    return ImageFont.truetype(path, size or (44 if weight == "Bold" else 30))
