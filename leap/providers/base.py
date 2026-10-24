"""Provider plumbing shared by every model integration."""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path


class ProviderError(RuntimeError):
    """Raised with a message a human can act on."""


def env(*names: str, default: str | None = None) -> str | None:
    for name in names:
        value = os.environ.get(name)
        if value:
            return value
    return default


def http_json(url: str, payload: dict | None = None, headers: dict | None = None,
              timeout: int = 120, method: str | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(
        url, data=data, method=method or ("POST" if data else "GET"),
        headers={"Content-Type": "application/json", "User-Agent": "leap/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:600]
        raise ProviderError(f"{url} -> HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise ProviderError(f"cannot reach {url}: {exc.reason}") from exc
    try:
        return json.loads(body)
    except json.JSONDecodeError as exc:
        raise ProviderError(f"{url} returned non-JSON: {body[:200]!r}") from exc


def http_bytes(url: str, payload: dict, headers: dict | None = None, timeout: int = 300) -> bytes:
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "User-Agent": "leap/1.0", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:600]
        raise ProviderError(f"{url} -> HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise ProviderError(f"cannot reach {url}: {exc.reason}") from exc


@dataclass
class Speech:
    """One synthesized shot of narration."""

    path: Path
    duration: float
    word_times: list[tuple[str, float, float]] = field(default_factory=list)
    provider: str = ""
    voice: str = ""
    text: str = ""


@dataclass
class LLMResult:
    text: str
    provider: str
    model: str
    usage: dict = field(default_factory=dict)
