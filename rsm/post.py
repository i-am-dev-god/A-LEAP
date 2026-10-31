"""The source material: a Reddit post."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

_MARKDOWN = re.compile(r"[*_~`#>]+")
_URL = re.compile(r"https?://\S+")
_SPACE = re.compile(r"\s+")
_SENTENCE = re.compile(r"(?<=[.!?])\s+")
_ABBREV = ("Mr.", "Mrs.", "Ms.", "Dr.", "St.", "vs.", "e.g.", "i.e.", "etc.")


@dataclass
class Post:
    subreddit: str
    author: str
    title: str
    text: str
    upvotes: int = 0
    comments: int = 0

    @classmethod
    def load(cls, path: str | Path) -> "Post":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        missing = [k for k in ("subreddit", "title", "text") if not data.get(k)]
        if missing:
            raise SystemExit(f"post file {path} is missing: {', '.join(missing)}")
        return cls(
            subreddit=str(data["subreddit"]).lstrip("r/"),
            author=str(data.get("author") or "anonymous"),
            title=clean(data["title"]),
            text=clean(data["text"]),
            upvotes=int(data.get("upvotes") or 0),
            comments=int(data.get("comments") or 0),
        )

    def sentences(self) -> list[str]:
        out: list[str] = []
        for chunk in _SENTENCE.split(self.text):
            chunk = chunk.strip()
            if not chunk:
                continue
            # Re-join anything that was split on an abbreviation.
            if out and out[-1].endswith(_ABBREV):
                out[-1] = f"{out[-1]} {chunk}"
            else:
                out.append(chunk)
        return _resplit_long(out, limit=180)


def clean(raw: str) -> str:
    text = _URL.sub("", raw)
    text = _MARKDOWN.sub("", text)
    text = text.replace("&amp;", "&").replace("&gt;", ">").replace("&lt;", "<")
    return _SPACE.sub(" ", text).strip()


def _resplit_long(sentences: list[str], limit: int) -> list[str]:
    """A 300-character sentence gives the caption engine a bad time."""
    out: list[str] = []
    for sentence in sentences:
        while len(sentence) > limit:
            cut = sentence.rfind(", ", 0, limit)
            if cut < 60:
                cut = sentence.rfind(" ", 0, limit)
            if cut < 40:
                break
            out.append(sentence[:cut].strip())
            sentence = sentence[cut:].lstrip(", ")
        if sentence:
            out.append(sentence.strip())
    return out
