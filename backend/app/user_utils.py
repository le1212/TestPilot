"""Helper to resolve user ids to display names (real_name or username)."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .models import User


async def get_user_display_names(db: AsyncSession, user_ids: list[int]) -> dict[int, str]:
    """Return {user_id: display_name} for display_name = real_name or username."""
    if not user_ids:
        return {}
    seen = {uid for uid in user_ids if uid is not None}
    if not seen:
        return {}
    result = await db.execute(select(User.id, User.real_name, User.username).where(User.id.in_(seen)))
    rows = result.all()
    out = {}
    for uid, real_name, username in rows:
        out[uid] = (real_name or "").strip() or (username or "")
    return out


async def get_user_display_with_account(db: AsyncSession, user_ids: list[int]) -> dict[int, str]:
    """Return {user_id: 'XXX(账号)'} 用于讨论区、操作日志等展示。有姓名则为 姓名(账号)，否则为 账号。"""
    if not user_ids:
        return {}
    seen = {uid for uid in user_ids if uid is not None}
    if not seen:
        return {}
    result = await db.execute(select(User.id, User.real_name, User.username).where(User.id.in_(seen)))
    rows = result.all()
    out = {}
    for uid, real_name, username in rows:
        rn = (real_name or "").strip()
        un = (username or "").strip()
        if rn and un:
            out[uid] = f"{rn}({un})"
        else:
            out[uid] = un or rn or str(uid)
    return out
