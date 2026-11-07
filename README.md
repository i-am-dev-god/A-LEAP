# LEAP

**An operating environment with no disk.**

Nine characters in the address bar reconstruct an entire machine: its field, its
key, its temperament, and its itinerary. Nothing is written down. Nothing is
fetched. Close the tab and the machine is gone; paste the address and it is
exactly, byte-for-byte, back.

```
naaldwijk.4g1c7j0m4   →   Junwisp, an ember machine in adagio
```

*One address, one engraved atlas that has never existed and is never saved.*

```bash
git clone https://github.com/i-am-dev-god/A-LEAP && cd A-LEAP
npm run dev        # → http://localhost:8080
npm run build      # → index.html, one file, 54 kB, nothing else
```

No dependencies at runtime. No build step required to use it. No assets, no fonts,
no images, no audio files, no database, no cookies, no `localStorage`. The
repository is smaller than a single photograph, and it is the whole machine.

---

## The idea, in one paragraph

Every operating system you have used is a machine **plus a pile of things it
remembers**: your files, your settings, your history, your accounts. The pile is
the point, and the pile is the problem — it is what breaks, what leaks, what has
to be migrated, what dies with the hardware. LEAP takes the opposite axiom:

> **Anything that can be recomputed should never have been stored.**

A machine's identity is not a record. It is a rule. Give me a rule and I can grow
the machine again anywhere, forever, from nothing. So LEAP replaces storage with
derivation, and asks the honest question that follows: *what is an operating
system for, if it cannot remember anything about you?* The answer it gives is the
best part of the design — **it remembers you by returning, not by keeping.**

## How storage is made impossible

| layer | ordinary OS | LEAP |
|---|---|---|
| identity | a user account, a row in a database | 42 bits in a URL fragment |
| appearance | a theme file, wallpapers | 2.9 kB of GLSL generated at boot, then discarded |
| sound | audio assets on disk | oscillator graph built from the seed; no samples |
| state | a session, a save file | `f(seed, clock)` — a pure function |
| documents | files | none exist; the shell is a naming ceremony |
| sync | a server | the address bar |

The address is the *only* persistent artifact, and you own it. If you do not
share it, LEAP has no idea who you are, because it never knew.

## What it actually does

**The plate.** Each machine is an engraved contour atlas of terrain that does not
exist. A continental mask decides where the high ground is, ridged noise decides
how sharp it is, and the contours are true level sets — their screen width is
derived from the slope, so every line holds the same weight and steep ground never
fills in solid. Round the map with a seed-derived sun bloom, a focal falloff, a
vignette and print grain, and you have a cartographic plate nobody has ever seen.

The GLSL is **generated as a string** from the genome, compiled at boot, and
thrown away at shutdown. Sixteen thousand names, each with its own palette,
landform, sun and line weight — and not one pixel of it stored.

**The organ.** There are no `.wav` files. The machine's key, its scale, its pad,
its air, and the bell it rings when it composes are synthesised by Web Audio from
the same seed. The analyser output is fed straight back into the fragment shader,
so three lit contours cut across the plate when the machine speaks. What you hear *is* what you
see, in the literal signal-flow sense.

**The itinerary.** LEAP has modes, not windows: `orbit`, `listen`, `compose`,
`reveal`, `settle`. They unfold as a timed score whose tempo comes from the
machine's patience dial. There is no "current mode" variable anywhere in the
system. Ask "what time is it?" and the answer is computed; ask "what mode am I in?"
and the answer is *the same computation*. That is why refreshing never loses your
place — there was no place to lose.

**The shell.** One input. It is deliberately not a terminal for files, because
there are no files. Typing a word that is not a command **renames the machine**:
unknown input becomes identity. It is the only OS I have used whose error message
is a naming ceremony.

```
› help      › seed      › name naaldwijk     › verify
› again     › settle    › pause / play       › motion  › night
› sound     › liturgy   › law                › close
```

**The refusal.** A seed carries a 10-bit checksum of the word it came from
(`4g1c7j0m4` ⟵ `naaldwijk`). Paste a machine with someone else's name on it and
LEAP boots the machine but tells you the name is not proven. Identity here is
verifiable, not asserted.

## The four laws

```
1. The seed reconstructs the machine. The machine never stores the seed.
2. Nothing is written to disk: there is no disk.
3. Every pixel is a pure function of the seed, the clock, and you.
4. A machine is not its files. A machine is a way of returning.
```

## Try the proof yourself

```bash
npm test
```

Two suites, no trust required:

* **The storage proof** (`test/storage-proof.test.mjs`) greps the *executable
  bundle* for every API that can persist — `localStorage`, `indexedDB`,
  `document.cookie`, `serviceWorker`, `fetch`, `XMLHttpRequest`, `WebSocket`,
  `FileReader` — and fails the build if one appears. It also asserts that the
  repository contains zero asset and zero database files, that the page makes no
  external requests, and that 2,000 seeds round-trip losslessly through nine
  characters.
* **The boot test** (`test/boot.test.mjs`) runs the real built page in a simulated
  browser with a recording WebGL stub, drives every shell command, and asserts
  that two loads of one address are identical machines, that a corrupt address
  degrades gracefully, and that a false name claim is refused.

Tests that can fail are the only kind worth writing.

## Layout

```
index.html            the build: one file, the whole OS
docs/index.html       the same, for GitHub Pages
src/core.js           seed ⇄ genome ⇄ GLSL. Pure. The whole machine.
src/cognition.js      modes, itinerary, liturgy. Pure functions of time.
src/render.js         WebGL cockpit: one triangle, no meshes
src/organ.js          Web Audio synthesis: no samples
src/app.js            boot, shell, address
src/shell.html        the visible shell (typography + structure)
scripts/build.mjs     ~90-line hand-rolled bundler
scripts/serve.mjs     ~30-line dev server
test/                 the storage proof and the boot test
```

## Why this, and not another app

- **It cannot leak you**, because there is nothing about you to leak.
- **It cannot rot**, because there is no data to migrate and no dependency tree.
- **It cannot be lost**, because the machine is an address you can write on paper.
- **It can be given away infinitely**, because giving it away costs zero bytes —
  which is the definition of a gift that does not deplete.

An OS that needs no storage is not a smaller OS. It is a different claim about
what a computer is: not a container you fill, but a place you can always return to.

---

MIT. Take it, rename it, seed it with your own town.
