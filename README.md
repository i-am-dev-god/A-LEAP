# How GPS actually finds you

A 60-second YouTube Short about satellite navigation, built with
[Remotion](https://github.com/remotion-dev/remotion). 1080×1920, 30 fps,
narrated, captioned, and cut so the Shorts player's own UI never sits on top of
anything that matters.

```
public/audio/*.mp3  ->  src/timings.json  ->  Remotion  ->  out/gps-short.mp4
```

The finished film is `demo/gps-short.mp4` (59.8 s, 11.7 MB).

## The story

| # | beat | on screen |
|---|---|---|
| 01 | 31 satellites are overhead | count-up numeral over the Earth limb |
| 02 | 20,200 km up, atomic clocks | altitude dimension drawn between horizon and orbit |
| 03 | what a satellite broadcasts | nav-message card: ID / position / timestamp |
| 04 | time of flight | 0.067 s × c = 20,200 km, pulse, distance ruler |
| 05 | trilateration | three distance circles, two candidates, one answer |
| 06 | the phone's clock is cheap | 1 µs = 300 m, four unknowns x y z t |
| 07 | relativity | −7 µs + 45 µs = +38 µs/day → 10 km of drift |
| 08 | your blue dot | "Thank Einstein." |

## Shorts safe area

The Shorts player paints a title / channel / description stack over the bottom
of the frame and like-comment-share buttons over the bottom-right. Everything
readable sits inside the box defined in `src/theme.ts` (`SAFE`):

| edge | reserved |
|---|---|
| top | 210 px |
| bottom | 470 px |
| left / right | 72 px |
| caption band | x 84 → 848, bottom at 1448 |

To check a frame against those zones:

```bash
npx remotion still GpsShort out/check.png --frame=950 --props='{"safeZones":true}'
```

`src/components/SafeZones.tsx` paints the excluded regions red and the content
box green, so a layout regression is obvious in one glance. `demo/safe-areas.png`
is that overlay on scene 04.

## Run it

```bash
npm install
npm run browser   # one-time: provisions Chromium (see below)
npm run render    # -> out/gps-short.mp4
npm run studio    # live preview in the browser
```

`npm run render` re-measures the narration, rewrites `src/timings.json`, and
renders. It takes about 3½ minutes for 1,793 frames on two cores.

## Audio

Narration is an AI voice, one clip per scene, kept in `voice-src/` exactly as it
was recorded. `scripts/prepare-audio.mjs` produces the clips the film actually
plays:

- trims the silence at the head and tail of every sentence,
- normalises each line to −16 LUFS,
- applies one global tempo nudge (1.22×) so the whole cut lands just under a
  minute without the voice changing character mid-film.

Timing is measured, not guessed: `scripts/timings.mjs` reads the real duration
of each clip and writes one scene length per line. Captions are then distributed
across each scene's audio by syllable-ish weight (`src/lib/captions.ts`, karaoke
highlight). Re-record any line, drop it back in `voice-src/`, and run
`npm run audio && npm run render`.

To change the voice, replace the files in `voice-src/` — anything that decodes
as mp3 works, and the film re-cuts itself to the new timing.

## Chromium without a CDN

Remotion normally downloads Chrome Headless Shell. On hosts where that CDN is
blocked, `scripts/browser.mjs` provisions an equivalent build from
`@sparticuz/chromium` (npm) together with the three NSS libraries Debian stock
images lack, then writes a launcher in `.cache/chromium/` that sets
`LD_LIBRARY_PATH` before exec'ing it. `remotion.config.ts` points Remotion at
that launcher. Everything lands in `.cache/` and is git-ignored.

## Layout

```
src/
  content.ts             running order: scene ids -> components
  timings.json           generated: frames per scene, total length
  theme.ts               colours, type scale, SAFE insets
  Video.tsx              <Series> of scenes + optional safe-zone overlay
  Root.tsx               composition registration
  components/            Scene shell, Backdrop, Earth, Satellite, Caption, Ui
  lib/                   anim helpers, caption timing, seeded PRNG
  scenes/                the eight beats
public/audio/            processed narration the video plays
voice-src/               narration as recorded
scripts/                 browser, prepare-audio, timings
```

Every frame is deterministic: randomness comes from `src/lib/anim.ts#seeded`,
so two renders are byte-identical in content.

## Notes

- Type is Inter + JetBrains Mono, self-hosted via `@fontsource` — no network at
  render time.
- The numbers on screen are the real ones: 20,200 km altitude, ~67 ms flight
  time, 300 m per microsecond, +38 µs/day net relativistic gain, ~10 km/day of
  drift if it were ignored.
- No background music is mixed in; add a track with another `<Audio>` inside
  `src/components/Scene.tsx` if you want one.
