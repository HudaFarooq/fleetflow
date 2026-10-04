"""Blocks repeated failed attempts (wrong passwords, reset-link spam) per key.

Kept in memory, which is fine for a single server process. With several servers you'd move
this to Redis so they share the counts.
"""

import time
from collections import defaultdict, deque


class AttemptLimiter:
    def __init__(self, max_attempts: int, window_seconds: int):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._attempts[key]
        while attempts and now - attempts[0] > self.window_seconds:
            attempts.popleft()
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds until the key may try again, or 0 if it isn't blocked."""
        now = time.monotonic()
        attempts = self._prune(key, now)
        if len(attempts) < self.max_attempts:
            return 0
        return max(1, int(self.window_seconds - (now - attempts[0])))

    def record(self, key: str) -> None:
        self._attempts[key].append(time.monotonic())

    def clear(self, key: str) -> None:
        self._attempts.pop(key, None)

    def reset(self) -> None:
        self._attempts.clear()
