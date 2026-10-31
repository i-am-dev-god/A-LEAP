# A-LEAP

**A**sset **L**icense **E**nforcement **A**nd **P**rovenance.

A clearance-first compiler for video. Nothing renders unless every byte is licensed, every person is released, and every obligation is recorded.

```
$ aleap check examples/risky-clone.json

  A-LEAP · Asset License Enforcement And Provenance
  GOAT DEBATE — Ronaldo in D, Messi in S (clone)  (short · 21s · sports)

  VERDICT  BLOCKED     SCORE 0/100
  4 assets · 6 blocking · 4 errors · 2 warnings

  exposure: copyright strike, Content ID claim, reused content, likeness rights, inauthentic content

  BLOCK R001  Reference video used as an asset source
        Cloning structure is fine. Reusing the reference's frames or audio is a
        derivative work and a fingerprint match.
        → Re-source every slot: keep the edit pattern, replace all bytes.
  ...
  NEXT  Render refused. Re-source the blocking assets.
```

---

## Why this exists

"Don't get a copyright strike" is not one problem. It is four, and they have different fixes:

| Failure mode | What triggers it | What actually protects you |
|---|---|---|
| **Copyright strike** | Someone else's footage or music in your timeline | A license record and a content hash per asset; render refuses unclean input |
| **Content ID claim** | Even a few seconds of a *legally licensed* track that is fingerprinted | Audio that exists in no catalog: commissioned, generated, or audio-library cleared |
| **Reused content** | Compilations, reactions, permissionless re-uploads | Real transformation — and permission from the original creator **does not** cure this |
| **Inauthentic content** (since 2025-07-15) | Templated, mass-produced, near-identical uploads | A consistent *format* with materially different *substance* every episode |

Plus two that are not copyright at all but end channels faster:

- **Likeness** — a real face or voice, with or without a face swap, is a publicity-rights problem. Takedowns here do not require a DMCA notice.
- **Disclosure** — photorealistic synthetic content must be labelled, and synthetic personas on health / legal / finance topics are excluded from monetization.

A-LEAP models all six. It treats *unknown* as *risk*, because the downside is asymmetric: an unnoticed claim silently redirects a video's revenue, and three strikes ends the channel.

## The core idea: clone structure, never substance

Cloning a viral video is safe in exactly one dimension — **structure**. Edit rhythm, caption style, shot count, hook shape, tier-list geometry: none of that is copyrightable. The bytes are.

So the spec asks one question about your reference:

```json
"reference": { "used": "structure-only" }
```

- `structure-only` → cleared.
- `assets` → **blocked**, every time, with no override.
- an asset that traces to the reference → blocked if `verbatim` or `resampled`, warned if `restyled`, cleared only when `regenerated`.

`examples/risky-clone.json` and `examples/fixed-clone.json` are the same video, one blocked and one cleared, differing only in where the bytes came from.

## Quickstart

```bash
git clone <this repo> && cd A-LEAP
npm install
npm test                                  # 17 tests
node src/cli.ts check examples/clean-episode.json
node src/cli.ts check examples/risky-clone.json --manifest out/manifest.json
```

Node 22.18+ runs the TypeScript directly. `npm run build` emits `dist/` if you prefer the compiled CLI.

Exit codes are CI-friendly:

| Code | Verdict | Meaning |
|---|---|---|
| 0 | `cleared` / `review` | Safe to render; review is advisory |
| 1 | `needs-work` | Will publish but will lose monetization |
| 2 | `blocked` | At least one asset cannot legally be used |

## Spec format

A spec is JSON. Every asset declares its own license, origin, and provenance hash:

```json
{
  "id": "ep01-iss-water",
  "title": "The ISS has been drinking the same water since 2009",
  "format": "documentary",
  "durationSec": 552,
  "topic": "engineering",
  "commercialUse": true,
  "reference": { "used": "structure-only" },
  "series": { "templateId": "systems-explained-v1", "structuralSimilarity": 0.34 },
  "presenter": { "kind": "synthetic" },
  "disclosure": { "syntheticRealistic": false },
  "assets": [
    {
      "id": "iss-archive-01",
      "kind": "video",
      "slot": "b-roll",
      "source": "https://images.nasa.gov/details/iss040e006000",
      "license": "us-gov-work",
      "origin": "public-domain",
      "sha256": "1b7d4f9c…"
    }
  ]
}
```

Fields that do the heavy lifting: `license`, `origin`, `sha256`, `derivedFrom`, `contentIdRegistered`, `persons` + `releasesOnFile`, `synthetic` + `realistic`, and `reference.used`.

## Rules

| ID | Rule | Severity | Surface |
|---|---|---|---|
| L001 | Asset has no license record | block | strike |
| L002 | Unrecognised license id | block | strike |
| L003 | Non-commercial license used commercially | block | strike |
| L004 | No-derivatives license on an edited asset | block | strike |
| L005 | ShareAlike obligation inherited | error | strike |
| L006 | Required attribution missing | error | strike |
| R001 | Pixels or samples lifted from the reference | block | strike, claim, reused |
| R002 | Reference-derived asset with no reference block | error | strike |
| R003 | Reference use unclassified | warn | strike |
| A001 | Audio likely fingerprinted | error | claim |
| P001 | Real person without a release | error | likeness |
| P002 | Synthetic voice of a real person | block | likeness, disclosure |
| D001 | Realistic synthetic content not disclosed | error | disclosure |
| D002 | Synthetic presenter on a restricted topic | error | inauthentic |
| D003 | Episode structurally identical to the series | error | inauthentic |
| H001 | Third-party asset has no content hash | warn | strike |
| H002 | Trademark visible in frame | warn | trademark |

`aleap rules` prints the list. Adding a rule is one function in `src/rules.ts` plus a test — the analyzer, report, and manifest pick it up automatically.

## The manifest

`--manifest` writes the artifact you hand to a client, a network, or a brand's legal team: every asset, its license, its hash, the auto-generated credit block, the disclosure flags, and what the reference was used for. It is generated from the spec and never edited by hand.

## What to make with it

The format matters as much as the clearance. The recommendation, in order:

1. **Synthetic documentary** — 8–12 minute engineering and science essays plus three shorts per episode. Every input is clearable: NASA / USGS / Library of Congress public domain, Wikimedia CC BY, code-rendered diagrams, licensed synthetic narration, a commissioned or procedural score. Highest watch time and CPM in a category where originality is the whole product.
2. **Data explainers** — 30–60 second code-rendered chart shorts. Zero strike surface, weaker moat, and the format drifts toward templated output if you are not disciplined.
3. **Client ad factory** — brand deliverables. Clearance is a contract term, not a policy risk.

Avoid: true crime and news remixes (footage and likeness), sports and gaming (fingerprinting), trending sounds (claims without exception), and synthetic personas in health, legal, or finance (not monetizable).

## Roadmap

- [ ] Renderer gate: a `render` command that refuses to encode while the verdict is `blocked`
- [ ] Asset ingestion: fetch from a source URL, hash the bytes, verify the license against the page's terms
- [ ] Audio fingerprint pre-check against a local index before upload
- [ ] Publish metadata: description with credits, disclosure flags, chapter and tag generation
- [ ] Series lint: compare episode specs and flag the mass-produced shape before it ships

## License

MIT
