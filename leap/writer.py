"""The writer: turn a topic into a shot list, a voice track script and metadata.

The prompt is the product here. It encodes a beat grammar that survives
YouTube's "inauthentic content" review (format may repeat, substance may not),
word budgets that map to real seconds, and a hard ban on invented numbers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from .niches import Niche, get_niche, niche_context
from .providers.base import LLMResult
from .providers.llm import get_llm
from .script import Script
from .theme import Brand
from .util import slugify


class WriterError(RuntimeError):
    pass


SYSTEM = """You write 30-60 second vertical videos that people actually finish.

You are not a hype machine. You are a documentary editor who has 45 seconds.

HARD RULES
1. The first sentence must open a loop the viewer cannot close without staying.
   No greeting, no "in this video", no throat-clearing.
2. Never invent a number, study, date or quote. If you are not certain, write the
   shot without a specific figure. Inaccuracy is the only unforgivable error.
3. Spoken text (vo) and on-screen text (headline/sub) are different registers.
   vo is a sentence a human says. headline is a fragment a designer sets.
   Never repeat the same words in both.
4. No CTAs for likes/subscribes. No emoji. No "part 2". No "follow for more".
5. Never pose as a doctor, lawyer or financial advisor, and never give medical,
   legal or investment advice. Explain documented facts; let the viewer conclude.
6. Every shot must earn its second: new information or a turn, never a restatement.
7. Write for the ear. Short sentences. Concrete nouns. Strong verbs. Cut adverbs.
8. The last spoken line must land the idea, and the end card is a single line
   that points at the next episode without begging.

OUTPUT: JSON only, no prose, no markdown fences."""


SHOT_DOC = """Available shot kinds (use a variety, never the same kind twice in a row):

statement  kicker, headline, sub            - editorial opener or turn
stat       kicker, number, unit, headline, secondary
                                            - one huge figure, then context
                                              (`secondary` renders as "vs 6%")
flash      headline (1-3 words), sub        - punch beat, used once or twice
quote      quote, attribution               - serif pull quote
receipt    kicker, headline, rows[{label,value,note}], sub - paper card, receipts/costs
list       kicker, headline, items[]        - 2-5 short items, revealed in order
compare    kicker, headline, left{label,value,body}, right{label,value,body}
timeline   kicker, headline, markers[{when,label}]
chart      kicker, headline, bars[{label,value,display}]
terminal   lines[] (mono), sub              - code/log/CLI beat
endcard    headline (brand or one line), sub, kicker ("NEXT: ...")

Every shot also takes:
  vo         the spoken sentence(s) for this shot            (required)
  beat       HOOK | STAKES | TURN | PROOF | REFRAME | LOOP   (required)
  emphasis   0-2 words that must appear verbatim in headline and deserve accent colour
  pace       0.8 (slow) .. 1.4 (fast), optional

Vary the shot kinds. A stat, then a receipt, then a chart, then a flash beats
four charts in a row - repetition of *shape* is what reviewers read as a template.

EXAMPLE SHOT
{"kind":"receipt","beat":"PROOF","vo":"The fee is one percent. On a thirty year
horizon that is a quarter of the growth, gone quietly.","kicker":"THE FEE",
"headline":"1% does not cost 1%","rows":[{"label":"Fee taken","value":"1.00%"},
{"label":"Growth lost","value":"~23%","note":"30 years, 7% nominal"}],
"sub":"small number, compounding horizon","emphasis":["1%"]}"""


def build_prompt(topic: str, niche: Niche, *, duration: float = 42.0,
                 brief: str | None = None, brand: Brand | None = None,
                 notes: str | None = None) -> str:
    words = int(duration * 2.75)
    shots = max(7, min(14, round(duration / 4.2)))
    per_shot = max(12, round(words / shots))
    brand = brand or Brand()
    parts = [
        niche_context(niche),
        f"TOPIC: {topic}",
        f"TARGET LENGTH: about {duration:.0f} seconds, which is roughly {words} spoken words "
        f"across {shots} shots (about {per_shot} words of vo per shot). Never exceed it.",
    ]
    if brief:
        parts.append("RESEARCH BRIEF (the only facts you are allowed to state as facts; "
                     "quote figures exactly as given, and cite the source in `sources`):\n"
                     + brief.strip()[:6000])
    else:
        parts.append("NO BRIEF PROVIDED. Therefore: no statistics, no study names, no dates "
                     "you cannot vouch for. Build the video out of mechanism, definition, "
                     "and consequence instead of numbers. Leave `sources` empty.")
    if notes:
        parts.append("EXTRA INSTRUCTIONS FROM THE CREATOR:\n" + notes.strip()[:2000])
    parts.append(SHOT_DOC)
    parts.append(
        'RESPOND WITH THIS JSON SHAPE:\n'
        '{"slug":"kebab-case","title":"<60 chars, no clickbait caps>",\n'
        ' "description":"2 sentences, plain, includes the sources as plain text",\n'
        ' "tags":["8-15 lowercase tags"],\n'
        ' "hook":"the first spoken sentence",\n'
        ' "sources":["url or citation", "..."],\n'
        f' "palette":"{niche.palette}",\n'
        ' "brand":{"name":"' + (brand.name or "LEAP") + '","handle":"' +
        (brand.handle or "") + '","tagline":"' + (brand.tagline or "") + '"},\n'
        ' "shots":[ ... ]}\n'
        "End with an endcard shot. Exactly one endcard, always last."
    )
    return "\n\n".join(parts)


# --------------------------------------------------------------------------
# parsing
# --------------------------------------------------------------------------


def extract_json(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n", "", cleaned)
        cleaned = re.sub(r"\n```\s*$", "", cleaned)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        candidate = cleaned[start:end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            # common failure: trailing commas
            fixed = re.sub(r",\s*([}\]])", r"\1", candidate)
            try:
                return json.loads(fixed)
            except json.JSONDecodeError as exc:
                raise WriterError(f"model did not return valid JSON ({exc}).") from exc
    raise WriterError("model did not return JSON")


def coerce(raw: dict, niche: Niche, topic: str, brand: Brand | None = None) -> Script:
    brand = brand or Brand()
    raw = dict(raw)
    raw.setdefault("slug", slugify(raw.get("title") or topic))
    raw.setdefault("title", topic[:70])
    raw.setdefault("palette", niche.palette)
    if not raw.get("brand"):
        raw["brand"] = {"name": brand.name, "handle": brand.handle, "tagline": brand.tagline}

    shots = []
    for i, s in enumerate(raw.get("shots", [])):
        if not isinstance(s, dict):
            continue
        s = dict(s)
        s.setdefault("beat", "HOOK" if i == 0 else "BODY")
        if "vo" not in s and "headline" in s:
            s["vo"] = s["headline"]
        shots.append(s)
    if shots and shots[-1].get("kind") != "endcard":
        shots.append({
            "kind": "endcard", "beat": "LOOP",
            "headline": brand.name or "LEAP",
            "sub": raw.get("title", topic)[:70],
            "kicker": "NEXT: " + _next_topic(topic, niche),
            "vo": "",
            "min_duration": 3.0,
        })
    raw["shots"] = shots
    try:
        return Script.from_dict(raw)
    except ValueError as exc:
        raise WriterError(f"script failed validation: {exc}") from exc


def _next_topic(topic: str, niche: Niche) -> str:
    angles = niche.angles or ["the mechanism"]
    return f"the {angles[0]} of {topic.split(':')[0][:34]}"


# --------------------------------------------------------------------------
# public API
# --------------------------------------------------------------------------


@dataclass
class WriteResult:
    script: Script
    raw: str
    result: LLMResult | None = None


def write(topic: str, *, niche: str | None = None, duration: float = 42.0,
          brief: str | None = None, notes: str | None = None,
          llm_name: str | None = None, brand: Brand | None = None,
          temperature: float = 0.85) -> WriteResult:
    profile = get_niche(niche)
    llm = get_llm(llm_name)
    prompt = build_prompt(topic, profile, duration=duration, brief=brief,
                          brand=brand, notes=notes)
    result = llm.complete(SYSTEM, prompt, temperature=temperature, max_tokens=6000)
    if not result.text.strip():
        raise WriterError(f"{llm.name} returned an empty response")
    try:
        raw = extract_json(result.text)
    except WriterError as exc:
        raise WriterError(f"{exc}\n\nRaw response starts:\n{result.text[:600]}") from exc
    script = coerce(raw, profile, topic, brand)
    if not script.niche:
        script.niche = profile.key
    script.meta = {"llm": result.provider, "model": result.model,
                   "usage": result.usage, "topic": topic}
    return WriteResult(script=script, raw=result.text, result=result)


def revise(script: Script, instruction: str, *, llm_name: str | None = None) -> WriteResult:
    """Ask for a surgical edit, keep the schema."""
    llm = get_llm(llm_name)
    payload = json.dumps(script.to_dict(), ensure_ascii=False, indent=1)
    prompt = (
        "Here is a valid LEAP video script as JSON.\n\n" + payload +
        "\n\nREVISION INSTRUCTION: " + instruction +
        "\n\nReturn the full corrected JSON in the same shape. Keep every good shot; "
        "change only what the instruction requires."
    )
    result = llm.complete(SYSTEM, prompt, temperature=0.5, max_tokens=6000)
    raw = extract_json(result.text)
    profile = get_niche(script.niche)
    revised = coerce(raw, profile, script.title, script.brand)
    revised.niche = script.niche or profile.key
    return WriteResult(script=revised, raw=result.text, result=result)


def from_file(path: str | Path) -> Script:
    return Script.load(path)
