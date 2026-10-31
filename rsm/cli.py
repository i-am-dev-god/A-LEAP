"""Command line.

    python main.py examples/post.json -o out/short.mp4
"""

from __future__ import annotations

import argparse
import tempfile
from pathlib import Path

from .captions import Captions
from .fetch import from_subreddit, from_url
from .layout import chrome
from .post import Post
from .render import auto_background, mix_music, render
from .tts import Voice, narrate


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="main.py",
        description="Turn one Reddit post into a narrated 1080x1920 short.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "examples:\n"
            "  python main.py examples/post.json -o out/short.mp4\n"
            "  python main.py examples/post.json --background gameplay.mp4 --voice rms\n"
            "  FLITE_BIN=./bin/flite python main.py post.json --tts-cmd 'espeak-ng -w {out} {text}'\n"
        ),
    )
    p.add_argument("post", nargs="?", help="path to a post JSON file")
    p.add_argument("--subreddit", help="pull the top post of the day from this subreddit")
    p.add_argument("--url", help="pull this specific reddit post url")
    p.add_argument("-o", "--out", default="out/short.mp4", help="output mp4")
    p.add_argument(
        "--background",
        default="auto",
        help="background video; 'auto' generates a gradient stand-in",
    )
    p.add_argument("--music", help="optional music bed (looped, mixed at 16%%)")
    p.add_argument("--font", help="path to a bold .ttf for captions and titles")
    p.add_argument("--font-dir", help="directory holding DejaVuSans.ttf / DejaVuSans-Bold.ttf")
    p.add_argument("--tts", default="flite", choices=["flite", "cmd"], help="speech backend")
    p.add_argument("--voice", default="slt", help="flite voice (slt, awb, rms, kal)")
    p.add_argument("--tts-cmd", help="template for --tts cmd, e.g. 'espeak-ng -w {out} {text}'")
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--max-seconds", type=float, default=90.0, help="trim narration at this length")
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.url:
        post = from_url(args.url)
    elif args.subreddit:
        post = from_subreddit(args.subreddit)
    elif args.post:
        post = Post.load(args.post)
    else:
        raise SystemExit("give me a post file, --subreddit, or --url")

    sentences = post.sentences()
    if not sentences:
        raise SystemExit("the post has no readable text")

    print(f"  r/{post.subreddit} · {len(sentences)} sentences")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)

        voice = Voice(backend=args.tts, name=args.voice, cmd=args.tts_cmd)
        narration = narrate(sentences, voice, work / "narration.wav")
        print(f"  narrated · {narration.duration:.1f}s · {len(narration.words)} words")

        audio = narration.path
        if args.music:
            audio = mix_music(audio, Path(args.music), narration.duration, work)

        background = (
            auto_background(work) if args.background == "auto" else Path(args.background)
        )
        if not background.exists():
            raise SystemExit(f"background not found: {background}")

        frames = chrome(
            subreddit=post.subreddit,
            author=post.author,
            title=post.title,
            upvotes=post.upvotes,
            comments=post.comments,
            font_dir=args.font_dir,
        )
        captions = Captions.build(narration.words, font_path=args.font)

        out = render(
            background=background,
            chrome=frames,
            captions=captions,
            audio=audio,
            duration=narration.duration,
            out=Path(args.out),
            fps=args.fps,
        )

    size_mb = out.stat().st_size / 1_048_576
    print(f"  wrote {out} · {size_mb:.1f} MB")
    return 0
