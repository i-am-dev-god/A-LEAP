"""Caption layout: wrap the word stream into lines and paint them per frame.

One line at a time, up to four words, the active word knocked out of a solid
highlight — the shape every short-form story channel uses.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from .tts import Word

MAX_WORDS = 4
MAX_WIDTH = 940
HIGHLIGHT = (255, 208, 0)
HIGHLIGHT_TEXT = (16, 16, 18)
TEXT = (255, 255, 255)
STROKE = (8, 8, 10)
BASELINE = 1500  # y of the caption block's baseline


@dataclass
class Glyph:
    """Where one word sits: draw origin plus its real ink box."""

    word: Word
    x: int
    draw_y: int
    width: int
    ink_top: int
    ink_bottom: int


@dataclass
class Line:
    words: list[Word]
    start: float
    end: float
    layout: list[Glyph] = field(default_factory=list)


class Captions:
    def __init__(self, lines: list[Line], font: ImageFont.FreeTypeFont):
        self.lines = lines
        self.font = font

    @classmethod
    def build(cls, words: list[Word], size: int = 76, font_path: str | None = None) -> "Captions":
        font = ImageFont.truetype(font_path or _default_font(bold=True), size)
        return cls(_group(words, font), font)

    def draw(self, frame: Image.Image, t: float) -> None:
        line = self._active(t)
        if line is None:
            return
        draw = ImageDraw.Draw(frame)
        active = next(
            (i for i, w in enumerate(line.words) if w.start <= t < w.end),
            len(line.words) - 1,
        )
        for index, glyph in enumerate(line.layout):
            if index == active:
                pad_x, pad_y = 16, 14
                draw.rounded_rectangle(
                    (
                        glyph.x - pad_x,
                        glyph.ink_top - pad_y,
                        glyph.x + glyph.width + pad_x,
                        glyph.ink_bottom + pad_y,
                    ),
                    radius=20,
                    fill=HIGHLIGHT,
                )
                draw.text((glyph.x, glyph.draw_y), glyph.word.text, font=self.font, fill=HIGHLIGHT_TEXT)
            else:
                draw.text(
                    (glyph.x, glyph.draw_y),
                    glyph.word.text,
                    font=self.font,
                    fill=TEXT,
                    stroke_width=9,
                    stroke_fill=STROKE,
                )

    def _active(self, t: float) -> Line | None:
        for line in self.lines:
            if line.start <= t <= line.end:
                return line
        return None


def _group(words: list[Word], font: ImageFont.FreeTypeFont) -> list[Line]:
    lines: list[Line] = []
    batch: list[Word] = []
    for word in words:
        trial = [*batch, word]
        if batch and (len(trial) > MAX_WORDS or _width(trial, font) > MAX_WIDTH):
            lines.append(_make_line(batch, font))
            batch = [word]
        else:
            batch = trial
    if batch:
        lines.append(_make_line(batch, font))
    return lines


def _make_line(words: list[Word], font: ImageFont.FreeTypeFont) -> Line:
    widths = [int(font.getlength(w.text)) for w in words]
    space = int(font.getlength(" ")) + 4
    total = sum(widths) + space * (len(words) - 1)
    x = (1080 - total) // 2
    layout: list[Glyph] = []
    for word, width in zip(words, widths):
        bbox = font.getbbox(word.text)  # (left, top, right, bottom) in origin space
        draw_y = BASELINE - bbox[3]
        layout.append(
            Glyph(
                word=word,
                x=x,
                draw_y=draw_y,
                width=width,
                ink_top=draw_y + bbox[1],
                ink_bottom=draw_y + bbox[3],
            )
        )
        x += width + space
    return Line(words=words, start=words[0].start, end=words[-1].end, layout=layout)


def _width(words: list[Word], font: ImageFont.FreeTypeFont) -> int:
    if not words:
        return 0
    total = sum(int(font.getlength(w.text)) for w in words)
    return total + int(font.getlength(" ")) * (len(words) - 1)


def _default_font(bold: bool = False) -> str:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"
        if bold
        else "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
        "/Library/Fonts/Arial Bold.ttf" if bold else "/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if Path(path).exists():
            return path
    raise SystemExit("No usable font found. Pass --font /path/to/Bold.ttf")
