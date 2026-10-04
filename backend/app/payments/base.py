from dataclasses import dataclass
from typing import Protocol


@dataclass
class CardDetails:
    number: str
    exp_month: int
    exp_year: int
    cvc: str


@dataclass
class ChargeResult:
    ok: bool
    provider_ref: str
    card_brand: str | None = None
    card_last4: str | None = None
    failure_reason: str | None = None


class PaymentProvider(Protocol):
    name: str

    def charge(self, amount_cents: int, currency: str, card: CardDetails, description: str) -> ChargeResult: ...

    def refund(self, provider_ref: str, amount_cents: int) -> bool: ...
