"""Design system: palettes, type scales and safe areas.

Everything the renderer draws is derived from one palette + one type scale, so a
channel looks like a channel and not like a random video. Palettes are
deliberately *mine* (procedural gradients, no stock footage) so pixels are
reproducible and licence-free.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from .util import darken, hex_to_rgb, lighten, mix, readable_on

WIDTH = 1080
HEIGHT = 1920
FPS = 30

# Shorts/Reels/TikTok chrome gets drawn over the bottom ~430px and the top
# ~150px. Nothing that carries meaning may live there.
SAFE_TOP = 190
SAFE_BOTTOM = 1920 - 470
CAPTION_Y = 1430


@dataclass(frozen=True)
class Palette:
    name: str
    bg: tuple[str, str, str]      # gradient stops
    text: str
    accent: str
    accent2: str
    muted: str
    surface: str = ""             # card / panel colour (derived when blank)
    style: str = "cinematic"      # cinematic | paper | neon | grid
    grain: float = 6.0
    vignette: float = 1.0

    # -- derived ---------------------------------------------------------
    def _surface(self) -> str:
        """Panels are *lifted* from the background, never plain white on a dark
        palette: white cards on near-black read as a rendering bug."""
        if self.style == "paper":
            return mix(self.bg[2], "#FFFFFF", 0.55)
        return mix(self.bg[1], self.text, 0.14)

    @property
    def panel(self) -> str:
        return self.surface or self._surface()

    @property
    def ink(self) -> str:
        return readable_on(self.panel, self.text, "#141414")

    @property
    def on_accent(self) -> str:
        return readable_on(self.accent, "#FFFFFF", "#101010")

    @property
    def glow(self) -> str:
        return lighten(self.accent, 0.35)

    @property
    def shade(self) -> str:
        return darken(self.bg[0], 0.45)


PALETTES: dict[str, Palette] = {
    "ember": Palette(
        name="ember",
        bg=("#0C0A09", "#2A1710", "#0A0A0C"),
        text="#F7F1E8", accent="#FF9E2C", accent2="#FF4D3D",
        muted="#8A7E74",
    ),
    "midnight": Palette(
        name="midnight",
        bg=("#050510", "#12173A", "#06060E"),
        text="#EAF0FF", accent="#6C8CFF", accent2="#C9A6FF",
        muted="#6E7796", grain=5.0,
    ),
    "paper": Palette(
        name="paper",
        bg=("#F3EDE2", "#E8DFCF", "#FBF7F0"),
        text="#15120E", accent="#C2410C", accent2="#1D4ED8",
        muted="#6B6357", style="paper",
        grain=9.0, vignette=0.55,
    ),
    "neon": Palette(
        name="neon",
        bg=("#04060A", "#07110D", "#02040A"),
        text="#F2FFF6", accent="#B6FF3C", accent2="#2CE8C5",
        muted="#5C7A68", style="neon", grain=4.0,
    ),
    "clay": Palette(
        name="clay",
        bg=("#2A1511", "#4A2318", "#160B09"),
        text="#FBEDE2", accent="#FF7A59", accent2="#FFC857",
        muted="#9A7365", grain=7.0,
    ),
    "graphite": Palette(
        name="graphite",
        bg=("#0B0C0E", "#1A1D21", "#08090A"),
        text="#F4F6F8", accent="#FF5A5F", accent2="#7BD3FF",
        muted="#7A828C", style="grid", grain=5.0,
    ),
    "sea": Palette(
        name="sea",
        bg=("#04100F", "#0B2B29", "#03100F"),
        text="#EAFBF6", accent="#2DD4A7", accent2="#8BE9FF",
        muted="#5D8479", grain=5.0,
    ),
    "gold": Palette(
        name="gold",
        bg=("#100D06", "#2B2109", "#0B0903"),
        text="#FFF8E6", accent="#F5C451", accent2="#F58E51",
        muted="#8A7A55", grain=6.0,
    ),
}


def get_palette(name: str | None, seed: str = "") -> Palette:
    if name and name in PALETTES:
        return PALETTES[name]
    if name:
        return PALETTES["ember"]
    names = sorted(PALETTES)
    idx = sum(ord(c) for c in seed) % len(names)
    return PALETTES[names[idx]]


@dataclass(frozen=True)
class TypeScale:
    display: int = 104
    headline: int = 88
    sub: int = 46
    kicker: int = 30
    caption: int = 66
    label: int = 34
    mono: int = 34
    giant: int = 300


TYPE = TypeScale()


@dataclass
class Brand:
    """End-card identity. No 'smash subscribe' spam - Shorts punish it."""

    name: str = "LEAP"
    handle: str = ""
    tagline: str = ""
    accent: str = ""


@dataclass
class MusicSpec:
    file: str | None = None
    gain_db: float = -27.0
    fade_out: float = 1.5
    mood: str = "tension"


@dataclass
class RenderSpec:
    width: int = WIDTH
    height: int = HEIGHT
    fps: int = FPS
    crf: int = 19
    preset: str = "medium"
    target_lufs: float = -14.0
    transition: float = 0.22
    burn_captions: bool = True
    export_srt: bool = True
    background_variation: bool = True
    extras: dict = field(default_factory=dict)


def palette_preview(p: Palette) -> str:
    """One-line swatch, handy for `leap palettes`."""
    return (f"{p.name:<10} bg {p.bg[1]:<8} text {p.text:<8} "
            f"accent {p.accent:<8} {p.style}")


__all__ = [
    "WIDTH", "HEIGHT", "FPS", "SAFE_TOP", "SAFE_BOTTOM", "CAPTION_Y",
    "Palette", "PALETTES", "get_palette", "TypeScale", "TYPE", "Brand",
    "MusicSpec", "RenderSpec", "palette_preview", "mix", "hex_to_rgb",
]
