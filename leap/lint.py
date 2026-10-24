"""Pre-flight checks. Cheap, opinionated, and they run before you spend a cent
on narration."""
from __future__ import annotations

import re
from dataclasses import dataclass

from .niches import get_niche
from .script import Script
from .theme import PALETTES
from .util import text_width, words

BANNED_OPENERS = [
    "in this video", "welcome back", "hey guys", "let's dive", "lets dive",
    "today we're going", "today we are going", "have you ever wondered",
    "imagine a world", "since the dawn of",
]
BANNED_ANYWHERE = [
    "smash that", "hit the like", "subscribe", "link in bio", "part 2",
    "follow for", "comment below", "don't forget to",
]
HEDGE_WORDS = ["very", "really", "actually", "literally", "basically", "amazing",
               "incredible", "unbelievable", "insane", "crazy"]
NUMERIC = re.compile(r"\d")


@dataclass
class Issue:
    level: str  # error | warn | note
    where: str
    message: str

    def __str__(self) -> str:
        icon = {"error": "✗", "warn": "!", "note": "·"}[self.level]
        return f"{icon} {self.where:<12} {self.message}"


def lint(script: Script, *, target_seconds: float = 45.0) -> list[Issue]:
    issues: list[Issue] = []
    niche = get_niche(script.niche)

    # ---- shape
    if len(script.shots) < 5:
        issues.append(Issue("error", "structure", f"only {len(script.shots)} shots; a 30-60s short wants 7-12"))
    if len(script.shots) > 15:
        issues.append(Issue("warn", "structure", f"{len(script.shots)} shots is a lot to read in {target_seconds:.0f}s"))
    if script.shots[-1].kind != "endcard":
        issues.append(Issue("warn", "structure", "no end card; you lose the loop"))
    if script.palette not in PALETTES:
        issues.append(Issue("warn", "palette", f"{script.palette!r} is not a known palette"))

    # ---- hook
    first = script.shots[0]
    hook = first.spoken.strip().lower()
    if len(words(hook)) > 22:
        issues.append(Issue("warn", "hook", f"{len(words(hook))} words before the first turn; cut to <= 18"))
    for opener in BANNED_OPENERS:
        if hook.startswith(opener):
            issues.append(Issue("error", "hook", f"opens with {opener!r}; that is where viewers leave"))

    total_words = 0
    for i, shot in enumerate(script.shots):
        where = f"shot {i + 1}"
        spoken = shot.spoken.strip()
        total_words += len(words(spoken))

        if shot.kind == "endcard":
            continue
        if not spoken:
            issues.append(Issue("error", where, f"{shot.kind} has no vo; the shot has nothing to say"))
        if len(words(spoken)) > 26:
            issues.append(Issue("warn", where, f"{len(words(spoken))} spoken words; keep under 22"))
        low = spoken.lower()
        for phrase in BANNED_ANYWHERE:
            if phrase in low:
                issues.append(Issue("error", where, f"engagement-bait phrase {phrase!r}"))
        for hedge in HEDGE_WORDS:
            if re.search(rf"\b{hedge}\b", low):
                issues.append(Issue("note", where, f"hedge word {hedge!r}"))

        # on-screen text should not repeat the narration verbatim
        if shot.headline and spoken:
            a = {w.lower() for w in words(shot.headline)}
            b = {w.lower() for w in words(spoken)}
            if a and len(a & b) / len(a) > 0.85 and len(a) > 2:
                issues.append(Issue("note", where, "headline repeats the vo almost word for word"))

        # emphasis must exist on screen
        for mark in shot.emphasis:
            haystack = " ".join(shot.on_screen_text()).lower()
            if mark.lower() not in haystack:
                issues.append(Issue("warn", where, f"emphasis {mark!r} is not on screen"))

        # numeric claims need a source
        if NUMERIC.search(spoken) and not script.sources:
            issues.append(Issue("warn", where, "numeric claim with no sources listed"))
        for phrase in niche.banned:
            if phrase.lower() in low:
                issues.append(Issue("warn", where, f"banned phrase for this niche: {phrase!r}"))

        # too much text to set legibly
        head = shot.headline or ""
        if head and text_width(head, "Poppins Bold", 88) > 1080 * 2.4:
            issues.append(Issue("warn", where, "headline is long; it will wrap to 4+ lines"))

        # shot shapes
        if shot.kind == "list" and not (2 <= len(shot.items) <= 5):
            issues.append(Issue("error", where, "list needs 2-5 items"))
        if shot.kind == "chart" and any("display" not in b for b in shot.bars):
            issues.append(Issue("note", where, "bars without `display` will show the raw number"))

    seconds = script.estimated_duration()
    if seconds > target_seconds + 12:
        issues.append(Issue("warn", "runtime", f"~{seconds:.0f}s estimated; target is {target_seconds:.0f}s"))
    if total_words > 175:
        issues.append(Issue("warn", "runtime", f"{total_words} spoken words is ~{total_words / 2.75:.0f}s; trim"))

    if not script.title or len(script.title) > 90:
        issues.append(Issue("note", "metadata", "title should be under 90 chars"))
    if not script.sources:
        issues.append(Issue("note", "metadata", "no sources: keep claims mechanism-based, not numeric"))
    return issues


def summarise(issues: list[Issue]) -> str:
    errors = sum(1 for i in issues if i.level == "error")
    warns = sum(1 for i in issues if i.level == "warn")
    head = f"{errors} error(s), {warns} warning(s)" if issues else "clean"
    return "\n".join([head] + [str(i) for i in issues]) if issues else head
