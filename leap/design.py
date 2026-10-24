"""The design layer: ASS subtitles as a vector graphics language.

Everything on screen is generated here as an ASS event stream. That sounds
archaic and is in fact the fastest, most deterministic 2D renderer that ships
with every ffmpeg build: real font shaping, kerning, per-glyph colour, precise
timing, one file, no browser, no GPU, no assets.

Two rules this file follows:
  1. Nothing meaningful outside the safe area (Short/Reel/TikTok chrome).
  2. Type does the work. No clip-art, no emoji, no stock footage.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from .theme import CAPTION_Y, HEIGHT, SAFE_BOTTOM, WIDTH, Palette
from .util import (ass_colour, ass_time, clamp, readable_on, text_width,
                   wrap)

MARGIN = 84
COL = WIDTH - 2 * MARGIN

# fonts bundled with LEAP (SIL Open Font License, see assets/fonts/OFL.txt)
F_DISPLAY = "DM Serif Display"
F_UI = "Poppins"
F_UI_BOLD = "Poppins SemiBold"
F_UI_HEAVY = "Poppins ExtraBold"
F_COND = "Bebas Neue"
F_IMPACT = "Anton"
F_MONO = "IBM Plex Mono"


# --------------------------------------------------------------------------
# shapes
# --------------------------------------------------------------------------


def rounded_rect(x: float, y: float, w: float, h: float, r: float) -> str:
    """ASS drawing path for a rounded rectangle (origin at top-left)."""
    r = max(0.0, min(r, w / 2, h / 2))
    if r <= 0.5:
        return f"m {x:.1f} {y:.1f} l {x + w:.1f} {y:.1f} l {x + w:.1f} {y + h:.1f} l {x:.1f} {y + h:.1f}"
    c = r * 0.5523
    p = [f"m {x + r:.1f} {y:.1f}",
         f"l {x + w - r:.1f} {y:.1f}",
         f"b {x + w - r + c:.1f} {y:.1f} {x + w:.1f} {y + r - c:.1f} {x + w:.1f} {y + r:.1f}",
         f"l {x + w:.1f} {y + h - r:.1f}",
         f"b {x + w:.1f} {y + h - r + c:.1f} {x + w - r + c:.1f} {y + h:.1f} {x + w - r:.1f} {y + h:.1f}",
         f"l {x + r:.1f} {y + h:.1f}",
         f"b {x + r - c:.1f} {y + h:.1f} {x:.1f} {y + h - r + c:.1f} {x:.1f} {y + h - r:.1f}",
         f"l {x:.1f} {y + r:.1f}",
         f"b {x:.1f} {y + r - c:.1f} {x + r - c:.1f} {y:.1f} {x + r:.1f} {y:.1f}"]
    return " ".join(p)


def rect(x: float, y: float, w: float, h: float) -> str:
    return f"m {x:.1f} {y:.1f} l {x + w:.1f} {y:.1f} l {x + w:.1f} {y + h:.1f} l {x:.1f} {y + h:.1f}"


# --------------------------------------------------------------------------
# ASS document
# --------------------------------------------------------------------------


@dataclass
class Style:
    name: str
    font: str
    size: float
    colour: str
    bold: bool = False
    outline: float = 0.0
    shadow: float = 0.0
    border_style: int = 1
    outline_colour: str = "#000000"
    back_colour: str = "#000000"
    align: int = 7
    margin_l: int = MARGIN
    margin_r: int = MARGIN
    margin_v: int = 0
    spacing: float = 0.0
    alpha: int = 0


@dataclass
class Event:
    style: str
    start: float
    end: float
    text: str
    layer: int = 0
    comment: bool = False


class ASSDocument:
    def __init__(self, palette: Palette, width: int = WIDTH, height: int = HEIGHT,
                 fps: int = 30):
        self.palette = palette
        self.width = width
        self.height = height
        self.fps = fps
        self.styles: dict[str, Style] = {}
        self.events: list[Event] = []
        self._install_base_styles()

    # -- styles --------------------------------------------------------
    def add_style(self, style: Style) -> None:
        self.styles[style.name] = style

    def _install_base_styles(self) -> None:
        p = self.palette
        ink = p.ink
        self.add_style(Style("kicker", F_UI_BOLD, 30, p.accent, spacing=4.5))
        self.add_style(Style("headline", F_UI_BOLD, 88, p.text))
        self.add_style(Style("headline_serif", F_DISPLAY, 96, p.text))
        self.add_style(Style("headline_impact", F_IMPACT, 104, p.text))
        self.add_style(Style("sub", F_UI, 44, p.muted))
        self.add_style(Style("giant", F_IMPACT, 300, p.accent))
        self.add_style(Style("giant_ui", F_UI_HEAVY, 250, p.accent))
        self.add_style(Style("unit", F_UI_BOLD, 52, p.text))
        self.add_style(Style("label", F_UI_BOLD, 32, p.text))
        self.add_style(Style("body", F_UI, 42, p.text))
        self.add_style(Style("mono", F_MONO, 34, p.text))
        self.add_style(Style("mono_small", F_MONO, 28, p.muted))
        self.add_style(Style("chip", F_UI_BOLD, 30, ink, border_style=3, outline=18,
                             outline_colour=p.accent, align=7))
        self.add_style(Style("caption", F_UI_BOLD, 62, p.text, align=2,
                             outline=7, outline_colour="#000000",
                             margin_v=HEIGHT - CAPTION_Y, shadow=0))
        self.add_style(Style("caption_word", F_UI_BOLD, 62, p.accent, align=2,
                             outline=7, outline_colour="#000000",
                             margin_v=HEIGHT - CAPTION_Y))
        self.add_style(Style("quote", F_DISPLAY, 78, p.text))
        self.add_style(Style("attrib", F_MONO, 30, p.muted))
        self.add_style(Style("brand", F_UI_HEAVY, 96, p.text))
        self.add_style(Style("shape", F_UI, 40, p.accent, align=7, border_style=1,
                             outline=0, shadow=0))
        self.add_style(Style("shape_soft", F_UI, 40, p.panel, align=7))

    # -- events --------------------------------------------------------
    def add(self, style: str, start: float, end: float, text: str,
            layer: int = 0, comment: bool = False) -> None:
        if end <= start:
            return
        self.events.append(Event(style, round(start, 3), round(end, 3), text, layer, comment))

    def shape(self, start: float, end: float, path: str, colour: str, *,
              alpha: int = 0, layer: int = 0, tag: str = "") -> None:
        body = f"{{\\an7\\pos(0,0)\\p1\\bord0\\shad0\\1c{ass_colour(colour)}\\1a&H{alpha:02X}&{tag}}}{path}{{\\p0}}"
        self.add("shape", start, end, body, layer=layer)

    # -- output --------------------------------------------------------
    def render(self) -> str:
        lines = [
            "[Script Info]",
            "ScriptType: v4.00+",
            f"PlayResX: {self.width}",
            f"PlayResY: {self.height}",
            "WrapStyle: 0",
            "ScaledBorderAndShadow: yes",
            "YCbCr Matrix: TV.709",
            "",
            "[V4+ Styles]",
            ("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, "
             "OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, "
             "ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, "
             "Alignment, MarginL, MarginR, MarginV, Encoding"),
        ]
        for s in self.styles.values():
            lines.append(
                "Style: {name},{font},{size},{primary},{secondary},{outline},{back},"
                "{bold},0,0,0,100,100,{spacing},0,{bs},{ol},{sh},{align},{ml},{mr},{mv},1".format(
                    name=s.name, font=s.font, size=int(round(s.size)),
                    primary=ass_colour(s.colour, s.alpha),
                    secondary=ass_colour(s.colour, s.alpha),
                    outline=ass_colour(s.outline_colour),
                    back=ass_colour(s.back_colour, 0x60),
                    bold=-1 if s.bold else 0, spacing=s.spacing, bs=s.border_style,
                    ol=s.outline, sh=s.shadow, align=s.align,
                    ml=s.margin_l, mr=s.margin_r, mv=s.margin_v,
                )
            )
        lines += ["", "[Events]",
                  "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
        for e in sorted(self.events, key=lambda ev: (ev.start, ev.layer)):
            kind = "Comment" if e.comment else "Dialogue"
            lines.append(f"{kind}: {e.layer},{ass_time(e.start)},{ass_time(e.end)},"
                         f"{e.style},,0,0,0,,{e.text}")
        return "\n".join(lines) + "\n"


# --------------------------------------------------------------------------
# text utilities
# --------------------------------------------------------------------------


def emphasise(text: str, marks: list[str], colour: str, base: str = "#FFFFFF") -> str:
    """Wrap whole-word matches in an accent colour (case-insensitive)."""
    if not marks:
        return text
    lowered = {m.lower().strip(".,!?%$") for m in marks if m.strip()}
    out: list[str] = []
    for token in text.split(" "):
        core = token.strip(".,!?%$:;\"'()").lower()
        if core and core in lowered:
            out.append(f"{{\\c{ass_colour(colour)}}}{token}{{\\c{ass_colour(base)}}}")
        else:
            out.append(token)
    return " ".join(out)


def lines_for(text: str, font: str, size: float, max_width: float = COL) -> list[str]:
    return wrap(text, font, size, max_width)


def block_height(lines: list[str], size: float, leading: float = 1.16) -> float:
    return len(lines) * size * leading


# --------------------------------------------------------------------------
# primitives
# --------------------------------------------------------------------------


def draw_kicker(doc: ASSDocument, t0: float, t1: float, text: str, y: float,
                *, colour: str | None = None, tick: bool = True,
                layer: int = 6) -> None:
    p = doc.palette
    c = colour or p.accent
    x = MARGIN
    if tick:
        doc.shape(t0, t1, rect(x, y + 4, 34, 6), c, alpha=0, layer=layer)
        x += 52
    doc.add("kicker", t0, t1,
            f"{{\\an7\\pos({x},{y})\\fad(180,120)\\1c{ass_colour(c)}}}{text.upper()}", layer=layer)


def draw_progress(doc: ASSDocument, start: float, end: float, colour: str) -> None:
    """Hairline chapter bar: a dimmed track plus a solid fill that advances in
    half-second steps. Cheap, and it tells the thumb-scroller how much is left."""
    total = end - start
    if total <= 0:
        return
    track_w = WIDTH - 2 * MARGIN
    doc.shape(start, end, rect(MARGIN, 44, track_w, 4), doc.palette.text, alpha=0xD8, layer=9)
    step = 0.5
    n = max(1, int(math.ceil(total / step)))
    for i in range(n):
        a = start + i * step
        b = min(end, a + step + 0.02)
        progress = clamp((i + 1) / n, 0.0, 1.0)
        doc.shape(a, b, rect(MARGIN, 44, track_w * progress, 4), colour, alpha=0x00, layer=9)


def draw_headline(doc: ASSDocument, t0: float, t1: float, text: str, y: float,
                  *, size: float = 88, font: str = F_UI_BOLD, style: str = "headline",
                  colour: str | None = None, marks: list[str] | None = None,
                  accent: str | None = None, max_width: float = COL,
                  stagger: float = 0.085, align: int = 7, x: float | None = None,
                  layer: int = 5, leading: float = 1.14) -> float:
    """Draw wrapped headline lines with a staggered rise-in. Returns bottom y."""
    p = doc.palette
    colour = colour or p.text
    accent = accent or p.accent
    lines = lines_for(text, font, size, max_width)
    anchor_x = MARGIN if x is None else x
    cursor = y
    for i, line in enumerate(lines):
        body_text = emphasise(line, marks or [], accent, colour)
        delay = i * stagger
        a = t0 + delay
        b = t1
        if b - a < 0.12:
            a = max(t0, b - 0.12)
        anim = (f"\\fad(150,120)\\move({anchor_x:.0f},{cursor + 14:.0f},{anchor_x:.0f},{cursor:.0f},0,240)"
                if align == 7 else
                f"\\fad(150,120)\\move({anchor_x:.0f},{cursor + 14:.0f},{anchor_x:.0f},{cursor:.0f},0,240)")
        doc.add(style, a, b,
                f"{{\\an{align}\\pos({anchor_x:.0f},{cursor:.0f})\\1c{ass_colour(colour)}{anim}}}{body_text}",
                layer=layer)
        cursor += size * leading
    return cursor


def draw_sub(doc: ASSDocument, t0: float, t1: float, text: str, y: float,
             *, size: float = 44, colour: str | None = None,
             max_width: float = COL, layer: int = 5, x: float | None = None) -> float:
    p = doc.palette
    colour = colour or p.muted
    anchor = MARGIN if x is None else x
    cursor = y
    for i, line in enumerate(wrap(text, F_UI, size, max_width)):
        a = t0 + i * 0.06
        doc.add("sub", a, t1,
                f"{{\\an7\\pos({anchor:.0f},{cursor:.0f})\\1c{ass_colour(colour)}}}{line}",
                layer=layer)
        cursor += size * 1.32
    return cursor


def draw_rule(doc: ASSDocument, t0: float, t1: float, y: float, w: float,
              colour: str, *, x: float = MARGIN, layer: int = 4) -> None:
    """Accent rule that grows in two steps (ASS has no path interpolation)."""
    doc.shape(t0, min(t1, t0 + 0.26), rect(x, y, w * 0.3, 3), colour, alpha=0x20, layer=layer)
    doc.shape(t0 + 0.26, t1, rect(x, y, w, 3), colour, alpha=0x20, layer=layer)


def draw_chip(doc: ASSDocument, t0: float, t1: float, text: str, y: float,
              *, colour: str | None = None, x: float | None = None,
              layer: int = 6) -> float:
    p = doc.palette
    c = colour or p.accent
    size = 30
    pad_x, pad_y = 22, 14
    w = text_width(text.upper(), F_UI_BOLD, size) + pad_x * 2
    h = size + pad_y * 2
    x = MARGIN if x is None else x
    doc.shape(t0, t1, rounded_rect(x, y, w, h, 10), c, alpha=0xE0, layer=layer)
    ink = readable_on(c, "#FFFFFF", "#111111")
    doc.add("chip", t0, t1,
            f"{{\\an7\\pos({x + pad_x:.0f},{y + pad_y - 4:.0f})\\1c{ass_colour(ink)}"
            f"\\fad(140,100)}}{text.upper()}", layer=layer + 1)
    return y + h


# --------------------------------------------------------------------------
# shot layouts
# --------------------------------------------------------------------------


def layout_statement(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    y = 470.0
    if shot.kicker:
        draw_kicker(doc, t0 + 0.02, t1, shot.kicker, y)
        y += 74
    head_size = 96
    if shot.headline:
        if text_width(shot.headline, F_UI_BOLD, head_size) > COL * 2.1:
            head_size = 82
        bottom = draw_headline(doc, t0 + 0.10, t1, shot.headline, y, size=head_size,
                               marks=shot.emphasis, max_width=COL)
        y = bottom + 26
        draw_rule(doc, t0 + 0.32, t1, y, 150, p.accent)
        y += 34
    if shot.sub:
        draw_sub(doc, t0 + 0.26, t1, shot.sub, y, size=42)
    if shot.number:
        _giant_number(doc, t0, t1, shot.number, shot.unit, 1180)


def _giant_number(doc: ASSDocument, t0: float, t1: float, number: str, unit: str | None,
                  baseline_y: float, *, layer: int = 5) -> None:
    p = doc.palette
    size = 300
    while size > 90 and text_width(number, F_IMPACT, size) > COL:
        size -= 10
    stages = [(0.0, 0.10, 74), (0.10, 0.18, 96), (0.18, 0.28, 104)]
    start = t0 + 0.05
    for i, (a, b, scale) in enumerate(stages):
        live_from = start + a
        live_to = start + b if i < len(stages) - 1 else t1
        doc.add("giant", live_from, live_to,
                f"{{\\an7\\pos({MARGIN},{baseline_y:.0f})\\fs{size}\\fscx{scale}\\fscy{scale}"
                f"\\1c{ass_colour(p.accent)}\\blur{2 if i == 0 else 0}\\fad(40,0)}}{number}",
                layer=layer)
    if unit:
        uy = baseline_y + size * 0.72
        doc.add("unit", t0 + 0.24, t1,
                f"{{\\an7\\pos({MARGIN},{uy:.0f})\\1c{ass_colour(p.text)}\\fad(160,0)}}{unit}",
                layer=layer)


def layout_stat(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    """One number, set as large as the frame physically allows.

    Sizing is width *and* height aware: a 300pt numeral wraps its unit into the
    glyphs on a shorter string, which is the most common vertical-video typo.
    """
    p = doc.palette
    y = 430.0
    if shot.kicker:
        draw_kicker(doc, t0 + 0.02, t1, shot.kicker, y)
        y += 96

    number = shot.number or "0"
    secondary = str(shot.extra.get("secondary") or "")
    size = 320
    if secondary:
        size = 200
    while size > 80 and text_width(number, F_IMPACT, size) > COL:
        size -= 8
    # cap by available height: number block + unit + headline + sub
    head_lines = len(lines_for(shot.headline, F_UI_BOLD, 58, COL)) if shot.headline else 0
    sub_lines = len(wrap(shot.sub, F_UI, 36, COL)) if shot.sub else 0
    fixed = 96 + (78 if shot.unit else 0) + head_lines * 70 + sub_lines * 50 + 40
    max_h = (SAFE_BOTTOM + 60) - y - fixed
    size = max(80, min(size, max_h / 0.74))

    base_y = y + 20
    stages = [(0.00, 0.08, 62, 8), (0.08, 0.15, 92, 3), (0.15, 0.22, 103, 0),
              (0.22, 0.29, 100, 0)]
    for i, (a, b, scale, blur) in enumerate(stages):
        live = t1 if i == len(stages) - 1 else t0 + b
        doc.add("giant", t0 + a, live,
                f"{{\\an7\\pos({MARGIN},{base_y:.0f})\\fs{int(size)}\\fscx{scale}\\fscy{scale}"
                f"\\1c{ass_colour(p.accent)}\\blur{blur}\\fad(20,0)}}{number}", layer=5)
    bottom = base_y + size * 0.80

    if secondary:
        doc.add("unit", t0 + 0.16, t1,
                f"{{\\an7\\pos({MARGIN + 16},{bottom + 8:.0f})\\fs54\\1c{ass_colour(p.muted)}}}"
                f"vs {secondary}", layer=5)
        bottom += 74
    elif shot.unit:
        doc.add("unit", t0 + 0.16, t1,
                f"{{\\an7\\pos({MARGIN},{bottom + 12:.0f})\\fs56\\1c{ass_colour(p.text)}"
                f"\\fad(140,0)}}{shot.unit}", layer=5)
        bottom += 92

    if shot.headline:
        bottom = draw_headline(doc, t0 + 0.2, t1, shot.headline, bottom + 18,
                               size=58, style="headline", marks=shot.emphasis,
                               max_width=COL) + 6
    if shot.sub:
        draw_sub(doc, t0 + 0.3, t1, shot.sub, bottom + 14, size=36)


def layout_flash(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    """One to three words, full-screen, punched. The beat-turn device."""
    p = doc.palette
    phrase = (shot.headline or shot.vo or "").strip()
    size = 150
    while size > 70 and max(text_width(w, F_IMPACT, size) for w in phrase.split()) > COL * 0.95:
        size -= 8
    lines = wrap(phrase.upper(), F_IMPACT, size, COL)
    total_h = len(lines) * size * 1.02
    y = 960 - total_h / 2
    for i, line in enumerate(lines):
        a = t0 + i * 0.05
        doc.add("headline_impact", a, t1,
                f"{{\\an5\\pos({WIDTH / 2:.0f},{y + i * size * 1.02 + size / 2:.0f})"
                f"\\fs{size}\\1c{ass_colour(p.text)}\\fad(60,80)\\t(0,120,\\fscx104\\fscy104)"
                f"\\t(120,220,\\fscx100\\fscy100)}}{line}", layer=6)
    if shot.sub:
        doc.add("sub", t0 + 0.1, t1,
                f"{{\\an5\\pos({WIDTH / 2:.0f},{960 + total_h / 2 + 90:.0f})\\fs40"
                f"\\1c{ass_colour(p.muted)}}}{shot.sub}", layer=6)


def layout_quote(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    text = shot.quote or shot.headline or ""
    size = 78
    while size > 48 and len(wrap(text, F_DISPLAY, size, COL)) > 6:
        size -= 4
    lines = wrap(text, F_DISPLAY, size, COL)
    total = len(lines) * size * 1.24
    y = 900 - total / 2
    doc.add("headline_serif", t0, t1,
            f"{{\\an7\\pos({MARGIN - 10}, {y - 150:.0f})\\fs200\\1c{ass_colour(p.accent)}"
            f"\\1a&H50&\\fad(200,0)}}\u201c", layer=3)
    cursor = y
    for i, line in enumerate(lines):
        doc.add("quote", t0 + 0.06 + i * 0.07, t1,
                f"{{\\an7\\pos({MARGIN},{cursor:.0f})\\fs{size}\\1c{ass_colour(p.text)}"
                f"\\fad(180,120)}}{line}", layer=5)
        cursor += size * 1.24
    if shot.attribution:
        doc.shape(t0 + 0.3, t1, rect(MARGIN, cursor + 34, 60, 3), p.accent, alpha=0x20, layer=4)
        doc.add("attrib", t0 + 0.3, t1,
                f"{{\\an7\\pos({MARGIN + 84},{cursor + 12:.0f})\\1c{ass_colour(p.muted)}}}"
                f"{shot.attribution}", layer=5)


def layout_list(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    y = 470.0
    if shot.kicker:
        draw_kicker(doc, t0, t1, shot.kicker, y)
        y += 84
    if shot.headline:
        y = draw_headline(doc, t0 + 0.06, t1, shot.headline, y, size=74,
                          marks=shot.emphasis) + 40
    items = shot.items[:5]
    if not items:
        return
    span = max(0.5, (t1 - t0) * 0.62)
    per = span / max(1, len(items))
    row_h = 116
    for i, item in enumerate(items):
        a = t0 + 0.18 + i * per
        cy = y + i * row_h
        doc.shape(a, t1, rounded_rect(MARGIN, cy + 10, 44, 44, 12), p.accent, alpha=0x22, layer=4)
        doc.add("label", a, t1,
                f"{{\\an7\\pos({MARGIN + 12},{cy + 17})\\fs30\\1c{ass_colour(p.accent)}}}"
                f"{i + 1:02d}", layer=5)
        draw_headline(doc, a, t1, item, cy, size=46, style="headline", x=MARGIN + 74,
                      max_width=COL - 74, stagger=0.0, layer=5)


def layout_compare(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    left, right = shot.left or {}, shot.right or {}
    y = 430.0
    if shot.kicker:
        draw_kicker(doc, t0, t1, shot.kicker, y)
        y += 82
    if shot.headline:
        y = draw_headline(doc, t0 + 0.05, t1, shot.headline, y, size=64,
                          marks=shot.emphasis) + 46
    col_w = (COL - 28) / 2
    inner_w = col_w - 60
    # panel height follows the longest body so nothing is clipped
    body_lines = max(
        len(wrap(str((left or {}).get("body", "")), F_UI, 32, inner_w)),
        len(wrap(str((right or {}).get("body", "")), F_UI, 32, inner_w)),
    )
    panel_h = 250 + body_lines * 46
    for i, (side, accent) in enumerate(((left, p.accent2), (right, p.accent))):
        x = MARGIN + i * (col_w + 28)
        a = t0 + 0.1 + i * 0.12
        doc.shape(a, t1, rounded_rect(x, y, col_w, panel_h, 26), p.panel, alpha=0x28, layer=3)
        doc.shape(a, t1, rounded_rect(x, y, col_w, 6, 3), accent, alpha=0x00, layer=4)
        label = str(side.get("label", ""))
        value = str(side.get("value", ""))
        body = str(side.get("body", ""))
        doc.add("kicker", a, t1, f"{{\\an7\\pos({x + 30:.0f},{y + 32:.0f})"
                f"\\1c{ass_colour(accent)}}}{label.upper()}", layer=5)
        vsize = 72
        while vsize > 34 and text_width(value, F_UI_HEAVY, vsize) > inner_w:
            vsize -= 3
        doc.add("headline", a + 0.05, t1,
                f"{{\\an7\\pos({x + 30:.0f},{y + 92:.0f})\\fs{vsize}"
                f"\\1c{ass_colour(p.text)}}}{value}", layer=5)
        draw_sub(doc, a + 0.1, t1, body, y + 116 + vsize * 0.92, size=32,
                 colour=p.muted, max_width=inner_w, layer=5, x=x + 30)


def layout_chart(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    y = 470.0
    if shot.kicker:
        draw_kicker(doc, t0, t1, shot.kicker, y)
        y += 84
    if shot.headline:
        y = draw_headline(doc, t0 + 0.05, t1, shot.headline, y, size=64,
                          marks=shot.emphasis) + 50
    bars = shot.bars or []
    if not bars:
        return
    peak = max(abs(float(b.get("value", 0)) or 0) for b in bars) or 1.0
    row_h = 108
    bar_x = MARGIN + 210
    bar_w_max = COL - 210
    for i, bar in enumerate(bars):
        a = t0 + 0.16 + i * 0.10
        label = str(bar.get("label", ""))
        value = float(bar.get("value", 0) or 0)
        display = str(bar.get("display", value))
        cy = y + i * row_h
        colour = bar.get("colour") or (p.accent if i == 0 else p.accent2)
        doc.add("label", a, t1,
                f"{{\\an7\\pos({MARGIN},{cy + 16:.0f})\\fs34\\1c{ass_colour(p.text)}}}{label}",
                layer=5)
        track = bar_w_max
        doc.shape(a, t1, rounded_rect(bar_x, cy + 18, track, 34, 8), p.panel, alpha=0x50, layer=3)
        # grow the bar in three steps (no path animation in ASS)
        frac = clamp(abs(value) / peak, 0.05, 1.0)
        for step, share in enumerate((0.45, 0.8, 1.0)):
            seg_a = a + step * 0.09
            seg_b = t1 if step == 2 else a + (step + 1) * 0.09
            doc.shape(seg_a, seg_b, rounded_rect(bar_x, cy + 18, track * frac * share, 34, 8),
                      colour, alpha=0x00, layer=4)
        doc.add("label", a + 0.16, t1,
                f"{{\\an7\\pos({bar_x + track * frac + 16:.0f},{cy + 14:.0f})\\fs32"
                f"\\1c{ass_colour(p.text)}\\fad(150,0)}}{display}", layer=5)


def layout_receipt(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    """Paper receipt: the format that makes a number feel like evidence."""
    p = doc.palette
    y = 500.0
    if shot.kicker:
        draw_kicker(doc, t0, t1, shot.kicker, y - 40)
    rows = shot.rows or []
    head = shot.headline or ""
    card_x, card_w = MARGIN, COL
    card_y = y + 20
    row_h = 92
    card_h = 132 + row_h * max(1, len(rows)) + (90 if shot.sub else 0)
    doc.shape(t0 + 0.04, t1, rounded_rect(card_x + 12, card_y + 16, card_w, card_h, 20),
              "#000000", alpha=0xA8, layer=2)
    doc.shape(t0 + 0.04, t1, rounded_rect(card_x, card_y, card_w, card_h, 20),
              p.panel, alpha=0x10, layer=3)
    doc.shape(t0 + 0.04, t1, rounded_rect(card_x, card_y, card_w, 8, 4), p.accent,
              alpha=0x00, layer=4)
    cy = card_y + 34
    if head:
        doc.add("headline", t0 + 0.10, t1,
                f"{{\\an7\\pos({card_x + 36},{cy:.0f})\\fs44\\1c{ass_colour(p.text)}}}{head}",
                layer=5)
    cy += 92
    doc.shape(t0 + 0.12, t1, rect(card_x + 36, cy - 22, card_w - 72, 2), p.text, alpha=0x40, layer=4)
    for i, row in enumerate(rows):
        a = t0 + 0.16 + i * 0.12
        label = str(row.get("label", ""))
        value = str(row.get("value", ""))
        note = str(row.get("note", ""))
        ry = cy + i * row_h
        doc.add("body", a, t1,
                f"{{\\an7\\pos({card_x + 36},{ry:.0f})\\fs38\\1c{ass_colour(p.muted)}}}{label}",
                layer=5)
        doc.add("body", a, t1,
                f"{{\\an8\\pos({card_x + card_w - 36},{ry + 8:.0f})\\fs38"
                f"\\1c{ass_colour(p.text)}}}{value}", layer=5)
        if note:
            doc.add("mono_small", a + 0.05, t1,
                    f"{{\\an7\\pos({card_x + 36},{ry + 46:.0f})\\1c{ass_colour(p.muted)}}}{note}",
                    layer=5)
    if shot.sub:
        doc.add("mono_small", t0 + 0.4, t1,
                f"{{\\an7\\pos({card_x + 36},{card_y + card_h - 62:.0f})"
                f"\\1c{ass_colour(p.accent)}}}{shot.sub}", layer=5)


def layout_timeline(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    y = 470.0
    if shot.kicker:
        draw_kicker(doc, t0, t1, shot.kicker, y)
        y += 78
    if shot.headline:
        y = draw_headline(doc, t0 + 0.05, t1, shot.headline, y, size=66) + 60
    axis_y = y + 210
    markers = shot.markers or []
    doc.shape(t0 + 0.1, t1, rect(MARGIN, axis_y, COL, 3), p.text, alpha=0x50, layer=3)
    n = max(1, len(markers))
    for i, marker in enumerate(markers):
        x = MARGIN + (COL - 40) * (i / max(1, n - 1)) if n > 1 else MARGIN + COL / 2
        a = t0 + 0.14 + i * 0.12
        label = str(marker.get("label", ""))
        when = str(marker.get("when", ""))
        colour = marker.get("colour") or (p.accent if i == 0 else p.text)
        doc.shape(a, t1, f"m {x:.0f} {axis_y - 26:.0f} l {x + 18:.0f} {axis_y - 18:.0f} "
                         f"l {x:.0f} {axis_y - 10:.0f}", colour, alpha=0x00, layer=4)
        doc.add("mono_small", a, t1,
                f"{{\\an5\\pos({x + 8:.0f},{axis_y - 52:.0f})\\fs28"
                f"\\1c{ass_colour(p.accent if i == 0 else p.muted)}}}{when}", layer=5)
        size = 34
        while size > 22 and text_width(label, F_UI_BOLD, size) > COL / max(2, n) + 40:
            size -= 2
        doc.add("label", a + 0.06, t1,
                f"{{\\an5\\pos({x + 8:.0f},{axis_y + 54:.0f})\\fs{size}"
                f"\\1c{ass_colour(p.text)}}}{label}", layer=5)
    if shot.sub:
        draw_sub(doc, t0 + 0.4, t1, shot.sub, axis_y + 220, size=36)


def layout_terminal(doc: ASSDocument, t0: float, t1: float, shot) -> None:
    p = doc.palette
    y = 560.0
    lines = shot.lines or []
    if not lines:
        return
    card_h = 120 + len(lines) * 64
    doc.shape(t0 + 0.03, t1, rounded_rect(MARGIN, y - 40, COL, card_h, 16), "#000000",
              alpha=0x70, layer=2)
    doc.shape(t0 + 0.03, t1, rounded_rect(MARGIN, y - 40, COL, card_h, 16), p.panel,
              alpha=0x30, layer=3)
    for i, dot in enumerate(("#FF5F57", "#FEBC2E", "#28C840")):
        doc.shape(t0 + 0.05, t1, f"m {MARGIN + 30 + i * 30} {y - 8} l {MARGIN + 44 + i * 30} {y - 8} "
                                  f"l {MARGIN + 44 + i * 30} {y + 6} l {MARGIN + 30 + i * 30} {y + 6}",
                  dot, alpha=0x20, layer=4)
    span = max(0.6, (t1 - t0) * 0.55)
    per = span / max(1, len(lines))
    cy = y + 56
    for i, line in enumerate(lines):
        a = t0 + 0.12 + i * per
        prefix = "❯ " if i == 0 else "  "
        doc.add("mono", a, t1,
                f"{{\\an7\\pos({MARGIN + 36},{cy:.0f})\\fs33"
                f"\\1c{ass_colour(p.accent if i == 0 else p.text)}}}{prefix}{line}", layer=5)
        cy += 64
    if shot.sub:
        draw_sub(doc, t0 + 0.3, t1, shot.sub, y + card_h + 30, size=34)


def layout_endcard(doc: ASSDocument, t0: float, t1: float, shot, brand) -> None:
    p = doc.palette
    cx = WIDTH / 2
    name = (shot.headline or brand.name or "").upper()
    size = 130
    while size > 60 and text_width(name, F_UI_HEAVY, size) > COL:
        size -= 6
    doc.shape(t0 + 0.02, t1, rect(cx - 34, 700, 68, 6), p.accent, alpha=0x00, layer=4)
    doc.add("brand", t0 + 0.06, t1,
            f"{{\\an5\\pos({cx:.0f},830)\\fs{size}\\1c{ass_colour(p.text)}"
            f"\\fad(220,0)\\t(0,260,\\fscx100\\fscy100)\\fscx94\\fscy94}}{name}", layer=5)
    cursor = 940.0
    if shot.sub or brand.tagline:
        line = shot.sub or brand.tagline
        for i, part in enumerate(wrap(line, F_UI, 42, COL - 60)):
            doc.add("sub", t0 + 0.18 + i * 0.05, t1,
                    f"{{\\an5\\pos({cx:.0f},{cursor + i * 56:.0f})\\fs42"
                    f"\\1c{ass_colour(p.muted)}}}{part}", layer=5)
            cursor += 26
        cursor += 46
    if shot.kicker:
        doc.add("kicker", t0 + 0.32, t1,
                f"{{\\an5\\pos({cx:.0f},{cursor + 20:.0f})\\1c{ass_colour(p.accent)}}}"
                f"{shot.kicker.upper()}", layer=5)
    if brand.handle:
        doc.add("attrib", t0 + 0.4, t1,
                f"{{\\an5\\pos({cx:.0f},1500)\\1c{ass_colour(p.muted)}}}{brand.handle}", layer=5)


# --------------------------------------------------------------------------
# captions
# --------------------------------------------------------------------------


def draw_captions(doc: ASSDocument, t0: float, chunks, *, accent: str,
                  base: str, size: float = 62, max_chars: int = 22) -> None:
    """Karaoke captions: the spoken word lights up in the accent colour.

    `chunks` is a list of lists of (word, start, end) in absolute seconds.
    """
    for chunk in chunks:
        if not chunk:
            continue
        words = [w for w, _, _ in chunk]
        joined = " ".join(words)
        if len(joined) > max_chars + 8:
            dial = 58
        else:
            dial = size
        for i, (word, ws, we) in enumerate(chunk):
            if i < len(chunk) - 1:
                we = min(we, chunk[i + 1][1])
            a = max(t0, ws - 0.02)
            b = min(max(we, a + 0.10), chunk[-1][2] + 0.12)
            parts = []
            for j, w in enumerate(words):
                colour = accent if i == j else base
                parts.append(f"{{\\c{ass_colour(colour)}}}{w}")
            body = " ".join(parts)
            pop = "\\t(0,70,\\fscx103\\fscy103)\\t(70,150,\\fscx100\\fscy100)" if i == 0 else ""
            doc.add("caption", a, b,
                    f"{{\\fad(70,40)\\fs{dial}{pop}}}{body}", layer=8)


# --------------------------------------------------------------------------
# pacing
# --------------------------------------------------------------------------


def reading_time(shot) -> float:
    """Minimum seconds this shot needs on screen for its type to be *read*.

    The timeline takes the max of this and the narration length, so a slow
    sentence never truncates an animation and a fast one never leaves a card
    sitting there with nothing happening.
    """
    base = 0.85
    if shot.kicker:
        base += 0.30
    head = shot.headline or ""
    if head:
        lines = lines_for(head, F_UI_BOLD, 88 if shot.kind == "statement" else 62, COL)
        base += 0.42 + 0.30 * len(lines)
    if shot.sub:
        base += 0.22 + 0.16 * len(wrap(shot.sub, F_UI, 40, COL))
    if shot.number:
        base += 0.55
    if shot.quote:
        lines = wrap(shot.quote, F_DISPLAY, 78, COL)
        base += 0.35 + 0.42 * len(lines)
    if shot.items:
        base += 0.30 * min(5, len(shot.items))
    if shot.rows:
        base += 0.46 * len(shot.rows)
    if shot.bars:
        base += 0.20 * len(shot.bars)
    if shot.markers:
        base += 0.20 * len(shot.markers)
    if shot.lines:
        base += 0.22 * len(shot.lines)
    if shot.kind == "endcard":
        base = max(base, 2.2)
    return round(base, 2)
