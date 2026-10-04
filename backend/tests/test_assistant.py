import json

import httpx
import pytest

from app.assistant import get_provider
from app.assistant.providers import GeminiProvider, ProviderError, ToolCall, Turn
from app.main import app
from app.models import Role
from app.routers import assistant as assistant_router

ASK = {"messages": [{"role": "user", "content": "Which vans are free?"}]}


class ScriptedProvider:
    """Plays back a fixed sequence of model turns and records what it was sent."""

    name = "scripted"

    def __init__(self, turns: list[Turn]):
        self.turns = list(turns)
        self.tool_results_seen: list[list[tuple[str, dict]]] = []

    def start(self, system, history):
        return [{"role": role, "text": text} for role, text in history]

    def complete(self, messages, tools):
        assert {tool["name"] for tool in tools} >= {"fleet_status", "find_parcel"}
        return self.turns.pop(0), {"role": "assistant"}

    def tool_results(self, results):
        self.tool_results_seen.append(results)
        return {"role": "tool", "results": results}


@pytest.fixture
def use_provider():
    assistant_router.per_user.reset()
    assistant_router.daily.reset()

    def install(provider):
        app.dependency_overrides[get_provider] = lambda: provider
        return provider

    yield install
    app.dependency_overrides.pop(get_provider, None)


def test_assistant_is_off_without_a_key(client, make_user, use_provider):
    _, admin = make_user(Role.admin)
    use_provider(None)
    assert client.get("/assistant/status", headers=admin).json() == {"configured": False, "model": None}
    response = client.post("/assistant/chat", json=ASK, headers=admin)
    assert response.status_code == 503
    assert "GEMINI_API_KEY" in response.json()["detail"]


def test_agent_calls_tools_and_answers(client, make_user, use_provider):
    _, admin = make_user(Role.admin)
    client.post("/vehicles", json={"plate_number": "FF-7", "type": "ev_van", "capacity_kg": 500, "battery_level": 64}, headers=admin)
    provider = use_provider(ScriptedProvider([
        Turn(tool_calls=[ToolCall("fleet_status", {}), ToolCall("find_parcel", {"tracking_id": "ffnope"})]),
        Turn(text="FF-7 is available with 64% battery."),
    ]))

    response = client.post("/assistant/chat", json=ASK, headers=admin)
    assert response.status_code == 200
    body = response.json()
    assert body["reply"] == "FF-7 is available with 64% battery."
    assert body["tools_used"] == ["fleet_status", "find_parcel"]

    (fleet, parcel), = provider.tool_results_seen
    assert fleet[1]["vehicles"][0] | {"location": None} == {
        "plate": "FF-7", "type": "ev_van", "status": "available", "driver": None, "battery_pct": 64.0,
        "load_kg": 0, "capacity_kg": 500.0, "location": None,
    }
    assert parcel == ("find_parcel", {"error": "No parcel with tracking ID ffnope"})


def test_bad_tool_arguments_become_errors_for_the_model(client, make_user, use_provider):
    _, admin = make_user(Role.admin)
    provider = use_provider(ScriptedProvider([
        Turn(tool_calls=[ToolCall("find_parcel", {"wrong": 1}), ToolCall("delete_everything", {})]),
        Turn(text="Sorry, I couldn't look that up."),
    ]))
    assert client.post("/assistant/chat", json=ASK, headers=admin).status_code == 200
    (bad_args, unknown), = provider.tool_results_seen
    assert "Invalid arguments" in bad_args[1]["error"]
    assert unknown[1] == {"error": "Unknown tool delete_everything"}


def test_agent_stops_after_too_many_tool_rounds(client, make_user, use_provider):
    _, admin = make_user(Role.admin)
    use_provider(ScriptedProvider([Turn(tool_calls=[ToolCall("current_time", {})])] * 10))
    reply = client.post("/assistant/chat", json=ASK, headers=admin).json()["reply"]
    assert "too many lookups" in reply


def test_limits_and_permissions(client, make_user, use_provider, monkeypatch):
    _, admin = make_user(Role.admin)
    _, driver = make_user(Role.driver)
    use_provider(ScriptedProvider([Turn(text="ok")] * 30))

    assert client.post("/assistant/chat", json=ASK, headers=driver).status_code == 403
    too_long = {"messages": [{"role": "user", "content": "x" * 501}]}
    assert client.post("/assistant/chat", json=too_long, headers=admin).status_code == 422

    monkeypatch.setattr(assistant_router.daily, "count", assistant_router.settings.assistant_daily_cap - 1)
    assert client.post("/assistant/chat", json=ASK, headers=admin).json()["remaining_today"] == 0
    assert client.post("/assistant/chat", json=ASK, headers=admin).status_code == 429

    assistant_router.daily.reset()
    for _ in range(assistant_router.settings.assistant_per_user_per_hour - 1):
        assert client.post("/assistant/chat", json=ASK, headers=admin).status_code == 200
    assert client.post("/assistant/chat", json=ASK, headers=admin).status_code == 429


def test_provider_errors_are_reported_cleanly(client, make_user, use_provider):
    _, admin = make_user(Role.admin)

    class Failing(ScriptedProvider):
        def complete(self, messages, tools):
            raise ProviderError("The AI service's free quota is used up for now. Try again later.")

    use_provider(Failing([]))
    response = client.post("/assistant/chat", json=ASK, headers=admin)
    assert response.status_code == 502
    assert "quota" in response.json()["detail"]


# --- Gemini wire format, against a fake HTTP server ---

def test_gemini_request_and_response_format():
    sent = []
    replies = iter([
        {"candidates": [{"content": {"role": "model", "parts": [
            {"functionCall": {"name": "fleet_status", "args": {}}, "thoughtSignature": "sig-123"},
        ]}}]},
        {"candidates": [{"content": {"role": "model", "parts": [{"text": "All good."}]}}]},
    ])

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append((request.url, request.headers.get("x-goog-api-key"), json.loads(request.content)))
        return httpx.Response(200, json=next(replies))

    gemini = GeminiProvider("test-key", "gemini-test", client=httpx.Client(transport=httpx.MockTransport(handler)))
    messages = gemini.start("be helpful", [("user", "hi"), ("assistant", "hello"), ("user", "status?")])
    turn, raw = gemini.complete(messages, [{"name": "fleet_status", "description": "d", "parameters": {"type": "object", "properties": {}}}])
    assert turn.tool_calls == [ToolCall("fleet_status", {})]
    messages += [raw, gemini.tool_results([("fleet_status", {"vehicles": []})])]
    final, _ = gemini.complete(messages, [])

    assert final.text == "All good."
    url, key, body = sent[0]
    assert str(url).endswith("/models/gemini-test:generateContent")
    assert key == "test-key"
    assert body["systemInstruction"] == {"parts": [{"text": "be helpful"}]}
    assert [c["role"] for c in body["contents"]] == ["user", "model", "user"]
    assert body["tools"][0]["functionDeclarations"][0]["name"] == "fleet_status"
    second = sent[1][2]["contents"]
    assert second[-2]["parts"][0]["thoughtSignature"] == "sig-123"  # sent back unchanged
    assert second[-1] == {"role": "user", "parts": [{"functionResponse": {"name": "fleet_status", "response": {"vehicles": []}}}]}


@pytest.mark.parametrize(("status", "message"), [(429, "quota"), (500, r"error \(500\)")])
def test_gemini_http_errors(status, message):
    client = httpx.Client(transport=httpx.MockTransport(lambda request: httpx.Response(status, json={})))
    with pytest.raises(ProviderError, match=message):
        GeminiProvider("k", "m", client=client).complete([], [])
