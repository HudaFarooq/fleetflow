from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from ..assistant import get_provider
from ..assistant.agent import run_agent
from ..assistant.providers import Provider, ProviderError
from ..config import settings
from ..deps import AdminUser, DbSession
from ..rate_limit import AttemptLimiter

router = APIRouter(prefix="/assistant", tags=["assistant"])

per_user = AttemptLimiter(settings.assistant_per_user_per_hour, 60 * 60)


class DailyCounter:
    """A global cap on requests per day, so a leaked account can't run up the bill."""

    def __init__(self) -> None:
        self.day = date.today()
        self.count = 0

    def remaining(self) -> int:
        if self.day != date.today():
            self.day, self.count = date.today(), 0
        return max(0, settings.assistant_daily_cap - self.count)

    def use(self) -> None:
        self.remaining()
        self.count += 1

    def reset(self) -> None:
        self.day, self.count = date.today(), 0


daily = DailyCounter()


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    # Only the recent conversation is sent, which keeps each request small and cheap
    messages: list[ChatMessage] = Field(min_length=1, max_length=12)


class ChatReply(BaseModel):
    reply: str
    tools_used: list[str]
    remaining_today: int


class AssistantStatus(BaseModel):
    configured: bool
    model: str | None


ProviderDep = Annotated[Provider | None, Depends(get_provider)]


@router.get("/status", response_model=AssistantStatus)
def assistant_status(_: AdminUser, provider: ProviderDep):
    return AssistantStatus(configured=provider is not None, model=settings.gemini_model if provider else None)


@router.post("/chat", response_model=ChatReply)
def chat(data: ChatRequest, db: DbSession, user: AdminUser, provider: ProviderDep):
    if provider is None:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The AI assistant isn't set up yet. Add GEMINI_API_KEY to backend/.env (free at aistudio.google.com).",
        )
    last = data.messages[-1]
    if last.role != "user" or len(last.content) > 500:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Ask a question of up to 500 characters.")

    key = f"user:{user.id}"
    if wait := per_user.retry_after(key):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, f"You've hit the hourly limit. Try again in {max(1, wait // 60)} minutes.")
    if daily.remaining() == 0:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "The assistant's daily limit is used up. It resets at midnight.")
    per_user.record(key)
    daily.use()

    try:
        reply = run_agent(provider, db, [(m.role, m.content) for m in data.messages])
    except ProviderError as error:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(error)) from error
    return ChatReply(reply=reply.text, tools_used=reply.tools_used, remaining_today=daily.remaining())
