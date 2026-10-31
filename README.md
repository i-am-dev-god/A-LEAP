# reddit-short

**One command turns a Reddit post into a 1080×1920 narrated short.**

```
post  ->  narration  ->  word timings  ->  captions  ->  frames  ->  mp4
```

```bash
python main.py examples/post.json -o out/short.mp4
```

```
  r/AmItheAsshole · 11 sentences
  narrated · 48.7s · 157 words
  rendered 1462 frames
  wrote out/short.mp4 · 6.9 MB
```

`demo/short.mp4` is the output of exactly that command.
`demo/laundry-short.mp4` is the same pipeline with an AI voice, a generated
background and a room-tone bed — see [AI voice](#ai-voice).

## Install

```bash
pip install -r requirements.txt     # imageio-ffmpeg, pillow
apt install flite                   # any TTS works; flite is the offline default
```

No API keys. No browser. No ffmpeg install (the binary ships inside `imageio-ffmpeg`).

## Use

```bash
python main.py examples/post.json                       # from a saved post
python main.py --subreddit AmItheAsshole                # top post of the day
python main.py --url https://reddit.com/r/AmItheAsshole/comments/xxxxx
python main.py examples/post.json --background gameplay.mp4 --music bed.mp3
```

| flag | default | what it does |
|---|---|---|
| `-o, --out` | `out/short.mp4` | where the video lands |
| `--background` | `auto` | background clip **or still image**; `auto` generates a gradient stand-in |
| `--music` | — | music bed, looped, mixed at 16% |
| `--voice` | `slt` | flite voice: `slt` (female), `awb`, `rms` (male), `kal` |
| `--tts` | `flite` | speech backend: `flite`, `cmd`, or `clips` |
| `--tts-cmd` | — | any TTS CLI, e.g. `'espeak-ng -w {out} {text}'` |
| `--clips-dir` | — | pre-recorded voice: `0000.wav`, `0001.wav`, … (see below) |
| `--font` | DejaVu Sans Bold | caption + title typeface |
| `--fps` | 30 | frame rate |

Output is H.264 / AAC, 1080×1920, `+faststart`, ready to upload.

## AI voice

Any voice you can save as one file per sentence drops straight in — ElevenLabs,
OpenAI, PlayHT, a human read. Name the files `0000.wav`, `0001.wav`, … in
sentence order, then:

```bash
python main.py examples/laundry.json \
  --tts clips --clips-dir assets/voice \
  --background assets/background.png \
  --music assets/room-tone.wav \
  -o out/short.mp4
```

Clips are resampled to 16 kHz mono and their head/tail silence is trimmed, so
caption timing stays tight against the voice. `assets/voice/` in this repo holds
the nine clips behind `demo/laundry-short.mp4`.

A still image is enough for a background: `--background shot.png` builds a
seamlessly looping breathing zoom from it (`rsm/render.py:image_background`).

## How it works

| file | job |
|---|---|
| `rsm/post.py` | loads the post, strips markdown, splits it into sentences |
| `rsm/tts.py` | narrates sentence by sentence so each sentence's length is exact (flite, any CLI, or pre-recorded clips), then allocates word timings by weight with punctuation pauses taken out |
| `rsm/captions.py` | wraps words four to a line and paints the active word knocked out of a solid highlight |
| `rsm/layout.py` | renders the whole frame chrome once — subreddit header, avatar, title card, scrims |
| `rsm/render.py` | streams the background as raw RGB, pastes the chrome, draws the caption, pipes frames straight into the encoder |
| `rsm/fetch.py` | pulls a post from Reddit's public JSON endpoint |
| `rsm/cli.py` | the one command |

Renders at about 25 fps of finished video per wall-clock second on two cores.

## Customising

- **Background** — drop any clip in with `--background clip.mp4`. It is scaled to cover, centre-cropped, and looped to whatever length the narration runs.
- **Voice** — `--tts-cmd` takes any TTS that writes a 16 kHz mono wav: `"piper -m voice.onnx -f {out}"`, `"say -o {out} --data-format=LEI16@16000 {text}"` on macOS.
- **Look** — colours, padding and the caption highlight live at the top of `layout.py` and `captions.py`.
- **Music** — `--music` loops a bed under the narration.

## Why not just use RedditVideoMakerBot?

[RedditVideoMakerBot](https://github.com/elebumm/RedditVideoMakerBot) is the
project that made this genre — a full bot: scrape, narrate, edit, upload, all
driven by `config.toml`. It is heavy: Reddit API credentials, Playwright for
comment screenshots, moviepy, ~40 transitive dependencies, and a render that
takes a while per minute of video.

This repo is the 80% that actually ships a short: ~900 lines, two dependencies
(`pillow`, `imageio-ffmpeg`), no credentials, no browser, frames streamed
straight into libx264. Reach for RedditVideoMakerBot when you want an automated
channel pulling posts on a schedule; reach for this when you want one clean
1080×1920 file in a couple of minutes.

## Notes

- The bot renders; it does not upload. You publish.
- `--background auto` is a placeholder gradient so the pipeline runs with zero assets. For a real video you supply the clip.
- Reddit's public JSON endpoint is rate-limited and blocks many hosts; if it 403s, save the post to JSON and pass the file.
