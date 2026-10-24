"""Turn a script + recorded narration into a timeline, then into an ASS overlay.

The timeline is the single source of truth: shot starts, shot durations, word
timings, caption chunks, and the total runtime. Video assembly just replays it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

from . import design
from .audio import Interval, chunk_words, detect_silences, estimate_word_times, speech_span
from .providers.base import Speech
from .script import Script, Shot
from .theme import CAPTION_Y, HEIGHT, WIDTH, get_palette
from .util import estimate_speech_seconds

LEAD_IN = 0.16
TAIL = 0.20
DEFAULT_MIN = {
    "flash": 0.9,
    "stat": 2.0,
    "endcard": 3.4,
    "terminal": 2.4,
    "list": 2.6,
    "timeline": 2.8,
    "chart": 2.6,
    "compare": 2.8,
    "receipt": 2.6,
    "quote": 2.6,
    "statement": 2.0,
}


@dataclass
class ShotTiming:
    index: int
    shot: Shot
    start: float
    duration: float
    lead: float
    vo_path: Path | None = None
    vo_duration: float = 0.0
    word_times: list[tuple[str, float, float]] = field(default_factory=list)
    chunks: list[list[tuple[str, float, float]]] = field(default_factory=list)

    @property
    def end(self) -> float:
        return self.start + self.duration

    @property
    def speech_start(self) -> float:
        return self.start + self.lead


@dataclass
class Timeline:
    shots: list[ShotTiming]
    duration: float
    palette_name: str

    def at(self, t: float) -> ShotTiming:
        for s in self.shots:
            if s.start <= t < s.end:
                return s
        return self.shots[-1]

    def captions(self) -> list[list[tuple[str, float, float]]]:
        out: list[list[tuple[str, float, float]]] = []
        for s in self.shots:
            out.extend(s.chunks)
        return out


def _silences_for(speech: Speech | None) -> list[Interval]:
    if not speech or speech.provider == "none":
        return []
    try:
        return detect_silences(speech.path)
    except Exception:
        return []


def build_timeline(script: Script, voices: dict[int, Speech] | None = None,
                   *, start_offset: float = 0.0) -> Timeline:
    voices = voices or {}
    timings: list[ShotTiming] = []
    cursor = start_offset
    for i, shot in enumerate(script.shots):
        speech = voices.get(i)
        lead = LEAD_IN if i else 0.28
        if speech is None:
            if shot.spoken:
                seconds = estimate_speech_seconds(shot.spoken)
            else:
                seconds = 1.6
        else:
            seconds = speech.duration
        min_dur = shot.min_duration or DEFAULT_MIN.get(shot.kind, 1.8)
        # pace to the slower of narration and reading time: text never gets cut
        duration = max(min_dur, lead + seconds + TAIL, design.reading_time(shot))
        if i == len(script.shots) - 1:
            duration += 0.55 if shot.kind != "endcard" else 0.2

        # ---- word timings, clipped to this shot's speech window ----------
        word_times: list[tuple[str, float, float]] = []
        if speech and speech.word_times:
            word_times = [(w, cursor + lead + s, cursor + lead + e)
                          for w, s, e in speech.word_times]
        elif shot.spoken:
            silences = _silences_for(speech)
            span = Interval(0.0, seconds)
            if silences:
                span = speech_span(seconds, silences)
            span = Interval(max(0.0, span.start), min(seconds, span.end))
            local = estimate_word_times(shot.spoken, span, silences)
            word_times = [(w, cursor + lead + s, cursor + lead + e) for w, s, e in local]

        timings.append(ShotTiming(index=i, shot=shot, start=cursor, duration=duration,
                                  lead=lead, vo_path=speech.path if speech else None,
                                  vo_duration=seconds, word_times=word_times))
        cursor += duration

    duration = cursor - start_offset
    timeline = Timeline(shots=timings, duration=duration, palette_name=script.palette)
    attach_captions(timeline)
    return timeline


def attach_captions(timeline: Timeline, *, max_words: int = 3,
                    max_chars: int = 22) -> None:
    for s in timeline.shots:
        s.chunks = chunk_words(s.word_times, max_words=max_words, max_chars=max_chars)


# --------------------------------------------------------------------------
# ASS generation
# --------------------------------------------------------------------------


def build_ass(timeline: Timeline, script: Script, *, fonts_dir: Path | None = None,
              safe_area_debug: bool = False, width: int = WIDTH,
              height: int = HEIGHT, fps: int = 30) -> str:
    palette = get_palette(script.palette, seed=script.slug)
    doc = design.ASSDocument(palette, width=width, height=height, fps=fps)
    attach_captions(timeline)

    design.draw_progress(doc, 0.0, timeline.duration, palette.accent)

    for s in timeline.shots:
        shot = s.shot
        palette_i = get_palette(shot.palette or script.palette, seed=script.slug)
        if palette_i is not palette:
            doc.palette = palette_i
            doc._install_base_styles()
        t0 = s.start + (0.04 if s.index == 0 else 0.0)
        t1 = s.end - 0.04

        if shot.kind == "statement":
            design.layout_statement(doc, t0, t1, shot)
        elif shot.kind == "stat":
            design.layout_stat(doc, t0, t1, shot)
        elif shot.kind == "flash":
            design.layout_flash(doc, t0, t1, shot)
        elif shot.kind == "quote":
            design.layout_quote(doc, t0, t1, shot)
        elif shot.kind == "list":
            design.layout_list(doc, t0, t1, shot)
        elif shot.kind == "compare":
            design.layout_compare(doc, t0, t1, shot)
        elif shot.kind == "chart":
            design.layout_chart(doc, t0, t1, shot)
        elif shot.kind == "receipt":
            design.layout_receipt(doc, t0, t1, shot)
        elif shot.kind == "timeline":
            design.layout_timeline(doc, t0, t1, shot)
        elif shot.kind == "terminal":
            design.layout_terminal(doc, t0, t1, shot)
        elif shot.kind == "endcard":
            design.layout_endcard(doc, t0, t1, shot, script.brand)

        if shot.kind != "endcard":
            design.draw_captions(doc, t0, s.chunks, accent=palette_i.accent,
                                 base=palette_i.text)

    if safe_area_debug:
        for y in (190, 1450):
            doc.shape(0, timeline.duration, design.rect(0, y, WIDTH, 4), "#FF00FF", alpha=0x40, layer=20)
        doc.shape(0, timeline.duration, design.rect(CAPTION_Y, 0, 3, HEIGHT), "#00FFFF",
                  alpha=0x60, layer=20)
    return doc.render()


def write_ass(path: Path, content: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    return path


def write_srt(path: Path, timeline: Timeline) -> Path:
    from .util import srt_time

    lines = []
    n = 0
    for chunk in timeline.captions():
        if not chunk:
            continue
        n += 1
        start = chunk[0][1]
        end = chunk[-1][2]
        text = " ".join(w for w, _, _ in chunk)
        lines.append(f"{n}\n{srt_time(start)} --> {srt_time(end)}\n{text}\n")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines), encoding="utf-8")
    return path
