import asyncio

import httpx
import pytest
from pydantic import ValidationError

from app.config import Settings
from app.keepalive import keep_alive


def test_pings_health_on_schedule_and_survives_failures():
    calls = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if len(calls) == 2:
            raise httpx.ConnectError("blip")  # one failed ping must not stop the loop
        return httpx.Response(200, json={"status": "ok"})

    async def run():
        client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        task = asyncio.create_task(keep_alive("https://fleetflow-api.onrender.com/", minutes=0.0005, client=client))
        await asyncio.sleep(0.25)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    asyncio.run(run())
    assert len(calls) >= 3
    assert set(calls) == {"https://fleetflow-api.onrender.com/health"}


def test_keep_alive_settings(monkeypatch):
    for name in ("KEEP_ALIVE_URL", "RENDER_EXTERNAL_URL", "KEEP_ALIVE_MINUTES"):
        monkeypatch.delenv(name, raising=False)
    assert Settings(_env_file=None).keep_alive_url is None  # off locally
    assert Settings(_env_file=None).keep_alive_minutes == 11

    monkeypatch.setenv("RENDER_EXTERNAL_URL", "https://fleetflow-api.onrender.com")
    assert Settings(_env_file=None).keep_alive_url == "https://fleetflow-api.onrender.com"  # on automatically on Render

    monkeypatch.setenv("KEEP_ALIVE_MINUTES", "15")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # 15+ minutes would let Render fall asleep


@pytest.mark.parametrize("url", ["https://fleetflow-api.onrender.com", None])
def test_app_starts_the_pinger_only_when_deployed(monkeypatch, url):
    from fastapi.testclient import TestClient

    from app import main

    started = []

    async def fake_keep_alive(base_url, minutes):
        started.append((base_url, minutes))

    monkeypatch.setattr(main.settings, "keep_alive_url", url)
    monkeypatch.setattr(main, "keep_alive", fake_keep_alive)
    with TestClient(main.app):
        pass
    assert started == ([(url, 11)] if url else [])
