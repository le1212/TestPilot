"""Simple in-memory sliding-window rate limiter (per user or IP) with periodic cleanup."""
import time
from collections import defaultdict
from fastapi import HTTPException, Request

_CLEANUP_INTERVAL = 300  # seconds between full cleanups


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60):
        self.max_requests = max_requests
        self.window = window_seconds
        self._buckets: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup: float = time.time()

    def _key(self, request: Request, user_id: int | None = None) -> str:
        if user_id:
            return f"user:{user_id}"
        xff = request.headers.get("x-forwarded-for")
        if xff:
            return f"ip:{xff.split(',')[0].strip()}"
        return f"ip:{request.client.host if request.client else 'unknown'}"

    def _maybe_cleanup(self, now: float) -> None:
        if now - self._last_cleanup < _CLEANUP_INTERVAL:
            return
        self._last_cleanup = now
        stale_keys = [k for k, v in self._buckets.items() if not v or now - v[-1] >= self.window]
        for k in stale_keys:
            del self._buckets[k]

    def check(self, request: Request, user_id: int | None = None) -> None:
        key = self._key(request, user_id)
        now = time.time()
        self._maybe_cleanup(now)
        self._buckets[key] = [t for t in self._buckets[key] if now - t < self.window]
        if len(self._buckets[key]) >= self.max_requests:
            raise HTTPException(
                status_code=429,
                detail=f"请求过于频繁，每分钟最多 {self.max_requests} 次，请稍后再试",
            )
        self._buckets[key].append(now)
