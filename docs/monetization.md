# The economics, without the fantasy

If you want millions from YouTube, the tool is the cheap part. This page is the
part the repos with 135,000 stars leave out.

---

## 1. The numbers you are actually aiming at

As of late 2026, the YouTube Partner Program (ads + Premium revenue) requires:

- **1,000 subscribers**, and
- **4,000 public watch hours in 12 months** *or* **10 million public Shorts
  views in 90 days**.

From **1 February 2027** those performance bars double: **8,000 watch hours** or
**20 million Shorts views in 90 days**.

Shorts RPMs are small — commonly cited at **$0.03–$0.15 per 1,000 views**, versus
$2–$10 for long-form. Do the arithmetic:

| 1M Shorts views | ≈ ad revenue |
|---|---|
| at $0.05 RPM | $50 |
| at $0.10 RPM | $100 |
| at $0.15 RPM | $150 |

So: **10,000,000 views/month ≈ $500–1,500/month in ads.** Millions of dollars
from Shorts ads alone implies hundreds of millions of monthly views. That is a
media company, not a side project. The realistic money in this niche is not ads:

1. **Long-form attached to the same research.** A 40-second Short is the trailer;
   a 12-minute video on the same idea earns 20–60× the RPM per view.
2. **A product the channel points at** — a paid newsletter, a course, a template
   pack, an affiliate with a real product behind it.
3. **Licensing / brand deals** — priced per deliverable, not per thousand views.

Treat any repo or course promising millions *from Shorts ad revenue* as
advertising, because that's what it is.

---

## 2. The policy that actually eats faceless channels

**Inauthentic content** (renamed from "repetitious content" on 15 July 2025,
clarified **16 July 2026**) — three buckets are ineligible for monetisation:

1. **Generic, repetitive or template-based content**: near-identical videos,
   slideshows, the same script shape with the noun swapped.
2. **Off-putting or distressing content**: stitched clips engineered to shock,
   repetitive peril scenarios.
3. **Synthetic personas on sensitive topics**: AI hosts presenting as experts on
   health, legal, financial or medical matters.

Enforcement is not theoretical: **January 2026, 16 AI-heavy channels removed** —
~4.7 billion lifetime views, ~35 million subscribers, an estimated ~$10M/year of
ad revenue. They were not caught by an AI detector; they were caught by being
interchangeable.

What is **explicitly still fine**:

- faceless narration over licensed or generated visuals
- recurring characters, mascots, hosts
- consistent intros/outros/lower-thirds/editing systems
- **series formats where each episode follows the same structure**
- AI for scripting, voice, editing, thumbnails

The line is one sentence: **format may repeat, substance cannot.**

Related, and separate:

- **AI disclosure.** Since 27 May 2026 YouTube auto-labels photorealistic
  synthetic media it detects, and disclosure does not by itself limit reach or
  monetisation. Undisclosed realistic synthetic media is the violation.
  `leap publish` sets `containsSyntheticMedia: true` on every upload.
- **Reused content.** Borrowed clips without substantive commentary. Another
  reason LEAP generates pixels instead of scraping Pexels.

Sources: YouTube Help *channel monetization policies*; TechCrunch (20 Jul 2026)
on the three buckets; Creator Insider walkthrough by Matt Halprin; the
Feb-2027 threshold announcement (10 Aug 2026).

---

## 3. What LEAP does about it, concretely

| Policy risk | LEAP's answer |
|---|---|
| Template-based output | 11 semantic shot kinds composed per script; palettes and motion seeded per shot; the writer is told to vary kinds and never repeat the previous one |
| No original value | `--brief` restricts facts to *your* research; the linter flags numeric claims with no `sources`; the writer is forbidden from inventing figures |
| Synthetic expert persona | the writer's hard rules ban medical/legal/financial advice and first-person authority claims; `niches.py` has no "AI doctor" profile |
| Engagement bait / off-putting content | banned phrase lists, linter errors, no CTA outros, no shock framing |
| Disclosure | `publish` sets the synthetic-media flag; descriptions carry sources |
| Sameness across a catalogue | one palette + type system *per channel*, but a new script, new layout mix, new background seed every episode |

That is why the deliverable is a *writer + design system*, not a template pack.

---

## 4. A channel plan that survives review

**Pick a niche where you can be the document, not the vibe.** LEAP ships 15
profiles, all chosen because the proof is checkable: unit economics, orbital
mechanics, archived documents, postmortems, proofs, replication studies, field
notes, etymology.

**Publish a series, not a feed.** Same palette, same 4-beat shape, same end
card — different research every time. This is exactly the "series following a
set of characters" shape YouTube allows, and it's what makes a channel
recognisable in 2 seconds of scroll.

**Cadence beats volume.** 3 good videos a week beats 30 templated ones, and 30
templated ones are a demonetisation risk. `leap plan --niche math` gives you 30
specific *claims* (not questions) to work through.

**Keep the receipts.** `sources` goes into the description automatically. It
costs nothing and it is the difference between "AI slop" and "explainer".

**Ship long-form.** The same script, minus captions, with a 12-minute expansion
earns multiples of Shorts RPM. `leap render` gives you the Short; the research
gives you the long-form.

---

## 5. What to measure (not vanity)

- **Average view duration / % viewed** on Shorts — under 60% and the hook or the
  pacing is the problem, not the topic.
- **Retention curve shape.** A cliff at 0:03 is a weak first frame. A cliff at
  0:25 is a shot that overstayed — check `leap lint`'s reading-time notes.
- **Views per video, not total views.** A 10× outlier is a format signal; copy
  its *structure*, not its topic.
- **RPM by topic**, not by channel — some niches simply pay more.

---

## 6. The uncomfortable summary

- A repo cannot make you millions. A **repeatable, defensible format** can make
  you a living, and occasionally more.
- The bottleneck moved from *production* (solved — this repo, and several
  others) to **research and taste**. That is the part you must own, which is why
  `--brief` exists and why the first rule in the writer prompt is "never invent a
  number".
- Anyone optimising for volume in 2026 is optimising for the exact behaviour
  YouTube is currently removing. Build the thing you'd still publish if the
  algorithm never noticed you.
