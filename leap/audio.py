"""Audio plumbing: WAV inspection, silence maps, loudness, mixing.

No numpy, no soundfile - the whole engine talks to ffmpeg and reads the WAV
header itself. That keeps `pip install -r requirements.txt` (empty) honest.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .util import syllables, words


# --------------------------------------------------------------------------
# ffmpeg discovery
# --------------------------------------------------------------------------

_FFMPEG: str | None = None


def ffmpeg_path() -> str:
    """Find ffmpeg: $LEAP_FFMPEG, PATH, or the imageio-ffmpeg wheel."""
    global _FFMPEG
    if _FFMPEG:
        return _FFMPEG
    import os

    env = os.environ.get("LEAP_FFMPEG")
    if env and Path(env).exists():
        _FFMPEG = env
        return env
    found = shutil.which("ffmpeg")
    if found:
        _FFMPEG = found
        return found
    try:  # optional convenience: pip install imageio-ffmpeg
        import imageio_ffmpeg  # type: ignore

        _FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
        return _FFMPEG
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(
            "ffmpeg not found. Install it (brew install ffmpeg / apt install ffmpeg) "
            "or set LEAP_FFMPEG=/path/to/ffmpeg."
        ) from exc


def run(args: list[str], *, capture: bool = True, timeout: int = 900) -> subprocess.CompletedProcess:
    proc = subprocess.run(
        args,
        stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
        text=True,
        errors="replace",
    )
    return proc


def ffprobe_duration(path: str | Path) -> float:
    """Duration in seconds, header-first and cheap."""
    p = Path(path)
    try:
        return wav_duration(p)
    except Exception:
        pass
    out = run([ffmpeg_path(), "-hide_banner", "-i", str(p)]).stderr
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", out)
    if not m:
        raise RuntimeError(f"cannot read duration of {p}")
    h, mi, s = m.groups()
    return int(h) * 3600 + int(mi) * 60 + float(s)


# --------------------------------------------------------------------------
# WAV header (PCM 16/24/32 + float32)
# --------------------------------------------------------------------------


@dataclass
class WavInfo:
    channels: int
    sample_rate: int
    bits: int
    frames: int

    @property
    def duration(self) -> float:
        return self.frames / float(self.sample_rate)


def wav_duration(path: str | Path) -> float:
    return wav_info(path).duration


def wav_info(path: str | Path) -> WavInfo:
    with open(path, "rb") as fh:
        riff = fh.read(12)
        if riff[:4] not in (b"RIFF", b"RF64") or riff[8:12] != b"WAVE":
            raise ValueError("not a WAV file")
        channels = sample_rate = bits = 0
        frames = 0
        while True:
            header = fh.read(8)
            if len(header) < 8:
                break
            cid, size = header[:4], struct.unpack("<I", header[4:])[0]
            if cid == b"fmt ":
                data = fh.read(size)
                _, channels, sample_rate, _, _, bits = struct.unpack("<HHIIHH", data[:16])
            elif cid == b"data":
                frame_bytes = max(1, channels * max(1, bits // 8))
                if size in (0, 0xFFFFFFFF):
                    here = fh.tell()
                    fh.seek(0, 2)
                    size = fh.tell() - here
                    fh.seek(here)
                frames = size // frame_bytes
                break
            else:
                fh.seek(size + (size & 1), 1)
    if not sample_rate:
        raise ValueError("WAV missing fmt chunk")
    return WavInfo(channels, sample_rate, bits, frames)


# --------------------------------------------------------------------------
# Silence map (used to snap caption timings onto real speech)
# --------------------------------------------------------------------------


@dataclass
class Interval:
    start: float
    end: float

    @property
    def length(self) -> float:
        return self.end - self.start


def detect_silences(path: str | Path, noise_db: float = -38.0, min_len: float = 0.10) -> list[Interval]:
    proc = run([
        ffmpeg_path(), "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"silencedetect=noise={noise_db}dB:d={min_len}", "-f", "null", "-",
    ])
    log = proc.stderr
    starts = [float(m) for m in re.findall(r"silence_start: (-?[\d.]+)", log)]
    ends = [float(m) for m in re.findall(r"silence_end: ([\d.]+)", log)]
    out: list[Interval] = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else s + min_len
        if e > s:
            out.append(Interval(max(0.0, s), e))
    return out


def speech_span(duration: float, silences: list[Interval]) -> Interval:
    """Trim leading/trailing silence."""
    start = 0.0
    end = duration
    if silences and silences[0].start <= 0.02:
        start = silences[0].end
    if silences and silences[-1].end >= duration - 0.02:
        end = silences[-1].start
    if end - start < 0.4:
        return Interval(0.0, duration)
    return Interval(start - 0.02, min(duration, end + 0.03))


# --------------------------------------------------------------------------
# Word timing
# --------------------------------------------------------------------------


def estimate_word_times(text: str, span: Interval, silences: list[Interval] | None = None
                        ) -> list[tuple[str, float, float]]:
    """Distribute words across a measured speech span using syllable weight,
    then snap each boundary onto the nearest real pause (if one is close)."""
    tokens = words(text)
    if not tokens:
        return []
    weights = []
    for w in tokens:
        weight = float(syllables(w))
        weights.append(weight)
    total = sum(weights) or 1.0
    duration = max(0.25, span.length)
    times: list[tuple[str, float, float]] = []
    cursor = span.start
    for w, weight in zip(tokens, weights):
        share = duration * (weight / total)
        times.append((w, cursor, cursor + share))
        cursor += share

    if silences:
        midpoints = [iv.start + iv.length * 0.45 for iv in silences
                     if span.start < iv.start < span.end]
        snapped: list[tuple[str, float, float]] = []
        for i, (w, t0, t1) in enumerate(times):
            if i > 0 and midpoints:
                nearest = min(midpoints, key=lambda m: abs(m - t0))
                if abs(nearest - t0) < 0.14 and nearest > snapped[-1][1]:
                    t0 = nearest
            if snapped:
                snapped[-1] = (snapped[-1][0], snapped[-1][1],
                               max(snapped[-1][1] + 0.05, t0))
            snapped.append((w, t0, t1))
        times = snapped
    # never let a word invert
    fixed: list[tuple[str, float, float]] = []
    for i, (w, t0, t1) in enumerate(times):
        t0 = max(t0, fixed[-1][1] if fixed else 0.0)
        t1 = max(t1, t0 + 0.06)
        fixed.append((w, t0, t1))
    return fixed


def chunk_words(times: list[tuple[str, float, float]], max_words: int = 3,
                max_chars: int = 22) -> list[list[tuple[str, float, float]]]:
    """Group word timings into caption lines that fit a phone screen."""
    chunks: list[list[tuple[str, float, float]]] = []
    current: list[tuple[str, float, float]] = []
    for item in times:
        candidate = current + [item]
        too_many = len(candidate) > max_words
        too_wide = len(" ".join(w for w, _, _ in candidate)) > max_chars
        if current and (too_many or too_wide):
            chunks.append(current)
            current = [item]
        else:
            current = candidate
    if current:
        chunks.append(current)
    return chunks


# --------------------------------------------------------------------------
# Loudness
# --------------------------------------------------------------------------


def measure_loudness(path: str | Path, target: float = -14.0) -> dict:
    proc = run([
        ffmpeg_path(), "-hide_banner", "-nostats", "-i", str(path),
        "-af", f"loudnorm=I={target}:TP=-1.5:LRA=11:print_format=json",
        "-f", "null", "-",
    ])
    blob = proc.stderr
    start = blob.rfind("{")
    end = blob.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(blob[start:end + 1])
    except json.JSONDecodeError:
        return {}


def verify_duration(path: str | Path) -> float:
    return ffprobe_duration(path)
