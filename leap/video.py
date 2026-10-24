"""Video assembly: gradient fields, one ASS overlay, one ffmpeg process.

Deliberately not a template library. Each shot gets a background generated from
its palette (a slowly rotating multi-stop gradient, grain, vignette), the ASS
overlay draws every word on top, and ffmpeg concatenates the lot in a single
pass. No stock footage, no licensing, no upload of your channel data anywhere.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path

from .audio import ffmpeg_path, measure_loudness, run
from .script import Script
from .theme import HEIGHT, WIDTH, Palette, get_palette
from .timeline import Timeline
from .util import hex_to_rgb, mix

SR = 48000


def _rgb(color: str) -> str:
    r, g, b = hex_to_rgb(color)
    return f"0x{r:02X}{g:02X}{b:02X}"


def escape_filter_path(path: Path | str) -> str:
    p = str(path).replace("\\", "/")
    p = p.replace("'", r"\'").replace(":", r"\:")
    return f"'{p}'"


# --------------------------------------------------------------------------
# background grammar
# --------------------------------------------------------------------------


def background_chain(palette: Palette, duration: float, seed: int, *,
                     fps: int = 30, width: int = WIDTH, height: int = HEIGHT,
                     energy: float = 1.0) -> str:
    """A moving field of colour. Same palette, different motion per shot, so a
    channel feels like a place instead of a slideshow."""
    style = palette.style
    stops = [palette.bg[0], palette.bg[1], palette.bg[2]]
    if style in ("neon", "grid"):
        accent_mix = mix(palette.bg[1], palette.accent, 0.18)
        stops = [palette.bg[0], accent_mix, palette.bg[2]]
    elif style == "paper":
        stops = [palette.bg[0], palette.bg[1], palette.bg[2]]
    c = [f"c{i}={_rgb(col)}" for i, col in enumerate(stops)]
    speed = 0.012 * (1.0 + 0.35 * math.sin(seed)) * energy
    angle_seed = (seed * 37) % 360

    # Gradient fields are smooth, so generate them small and scale up: a 4x
    # cheaper frame with no visible loss. Grain and grid are drawn at full
    # resolution afterwards, which is where sharpness actually matters.
    hw, hh = width // 2, height // 2
    chain = [
        f"gradients=s={hw}x{hh}:r={fps}:d={duration:.3f}:n=3:"
        f"{':'.join(c)}:speed={speed:.4f}:seed={(seed * 13) % 1000}",
        "gblur=sigma=12" if style != "paper" else "gblur=sigma=6",
        f"scale={width}:{height}:flags=bicubic",
        "eq=contrast=1.03:saturation=1.05",
    ]
    if style == "neon":
        chain.append(f"drawgrid=w=72:h=72:t=1:c={palette.accent}@0.10")
        chain.append("vignette=PI/3.2")
    elif style == "grid":
        chain.append(f"drawgrid=w=54:h=54:t=1:c={palette.accent}@0.06")
        chain.append("vignette=PI/3.6")
    elif style == "paper":
        chain.append("curves=all='0/0.02 0.5/0.52 1/0.97'")
        chain.append("vignette=PI/5")
    else:
        chain.append("vignette=PI/4")
    chain.append(f"noise=alls={int(palette.grain)}:allf=t+u")
    chain.append("format=yuv420p")
    chain.append("setsar=1")
    if angle_seed and False:  # placeholder for future per-shot skew
        pass
    return ",".join(chain)


# --------------------------------------------------------------------------
# audio graph
# --------------------------------------------------------------------------


def audio_graph(timeline: Timeline, *, sample_rate: int = SR) -> str:
    """Lay each shot's narration on the timeline with its lead-in and tail.

    Each shot contributes [silence(lead)] [vo] [silence(tail)] so the concatenated
    stream is sample-accurate against the motion timeline, even when a shot has no
    narration at all (flash beats, end cards).
    """
    parts: list[str] = []
    segments: list[str] = []
    vo_index = 0
    for s in timeline.shots:
        vo_len = s.vo_duration if (s.vo_path and s.vo_duration > 0) else 0.0
        lead = max(0.0, s.lead)
        tail = max(0.0, s.duration - lead - vo_len)
        if lead > 0.005:
            name = f"s{vo_index}lead"
            parts.append(f"anullsrc=r={sample_rate}:cl=mono,atrim=duration={lead:.3f},"
                         f"asetpts=N/SR/TB[{name}]")
            segments.append(f"[{name}]")
        if vo_len > 0:
            name = f"vo{vo_index}"
            parts.append(f"[{vo_index}:a]aresample={sample_rate},"
                         f"aformat=channel_layouts=mono,"
                         f"atrim=0:{vo_len:.3f},asetpts=N/SR/TB[{name}]")
            segments.append(f"[{name}]")
            vo_index += 1
        if tail > 0.005:
            name = f"s{vo_index}tail"
            parts.append(f"anullsrc=r={sample_rate}:cl=mono,atrim=duration={tail:.3f},"
                         f"asetpts=N/SR/TB[{name}]")
            segments.append(f"[{name}]")
    if not segments:
        return "anullsrc=r=48000:cl=mono[vout]"
    parts.append("".join(segments) + f"concat=n={len(segments)}:v=0:a=1[voice]")
    parts.append("[voice]anull[vout]")
    return ";".join(parts)


def render_voice_track(timeline: Timeline, out: Path, *, sample_rate: int = SR) -> Path:
    """Cheap audio-only pass. Gives us a file to measure loudness on."""
    out.parent.mkdir(parents=True, exist_ok=True)
    inputs = [str(s.vo_path) for s in timeline.shots if s.vo_path and s.vo_duration > 0]
    if not inputs:
        run([ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
             "-f", "lavfi", "-i", f"anullsrc=r={sample_rate}:cl=mono",
             "-t", f"{timeline.duration:.3f}", "-c:a", "pcm_s16le", str(out)])
        return out
    graph = audio_graph(timeline, sample_rate=sample_rate)
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y"]
    for path in inputs:
        cmd += ["-i", path]
    cmd += ["-filter_complex", graph, "-map", "[vout]", "-c:a", "pcm_s16le",
            "-ar", str(sample_rate), str(out)]
    proc = run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(f"voice track failed: {proc.stderr[-800:]}")
    return out


# --------------------------------------------------------------------------
# render
# --------------------------------------------------------------------------


@dataclass
class RenderResult:
    video: Path
    duration: float
    loudness: dict
    size_mb: float


def render(timeline: Timeline, script: Script, ass_path: Path, out: Path,
           *, voice_track: Path | None = None, music: Path | None = None,
           crf: int = 19, preset: str = "medium", fps: int = 30,
           width: int = WIDTH, height: int = HEIGHT, verbose: bool = False,
           fonts_dir: Path | None = None, progress: bool = True) -> RenderResult:
    out.parent.mkdir(parents=True, exist_ok=True)
    palette = get_palette(script.palette, seed=script.slug)

    # ---- loudness (measure -> gain, avoids one-pass pumping)
    gain_db = 0.0
    loudness: dict = {}
    if voice_track and voice_track.exists():
        loudness = measure_loudness(voice_track, target=script.render.target_lufs)
        try:
            measured = float(loudness.get("input_i", "nan"))
            target = script.render.target_lufs
            if math.isfinite(measured):
                gain_db = max(-12.0, min(18.0, target - measured))
        except (TypeError, ValueError):
            gain_db = 0.0

    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "warning" if not verbose else "info", "-y"]

    # ---- inputs: one gradient field per shot
    filter_parts: list[str] = []
    concat_labels: list[str] = []
    for i, s in enumerate(timeline.shots):
        chain = background_chain(palette, s.duration, seed=s.index + 3,
                                 fps=fps, width=width, height=height)
        cmd += ["-f", "lavfi", "-t", f"{s.duration:.3f}", "-i", chain]
        filter_parts.append(f"[{i}:v]trim=duration={s.duration:.3f},setpts=PTS-STARTPTS[bg{i}]")
        concat_labels.append(f"[bg{i}]")

    v_index = len(timeline.shots)
    filter_parts.append("".join(concat_labels) + f"concat=n={len(concat_labels)}:v=1:a=0[vcat]")
    filter_parts.append(f"[vcat]ass={escape_filter_path(ass_path)}:"
                        f"fontsdir={escape_filter_path(fonts_dir)}[vout]" if fonts_dir
                        else f"[vcat]ass={escape_filter_path(ass_path)}[vout]")

    # ---- audio
    audio_index = None
    if voice_track and voice_track.exists():
        cmd += ["-i", str(voice_track)]
        audio_index = v_index
        audio_parts = []
        if music and music.exists():
            cmd += ["-i", str(music)]
            music_index = audio_index + 1
            fade_start = max(0.0, timeline.duration - 1.8)
            audio_parts.append(
                f"[{music_index}:a]aresample={SR},aformat=channel_layouts=stereo,"
                f"volume={script.music.gain_db}dB,"
                f"afade=t=in:st=0:d=1.2,afade=t=out:st={fade_start:.2f}:d=1.8[mus]")
            audio_parts.append(
                f"[{audio_index}:a]aresample={SR},aformat=channel_layouts=stereo,"
                f"volume={gain_db:.2f}dB,asplit=2[voice][sc]")
            audio_parts.append("[mus][sc]sidechaincompress=threshold=0.035:ratio=8:"
                               "attack=12:release=380:makeup=1[musd]")
            audio_parts.append("[voice][musd]amix=inputs=2:duration=first:normalize=0,"
                               "alimiter=limit=0.95[aout]")
        else:
            audio_parts.append(f"[{audio_index}:a]aresample={SR},aformat=channel_layouts=stereo,"
                               f"volume={gain_db:.2f}dB,alimiter=limit=0.95[aout]")
        filter_parts.extend(audio_parts)

    graph = ";".join(filter_parts)
    cmd += ["-filter_complex", graph, "-map", "[vout]"]
    if audio_index is not None:
        cmd += ["-map", "[aout]", "-c:a", "aac", "-b:a", "192k", "-ar", str(SR)]

    cmd += ["-c:v", "libx264", "-preset", preset, "-crf", str(crf),
            "-profile:v", "high", "-level", "4.2", "-pix_fmt", "yuv420p",
            "-r", str(fps), "-t", f"{timeline.duration:.3f}",
            "-movflags", "+faststart", "-shortest", str(out)]

    proc = run(cmd, capture=not verbose, timeout=3600)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{(proc.stderr or '')[-1600:]}")
    if not out.exists() or out.stat().st_size < 1024:
        raise RuntimeError("ffmpeg produced no output")

    from .audio import ffprobe_duration

    return RenderResult(video=out, duration=ffprobe_duration(out), loudness=loudness,
                        size_mb=out.stat().st_size / 1e6)


def render_still(timeline: Timeline, script: Script, ass_path: Path, out: Path,
                 t: float, *, fonts_dir: Path | None = None, fps: int = 30,
                 width: int = WIDTH, height: int = HEIGHT, verbose: bool = False) -> Path:
    """One frame at time `t`. Used by QA and by `leap frames`."""
    palette = get_palette(script.palette, seed=script.slug)
    shot = timeline.at(t)
    chain = background_chain(palette, shot.duration, seed=shot.index + 3,
                             fps=fps, width=width, height=height)
    ass = (f"ass={escape_filter_path(ass_path)}:fontsdir={escape_filter_path(fonts_dir)}"
           if fonts_dir else f"ass={escape_filter_path(ass_path)}")
    out.parent.mkdir(parents=True, exist_ok=True)
    # The overlay file is timed against the *whole* video, so shift this shot's
    # frames onto the global timeline before libass sees them. Then -ss (an
    # output option, after the filter) picks the exact frame.
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
           "-f", "lavfi", "-t", f"{shot.duration:.3f}", "-i", chain,
           "-vf", f"setpts=PTS+{shot.start:.3f}/TB,{ass}",
           "-ss", f"{t:.3f}", "-frames:v", "1",
           "-update", "1", str(out)]
    proc = run(cmd)
    if proc.returncode != 0 or not out.exists():
        raise RuntimeError(f"still failed: {proc.stderr[-600:]}")
    return out


def contact_sheet(timeline: Timeline, script: Script, ass_path: Path, out_dir: Path,
                  *, fonts_dir: Path | None = None, per_shot: int = 1) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    frames: list[Path] = []
    for s in timeline.shots:
        for k in range(per_shot):
            frac = 0.5 if per_shot == 1 else 0.25 + 0.5 * (k / max(1, per_shot - 1))
            t = s.start + s.duration * frac
            p = out_dir / f"{s.index + 1:02d}-{s.shot.kind}-{int(t * 10):04d}.png"
            render_still(timeline, script, ass_path, p, t, fonts_dir=fonts_dir)
            frames.append(p)
    return frames
