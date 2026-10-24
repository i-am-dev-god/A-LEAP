"""The video contract.

A LEAP video is a JSON file: a slug, a palette, and an ordered list of shots.
Shots are semantic ("stat", "compare", "timeline"...) not pixel-level, so the
renderer can restyle the whole channel without touching the writing.

    shot.kind            what it is
    shot.vo              exactly what the voice says (drives duration + captions)
    shot.headline/sub    what the viewer reads (drives the layout)

Everything else is optional. Unknown keys are preserved in `extra`.
"""
from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from .theme import Brand, MusicSpec, RenderSpec, get_palette
from .util import slugify, speech_weight, words

KINDS = {
    "statement",   # kicker + headline + sub, editorial opener
    "stat",        # one giant number, context underneath
    "flash",       # 1-3 punched words, high contrast, fast
    "quote",       # serif pull-quote card
    "receipt",     # paper card with rows (costs, maths, before/after)
    "list",        # 2-5 items revealed one by one
    "compare",     # left vs right columns
    "timeline",    # horizontal time axis with markers
    "chart",       # horizontal bars with values
    "terminal",    # mono lines, typed on
    "endcard",     # brand card + next-episode hook
}

BEATS = {"HOOK", "STAKES", "TURN", "PROOF", "REFRAME", "LOOP", "BODY"}


@dataclass
class Shot:
    kind: str = "statement"
    vo: str = ""
    beat: str = "BODY"

    kicker: str | None = None
    headline: str | None = None
    sub: str | None = None

    number: str | None = None
    unit: str | None = None

    items: list[str] = field(default_factory=list)
    bars: list[dict[str, Any]] = field(default_factory=list)
    rows: list[dict[str, Any]] = field(default_factory=list)
    markers: list[dict[str, Any]] = field(default_factory=list)
    lines: list[str] = field(default_factory=list)

    left: dict[str, Any] | None = None
    right: dict[str, Any] | None = None

    quote: str | None = None
    attribution: str | None = None

    emphasis: list[str] = field(default_factory=list)
    transition: str | None = None
    palette: str | None = None
    pace: float = 1.0
    min_duration: float = 0.0
    extra: dict[str, Any] = field(default_factory=dict)

    # filled in by the timing pass
    start: float = 0.0
    duration: float = 0.0
    word_times: list[list[Any]] = field(default_factory=list)

    # ------------------------------------------------------------------
    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Shot":
        known = {f for f in cls.__dataclass_fields__ if f not in {"extra", "start", "duration", "word_times"}}
        data = {k: v for k, v in raw.items() if k in known}
        extra = {k: v for k, v in raw.items() if k not in known}
        shot = cls(**data)
        shot.extra = extra
        shot.validate()
        return shot

    def validate(self) -> None:
        if self.kind not in KINDS:
            raise ValueError(f"unknown shot kind {self.kind!r}; expected one of {sorted(KINDS)}")
        if self.beat not in BEATS:
            self.beat = "BODY"
        if self.kind in {"stat", "chart"} and not (self.number or self.bars):
            raise ValueError(f"{self.kind} shot needs `number` or `bars`")
        if self.kind == "compare" and not (self.left and self.right):
            raise ValueError("compare shot needs `left` and `right` objects")
        if self.kind == "timeline" and not self.markers:
            raise ValueError("timeline shot needs `markers`")
        if self.pace <= 0:
            self.pace = 1.0

    # ------------------------------------------------------------------
    @property
    def spoken(self) -> str:
        return self.vo or self.headline or self.quote or " ".join(self.lines) or ""

    def speech_seconds(self, wpm: int = 165) -> float:
        return max(1.1, speech_weight(self.spoken) / (wpm * 1.45 / 60.0) * 0.62)

    def on_screen_text(self) -> list[str]:
        """Every string this shot actually puts in front of the viewer.

        Used by the linter to prove that `emphasis` words are visible, so it has
        to include the sub-objects (rows, bars, markers, compare sides) and not
        just the headline.
        """
        out = [t for t in (self.kicker, self.headline, self.sub, self.quote,
                           self.number, self.unit, self.attribution) if t]
        out += list(self.items) + list(self.lines)
        for key in ("rows", "bars", "markers"):
            for item in getattr(self, key) or []:
                out += [str(v) for k, v in item.items() if k != "colour"]
        for side in (self.left or {}, self.right or {}):
            out += [str(v) for v in side.values()]
        return [t for t in out if t]

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        for key in ("start", "duration", "word_times"):
            d.pop(key, None)
        extra = d.pop("extra", {})
        d = {k: v for k, v in d.items() if not _empty(v)}
        d.update(extra)
        if self.transition:
            d["transition"] = self.transition
        return d


def _empty(v: Any) -> bool:
    return v is None or v == [] or v == {} or v == 0 or v == 0.0 or v == "" or v is False


@dataclass
class Script:
    slug: str
    title: str
    shots: list[Shot]
    niche: str = ""
    palette: str = ""
    hook: str = ""
    description: str = ""
    tags: list[str] = field(default_factory=list)
    sources: list[str] = field(default_factory=list)
    brand: Brand = field(default_factory=Brand)
    music: MusicSpec = field(default_factory=MusicSpec)
    render: RenderSpec = field(default_factory=RenderSpec)
    voice: dict[str, Any] = field(default_factory=dict)
    meta: dict[str, Any] = field(default_factory=dict)

    # ------------------------------------------------------------------
    @classmethod
    def load(cls, path: str | Path) -> "Script":
        raw = json.loads(Path(path).read_text(encoding="utf-8"))
        return cls.from_dict(raw)

    @classmethod
    def from_dict(cls, raw: dict[str, Any]) -> "Script":
        shots = [Shot.from_dict(s) for s in raw.get("shots", [])]
        if not shots:
            raise ValueError("script has no shots")
        brand = Brand(**raw["brand"]) if isinstance(raw.get("brand"), dict) else Brand()
        music = MusicSpec(**raw["music"]) if isinstance(raw.get("music"), dict) else MusicSpec()
        render_raw = raw.get("render") or {}
        render = RenderSpec(**{k: v for k, v in render_raw.items()
                               if k in RenderSpec.__dataclass_fields__})
        script = cls(
            slug=raw.get("slug") or slugify(raw.get("title", "video")),
            title=raw.get("title", "untitled"),
            shots=shots,
            niche=raw.get("niche", ""),
            palette=raw.get("palette", ""),
            hook=raw.get("hook", ""),
            description=raw.get("description", ""),
            tags=list(raw.get("tags", [])),
            sources=list(raw.get("sources", [])),
            brand=brand,
            music=music,
            render=render,
            voice=raw.get("voice", {}) or {},
            meta=raw.get("meta", {}) or {},
        )
        script.validate()
        return script

    def to_dict(self) -> dict[str, Any]:
        return {
            "slug": self.slug,
            "title": self.title,
            "niche": self.niche,
            "palette": self.palette,
            "hook": self.hook,
            "description": self.description,
            "tags": self.tags,
            "sources": self.sources,
            "brand": asdict(self.brand),
            "music": asdict(self.music),
            "render": asdict(self.render),
            "voice": self.voice,
            "meta": self.meta,
            "shots": [s.to_dict() for s in self.shots],
        }

    def save(self, path: str | Path) -> Path:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(json.dumps(self.to_dict(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        return p

    # ------------------------------------------------------------------
    def validate(self) -> None:
        if not self.shots:
            raise ValueError("script has no shots")
        if self.shots[0].kind == "endcard":
            raise ValueError("a video cannot open on the end card")
        total = sum(s.speech_seconds() for s in self.shots)
        if total > 95:
            raise ValueError(f"script is ~{total:.0f}s of speech; Shorts want 20-60s. Cut shots.")
        if not self.hook:
            self.hook = self.shots[0].headline or self.shots[0].vo
        if not self.palette:
            self.palette = get_palette(None, seed=self.slug).name

    # ------------------------------------------------------------------
    def word_count(self) -> int:
        return sum(len(words(s.spoken)) for s in self.shots)

    def estimated_duration(self) -> float:
        return sum(s.speech_seconds() for s in self.shots) + 0.35 * len(self.shots)

    def summary(self) -> str:
        lines = [f"{self.slug}  |  {self.title}",
                 f"{len(self.shots)} shots · {self.word_count()} words · "
                 f"~{self.estimated_duration():.0f}s · palette {self.palette}"]
        for i, s in enumerate(self.shots):
            lines.append(f"  {i + 1:>2}. {s.beat:<7} {s.kind:<9} "
                         f"{s.headline or s.vo[:52]!r}")
        return "\n".join(lines)
