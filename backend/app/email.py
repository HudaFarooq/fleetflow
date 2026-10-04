"""Outgoing email.

"console" (the default) prints messages to the server log, so password reset links work in
development without any account. Set EMAIL_BACKEND=resend and RESEND_API_KEY to send real
emails through Resend's free tier.
"""

import logging
from dataclasses import dataclass

import httpx

from .config import settings

logger = logging.getLogger("fleetflow.email")


@dataclass
class Email:
    to: str
    subject: str
    text: str


# Every email sent in this process; tests read it to check what went out
outbox: list[Email] = []


def send_email(to: str, subject: str, text: str) -> None:
    message = Email(to=to, subject=subject, text=text)
    outbox.append(message)

    if settings.email_backend == "resend" and settings.resend_api_key:
        response = httpx.post(
            "https://api.resend.com/emails",
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.email_from, "to": [to], "subject": subject, "text": text},
            timeout=10,
        )
        if response.is_error:
            # Never let an email failure break the request that triggered it
            logger.error("Email to %s failed: %s %s", to, response.status_code, response.text)
        return

    divider = "-" * 60
    print(f"\n{divider}\nEMAIL to {to}\nSubject: {subject}\n\n{text}\n{divider}\n", flush=True)
