"""Keeps a free-tier server awake by visiting its own public URL on a timer.

Render's free plan stops a service after 15 minutes without inbound traffic, and the next visitor
then waits about a minute for it to start again. A request to our own public address goes through
Render's proxy, so it counts as traffic. This only runs where a public URL is configured (Render
provides RENDER_EXTERNAL_URL automatically), never in local development.
"""

import asyncio
import logging

import httpx

logger = logging.getLogger("fleetflow.keepalive")


async def keep_alive(base_url: str, minutes: float, client: httpx.AsyncClient | None = None) -> None:
    url = f"{base_url.rstrip('/')}/health"
    async with client or httpx.AsyncClient(timeout=30) as http:
        while True:
            await asyncio.sleep(minutes * 60)
            try:
                response = await http.get(url)
                if response.is_error:
                    logger.warning("Keep-alive ping to %s returned %s", url, response.status_code)
            except httpx.HTTPError as error:
                # Never let a failed ping stop the loop; the next one may succeed
                logger.warning("Keep-alive ping to %s failed: %s", url, error)
