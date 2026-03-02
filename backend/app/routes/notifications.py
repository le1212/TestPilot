"""
站内通知：列表、未读数、已读、即时推送（WebSocket 广播）、同步到即时通讯消息通知。
"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Notification, NotificationRead, User
from ..schemas import NotificationOut
from .auth import get_current_user
from .chat import add_notification_to_im, broadcast_im_notification

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


def _assignee_to_username(assignee: str) -> str | None:
    """从指派字符串解析出用户名。格式为 姓名(账号) 或 账号。"""
    if not assignee or not assignee.strip():
        return None
    s = assignee.strip()
    if "(" in s and ")" in s:
        start = s.index("(") + 1
        end = s.index(")")
        if end > start:
            return s[start:end].strip()
    return s


async def get_notification_target_user_ids(
    db: AsyncSession,
    *,
    case=None,
    execution=None,
    defect=None,
    extra_user_ids: list[int] | None = None,
) -> list[int]:
    """收集应接收通知的用户 id：创建者、执行者、协作者、管理员、指派人。"""
    ids = set()
    if extra_user_ids:
        ids.update(extra_user_ids)
    if case:
        if getattr(case, "created_by_id", None):
            ids.add(case.created_by_id)
        cids = getattr(case, "collaborator_ids", None)
        if isinstance(cids, list):
            ids.update(c for c in cids if isinstance(c, int))
    if execution and getattr(execution, "created_by_id", None):
        ids.add(execution.created_by_id)
    if defect and getattr(defect, "created_by_id", None):
        ids.add(defect.created_by_id)
    # 缺陷指派人：指派给谁就通知谁
    if defect and getattr(defect, "assignee", None):
        username = _assignee_to_username(defect.assignee)
        if username:
            r = await db.execute(select(User.id).where(User.username == username, User.disabled == False))
            row = r.one_or_none()
            if row:
                ids.add(row[0])
    r = await db.execute(select(User.id).where(User.is_admin == True))
    for (uid,) in r.all():
        ids.add(uid)
    return list(ids)


async def get_assignee_user_id(db: AsyncSession, defect) -> int | None:
    """根据缺陷的 assignee 字符串解析出对应用户 id，无则返回 None。"""
    if not defect or not getattr(defect, "assignee", None):
        return None
    username = _assignee_to_username(defect.assignee)
    if not username:
        return None
    r = await db.execute(select(User.id).where(User.username == username, User.disabled == False))
    row = r.one_or_none()
    return row[0] if row else None


async def create_and_broadcast(
    db: AsyncSession,
    app,
    title: str,
    content: str = "",
    type: str = "system",
    extra: dict = None,
    target_user_ids: list[int] | None = None,
) -> Notification | None:
    """创建站内通知并 WebSocket 广播。
    - 公告（type 为 announcement/公告）：创建一条 user_id=null，全员可见。
    - 其他：target_user_ids 为创建者、执行者、协作者、管理员等，为每人创建一条 user_id 通知。
    """
    try:
        im_items = []
        if (type or "").lower() in ("announcement", "公告"):
            n = Notification(title=title, content=content, type=type or "system", extra=extra or {}, user_id=None)
            db.add(n)
            r = await db.execute(select(User.id).where(User.disabled == False))
            all_user_ids = [row[0] for row in r.all()]
            im_items = await add_notification_to_im(db, app, all_user_ids, title, content, type_=type or "system", extra=extra)
            await db.commit()
            await db.refresh(n)
            broadcast = getattr(app.state, "broadcast_ws", None)
            if callable(broadcast):
                await broadcast({"type": "notification", "id": n.id, "title": title, "created_at": str(n.created_at)})
            await broadcast_im_notification(app, im_items)
            return n
        if target_user_ids:
            created = []
            for uid in set(target_user_ids):
                n = Notification(title=title, content=content, type=type or "system", extra=extra or {}, user_id=uid)
                db.add(n)
                created.append(n)
            im_items = await add_notification_to_im(db, app, list(set(target_user_ids)), title, content, type_=type or "system", extra=extra)
            await db.commit()
            for n in created:
                await db.refresh(n)
            broadcast = getattr(app.state, "broadcast_ws", None)
            if callable(broadcast):
                for uid in set(target_user_ids):
                    await broadcast({"type": "notification", "title": title, "user_id": uid})
            await broadcast_im_notification(app, im_items)
            return created[0] if created else None
        n = Notification(title=title, content=content, type=type or "system", extra=extra or {})
        db.add(n)
        r = await db.execute(select(User.id).where(User.disabled == False))
        all_user_ids = [row[0] for row in r.all()]
        im_items = await add_notification_to_im(db, app, all_user_ids, title, content, type_=type or "system", extra=extra)
        await db.commit()
        await db.refresh(n)
        broadcast = getattr(app.state, "broadcast_ws", None)
        if callable(broadcast):
            await broadcast({"type": "notification", "id": n.id, "title": title, "created_at": str(n.created_at)})
        await broadcast_im_notification(app, im_items)
        return n
    except Exception:
        return None


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # 全员通知 (user_id is null) 或指定当前用户
    stmt = select(Notification).where(
        (Notification.user_id.is_(None)) | (Notification.user_id == user.id)
    ).order_by(Notification.created_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    notifications = result.scalars().all()
    # 已读标记
    ids = [n.id for n in notifications]
    read_stmt = select(NotificationRead.notification_id).where(
        NotificationRead.user_id == user.id,
        NotificationRead.notification_id.in_(ids),
    )
    read_result = await db.execute(read_stmt)
    read_ids = {r[0] for r in read_result.all()}
    out = []
    for n in notifications:
        o = NotificationOut.model_validate(n)
        o.read = n.id in read_ids
        out.append(o)
    return out


@router.get("/unread-count")
async def unread_count(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    read_sub = select(NotificationRead.notification_id).where(NotificationRead.user_id == user.id)
    stmt = select(func.count()).select_from(Notification).where(
        (Notification.user_id.is_(None)) | (Notification.user_id == user.id),
    ).where(Notification.id.not_in(read_sub))
    r = await db.execute(stmt)
    return {"count": r.scalar() or 0}


@router.post("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    n = (await db.execute(select(Notification).where(Notification.id == notification_id))).scalar_one_or_none()
    if not n:
        raise HTTPException(404, "通知不存在")
    existing = (await db.execute(
        select(NotificationRead).where(
            NotificationRead.user_id == user.id,
            NotificationRead.notification_id == notification_id,
        )
    )).scalar_one_or_none()
    if not existing:
        db.add(NotificationRead(user_id=user.id, notification_id=notification_id))
        await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # 为当前用户未读的全体通知全部标记已读
    sub = select(Notification.id).where(
        (Notification.user_id.is_(None)) | (Notification.user_id == user.id),
    )
    existing_read = select(NotificationRead.notification_id).where(NotificationRead.user_id == user.id)
    to_mark = await db.execute(sub.where(Notification.id.not_in(existing_read)))
    for (nid,) in to_mark.all():
        db.add(NotificationRead(user_id=user.id, notification_id=nid))
    await db.commit()
    return {"ok": True}
