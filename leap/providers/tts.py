"""Voice providers.

Every provider returns the same thing: a 48 kHz mono WAV plus (when the
provider supports it) word-level timings. Word timings are the difference
between captions that *sit* on the speech and captions that guess.
"""
from __future__ import annotations

import asyncio
import base64
import shutil
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

from ..audio import ffmpeg_path, run, wav_duration
from ..util import estimate_speech_seconds
from .base import ProviderError, Speech, env, http_bytes, http_json

SR = 48000


class TTS(Protocol):
    name: str

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech: ...


# --------------------------------------------------------------------------
# helpers
# --------------------------------------------------------------------------


def to_wav(src: Path, out: Path, sr: int = SR, mono: bool = True) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y", "-i", str(src),
           "-ar", str(sr)]
    if mono:
        cmd += ["-ac", "1"]
    cmd += ["-c:a", "pcm_s16le", str(out)]
    proc = run(cmd)
    if proc.returncode != 0 or not out.exists():
        raise ProviderError(f"ffmpeg could not convert {src.name}: {proc.stderr[-400:]}")
    return out


def silence_wav(out: Path, seconds: float, sr: int = SR) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    run([ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
         "-f", "lavfi", "-i", f"anullsrc=r={sr}:cl=mono", "-t", f"{seconds:.2f}",
         "-c:a", "pcm_s16le", str(out)])
    return out


def _word_times_from_chars(chars: list[str], starts: list[float], ends: list[float]
                           ) -> list[tuple[str, float, float]]:
    out: list[tuple[str, float, float]] = []
    buf, t0, t1 = "", None, None
    for ch, s, e in zip(chars, starts, ends):
        if ch.strip() == "":
            if buf:
                out.append((buf, t0 or s, t1 or e))
                buf, t0, t1 = "", None, None
            continue
        if t0 is None:
            t0 = s
        t1 = e
        buf += ch
    if buf:
        out.append((buf, t0 or 0.0, t1 or 0.0))
    return out


# --------------------------------------------------------------------------
# ElevenLabs (word-exact timings)
# --------------------------------------------------------------------------


@dataclass
class ElevenLabsTTS:
    name: str = "elevenlabs"
    default_voice: str = "21m00Tcm4TlvDq8ikWAM"  # Rachel

    @staticmethod
    def available() -> bool:
        return bool(env("ELEVENLABS_API_KEY", "XI_API_KEY"))

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech:
        key = env("ELEVENLABS_API_KEY", "XI_API_KEY")
        if not key:
            raise ProviderError("set ELEVENLABS_API_KEY to use ElevenLabs")
        voice_id = voice or env("LEAP_VOICE", default=self.default_voice)
        model = env("LEAP_TTS_MODEL", default="eleven_multilingual_v2")
        payload = {
            "text": text,
            "model_id": model,
            "voice_settings": {"stability": 0.45, "similarity_boost": 0.75,
                               "style": 0.15, "use_speaker_boost": True},
        }
        if speed != 1.0:
            payload["voice_settings"]["speed"] = speed
        data = http_json(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/with-timestamps",
            payload, headers={"xi-api-key": key}, timeout=300,
        )
        audio = data.get("audio_base64")
        if not audio:
            raise ProviderError("ElevenLabs returned no audio")
        raw = base64.b64decode(audio)
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as fh:
            fh.write(raw)
            tmp = Path(fh.name)
        to_wav(tmp, out_wav)
        tmp.unlink(missing_ok=True)
        times: list[tuple[str, float, float]] = []
        align = data.get("alignment") or data.get("normalized_alignment") or {}
        if align.get("characters"):
            times = _word_times_from_chars(
                align["characters"],
                align.get("character_start_times_seconds", []),
                align.get("character_end_times_seconds", []),
            )
        return Speech(out_wav, wav_duration(out_wav), times, self.name, voice_id, text)


# --------------------------------------------------------------------------
# OpenAI
# --------------------------------------------------------------------------


@dataclass
class OpenAITTS:
    name: str = "openai"
    default_voice: str = "onyx"

    @staticmethod
    def available() -> bool:
        return bool(env("OPENAI_API_KEY"))

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech:
        key = env("OPENAI_API_KEY")
        if not key:
            raise ProviderError("set OPENAI_API_KEY to use OpenAI TTS")
        base = env("OPENAI_BASE_URL", default="https://api.openai.com/v1").rstrip("/")
        model = env("LEAP_TTS_MODEL", default="gpt-4o-mini-tts")
        chosen = voice or env("LEAP_VOICE", default=self.default_voice)
        raw = http_bytes(
            f"{base}/audio/speech",
            {"model": model, "voice": chosen, "input": text, "response_format": "mp3",
             "speed": speed},
            headers={"Authorization": f"Bearer {key}"},
        )
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as fh:
            fh.write(raw)
            tmp = Path(fh.name)
        to_wav(tmp, out_wav)
        tmp.unlink(missing_ok=True)
        return Speech(out_wav, wav_duration(out_wav), [], self.name, chosen, text)


# --------------------------------------------------------------------------
# Edge TTS (free, needs `pip install edge-tts`)
# --------------------------------------------------------------------------


@dataclass
class EdgeTTS:
    name: str = "edge"
    default_voice: str = "en-US-AndrewMultilingualNeural"

    @staticmethod
    def available() -> bool:
        import importlib.util

        return importlib.util.find_spec("edge_tts") is not None

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech:
        try:
            import edge_tts
        except ImportError as exc:
            raise ProviderError("pip install edge-tts (free Microsoft voices)") from exc
        chosen = voice or env("LEAP_VOICE", default=self.default_voice)
        rate = f"{int(round((speed - 1) * 100)):+d}%"
        tmp = out_wav.with_suffix(".mp3")
        events: list[tuple[float, float, str]] = []

        async def _go() -> None:
            comm = edge_tts.Communicate(text, chosen, rate=rate)
            with open(tmp, "wb") as fh:
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        fh.write(chunk["data"])
                    elif chunk["type"] == "WordBoundary":
                        start = chunk["offset"] / 1e7
                        dur = chunk["duration"] / 1e7
                        events.append((start, start + dur, chunk["text"]))

        asyncio.run(_go())
        to_wav(tmp, out_wav)
        tmp.unlink(missing_ok=True)
        return Speech(out_wav, wav_duration(out_wav),
                      [(w, s, e) for s, e, w in events], self.name, chosen, text)


# --------------------------------------------------------------------------
# Local, offline voices
# --------------------------------------------------------------------------


@dataclass
class LocalTTS:
    """say (macOS), espeak-ng, or piper - whichever is installed."""

    name: str = "local"
    default_voice: str = ""

    @staticmethod
    def available() -> bool:
        return bool(shutil.which("say") or shutil.which("espeak-ng") or
                    shutil.which("espeak") or shutil.which("piper"))

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech:
        out_wav.parent.mkdir(parents=True, exist_ok=True)
        chosen = voice or env("LEAP_VOICE", default="")
        if shutil.which("say"):
            aiff = out_wav.with_suffix(".aiff")
            args = ["say", "-o", str(aiff)]
            if chosen:
                args += ["-v", chosen]
            args += ["-r", str(int(190 * speed)), text]
            if run(args).returncode != 0:
                raise ProviderError("macOS `say` failed")
            to_wav(aiff, out_wav)
            aiff.unlink(missing_ok=True)
        elif shutil.which("espeak-ng") or shutil.which("espeak"):
            exe = shutil.which("espeak-ng") or shutil.which("espeak")
            args = [exe, "-w", str(out_wav)]
            if chosen:
                args += ["-v", chosen]
            args += ["-s", str(int(165 * speed)), text]
            if run(args).returncode != 0:
                raise ProviderError("espeak failed")
        elif shutil.which("piper"):
            raise ProviderError(
                "piper needs a voice model; run: echo \"text\" | piper --model en_US-lessac-medium.onnx -f out.wav")
        else:
            raise ProviderError("no local TTS found")
        return Speech(out_wav, wav_duration(out_wav), [], self.name, chosen or "default", text)


@dataclass
class SilentTTS:
    """No voice. Produces timed silence so you can preview motion + type
    without paying for narration. Every output is tagged so you never publish it
    by accident."""

    name: str = "none"
    default_voice: str = "silent"

    @staticmethod
    def available() -> bool:
        return True

    def speak(self, text: str, out_wav: Path, *, voice: str | None = None,
              speed: float = 1.0) -> Speech:
        seconds = estimate_speech_seconds(text, wpm=185)
        silence_wav(out_wav, seconds)
        return Speech(out_wav, seconds, [], self.name, "silent", text)


PROVIDERS: dict[str, type] = {
    "elevenlabs": ElevenLabsTTS,
    "openai": OpenAITTS,
    "edge": EdgeTTS,
    "local": LocalTTS,
    "none": SilentTTS,
}

AUTO_ORDER = ["elevenlabs", "openai", "edge", "local"]


def get_tts(name: str | None = None) -> TTS:
    choice = (name or env("LEAP_TTS", default="auto") or "auto").lower()
    if choice == "auto":
        for key in AUTO_ORDER:
            if PROVIDERS[key].available():
                return PROVIDERS[key]()
        return SilentTTS()
    if choice not in PROVIDERS:
        raise ProviderError(f"unknown TTS provider {choice!r}; try {sorted(PROVIDERS)}")
    return PROVIDERS[choice]()


def available() -> list[str]:
    return [name for name, cls in PROVIDERS.items() if cls.available()]
