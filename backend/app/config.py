"""
Centralized configuration — all tunables read from environment variables.
Production deployment MUST set JWT_SECRET to a strong random value.
"""
import os
import warnings

# ── App Info ──

APP_VERSION: str = "1.1.0"


def _parse_list(val: str) -> list[str]:
    return [v.strip() for v in val.split(",") if v.strip()] if val else []


# ── Security ──

_DEFAULT_JWT_SECRET = "testpilot-jwt-secret-change-in-production"
JWT_SECRET: str = os.getenv("JWT_SECRET", "")
_JWT_IS_DEFAULT = False
if not JWT_SECRET:
    JWT_SECRET = _DEFAULT_JWT_SECRET
    _JWT_IS_DEFAULT = True
    warnings.warn(
        "\n[TestPilot] JWT_SECRET 未通过环境变量设置，正在使用默认值。"
        "\n[TestPilot] 生产环境务必设置: export JWT_SECRET=$(python3 -c \"import secrets; print(secrets.token_urlsafe(48))\")\n",
        UserWarning,
        stacklevel=1,
    )

JWT_ALGORITHM: str = "HS256"
JWT_EXPIRE_HOURS: int = int(os.getenv("JWT_EXPIRE_HOURS", "168"))  # 7 days

# ── CORS ──

_cors_raw = os.getenv("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = _parse_list(_cors_raw) if _cors_raw else ["*"]

# ── Rate Limiting (per user per minute) ──

RATE_LIMIT_EXECUTION: int = int(os.getenv("RATE_LIMIT_EXECUTION", "30"))
RATE_LIMIT_AI: int = int(os.getenv("RATE_LIMIT_AI", "20"))

# ── Database ──

DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./testplatform.db")

# ── Logging ──

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

# ── Frontend ──

FRONTEND_URL: str = os.getenv("FRONTEND_URL", "")

# ── Login lockout ──

LOGIN_MAX_FAILED: int = int(os.getenv("LOGIN_MAX_FAILED", "5"))
LOGIN_LOCK_SECONDS: int = int(os.getenv("LOGIN_LOCK_SECONDS", str(15 * 60)))
