# Writing for LEAP

`script.json` is a contract between the writer, the designer and the renderer.
It is small on purpose. This page is the whole specification.

```jsonc
{
  "slug": "one-percent-is-not-one-percent",
  "title": "1% does not cost 1%",        // ≤ 90 chars, no CAPS, no clickbait
  "hook": "the first spoken sentence",   // derived if omitted
  "description": "2 plain sentences",    // goes straight into YouTube
  "tags": ["compounding", "fees"],       // 8–15 lowercase
  "sources": ["arithmetic: 1.06^30 = 5.7435"],
  "niche": "business",
  "palette": "ember",
  "brand": {"name": "LEAP", "handle": "@leap", "tagline": "one idea, forty seconds"},
  "music": {"file": null, "gain_db": -27},
  "render": {"crf": 19, "preset": "medium", "target_lufs": -14},
  "shots": [ ... ]
}
```

Only `title` and `shots` are required. Everything else is inferred.

---

## The six beats

A 40-second short holds attention with a very small grammar. Shots carry their
beat in `beat`, so the writer can be checked mechanically.

| Beat | Purpose | Typical shot kinds |
|---|---|---|
| `HOOK` | open a loop the viewer can't close without staying | `statement`, `stat` |
| `STAKES` | make not-knowing cost something | `stat`, `compare`, `receipt` |
| `PROOF` | the receipt: the number, the document, the mechanism | `receipt`, `chart`, `timeline`, `terminal` |
| `TURN` | the reversal that makes it worth finishing | `flash`, `compare`, `quote` |
| `REFRAME` | name the thing they were actually looking at | `quote`, `statement` |
| `LOOP` | land the idea, point at the next episode | `statement`, `endcard` |

Hook, proof, turn are non-negotiable. Everything else is taste.

**Word budget:** ~2.75 spoken words per second. 40 s ≈ 110 words across 8–11
shots. LEAP rejects scripts over 175 words before rendering.

---

## Shot types

Every shot takes `vo` (what the narrator says) and `beat`. The rest are layout
inputs. `vo` and `headline` are different registers: `vo` is a sentence a human
speaks, `headline` is a fragment a designer sets. Repeating them verbatim wastes
half the frame — `leap lint` will tell you.

### `statement` — the editorial opener or turn
```json
{"kind": "statement", "beat": "HOOK", "kicker": "THE FEE",
 "headline": "1% is not 1%", "vo": "One percent sounds like nothing. That is the whole trick.",
 "sub": "thirty years. same market. two fees.", "emphasis": ["1%"]}
```

### `stat` — one figure, set as large as geometry allows
```json
{"kind": "stat", "beat": "STAKES", "kicker": "THE SETUP",
 "number": "7%", "unit": "a year, before fees", "secondary": "6%",
 "headline": "now subtract one point, every year", "vo": "..."}
```
`secondary` renders as `vs 6%` — useful for before/after pairs.

### `receipt` — the paper card; receipts make numbers feel like evidence
```json
{"kind": "receipt", "beat": "PROOF", "kicker": "THE ARITHMETIC",
 "headline": "Same market. Two endings.",
 "rows": [{"label": "7.00% for 30 years", "value": "$7.61"},
          {"label": "6.00% for 30 years", "value": "$5.74"},
          {"label": "Difference", "value": "24.5%", "note": "per $1 invested"}],
 "sub": "1.06^30 / 1.07^30 = 0.7545"}
```

### `chart` — horizontal bars, values on the right
```json
{"kind": "chart", "bars": [{"label": "year 5", "value": 4.6, "display": "4.6%"},
                           {"label": "year 30", "value": 24.5, "display": "24.5%"}]}
```
`value` is geometry; `display` is what humans read. Keep `display` short.

### `compare` — two columns, auto-fitted
```json
{"kind": "compare",
 "left":  {"label": "The fee", "value": "1%", "body": "charged every year, win or lose"},
 "right": {"label": "What it buys", "value": "the wrapper", "body": "not the return inside it"}}
```

### `flash` — one to three words, full screen, the beat-turn device
```json
{"kind": "flash", "beat": "TURN", "headline": "COMPOUNDING WORKS BOTH WAYS",
 "sub": "in your favour, or against you"}
```
Use at most twice per video.

### `quote` — serif pull-quote
```json
{"kind": "quote", "quote": "The fee is small. The horizon is not.",
 "attribution": "the arithmetic, not an opinion"}
```
Attribute honestly. An unattributed invented quote is a credibility hole.

### `timeline` — a date axis
```json
{"kind": "timeline", "markers": [{"when": "1971", "label": "Bretton Woods ends"},
                                 {"when": "2008", "label": "rates hit zero"}]}
```

### `terminal` — mono lines, revealed in order
```json
{"kind": "terminal", "lines": ["$ git reflog", "a1b2c3d HEAD@{0}: commit: fix"],
 "sub": "your mistake is still in the log"}
```

### `list` — 2–5 items, revealed in order

### `endcard` — the last shot, always
```json
{"kind": "endcard", "beat": "LOOP", "headline": "LEAP",
 "sub": "one idea, forty seconds", "kicker": "NEXT: what 2% does", "vo": ""}
```
No "smash subscribe". A next-episode pointer is worth more than a CTA and can't
be flagged as bait.

---

## Field reference

| Field | Type | Notes |
|---|---|---|
| `kind` | enum | see above, required |
| `vo` | string | spoken text; drives duration, captions and the voice track |
| `beat` | enum | `HOOK STAKES TURN PROOF REFRAME LOOP BODY` |
| `kicker` | string | small caps label above the headline, uppercase rendered |
| `headline` | string | the big line; wraps automatically, sized to fit |
| `sub` | string | one supporting line; never a paragraph |
| `emphasis` | string[] | words that get the accent colour. Must appear on screen verbatim |
| `pace` | float | `0.8` slow → `1.4` fast (currently a hint) |
| `palette` | string | per-shot palette override |
| `min_duration` | float | seconds. Defaults per kind; reading time is still a floor |
| `transition` | string | reserved |

Unknown keys are preserved, so you can carry your own metadata through the
pipeline (`"my_id": 42` survives a save/load round-trip).

---

## Writing rules the linter enforces

1. **No greeting, no "in this video".** The first sentence is the hook.
2. **No engagement bait.** `subscribe`, `smash that`, `part 2`, `link in bio`.
3. **No invented numbers.** A numeric claim without `sources` is a warning; a
   number that comes from nowhere is a credibility failure the linter can't see.
   Use `--brief` and let the writer copy figures out of it verbatim.
4. **≤ 26 spoken words per shot**, ≤ 22 for the hook.
5. **No hedge words** (`literally`, `actually`, `basically`, `insane`) — flagged
   as notes, not failures, because they're a style signal.
6. **Niche bans.** Every profile has a `banned` list (`"scientists are baffled"`,
   `"your brain is wired to"`, `"game-changer"`). Genre tells, removed.

## Using your own model

The prompt lives in `leap/writer.py` (`SYSTEM` + `build_prompt`). Any model that
can return JSON will work. To write by hand:

```bash
leap scaffold   # not needed: just copy examples/demo.json
leap frames script.json --per-shot 2   # check the look before paying for voice
leap render script.json                # voice + render
```

`leap frames` renders stills from the current script in ~15 s with no audio and
no API calls — that is the loop for iterating on a shot.
