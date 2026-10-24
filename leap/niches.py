"""Niche profiles: what a channel *is*, not just what it talks about.

A profile shapes the writing (tone, hook grammar, what counts as proof), the
look (palette, type weight) and the pacing. Fifteen lines of Python is enough to
make a new channel feel like a different publication.

Deliberate omission: no "AI expert persona" niches. YouTube's 2026 inauthentic
content policy demonetises synthetic hosts giving medical, legal or financial
advice. LEAP writes *documented explanations with sources*, which is the
monetisable side of that line.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Niche:
    key: str
    name: str
    palette: str
    audience: str
    tone: str
    hook_patterns: list[str]
    proof: str
    visual: str
    banned: list[str] = field(default_factory=list)
    angles: list[str] = field(default_factory=list)
    caption_words: int = 3


NICHES: dict[str, Niche] = {
    "science": Niche(
        key="science",
        name="Science, made physical",
        palette="midnight",
        audience="curious adults, 20-40, who scroll fast and hate being talked down to",
        tone="precise, calm, slightly awed. Short sentences. Concrete nouns.",
        hook_patterns=[
            "a familiar object behaving impossibly",
            "a number that contradicts intuition",
            "a thing you do daily that is secretly physics",
        ],
        proof="named studies, instrument readings, units, dates",
        visual="deep blue fields, serif quotes, mono data labels",
        banned=["mind-blowing", "scientists are baffled", "you won't believe"],
        angles=["scale", "time", "energy", "measurement error", "the apparatus",
                "what the model gets wrong"],
    ),
    "space": Niche(
        key="space",
        name="Orbital mechanics and missions",
        palette="midnight",
        audience="space nerds and engineering students",
        tone="mission-log dry, then one line of genuine wonder. Never whimsical.",
        hook_patterns=[
            "a mission constraint that sounds like a mistake",
            "a distance or delta-v nobody visualises",
            "a piece of hardware that failed for a stupid reason",
        ],
        proof="NASA/ESA numbers, delta-v, dates, mission names, failure reports",
        visual="dark navy, thin rules, mono telemetry type",
        banned=["infinity and beyond", "the universe is huge"],
        angles=["delta-v", "thermal", "comms delay", "failure modes", "budget cuts"],
    ),
    "history": Niche(
        key="history",
        name="Documents and decisions",
        palette="paper",
        audience="people who like receipts, not vibes",
        tone="forensic. Dates and documents first. No grand narration voice.",
        hook_patterns=[
            "one line in a document that changed an outcome",
            "a decision made for a boring reason",
            "a myth that survives because it is a better story",
        ],
        proof="primary documents, dates, named people, archives",
        visual="warm paper, serif, red annotations",
        banned=["in this video we will explore", "since the dawn of time"],
        angles=["money", "logistics", "miscommunication", "bureaucracy", "weather"],
    ),
    "tech": Niche(
        key="tech",
        name="Systems and failure",
        palette="graphite",
        audience="engineers, founders, technically literate scrollers",
        tone="blunt, specific, allergic to hype. Show the mechanism.",
        hook_patterns=[
            "a system that fails in one specific way",
            "a tradeoff nobody puts on the slide",
            "a bug that cost money per second",
        ],
        proof="postmortems, changelogs, latency numbers, version numbers",
        visual="graphite, red accents, mono terminal cards",
        banned=["game-changer", "revolutionary", "AI will replace"],
        angles=["latency", "cost per request", "on-call", "schema migration", "cache"],
    ),
    "math": Niche(
        key="math",
        name="Proofs you can see",
        palette="neon",
        audience="students and puzzle-brained adults",
        tone="playful but exact. One idea per shot. The visual *is* the argument.",
        hook_patterns=[
            "a claim that feels false until you draw it",
            "a coin-flip intuition that is wrong",
            "a shortcut that works for a reason",
        ],
        proof="worked examples, small numbers, exact arithmetic",
        visual="near-black, acid green, impact type, big numerals",
        banned=["math is hard", "only geniuses"],
        angles=["counting", "symmetry", "probability", "growth", "proof by picture"],
    ),
    "psychology": Niche(
        key="psychology",
        name="Studies, effects, and what replicated",
        palette="clay",
        audience="people self-diagnosing from the internet",
        tone="careful. Distinguish effect from story. Name the sample size.",
        hook_patterns=[
            "an effect everyone cites that failed to replicate",
            "a study design flaw that explains the headline",
            "a behaviour with a boring explanation",
        ],
        proof="study names, sample sizes, replication status, year",
        visual="warm clay tones, generous line height, serif quotes",
        banned=["your brain is wired to", "psychopaths do this", "dark psychology"],
        angles=["replication", "sampling", "demand characteristics", "effect size"],
    ),
    "business": Niche(
        key="business",
        name="Unit economics, not hustle",
        palette="ember",
        audience="operators and people tired of hustle content",
        tone="accountant with a sense of humour. Numbers, then consequence.",
        hook_patterns=[
            "a business that loses money on every sale it celebrates",
            "a price change that quietly killed a company",
            "a metric that hides the real cost",
        ],
        proof="filings, unit economics, price history, named companies",
        visual="ember orange on near-black, receipt cards, bar charts",
        banned=["passive income", "get rich", "nobody talks about this"],
        angles=["CAC", "margin", "churn", "supply chain", "distribution"],
    ),
    "nature": Niche(
        key="nature",
        name="Field notes",
        palette="sea",
        audience="nature-curious scrollers who are bored of slow documentaries",
        tone="observational, sensory, specific species and places.",
        hook_patterns=[
            "an organism doing something that looks like a decision",
            "a survival strategy with a brutal cost",
            "a place where the rules change",
        ],
        proof="species names, locations, measurements, study years",
        visual="deep sea green, soft type, mono field labels",
        banned=["mother nature", "as humans we can learn from"],
        angles=["energy budget", "camouflage", "cooperation", "timing", "extremes"],
    ),
    "language": Niche(
        key="language",
        name="Words, traced",
        palette="gold",
        audience="language learners and etymology nerds",
        tone="delighted, precise, one surprise per shot.",
        hook_patterns=[
            "a word that means the opposite of what you think",
            "a grammar rule that exists for a reason",
            "a mistranslation that changed history",
        ],
        proof="etymologies, dates, source languages, quoted usage",
        visual="gold on black, serif display, mono glosses",
        banned=["English is weird", "grammar nazis"],
        angles=["etymology", "loanwords", "translation", "dialect", "script"],
    ),
    "engineering": Niche(
        key="engineering",
        name="Things that fell down",
        palette="graphite",
        audience="engineers and people who like failure analysis",
        tone="flat, technical, respectful of the dead. One cause per shot.",
        hook_patterns=[
            "a structure that failed for a reason nobody modelled",
            "a design margin that was known to be too thin",
            "a maintenance step that was skipped for years",
        ],
        proof="incident reports, load figures, dates, named components",
        visual="graphite, red annotations, mono labels",
        banned=["engineering disaster", "how could this happen"],
        angles=["fatigue", "resonance", "thermal expansion", "inspection intervals",
                "the last inspection"],
    ),
    "geography": Niche(
        key="geography",
        name="Maps and the lies on them",
        palette="sea",
        audience="map-curious scrollers",
        tone="wry, exact, always naming the projection when it matters.",
        hook_patterns=[
            "a border that exists for a boring reason",
            "a distance that is not what the map shows",
            "a place whose shape decides its economy",
        ],
        proof="coordinates, distances, projection names, treaty dates",
        visual="sea green, thin rules, mono coordinate labels",
        banned=["mind the gap", "geography is weird"],
        angles=["projection distortion", "chokepoints", "time zones", "rivers",
                "straight-line borders"],
    ),
    "music": Niche(
        key="music",
        name="Why the song works",
        palette="gold",
        audience="musicians and listeners who want the mechanics",
        tone="enthusiastic but technical. Name the interval, not the vibe.",
        hook_patterns=[
            "a chord everyone loves and nobody names",
            "a production trick that solves a specific problem",
            "a rhythm that is one beat away from falling",
        ],
        proof="intervals, tempos, bar counts, named recordings",
        visual="gold on black, serif display, mono chord labels",
        banned=["this song will blow your mind", "musical genius"],
        angles=["intervals", "voice leading", "meter", "arrangement", "mixing"],
    ),
    "design": Niche(
        key="design",
        name="Decisions you didn't notice",
        palette="paper",
        audience="designers and people who use things",
        tone="specific, generous, never sneering at the object.",
        hook_patterns=[
            "a shape that exists because of a manufacturing constraint",
            "a colour chosen for a boring reason",
            "an interface pattern that survives because of habit",
        ],
        proof="patents, dimensions, dates, named objects",
        visual="paper, serif, red annotation marks",
        banned=["design is invisible", "form follows function"],
        angles=["constraints", "affordances", "manufacture", "signage", "defaults"],
    ),
    "food": Niche(
        key="food",
        name="Kitchen chemistry",
        palette="clay",
        audience="home cooks who want the why",
        tone="warm, empirical, always a temperature or a time.",
        hook_patterns=[
            "a step that only makes sense at a specific temperature",
            "an ingredient doing something structural",
            "a rule everyone follows for the wrong reason",
        ],
        proof="temperatures, times, ratios, named reactions",
        visual="clay tones, warm paper cards, mono quantities",
        banned=["food hack", "restaurant secret", "you've been doing it wrong"],
        angles=["Maillard", "gluten", "emulsions", "salt timing", "water content"],
    ),
    "sports": Niche(
        key="sports",
        name="Numbers on the field",
        palette="neon",
        audience="fans who like the data more than the hot take",
        tone="analyst's notebook. No takes, just the sample.",
        hook_patterns=[
            "a statistic that inverts the narrative",
            "a tactical choice that costs points in a measurable way",
            "a record that is an artefact of scheduling",
        ],
        proof="sample sizes, rates, seasons, named players and matches",
        visual="near-black, acid green, data cards",
        banned=["GOAT", "washed", "narrative"],
        angles=["sample size", "pace", "expected value", "scheduling", "variance"],
    ),
}


def get_niche(key: str | None) -> Niche:
    if key and key.lower() in NICHES:
        return NICHES[key.lower()]
    return NICHES["business"]


def list_niches() -> str:
    lines = []
    for n in NICHES.values():
        lines.append(f"{n.key:<11} {n.name:<32} palette:{n.palette}")
    return "\n".join(lines)


def niche_context(niche: Niche) -> str:
    return (
        f"NICHE: {niche.name}\n"
        f"AUDIENCE: {niche.audience}\n"
        f"TONE: {niche.tone}\n"
        f"PROOF THIS NICHE ACCEPTS: {niche.proof}\n"
        f"VISUAL LANGUAGE: {niche.visual}\n"
        "HOOK GRAMMAR (pick one shape, never the literal wording): "
        + "; ".join(niche.hook_patterns) + "\n"
        "ANGLES THAT WORK: " + ", ".join(niche.angles) + "\n"
        "BANNED PHRASES: " + ", ".join(niche.banned) + "\n"
    )
