"""Small, dependency-free helpers: colour maths, text metrics, timing."""
from __future__ import annotations

import math
import re

# --------------------------------------------------------------------------
# Colour
# --------------------------------------------------------------------------


def hex_to_rgb(value: str) -> tuple[int, int, int]:
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise ValueError(f"bad hex colour: {value!r}")
    return int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16)


def rgb_to_hex(rgb: tuple[int, int, int]) -> str:
    return "#%02X%02X%02X" % tuple(max(0, min(255, int(round(c)))) for c in rgb)


def ass_colour(value: str, alpha: int = 0) -> str:
    """#RRGGBB -> &HAABBGGRR (ASS is BGR, alpha 0 = opaque)."""
    r, g, b = hex_to_rgb(value)
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"


def mix(a: str, b: str, t: float) -> str:
    ar, ag, ab = hex_to_rgb(a)
    br, bg, bb = hex_to_rgb(b)
    return rgb_to_hex((ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t))


def lighten(c: str, t: float) -> str:
    return mix(c, "#FFFFFF", t)


def darken(c: str, t: float) -> str:
    return mix(c, "#000000", t)


def luminance(c: str) -> float:
    r, g, b = (x / 255 for x in hex_to_rgb(c))
    f = lambda x: x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def readable_on(bg: str, light: str = "#FFFFFF", dark: str = "#101014") -> str:
    return light if luminance(bg) < 0.45 else dark


# --------------------------------------------------------------------------
# Text
# --------------------------------------------------------------------------

# Average glyph advance as a fraction of font size, measured for the bundled
# families. Used only for wrapping / fitting, so approximate is fine.
FONT_WIDTH = {
    "Poppins": 0.545,
    "Poppins SemiBold": 0.555,
    "Poppins Bold": 0.565,
    "Poppins ExtraBold": 0.575,
    "Anton": 0.435,
    "Bebas Neue": 0.40,
    "DM Serif Display": 0.475,
    "IBM Plex Mono": 0.60,
    "DejaVu Sans": 0.58,
}

NARROW = set("iljtfrI.,:;'!|()[] ")
WIDE = set("mwMW@%")


def text_width(text: str, font: str, size: float) -> float:
    factor = FONT_WIDTH.get(font, 0.55)
    width = 0.0
    for ch in text:
        if ch in NARROW:
            width += factor * 0.55
        elif ch in WIDE:
            width += factor * 1.35
        elif ch.isdigit():
            width += factor * 1.03
        elif ch.isupper():
            width += factor * 1.12
        else:
            width += factor
    return width * size


def wrap(text: str, font: str, size: float, max_width: float) -> list[str]:
    """Greedy wrap using estimated metrics."""
    words = text.split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if text_width(candidate, font, size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def fit_size(text: str, font: str, max_width: float, max_size: float,
             min_size: float = 24) -> float:
    size = max_size
    while size > min_size and text_width(text, font, size) > max_width:
        size -= 2
    return size


WORD_RE = re.compile(r"[A-Za-z0-9']+(?:[-'][A-Za-z0-9']+)*")


def words(text: str) -> list[str]:
    return WORD_RE.findall(text)


def syllables(word: str) -> int:
    w = word.lower().strip("',.!?:;\"()")
    if not w:
        return 0
    vowels = "aeiouy"
    count, prev = 0, False
    for ch in w:
        is_v = ch in vowels
        if is_v and not prev:
            count += 1
        prev = is_v
    if w.endswith("e") and count > 1 and not w.endswith(("le", "ee")):
        count -= 1
    return max(1, count)


def speech_weight(text: str) -> float:
    """Relative spoken length of a phrase (syllable + word-gap model)."""
    ws = words(text)
    if not ws:
        return 0.0
    syl = sum(syllables(w) for w in ws)
    # commas and full stops add pause weight
    pauses = text.count(",") * 0.9 + text.count(".") * 1.6 + text.count("—") * 1.2
    return syl + pauses


def estimate_speech_seconds(text: str, wpm: float = 165) -> float:
    syl = sum(syllables(w) for w in words(text))
    minutes = max(syl, 1) / (wpm * 1.45)
    return minutes * 60.0


# --------------------------------------------------------------------------
# Timecode / formatting
# --------------------------------------------------------------------------


def ass_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    cs = int(round(seconds * 100))
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, cs = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def srt_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    ms = int(round(seconds * 1000))
    h, rem = divmod(ms, 3600000)
    m, rem = divmod(rem, 60000)
    s, ms = divmod(rem, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def ease_out(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    return 1 - (1 - t) ** 3


def lerp(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def slugify(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:60] or "video"


def fmt_seconds(s: float) -> str:
    s = max(0, int(round(s)))
    return f"{s // 60}:{s % 60:02d}"


def safe_text(text: str) -> str:
    """Escape characters that ASS treats as markup inside a Dialogue line."""
    out = []
    for ch in text:
        if ch in "\\{}":
            out.append({"\\": "\\\u200b", "{": "(", "}": ")"}[ch])
        elif ch == "\n":
            out.append("\\N")
        else:
            out.append(ch)
    return "".join(out)


def round_half(x: float) -> int:
    return int(math.floor(x + 0.5))
