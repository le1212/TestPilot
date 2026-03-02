"""Audit logging helper — records key operations to the audit_logs table."""
from sqlalchemy.ext.asyncio import AsyncSession

from .logging_config import get_logger

logger = get_logger("audit")


async def log_audit(
    db: AsyncSession,
    *,
    user_id: int | None,
    action: str,
    target_type: str = "",
    target_id: int | None = None,
    detail: str = "",
    ip_address: str = "",
) -> None:
    from .models import AuditLog

    entry = AuditLog(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        detail=detail,
        ip_address=ip_address,
    )
    db.add(entry)
    try:
        await db.commit()
        logger.info("audit | user=%s action=%s target=%s:%s", user_id, action, target_type, target_id)
    except Exception:
        await db.rollback()
        logger.warning("audit log failed: user=%s action=%s", user_id, action)
