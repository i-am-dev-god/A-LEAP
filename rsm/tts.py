"""Narration: text to speech, plus the word timings the captions need.

Sentence by sentence, so each sentence's audio length is known exactly. Word
timings inside a sentence are allocated by weight, with punctuation pauses
taken out first. Good enough that no viewer has ever noticed.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
import wave
from dataclasses import dataclass
from pathlib import Path

SAMPLE_RATE = 16000
LEAD_IN = 0.35
GAP = 0.12

_PUNCT_PAUSE = {",": 0.16, ";": 0.16, ":": 0.16, ".": 0.24, "!": 0.24, "?": 0.24}
_WORD = re.compile(r"\S+")


@dataclass
class Word:
    text: str
    start: float
    end: float


@dataclass
class Narration:
    path: Path
    duration: float
    words: list[Word]

    def text(self) -> str:
        return " ".join(w.text for w in self.words)


class Voice:
    """A speech backend. `flite` is the offline default; anything else via template.

    `clips` reads one pre-recorded file per sentence from a directory
    (`0000.wav`, `0001.wav`, …) — that is how an AI voice drops straight into
    the pipeline without a local TTS install.
    """

    def __init__(
        self,
        backend: str = "flite",
        name: str = "slt",
        cmd: str | None = None,
        clips: str | Path | None = None,
    ):
        self.backend = backend
        self.name = name
        self.cmd = cmd
        self.clips = Path(clips) if clips else None
        if backend == "flite":
            self.binary = _find(
                os.environ.get("FLITE_BIN"),
                shutil.which("flite"),
                str(Path.cwd() / "bin" / "flite"),
            )
            if not self.binary:
                raise SystemExit(
                    "flite not found. Install it (apt install flite), point FLITE_BIN at the "
                    "binary, or use --tts-cmd with any TTS that writes a wav."
                )
        elif backend == "cmd":
            if not cmd:
                raise SystemExit("--tts-cmd is required when --tts is cmd")
        elif backend == "clips":
            if not self.clips or not self.clips.is_dir():
                raise SystemExit("--clips-dir is required when --tts is clips")
        else:
            raise SystemExit(f"unknown tts backend: {backend}")

    def say(self, text: str, out: Path, index: int = 0) -> None:
        if self.backend == "clips":
            self._copy_clip(index, out)
            return
        if self.backend == "flite":
            subprocess.run(
                [self.binary, "-voice", self.name, "-t", text, "-o", str(out)],
                check=True,
                capture_output=True,
            )
        else:
            argv = self.cmd.format(out=str(out), text=text, voice=self.name).split(" ")
            subprocess.run(argv, check=True, capture_output=True)
        if not out.exists() or out.stat().st_size < 64:
            raise SystemExit(f"TTS produced no audio for: {text[:60]}…")

    def _copy_clip(self, index: int, out: Path) -> None:
        """Normalise one pre-recorded clip: 16 kHz mono, silence trimmed."""
        sources = sorted(
            p for p in self.clips.iterdir() if p.suffix.lower() in _AUDIO and p.is_file()
        )
        if index >= len(sources):
            raise SystemExit(
                f"--clips-dir has {len(sources)} clips but the post needs more; "
                f"missing clip {index:04d}"
            )
        subprocess.run(
            [
                _ffmpeg(), "-y", "-v", "error",
                "-i", str(sources[index]),
                "-af",
                "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB,"
                "areverse,"
                "silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB,"
                "areverse",
                "-ar", str(SAMPLE_RATE), "-ac", "1",
                str(out),
            ],
            check=True,
        )


_AUDIO = {".wav", ".mp3", ".m4a", ".aac", ".flac", ".ogg", ".opus"}


def _ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        found = shutil.which("ffmpeg")
        if not found:
            raise SystemExit("ffmpeg not found: pip install imageio-ffmpeg, or install ffmpeg")
        return found


def _find(*candidates: str | None) -> str | None:
    for candidate in candidates:
        if candidate and Path(candidate).exists() and os.access(candidate, os.X_OK):
            return candidate
    return None


def narrate(sentences: list[str], voice: Voice, out: Path) -> Narration:
    frames = bytearray(b"\x00\x00" * int(SAMPLE_RATE * LEAD_IN))
    words: list[Word] = []
    cursor = LEAD_IN

    with tempfile.TemporaryDirectory() as tmp:
        for index, sentence in enumerate(sentences):
            clip = Path(tmp) / f"{index:04d}.wav"
            voice.say(sentence, clip, index=index)
            with wave.open(str(clip), "rb") as src:
                rate = src.getframerate()
                if rate != SAMPLE_RATE:
                    raise SystemExit(
                        f"TTS returned {rate} Hz; the mixer expects {SAMPLE_RATE} Hz. "
                        "Add `-ar 16000` to your --tts-cmd."
                    )
                pcm = src.readframes(src.getnframes())
                duration = src.getnframes() / rate

            frames.extend(pcm)
            words.extend(_allocate(sentence, cursor, duration))

            gap = GAP if index < len(sentences) - 1 else 0.0
            frames.extend(b"\x00\x00" * int(SAMPLE_RATE * gap))
            cursor += duration + gap

    with wave.open(str(out), "wb") as dst:
        dst.setnchannels(1)
        dst.setsampwidth(2)
        dst.setframerate(SAMPLE_RATE)
        dst.writeframes(bytes(frames))

    return Narration(path=out, duration=cursor, words=words)


def _allocate(sentence: str, start: float, duration: float) -> list[Word]:
    tokens = _WORD.findall(sentence)
    if not tokens:
        return []

    pauses = [_PUNCT_PAUSE.get(t[-1], 0.0) for t in tokens]
    spoken = max(duration * 0.55, duration - sum(pauses))
    weights = [max(2, len(re.sub(r"\W", "", t))) + 1.5 for t in tokens]
    total = sum(weights)

    words: list[Word] = []
    cursor = start
    for token, pause, weight in zip(tokens, pauses, weights):
        length = max(0.08, spoken * weight / total)
        words.append(Word(text=token, start=cursor, end=cursor + length))
        cursor += length + pause
    return words
