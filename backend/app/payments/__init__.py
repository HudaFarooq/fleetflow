"""Payments, behind a small provider interface so the payment company can be swapped.

The rest of the app only calls `get_provider()` and `quote_cents()`. Adding Stripe (or a local
provider) means writing one class with `charge` and `refund`, and choosing it in settings.
"""

from ..config import settings
from .base import ChargeResult, PaymentProvider
from .sandbox import SandboxProvider

_PROVIDERS: dict[str, type] = {"sandbox": SandboxProvider}


def get_provider() -> PaymentProvider:
    try:
        return _PROVIDERS[settings.payment_provider]()
    except KeyError:
        raise RuntimeError(f"Unknown PAYMENT_PROVIDER '{settings.payment_provider}'") from None


def quote_cents(weight_kg: float) -> int:
    """Price for a parcel: a flat fee plus a per-kg rate, rounded to whole cents."""
    return settings.price_base_cents + round(weight_kg * settings.price_per_kg_cents)


__all__ = ["ChargeResult", "PaymentProvider", "get_provider", "quote_cents"]
