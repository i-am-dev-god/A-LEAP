"""Fast, offline tests. `python -m pytest tests -q` or `python tests/test_engine.py`."""
from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from leap import design, lint  # noqa: E402
from leap.audio import (Interval, chunk_words, estimate_word_times,  # noqa: E402
                        ffmpeg_path, wav_duration)
from leap.providers.tts import silence_wav  # noqa: E402
from leap.providers.base import Speech  # noqa: E402
from leap.script import Script, Shot  # noqa: E402
from leap.theme import PALETTES, get_palette  # noqa: E402
from leap.timeline import build_ass, build_timeline, write_srt  # noqa: E402
from leap.util import (ass_colour, estimate_speech_seconds, hex_to_rgb,  # noqa: E402
                       syllables, text_width, wrap)
from leap.video import audio_graph, background_chain  # noqa: E402
from leap.writer import coerce, extract_json  # noqa: E402


def demo_script() -> Script:
    return Script.load(ROOT / "examples" / "demo.json")


# --------------------------------------------------------------------------
# text and colour
# --------------------------------------------------------------------------


def test_colour_roundtrip():
    assert hex_to_rgb("#FF9E2C") == (255, 158, 44)
    assert ass_colour("#FF9E2C") == "&H002C9EFF"   # ASS is BGR
    assert ass_colour("#FFFFFF", 0x80).startswith("&H80")


def test_syllables():
    assert syllables("fee") == 1
    assert syllables("compounding") == 3
    assert syllables("horizon") == 3


def test_wrap_never_exceeds_width():
    lines = wrap("a fairly long headline that has to wrap onto several lines",
                 "Poppins Bold", 80, 600)
    assert len(lines) > 1
    for line in lines:
        assert text_width(line, "Poppins Bold", 80) <= 600 or len(line.split()) == 1


def test_speech_estimate_is_plausible():
    seconds = estimate_speech_seconds(
        "One percent sounds like nothing. That is the whole trick.")
    assert 2.0 < seconds < 8.0


# --------------------------------------------------------------------------
# script schema
# --------------------------------------------------------------------------


def test_demo_script_loads_and_roundtrips():
    s = demo_script()
    blob = json.dumps(s.to_dict())
    again = Script.from_dict(json.loads(blob))
    assert len(again.shots) == len(s.shots)
    assert again.shots[0].kind == "statement"
    assert again.shots[-1].kind == "endcard"


def test_unknown_keys_survive():
    s = Script.from_dict({
        "title": "t", "shots": [
            {"kind": "statement", "vo": "hello", "headline": "hi", "my_custom": 42},
            {"kind": "endcard", "headline": "b"},
        ]})
    assert s.shots[0].to_dict().get("my_custom") == 42


def test_invalid_shots_rejected():
    for bad in (
        {"kind": "nonsense", "vo": "x"},
        {"kind": "compare", "vo": "x"},          # needs left/right
        {"kind": "timeline", "vo": "x"},         # needs markers
    ):
        try:
            Script.from_dict({"title": "t", "shots": [bad]})
        except ValueError:
            continue
        raise AssertionError(f"should have rejected {bad}")


def test_writer_json_extraction_is_forgiving():
    assert extract_json('```json\n{"a": 1}\n```')["a"] == 1
    assert extract_json('Sure! Here you go: {"a": 2, }')["a"] == 2


def test_coerce_adds_endcard():
    from leap.niches import get_niche

    raw = {"title": "Test", "shots": [
        {"kind": "statement", "vo": "hello there", "headline": "hello"}]}
    script = coerce(raw, get_niche("business"), "Test")
    assert script.shots[-1].kind == "endcard"


# --------------------------------------------------------------------------
# lint
# --------------------------------------------------------------------------


def test_lint_flags_engagement_bait():
    s = demo_script()
    s.shots[1].vo = "Smash that like button and subscribe for part 2"
    issues = lint.lint(s)
    assert any(i.level == "error" and "bait" in i.message for i in issues)


def test_lint_flags_weak_hook():
    s = demo_script()
    s.shots[0].vo = "In this video we are going to talk about fees."
    s.shots[0].headline = "fees"
    issues = lint.lint(s)
    assert any(i.level == "error" and "opens with" in i.message for i in issues)


def test_clean_demo_has_no_errors():
    errors = [i for i in lint.lint(demo_script()) if i.level == "error"]
    assert not errors, [str(e) for e in errors]


# --------------------------------------------------------------------------
# timing
# --------------------------------------------------------------------------


def test_word_times_are_monotonic_and_inside_span():
    text = "Take seven percent a year, then take one point off, every year."
    span = Interval(0.2, 4.0)
    times = estimate_word_times(text, span)
    assert len(times) == len(text.replace(",", "").split())
    last = -1.0
    for _, start, end in times:
        assert start >= last - 1e-6
        assert end >= start
        last = start
    assert times[0][1] >= span.start - 1e-6
    assert times[-1][2] <= span.end + 0.5


def test_caption_chunks_are_short():
    span = Interval(0.0, 6.0)
    times = estimate_word_times(
        "Compounding does not care whose side it is on in the end", span)
    chunks = chunk_words(times, max_words=3, max_chars=22)
    assert all(len(c) <= 3 for c in chunks)
    assert " ".join(w for c in chunks for w, _, _ in c).split() == \
        "Compounding does not care whose side it is on in the end".split()


def test_timeline_covers_every_shot_without_gaps():
    s = demo_script()
    tl = build_timeline(s, {})
    cursor = 0.0
    for shot in tl.shots:
        assert abs(shot.start - cursor) < 1e-6
        assert shot.duration > 0
        cursor = shot.end
    assert abs(tl.duration - cursor) < 1e-6


def test_reading_time_wins_over_short_narration():
    shot = Shot(kind="receipt", vo="Short.", rows=[
        {"label": "a", "value": "1"}, {"label": "b", "value": "2"},
        {"label": "c", "value": "3"}])
    assert design.reading_time(shot) > 2.0


# --------------------------------------------------------------------------
# rendering (offline, silent)
# --------------------------------------------------------------------------


def test_ass_document_is_valid_and_escapes():
    s = demo_script()
    tl = build_timeline(s, {})
    ass = build_ass(tl, s, fonts_dir=ROOT / "assets" / "fonts")
    assert ass.startswith("[Script Info]")
    assert "PlayResX: 1080" in ass
    assert "[V4+ Styles]" in ass and "[Events]" in ass
    events = [ln for ln in ass.splitlines() if ln.startswith("Dialogue:")]
    assert len(events) > 50
    # no raw newlines inside events, no stray braces from user text
    assert all("\n" not in e for e in events)


def test_captions_never_leave_safe_area():
    s = demo_script()
    tl = build_timeline(s, {})
    ass = build_ass(tl, s, fonts_dir=ROOT / "assets" / "fonts")
    style_line = next(ln for ln in ass.splitlines() if ln.startswith("Style: caption,"))
    fields = style_line.split(",")
    # Alignment is field 19 (index 18), MarginV is field 22 (index 21)
    assert fields[18] == "2"
    caption_y = 1920 - int(fields[21])
    assert 1200 < caption_y < 1600, caption_y
    assert any(",caption," in ln for ln in ass.splitlines())


def test_background_chain_is_ffmpeg_parsable():
    import subprocess

    palette = get_palette("ember")
    chain = background_chain(palette, 0.4, seed=2, fps=30)
    cmd = [ffmpeg_path(), "-hide_banner", "-loglevel", "error", "-y",
           "-f", "lavfi", "-i", chain, "-t", "0.2", "-f", "null", "-"]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    assert proc.returncode == 0, proc.stderr[-500:]


def test_audio_graph_counts_inputs_correctly():
    s = demo_script()
    with tempfile.TemporaryDirectory() as tmp:
        voices = {}
        for i in range(len(s.shots)):
            wav = Path(tmp) / f"{i}.wav"
            silence_wav(wav, 1.0 + 0.1 * i)
            voices[i] = Speech(wav, wav_duration(wav), [], "none", "silent", "x")
        tl = build_timeline(s, voices)
        graph = audio_graph(tl)
        assert graph.count("anullsrc") >= len(s.shots)
        assert "concat=n=" in graph
        import re

        # each vo label appears twice: defined, then referenced by concat
        assert len(set(re.findall(r"\[vo\d+\]", graph))) == len(s.shots)


def test_full_silent_render_smoke():
    """One real ffmpeg pass: proves the graph, the overlay and the mux work."""
    import subprocess

    from leap.video import render

    s = demo_script()
    s.shots = s.shots[:3]
    s.shots.append(Shot(kind="endcard", beat="LOOP", headline="LEAP", vo=""))
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        voices = {}
        for i, shot in enumerate(s.shots):
            wav = tmp_path / f"v{i}.wav"
            silence_wav(wav, 1.2)
            voices[i] = Speech(wav, 1.2, [], "none", "silent", shot.spoken)
        tl = build_timeline(s, voices)
        ass_path = tmp_path / "o.ass"
        ass_path.write_text(build_ass(tl, s, fonts_dir=ROOT / "assets" / "fonts"))
        voice = tmp_path / "voice.wav"
        from leap.video import render_voice_track

        render_voice_track(tl, voice)
        assert wav_duration(voice) > 3.0
        out = tmp_path / "v.mp4"
        result = render(tl, s, ass_path, out, voice_track=voice, crf=30,
                        preset="ultrafast", fps=12, width=540, height=960,
                        fonts_dir=ROOT / "assets" / "fonts")
        assert out.exists() and result.size_mb > 0.05
        probe = subprocess.run(
            [ffmpeg_path(), "-hide_banner", "-i", str(out)],
            capture_output=True, text=True).stderr
        assert "Video: h264" in probe
        assert "Audio: aac" in probe


def test_every_palette_builds_a_document():
    s = demo_script()
    for name in PALETTES:
        s.palette = name
        tl = build_timeline(s, {})
        ass = build_ass(tl, s)
        assert len(ass) > 4000


def test_srt_export():
    s = demo_script()
    tl = build_timeline(s, {})
    with tempfile.TemporaryDirectory() as tmp:
        out = write_srt(Path(tmp) / "c.srt", tl)
        blob = out.read_text()
        assert "-->" in blob
        assert blob.strip().startswith("1")


if __name__ == "__main__":
    failures = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"  ok   {name}")
            except Exception as exc:  # noqa: BLE001
                failures += 1
                print(f"  FAIL {name}: {type(exc).__name__}: {exc}")
    print("failed:", failures)
    sys.exit(1 if failures else 0)
