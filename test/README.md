# test/

Real output, committed so you can watch it without installing anything.

| File | What it is |
|---|---|
| **`TEST.mp4`** | 34 s · 1080×1920 · 30 fps · 3.9 MB · the demo script rendered end-to-end |
| `TEST.script.json` | the exact input — 9 shots, 118 words |
| `TEST.description.txt` | the YouTube description LEAP generated (sources included) |

## What is and isn't in this file

- **This render is SILENT on purpose.** It was made with `--tts none`, which is the
  keyless preview mode: motion, layout, pacing and karaoke caption timing all
  driven by the estimate model. The caption words you see flashing are the real
  caption engine working off estimated word timings.
- To get a voiced version you need one API key, then:

  ```bash
  export ELEVENLABS_API_KEY=…      # word-exact captions
  # or: pip install edge-tts       # free, estimated captions
  python3 -m leap render examples/demo.json --out out
  ```

  Same 90 seconds of CPU, ~$0.15 of narration.

## Reproduce this file exactly

```bash
python3 -m leap render examples/demo.json --tts none --skip-lint --crf 22 --preset medium
cp out/one-percent-is-not-one-percent/video.mp4 test/TEST.mp4
```

## Check it

```bash
ffprobe test/TEST.mp4     # 1080x1920, h264, 30 fps, 34 s, aac 48 kHz
python3 tests/test_engine.py
```

The underlying script is fact-checked in the only way that matters here: the
claim *is* arithmetic (`1.06^30 = 5.7435`, `1.07^30 = 7.6123`, ratio `0.7545`),
so nothing is cited and nothing is invented. It is not financial advice.
