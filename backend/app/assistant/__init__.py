"""AI dispatch assistant: an LLM agent that answers questions using read-only fleet tools."""

from ..config import settings
from .providers import GeminiProvider, Provider


def get_provider() -> Provider | None:
    """The configured LLM provider, or None if no API key is set (the assistant is then off)."""
    if not settings.gemini_api_key:
        return None
    return GeminiProvider(settings.gemini_api_key, settings.gemini_model)
