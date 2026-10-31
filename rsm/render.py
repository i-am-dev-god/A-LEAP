"""Frames in, mp4 out.

The background is decoded once at 1080x1920 and streamed as raw RGB; each frame
gets the chrome overlay pasted on and the active caption painted, then goes
straight into the encoder. No intermediate image files, no moviepy.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

from .captions import Captions

W, H = 1080, 1920
FPS = 30


def ffmpeg() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        found = shutil.which("ffmpeg")
        if not found:
            raise SystemExit("ffmpeg not found: pip install imageio-ffmpeg, or install ffmpeg")
        return found


def auto_background(workdir: Path) -> Path:
    """A stand-in for the gameplay clip: slow gradient with film grain."""
    target = workdir / "background.mp4"
    subprocess.run(
        [
            ffmpeg(), "-y", "-v", "error",
            "-f", "lavfi", "-i",
            "gradients=s=1080x1920:c0=0x1e2a4a:c1=0x54286b:c2=0x183a52:speed=0.02:d=8:r=30",
            "-vf", "noise=alls=4:allf=t,vignette=PI/5,format=yuv420p",
            "-c:v", "libx264", "-crf", "26", "-pix_fmt", "yuv420p", str(target),
        ],
        check=True,
    )
    return target


def mix_music(narration: Path, music: Path, duration: float, workdir: Path) -> Path:
    out = workdir / "mixed.wav"
    subprocess.run(
        [
            ffmpeg(), "-y", "-v", "error",
            "-stream_loop", "-1", "-i", str(music),
            "-i", str(narration),
            "-filter_complex",
            "[0:a]volume=0.16[bed];[1:a]volume=1.0[voice];"
            "[bed][voice]amix=inputs=2:duration=longest:dropout_transition=0[a]",
            "-map", "[a]", "-t", f"{duration:.3f}", str(out),
        ],
        check=True,
    )
    return out


def render(
    background: Path,
    chrome: Image.Image,
    captions: Captions,
    audio: Path,
    duration: float,
    out: Path,
    fps: int = FPS,
) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    total = max(1, int(duration * fps) + 1)
    frame_bytes = W * H * 3

    decoder = subprocess.Popen(
        [
            ffmpeg(), "-v", "error", "-stream_loop", "-1", "-i", str(background),
            "-vf",
            f"scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},"
            f"fps={fps},eq=brightness=-0.04:saturation=1.0,format=rgb24",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )
    encoder = subprocess.Popen(
        [
            ffmpeg(), "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(fps), "-i", "-",
            "-i", str(audio),
            "-map", "0:v", "-map", "1:a",
            "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart",
            str(out),
        ],
        stdin=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
    )

    assert decoder.stdout and encoder.stdin
    try:
        for index in range(total):
            raw = decoder.stdout.read(frame_bytes)
            if len(raw) < frame_bytes:
                break
            frame = Image.frombuffer("RGB", (W, H), raw, "raw", "RGB", 0, 1).copy()
            frame.paste(chrome, (0, 0), chrome)
            captions.draw(frame, index / fps)
            encoder.stdin.write(frame.tobytes())
            if index % (fps * 5) == 0:
                pct = 100 * index / total
                sys.stderr.write(f"\r  rendering {pct:5.1f}%  ({index}/{total} frames)")
                sys.stderr.flush()
    finally:
        decoder.stdout.close()
        decoder.terminate()
        encoder.stdin.close()
        encoder.wait()

    sys.stderr.write(f"\r  rendered {total} frames{' ' * 24}\n")
    if encoder.returncode != 0:
        raise SystemExit("ffmpeg failed while encoding")
    return out
