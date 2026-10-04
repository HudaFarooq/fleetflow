"""A test-mode payment provider that moves no money.

It behaves like a real provider's test mode: specific card numbers succeed or fail in specific
ways. With a real provider such as Stripe, the card form is the provider's own widget and
our server only ever receives a token, never card numbers. The sandbox accepts card details
directly so the demo needs no account, and it still only stores the last 4 digits.
"""

import secrets
from datetime import date

from .base import CardDetails, ChargeResult

TEST_CARDS = {
    "4242424242424242": None,  # succeeds
    "5555555555554444": None,  # succeeds (Mastercard)
    "4000000000000002": "Your card was declined.",
    "4000000000009995": "Your card has insufficient funds.",
}


def luhn_valid(number: str) -> bool:
    digits = [int(d) for d in reversed(number)]
    total = sum(digits[0::2]) + sum(sum(divmod(2 * d, 10)) for d in digits[1::2])
    return total % 10 == 0


def card_brand(number: str) -> str:
    if number.startswith("4"):
        return "Visa"
    if number[:2] in {"51", "52", "53", "54", "55"}:
        return "Mastercard"
    return "Card"


class SandboxProvider:
    name = "sandbox"

    def charge(self, amount_cents: int, currency: str, card: CardDetails, description: str) -> ChargeResult:
        number = "".join(ch for ch in card.number if ch.isdigit())
        ref = f"sbx_ch_{secrets.token_hex(8)}"
        brand, last4 = card_brand(number), number[-4:] or None

        def fail(reason: str) -> ChargeResult:
            return ChargeResult(ok=False, provider_ref=ref, card_brand=brand, card_last4=last4, failure_reason=reason)

        if not (13 <= len(number) <= 19) or not luhn_valid(number):
            return fail("Your card number is invalid.")
        today = date.today()
        if not 1 <= card.exp_month <= 12 or (card.exp_year, card.exp_month) < (today.year, today.month):
            return fail("Your card has expired.")
        if not (card.cvc.isdigit() and len(card.cvc) in (3, 4)):
            return fail("Your card's security code is invalid.")
        if number not in TEST_CARDS:
            return fail("Test mode: use one of the test card numbers shown on the payment page.")
        if TEST_CARDS[number]:
            return fail(TEST_CARDS[number])
        return ChargeResult(ok=True, provider_ref=ref, card_brand=brand, card_last4=last4)

    def refund(self, provider_ref: str, amount_cents: int) -> bool:
        return provider_ref.startswith("sbx_ch_")
