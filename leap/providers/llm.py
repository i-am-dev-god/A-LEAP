"""Text providers. The writer is provider-agnostic on purpose: you should be
able to swap Claude for Gemini for a local model without touching a script."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .base import LLMResult, ProviderError, env, http_json


class LLM(Protocol):
    name: str

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult: ...


# --------------------------------------------------------------------------


@dataclass
class AnthropicLLM:
    name: str = "anthropic"

    @staticmethod
    def available() -> bool:
        return bool(env("ANTHROPIC_API_KEY"))

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult:
        key = env("ANTHROPIC_API_KEY")
        if not key:
            raise ProviderError("set ANTHROPIC_API_KEY to use Claude")
        model = env("LEAP_MODEL", default="claude-sonnet-4-5-20250929")
        data = http_json(
            "https://api.anthropic.com/v1/messages",
            {
                "model": model,
                "max_tokens": max_tokens,
                "temperature": temperature,
                "system": system,
                "messages": [{"role": "user", "content": user}],
            },
            headers={"x-api-key": key, "anthropic-version": "2023-06-01"},
        )
        text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
        return LLMResult(text=text, provider=self.name, model=model, usage=data.get("usage", {}))


@dataclass
class OpenAILLM:
    name: str = "openai"

    @staticmethod
    def available() -> bool:
        return bool(env("OPENAI_API_KEY"))

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult:
        key = env("OPENAI_API_KEY")
        if not key:
            raise ProviderError("set OPENAI_API_KEY to use OpenAI")
        base = env("OPENAI_BASE_URL", default="https://api.openai.com/v1")
        model = env("LEAP_MODEL", default="gpt-4o-mini")
        data = http_json(
            f"{base.rstrip('/')}/chat/completions",
            {
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
            },
            headers={"Authorization": f"Bearer {key}"},
        )
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"unexpected OpenAI response: {str(data)[:300]}") from exc
        return LLMResult(text=text or "", provider=self.name, model=model, usage=data.get("usage", {}))


@dataclass
class OpenRouterLLM:
    name: str = "openrouter"

    @staticmethod
    def available() -> bool:
        return bool(env("OPENROUTER_API_KEY"))

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult:
        key = env("OPENROUTER_API_KEY")
        if not key:
            raise ProviderError("set OPENROUTER_API_KEY to use OpenRouter")
        model = env("LEAP_MODEL", default="anthropic/claude-sonnet-4.5")
        data = http_json(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                "model": model,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": system},
                             {"role": "user", "content": user}],
            },
            headers={"Authorization": f"Bearer {key}"},
        )
        try:
            text = data["choices"][0]["message"]["content"]
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"unexpected OpenRouter response: {str(data)[:300]}") from exc
        return LLMResult(text=text or "", provider=self.name, model=model, usage=data.get("usage", {}))


@dataclass
class GeminiLLM:
    name: str = "gemini"

    @staticmethod
    def available() -> bool:
        return bool(env("GEMINI_API_KEY", "GOOGLE_API_KEY"))

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult:
        key = env("GEMINI_API_KEY", "GOOGLE_API_KEY")
        if not key:
            raise ProviderError("set GEMINI_API_KEY to use Gemini")
        model = env("LEAP_MODEL", default="gemini-2.5-flash")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}"
        data = http_json(url, {
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": [{"role": "user", "parts": [{"text": user}]}],
            "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens,
                                 "responseMimeType": "application/json"},
        })
        try:
            parts = data["candidates"][0]["content"]["parts"]
            text = "".join(p.get("text", "") for p in parts)
        except (KeyError, IndexError) as exc:
            raise ProviderError(f"unexpected Gemini response: {str(data)[:300]}") from exc
        return LLMResult(text=text, provider=self.name, model=model,
                         usage=data.get("usageMetadata", {}))


@dataclass
class OllamaLLM:
    name: str = "ollama"

    @staticmethod
    def available() -> bool:
        return bool(env("OLLAMA_HOST", default=None)) or env("LEAP_LLM", "") == "ollama"

    def complete(self, system: str, user: str, *, temperature: float = 0.8,
                 max_tokens: int = 4000) -> LLMResult:
        host = env("OLLAMA_HOST", default="http://127.0.0.1:11434")
        model = env("LEAP_MODEL", default="llama3.1")
        data = http_json(f"{host.rstrip('/')}/api/chat", {
            "model": model, "stream": False,
            "options": {"temperature": temperature, "num_predict": max_tokens},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": user}],
        }, timeout=300)
        return LLMResult(text=data.get("message", {}).get("content", ""), provider=self.name, model=model)


PROVIDERS: dict[str, type] = {
    "anthropic": AnthropicLLM,
    "openai": OpenAILLM,
    "openrouter": OpenRouterLLM,
    "gemini": GeminiLLM,
    "ollama": OllamaLLM,
}

AUTO_ORDER = ["anthropic", "openai", "gemini", "openrouter", "ollama"]


def get_llm(name: str | None = None) -> LLM:
    """Resolve a provider: explicit (`leap write --llm gemini`), $LEAP_LLM, or
    the first one that has credentials."""
    choice = (name or env("LEAP_LLM", default="auto") or "auto").lower()
    if choice != "auto":
        if choice not in PROVIDERS:
            raise ProviderError(f"unknown LLM provider {choice!r}; try {sorted(PROVIDERS)}")
        return PROVIDERS[choice]()
    for key in AUTO_ORDER:
        cls = PROVIDERS[key]
        if cls.available():
            return cls()
    raise ProviderError(
        "no LLM credentials found. Export one of ANTHROPIC_API_KEY, OPENAI_API_KEY, "
        "GEMINI_API_KEY, OPENROUTER_API_KEY (or run Ollama and LEAP_LLM=ollama). "
        "You can also skip the writer entirely and pass your own script.json to `leap render`."
    )


def available() -> list[str]:
    return [name for name, cls in PROVIDERS.items() if cls.available()]
