"""LLM providers behind one small interface, so the model vendor can be swapped.

A provider takes the conversation so far (in its own native message format, which it builds and
reads itself) and returns either text or tool calls. Keeping messages native matters: Gemini 3
attaches hidden "thought signatures" to its parts, and they must be sent back unchanged.
"""

from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]


@dataclass
class Turn:
    text: str | None = None
    tool_calls: list[ToolCall] = field(default_factory=list)


class Provider(Protocol):
    name: str

    def start(self, system: str, history: list[tuple[str, str]]) -> list[dict]:
        """Build the native message list from (role, text) pairs; role is "user" or "assistant"."""

    def complete(self, messages: list[dict], tools: list[dict]) -> tuple[Turn, dict]:
        """Ask the model. Returns its turn plus the raw message to append to the history."""

    def tool_results(self, results: list[tuple[str, dict]]) -> dict:
        """Wrap (tool name, result) pairs as the message that answers the model's calls."""


class ProviderError(Exception):
    pass


class GeminiProvider:
    """Google Gemini via the REST generateContent endpoint (free tier available)."""

    name = "gemini"
    URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(self, api_key: str, model: str, client: httpx.Client | None = None):
        self.api_key = api_key
        self.model = model
        self.client = client or httpx.Client(timeout=30)
        self._system = ""

    def start(self, system: str, history: list[tuple[str, str]]) -> list[dict]:
        self._system = system
        return [{"role": "model" if role == "assistant" else "user", "parts": [{"text": text}]} for role, text in history]

    def complete(self, messages: list[dict], tools: list[dict]) -> tuple[Turn, dict]:
        body = {
            "systemInstruction": {"parts": [{"text": self._system}]},
            "contents": messages,
            "tools": [{"functionDeclarations": tools}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 800},
        }
        try:
            response = self.client.post(
                self.URL.format(model=self.model), headers={"x-goog-api-key": self.api_key}, json=body
            )
        except httpx.HTTPError as error:
            raise ProviderError("Couldn't reach the AI service. Try again in a moment.") from error
        if response.status_code == 429:
            raise ProviderError("The AI service's free quota is used up for now. Try again later.")
        if response.is_error:
            raise ProviderError(f"The AI service returned an error ({response.status_code}).")

        candidates = response.json().get("candidates") or []
        if not candidates or "content" not in candidates[0]:
            raise ProviderError("The AI service returned no answer (it may have been blocked by a safety filter).")
        content = candidates[0]["content"]  # kept verbatim, including any thought signatures
        parts = content.get("parts", [])
        turn = Turn(
            text="".join(part["text"] for part in parts if "text" in part and not part.get("thought")) or None,
            tool_calls=[ToolCall(p["functionCall"]["name"], p["functionCall"].get("args") or {}) for p in parts if "functionCall" in p],
        )
        return turn, content

    def tool_results(self, results: list[tuple[str, dict]]) -> dict:
        return {
            "role": "user",
            "parts": [{"functionResponse": {"name": name, "response": result}} for name, result in results],
        }
