"""`leap` - one command from a topic to a published vertical video."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from . import __version__, lint as lint_mod, publish as publish_mod, video as video_mod
from .audio import ffmpeg_path, wav_duration
from .niches import get_niche, list_niches
from .providers import llm as llm_mod
from .providers import tts as tts_mod
from .providers.base import ProviderError, Speech
from .script import Script
from .theme import PALETTES, Brand, palette_preview
from .timeline import build_ass, build_timeline, write_ass, write_srt
from .util import fmt_seconds
from .writer import WriterError, revise, write

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
FONTS = ASSETS / "fonts"
CACHE = Path(os.environ.get("LEAP_CACHE", Path.home() / ".cache" / "leap"))

C = {
    "dim": "\033[2m", "b": "\033[1m", "off": "\033[0m",
    "acc": "\033[38;5;209m", "ok": "\033[38;5;114m", "warn": "\033[38;5;179m",
    "err": "\033[38;5;203m", "mono": "\033[38;5;110m",
}


def say(msg: str = "") -> None:
    print(msg, flush=True)


def step(msg: str) -> None:
    say(f"{C['acc']}▸{C['off']} {msg}")


def ok(msg: str) -> None:
    say(f"{C['ok']}✓{C['off']} {msg}")


def warn(msg: str) -> None:
    say(f"{C['warn']}!{C['off']} {msg}")


def fail(msg: str, code: int = 1) -> None:
    say(f"{C['err']}✗{C['off']} {msg}")


# --------------------------------------------------------------------------
# TTS with a text-keyed cache
# --------------------------------------------------------------------------


def _cache_key(text: str, provider: str, voice: str, speed: float) -> str:
    blob = f"{provider}|{voice}|{speed}|{text}".encode()
    return hashlib.sha256(blob).hexdigest()[:24]


def narrate(script: Script, workdir: Path, *, provider: str | None, voice: str | None,
            speed: float = 1.0, jobs: int = 3, force: bool = False) -> dict[int, Speech]:
    engine = tts_mod.get_tts(provider)
    audio_dir = workdir / "voice"
    audio_dir.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    voices: dict[int, Speech] = {}

    def one(index: int, text: str) -> Speech:
        key = _cache_key(text, engine.name, voice or "", speed)
        cached = CACHE / f"{key}.wav"
        final = audio_dir / f"{index:02d}.wav"
        if cached.exists() and not force:
            shutil.copyfile(cached, final)
            return Speech(final, wav_duration(final), [], engine.name, voice or "", text)
        speech = engine.speak(text, final, voice=voice, speed=speed)
        if speech.path and speech.path.exists():
            shutil.copyfile(speech.path, cached)
        return speech

    todo = [(i, s.spoken.strip()) for i, s in enumerate(script.shots) if s.spoken.strip()]
    total = len(todo)
    if engine.name == "none":
        warn("no voice provider configured - rendering silent (motion + captions only)")
    else:
        step(f"narrating {total} shots with {engine.name}")
    done = 0
    if jobs <= 1 or total <= 1:
        for i, text in todo:
            voices[i] = one(i, text)
            done += 1
            say(f"  {C['dim']}{done}/{total}{C['off']} shot {i + 1}  "
                f"{voices[i].duration:5.1f}s  {text[:52]}")
    else:
        with ThreadPoolExecutor(max_workers=jobs) as pool:
            futures = {pool.submit(one, i, text): i for i, text in todo}
            for fut, i in futures.items():
                voices[i] = fut.result()
                done += 1
                say(f"  {C['dim']}{done}/{total}{C['off']} shot {i + 1}  "
                    f"{voices[i].duration:5.1f}s")
    return voices


# --------------------------------------------------------------------------
# render pipeline
# --------------------------------------------------------------------------


def render_script(script_path: Path | None, *, out_root: Path = Path("out"),
                  provider: str | None = None, voice: str | None = None,
                  speed: float = 1.0, jobs: int = 3, force: bool = False,
                  qa_frames: int = 0, music: Path | None = None, crf: int = 19,
                  preset: str = "medium", dry_run: bool = False,
                  skip_lint: bool = False, script: Script | None = None) -> dict:
    script = script or Script.load(script_path)  # type: ignore[arg-type]
    if not skip_lint:
        issues = lint_mod.lint(script)
        errors = [i for i in issues if i.level == "error"]
        if issues:
            say(lint_mod.summarise(issues))
        if errors:
            raise SystemExit("fix the errors above (or pass --skip-lint)")

    workdir = out_root / script.slug
    workdir.mkdir(parents=True, exist_ok=True)
    script.save(workdir / "script.json")

    if dry_run:
        say(script.summary())
        estimated = script.estimated_duration()
        say(f"\nestimated runtime {estimated:.1f}s · {script.word_count()} words")
        return {"dry_run": True, "workdir": str(workdir)}

    t0 = time.time()
    voices = narrate(script, workdir, provider=provider, voice=voice, speed=speed,
                     jobs=jobs, force=force)
    timeline = build_timeline(script, voices)
    ass_path = write_ass(workdir / "overlay.ass",
                         build_ass(timeline, script, fonts_dir=FONTS))
    if script.render.export_srt:
        write_srt(workdir / "captions.srt", timeline)
    step(f"timeline {fmt_seconds(timeline.duration)} · {len(timeline.shots)} shots")

    voice_track = video_mod.render_voice_track(timeline, workdir / "voice.wav")
    music_path = music or (Path(script.music.file) if script.music.file else None)
    if music_path and not music_path.exists():
        warn(f"music file {music_path} not found - continuing without it")
        music_path = None

    video_path = workdir / "video.mp4"
    step("rendering (x264) ...")
    result = video_mod.render(timeline, script, ass_path, video_path,
                              voice_track=voice_track, music=music_path,
                              crf=crf, preset=preset, fonts_dir=FONTS)
    ok(f"{video_path}  {result.size_mb:.1f} MB  {fmt_seconds(result.duration)}  "
       f"{time.time() - t0:.0f}s wall")

    (workdir / "description.txt").write_text(
        build_description(script), encoding="utf-8")

    if qa_frames:
        step(f"qa frames -> {workdir / 'frames'}")
        try:
            video_mod.contact_sheet(timeline, script, ass_path, workdir / "frames",
                                    fonts_dir=FONTS, per_shot=qa_frames)
        except Exception as exc:  # noqa: BLE001
            warn(f"frames failed: {exc}")

    manifest = {
        "slug": script.slug,
        "title": script.title,
        "video": str(video_path),
        "duration": round(result.duration, 2),
        "shots": len(timeline.shots),
        "words": script.word_count(),
        "tts": {"provider": next(iter(voices.values())).provider if voices else "none",
                "voice": voice},
        "loudness": result.loudness,
        "palette": script.palette,
        "sources": script.sources,
        "created": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": __version__,
    }
    (workdir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def build_description(script: Script) -> str:
    parts = [script.title, ""]
    if script.description:
        parts += [script.description, ""]
    if script.sources:
        parts.append("Sources:")
        parts += [f"- {s}" for s in script.sources]
        parts.append("")
    if script.brand.handle:
        parts.append(script.brand.handle)
    return "\n".join(parts).strip() + "\n"


# --------------------------------------------------------------------------
# commands
# --------------------------------------------------------------------------


def cmd_niches(_: argparse.Namespace) -> None:
    say(list_niches())


def cmd_palettes(_: argparse.Namespace) -> None:
    for p in PALETTES.values():
        say(palette_preview(p))


def cmd_voices(_: argparse.Namespace) -> None:
    say(f"{C['b']}text models{C['off']}   {', '.join(llm_mod.available()) or 'none configured'}")
    say(f"{C['b']}voices{C['off']}        {', '.join(tts_mod.available()) or 'none'}")


def cmd_doctor(_: argparse.Namespace) -> None:
    say(f"leap {__version__}")
    try:
        ff = ffmpeg_path()
        ok(f"ffmpeg  {ff}")
    except Exception as exc:  # noqa: BLE001
        fail(str(exc))
    ok(f"fonts   {FONTS} ({len(list(FONTS.glob('*.ttf')))} families)")
    llms = llm_mod.available()
    (ok if llms else warn)(f"llm     {', '.join(llms) or 'no API keys found'}")
    voices = tts_mod.available()
    (ok if voices else warn)(f"tts     {', '.join(voices) or 'none'}")
    say(f"cache   {CACHE}")


def cmd_write(args: argparse.Namespace) -> None:
    brand = Brand(name=args.brand, handle=args.handle, tagline=args.tagline)
    brief = Path(args.brief).read_text(encoding="utf-8") if args.brief else None
    try:
        result = write(args.topic, niche=args.niche, duration=args.duration,
                       brief=brief, notes=args.notes, llm_name=args.llm, brand=brand)
    except (ProviderError, WriterError) as exc:
        fail(str(exc))
        raise SystemExit(2)
    script = result.script
    out = Path(args.out or f"scripts/{script.slug}.json")
    script.save(out)
    ok(f"script -> {out}")
    say(script.summary())
    issues = lint_mod.lint(script)
    if issues:
        say("")
        say(lint_mod.summarise(issues))


def cmd_lint(args: argparse.Namespace) -> None:
    script = Script.load(args.script)
    issues = lint_mod.lint(script, target_seconds=args.target)
    say(script.summary())
    say("")
    say(lint_mod.summarise(issues))
    if any(i.level == "error" for i in issues):
        raise SystemExit(1)


def cmd_revise(args: argparse.Namespace) -> None:
    script = Script.load(args.script)
    result = revise(script, args.instruction, llm_name=args.llm)
    result.script.save(args.script)
    ok(f"revised {args.script}")
    say(result.script.summary())


def cmd_render(args: argparse.Namespace) -> None:
    manifest = render_script(
        Path(args.script) if args.script else None,
        out_root=Path(args.out), provider=args.tts, voice=args.voice,
        speed=args.speed, jobs=args.jobs, force=args.force,
        qa_frames=args.frames, music=Path(args.music) if args.music else None,
        crf=args.crf, preset=args.preset, dry_run=args.dry_run,
        skip_lint=args.skip_lint,
    )
    if not manifest.get("dry_run"):
        say("")
        say(f"{C['dim']}next:{C['off']} leap publish {manifest['video']} --privacy unlisted")


def cmd_frames(args: argparse.Namespace) -> None:
    from . import video as vid

    script = Script.load(args.script)
    workdir = Path(args.out)
    voices = {}
    if args.tts:
        voices = narrate(script, workdir, provider=args.tts, voice=args.voice, jobs=args.jobs)
    timeline = build_timeline(script, voices)
    ass_path = write_ass(workdir / "overlay.ass", build_ass(timeline, script, fonts_dir=FONTS))
    frames = vid.contact_sheet(timeline, script, ass_path, workdir / "frames",
                               fonts_dir=FONTS, per_shot=args.per_shot)
    ok(f"{len(frames)} frames -> {workdir / 'frames'}")


def cmd_publish(args: argparse.Namespace) -> None:
    video = Path(args.video)
    if not video.exists():
        fail(f"{video} not found")
        raise SystemExit(1)
    workdir = video.parent
    script_path = workdir / "script.json"
    script = Script.load(script_path) if script_path.exists() else None
    title = args.title or (script.title if script else video.stem)
    description = args.description or (build_description(script) if script else "")
    tags = script.tags if script else []
    try:
        video_id = publish_mod.upload(
            video, title=title, description=description, tags=tags,
            privacy=args.privacy,
            thumbnail=Path(args.thumbnail) if args.thumbnail else None,
        )
    except ProviderError as exc:
        fail(str(exc))
        raise SystemExit(2)
    ok(f"uploaded https://youtube.com/watch?v={video_id}")


def cmd_auth(_: argparse.Namespace) -> None:
    try:
        publish_mod.interactive_auth()
    except ProviderError as exc:
        fail(str(exc))
        raise SystemExit(2)


def cmd_init(args: argparse.Namespace) -> None:
    root = Path(args.dir)
    root.mkdir(parents=True, exist_ok=True)
    env_file = root / ".env.example"
    if not env_file.exists():
        env_file.write_text(
            "# text model - pick one\n"
            "ANTHROPIC_API_KEY=\n# OPENAI_API_KEY=\n# GEMINI_API_KEY=\n"
            "# voices\nELEVENLABS_API_KEY=\n# LEAP_VOICE=21m00Tcm4TlvDq8ikWAM\n"
            "# youtube upload (optional)\nYT_CLIENT_ID=\nYT_CLIENT_SECRET=\nYT_REFRESH_TOKEN=\n",
            encoding="utf-8")
    channel = root / "channel.json"
    if not channel.exists():
        channel.write_text(json.dumps({
            "brand": {"name": "You", "handle": "@yourhandle", "tagline": "one idea per video"},
            "niche": "business",
            "palette": "ember",
            "voice": "",
            "render": {"crf": 19, "preset": "medium"},
        }, indent=2) + "\n", encoding="utf-8")
    ok(f"scaffolded {root} (channel.json + .env.example)")


def cmd_demo(args: argparse.Namespace) -> None:
    demo = ROOT / "examples" / "demo.json"
    if not demo.exists():
        fail("examples/demo.json missing")
        raise SystemExit(1)
    manifest = render_script(demo, out_root=Path(args.out),
                             provider=args.tts or "none", jobs=1,
                             qa_frames=2, skip_lint=True, force=args.force)
    ok(json.dumps({k: manifest[k] for k in ("video", "duration", "shots")}, indent=2))


def cmd_make(args: argparse.Namespace) -> None:
    """topic -> video.mp4 in one command. The whole point of the thing."""
    brand = Brand(name=args.brand, handle=args.handle, tagline=args.tagline)
    brief = Path(args.brief).read_text(encoding="utf-8") if args.brief else None
    step(f"writing: {args.topic}")
    try:
        result = write(args.topic, niche=args.niche, duration=args.duration,
                       brief=brief, notes=args.notes, llm_name=args.llm, brand=brand)
    except (ProviderError, WriterError) as exc:
        fail(str(exc))
        raise SystemExit(2)
    script = result.script
    issues = lint_mod.lint(script)
    errors = [i for i in issues if i.level == "error"]
    if issues:
        say(lint_mod.summarise(issues))
    if errors:
        save = Path(args.out) / "scripts" / f"{script.slug}.json"
        script.save(save)
        fail(f"script has {len(errors)} blocking issue(s); saved to {save} for a manual edit "
             f"(`leap revise {save} \"...\"`)")
        raise SystemExit(1)
    say("")
    say(script.summary())
    say("")
    manifest = render_script(None, out_root=Path(args.out), provider=args.tts,
                             voice=args.voice, speed=args.speed, jobs=args.jobs,
                             force=args.force, qa_frames=args.frames,
                             music=Path(args.music) if args.music else None,
                             crf=args.crf, preset=args.preset, skip_lint=True,
                             script=script)
    say("")
    ok(f"{manifest['video']}")
    say(f"{C['dim']}publish:{C['off']} leap publish {manifest['video']} --privacy unlisted")


def cmd_batch(args: argparse.Namespace) -> None:
    """Render every script in a directory. Batching a week is how a series
    actually ships; one video at a time is how channels die at episode 4."""
    root = Path(args.dir)
    scripts = sorted(root.glob("*.json")) if root.is_dir() else [root]
    scripts = [p for p in scripts if p.name not in {"plan.json", "channel.json", "manifest.json"}]
    if not scripts:
        fail(f"no scripts found in {root}")
        raise SystemExit(1)
    say(f"{len(scripts)} script(s)")
    done, failed = [], []
    for i, path in enumerate(scripts, 1):
        say("")
        step(f"[{i}/{len(scripts)}] {path.name}")
        try:
            manifest = render_script(path, out_root=Path(args.out), provider=args.tts,
                                     voice=args.voice, jobs=args.jobs, force=args.force,
                                     qa_frames=args.frames, crf=args.crf,
                                     preset=args.preset, skip_lint=args.skip_lint)
            done.append((path.name, manifest.get("video"), manifest.get("duration")))
        except (SystemExit, Exception) as exc:  # noqa: BLE001
            failed.append((path.name, str(exc) or "lint failed"))
            warn(f"{path.name}: {exc}")
            if args.stop_on_error:
                break
    say("")
    for name, video, duration in done:
        ok(f"{name:<40} {duration}s  {video}")
    for name, why in failed:
        fail(f"{name:<40} {why}")
    if failed:
        raise SystemExit(1)


def cmd_plan(args: argparse.Namespace) -> None:
    """A 30-day content calendar. Consistency beats virality; this makes
    consistency mechanical."""
    niche = get_niche(args.niche)
    topics = list(args.topics) if args.topics else []
    if not topics:
        from .providers.llm import get_llm
        prompt = (f"Give me 30 specific video topics for a faceless vertical channel.\n"
                  f"NICHE: {niche.name}. AUDIENCE: {niche.audience}. ANGLES: {', '.join(niche.angles)}.\n"
                  f"Each topic: a concrete claim or mechanism, max 9 words, no clickbait, "
                  f"no questions. Return JSON: {{\"topics\": [\"...\"]}}")
        try:
            llm = get_llm()
            data = json.loads(llm.complete("You are a documentary commissioning editor.",
                                           prompt, temperature=0.9, max_tokens=2000).text)
            topics = data.get("topics", [])
        except Exception as exc:  # noqa: BLE001
            fail(f"could not plan without an LLM key: {exc}")
            raise SystemExit(2)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"niche": niche.key, "topics": topics}, indent=2) + "\n",
                   encoding="utf-8")
    for i, topic in enumerate(topics[:30], 1):
        say(f"{i:>2}. {topic}")
    ok(f"{len(topics)} topics -> {out}")


# --------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="leap",
        description="LEAP - a vertical video engine you own. Write, voice, render, publish.")
    p.add_argument("--version", action="version", version=f"leap {__version__}")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("niches", help="list niche profiles").set_defaults(func=cmd_niches)
    sub.add_parser("palettes", help="list palettes").set_defaults(func=cmd_palettes)
    sub.add_parser("voices", help="show configured models and voices").set_defaults(func=cmd_voices)
    sub.add_parser("doctor", help="check the toolchain").set_defaults(func=cmd_doctor)

    d = sub.add_parser("demo", help="render the bundled 30s demo")
    d.add_argument("--out", default="out")
    d.add_argument("--tts", default=None)
    d.add_argument("--force", action="store_true")
    d.set_defaults(func=cmd_demo)

    i = sub.add_parser("init", help="scaffold a channel directory")
    i.add_argument("dir", nargs="?", default=".")
    i.set_defaults(func=cmd_init)

    w = sub.add_parser("write", help="topic -> script.json")
    w.add_argument("topic")
    w.add_argument("--niche", default=None)
    w.add_argument("--duration", type=float, default=42.0)
    w.add_argument("--brief", help="path to a research brief; the only allowed source of facts")
    w.add_argument("--notes", help="extra instructions for the writer")
    w.add_argument("--llm", default=None)
    w.add_argument("--out", default=None)
    w.add_argument("--brand", default="LEAP")
    w.add_argument("--handle", default="")
    w.add_argument("--tagline", default="")
    w.set_defaults(func=cmd_write)

    l = sub.add_parser("lint", help="check a script before spending money")
    l.add_argument("script")
    l.add_argument("--target", type=float, default=45.0)
    l.set_defaults(func=cmd_lint)

    rv = sub.add_parser("revise", help="ask the writer for a surgical edit")
    rv.add_argument("script")
    rv.add_argument("instruction")
    rv.add_argument("--llm", default=None)
    rv.set_defaults(func=cmd_revise)

    r = sub.add_parser("render", help="script.json -> video.mp4")
    r.add_argument("script", nargs="?")
    r.add_argument("--out", default="out")
    r.add_argument("--tts", default=None, help="elevenlabs | openai | edge | local | none")
    r.add_argument("--voice", default=None)
    r.add_argument("--speed", type=float, default=1.0)
    r.add_argument("--jobs", type=int, default=3)
    r.add_argument("--music", default=None)
    r.add_argument("--crf", type=int, default=19)
    r.add_argument("--preset", default="medium")
    r.add_argument("--frames", type=int, default=0, help="render N QA stills per shot")
    r.add_argument("--force", action="store_true", help="ignore the narration cache")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--skip-lint", action="store_true")
    r.set_defaults(func=cmd_render)

    f = sub.add_parser("frames", help="render layout stills only (no audio)")
    f.add_argument("script")
    f.add_argument("--out", default="out/preview")
    f.add_argument("--per-shot", type=int, default=1)
    f.add_argument("--tts", default=None)
    f.add_argument("--voice", default=None)
    f.add_argument("--jobs", type=int, default=3)
    f.set_defaults(func=cmd_frames)

    pu = sub.add_parser("publish", help="upload to YouTube")
    pu.add_argument("video")
    pu.add_argument("--title", default=None)
    pu.add_argument("--description", default=None)
    pu.add_argument("--thumbnail", default=None)
    pu.add_argument("--privacy", default="unlisted",
                    choices=["private", "unlisted", "public"])
    pu.set_defaults(func=cmd_publish)

    sub.add_parser("auth", help="one-time YouTube authorisation").set_defaults(func=cmd_auth)

    mk = sub.add_parser("make", help="topic -> finished video, one command")
    mk.add_argument("topic")
    mk.add_argument("--niche", default=None)
    mk.add_argument("--duration", type=float, default=42.0)
    mk.add_argument("--brief", default=None)
    mk.add_argument("--notes", default=None)
    mk.add_argument("--llm", default=None)
    mk.add_argument("--tts", default=None)
    mk.add_argument("--voice", default=None)
    mk.add_argument("--speed", type=float, default=1.0)
    mk.add_argument("--jobs", type=int, default=3)
    mk.add_argument("--music", default=None)
    mk.add_argument("--crf", type=int, default=19)
    mk.add_argument("--preset", default="medium")
    mk.add_argument("--frames", type=int, default=0)
    mk.add_argument("--force", action="store_true")
    mk.add_argument("--out", default="out")
    mk.add_argument("--brand", default="LEAP")
    mk.add_argument("--handle", default="")
    mk.add_argument("--tagline", default="")
    mk.set_defaults(func=cmd_make)

    b = sub.add_parser("batch", help="render every script in a directory")
    b.add_argument("dir")
    b.add_argument("--out", default="out")
    b.add_argument("--tts", default=None)
    b.add_argument("--voice", default=None)
    b.add_argument("--jobs", type=int, default=3)
    b.add_argument("--crf", type=int, default=19)
    b.add_argument("--preset", default="medium")
    b.add_argument("--frames", type=int, default=0)
    b.add_argument("--force", action="store_true")
    b.add_argument("--skip-lint", action="store_true")
    b.add_argument("--stop-on-error", action="store_true")
    b.set_defaults(func=cmd_batch)

    pl = sub.add_parser("plan", help="30-day topic calendar")
    pl.add_argument("--niche", default="business")
    pl.add_argument("--topics", nargs="*", default=None)
    pl.add_argument("--out", default="scripts/plan.json")
    pl.set_defaults(func=cmd_plan)
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        args.func(args)
    except KeyboardInterrupt:
        fail("interrupted")
        return 130
    except (ProviderError, WriterError, RuntimeError) as exc:
        fail(str(exc))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
