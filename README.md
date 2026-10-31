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
| `--background` | `auto` | background clip; `auto` generates a gradient stand-in |
| `--music` | — | music bed, looped, mixed at 16% |
| `--voice` | `slt` | flite voice: `slt` (female), `awb`, `rms` (male), `kal` |
| `--tts` | `flite` | speech backend: `flite` or `cmd` |
| `--tts-cmd` | — | any TTS CLI, e.g. `'espeak-ng -w {out} {text}'` |
| `--font` | DejaVu Sans Bold | caption + title typeface |
| `--fps` | 30 | frame rate |

Output is H.264 / AAC, 1080×1920, `+faststart`, ready to upload.

## How it works

| file | job |
|---|---|
| `rsm/post.py` | loads the post, strips markdown, splits it into sentences |
| `rsm/tts.py` | narrates sentence by sentence so each sentence's length is exact, then allocates word timings by weight with punctuation pauses taken out |
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

## Notes

- The bot renders; it does not upload. You publish.
- `--background auto` is a placeholder gradient so the pipeline runs with zero assets. For a real video you supply the clip.
- Reddit's public JSON endpoint is rate-limited and blocks many hosts; if it 403s, save the post to JSON and pass the file.
