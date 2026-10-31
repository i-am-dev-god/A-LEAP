"""Pull a post straight off Reddit.

Uses the public JSON endpoint (no API key). If Reddit returns 403/429 the
sandbox or your IP is rate-limited — pass a saved post file instead:

    python main.py --subreddit AmItheAsshole -o out/short.mp4
    python main.py examples/post.json          # offline path
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request

from .post import Post

USER_AGENT = "reddit-short/1.0 (by /u/unknown)"
_POST_URL = re.compile(r"reddit\.com/r/(?P<sub>[\w-]+)/comments/(?P<id>\w+)")


def from_subreddit(subreddit: str, sort: str = "top", window: str = "day", index: int = 0) -> Post:
    sub = subreddit.removeprefix("r/").strip("/")
    url = f"https://www.reddit.com/r/{sub}/{sort}.json?t={window}&limit=60&raw_json=1"
    payload = _get(url)
    children = [c["data"] for c in payload["data"]["children"] if not c["data"].get("stickied")]
    usable = [c for c in children if c.get("selftext") and len(c["selftext"]) > 120]
    if not usable:
        raise SystemExit(f"r/{sub} has no text posts in the {sort}/{window} window")
    return _to_post(usable[index % len(usable)])


def from_url(url: str) -> Post:
    match = _POST_URL.search(url)
    if not match:
        raise SystemExit(f"not a reddit post url: {url}")
    payload = _get(f"https://www.reddit.com/r/{match['sub']}/comments/{match['id']}.json?raw_json=1")
    return _to_post(payload[0]["data"]["children"][0]["data"])


def _get(url: str) -> dict | list:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return json.loads(response.read().decode())
    except urllib.error.HTTPError as err:
        raise SystemExit(
            f"reddit returned {err.code}. Use a saved post file: "
            "python main.py examples/post.json"
        ) from err
    except (urllib.error.URLError, TimeoutError):
        raise SystemExit(
            "no route to reddit from here. Use a saved post file: python main.py examples/post.json"
        )


def _to_post(data: dict) -> Post:
    return Post(
        subreddit=str(data.get("subreddit") or "unknown"),
        author=str(data.get("author") or "anonymous"),
        title=str(data.get("title") or ""),
        text=str(data.get("selftext") or ""),
        upvotes=int(data.get("ups") or data.get("score") or 0),
        comments=int(data.get("num_comments") or 0),
    )
