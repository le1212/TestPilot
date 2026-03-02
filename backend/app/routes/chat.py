# -*- coding: utf-8 -*-
"""即时通讯：私聊、群聊、消息通知机器人，会话记录自动保存。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func, and_, or_, case as sa_case
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from ..database import get_db, async_session
from ..date_utils import iso_utc
from ..db_utils import escape_like
from ..models import (
    ChatRoom, ChatRoomType, ChatMessage, ChatRoomMember, User,
)
from .auth import get_current_user

router = APIRouter(prefix="/api/chat", tags=["chat"])

SYSTEM_BOT_NAME = "消息通知"
SYSTEM_BOT_ID = -1


class CreateGroupBody(BaseModel):
    name: str
    member_ids: list[int]


class SendBody(BaseModel):
    room_id: int
    content: str
    msg_type: str = "text"
    reply_to_id: Optional[int] = None  # 引用回复的消息 ID


class StartPrivateBody(BaseModel):
    target_user_id: int


class AddMembersBody(BaseModel):
    member_ids: list[int]


# ─── 确保系统机器人房间存在 ───

async def ensure_bot_room(user_id: int, db: AsyncSession, *, commit: bool = True) -> ChatRoom:
    """确保当前用户拥有与系统机器人的 1:1 房间。commit=False 时由调用方统一提交（用于通知推送场景）。"""
    sub = (
        select(ChatRoomMember.room_id)
        .where(ChatRoomMember.user_id == user_id)
        .subquery()
    )
    r = await db.execute(
        select(ChatRoom)
        .where(
            ChatRoom.type == ChatRoomType.BOT,
            ChatRoom.id.in_(select(sub.c.room_id)),
        )
    )
    room = r.scalar_one_or_none()
    if room:
        return room

    room = ChatRoom(name=SYSTEM_BOT_NAME, type=ChatRoomType.BOT, owner_id=None)
    db.add(room)
    await db.flush()
    db.add(ChatRoomMember(room_id=room.id, user_id=user_id))
    await db.flush()

    welcome = ChatMessage(
        room_id=room.id,
        sender_id=SYSTEM_BOT_ID,
        content="欢迎使用 TestPilot 即时通讯！我是消息通知机器人，系统通知将在此推送。",
        msg_type="system",
    )
    db.add(welcome)
    if commit:
        await db.commit()
    return room


def _build_notification_link(type_: str, extra: dict | None) -> str:
    """根据通知类型和 extra 信息生成前端跳转路径。"""
    extra = extra or {}
    if type_ == "defect" and extra.get("defect_id"):
        return f"/defects/{extra['defect_id']}"
    if type_ == "execution" and extra.get("execution_id"):
        return f"/executions/{extra['execution_id']}"
    if type_ == "report" and extra.get("report_id"):
        return f"/reports/{extra['report_id']}"
    if type_ == "case" and extra.get("case_id"):
        return f"/test-cases/{extra['case_id']}"
    return ""


async def add_notification_to_im(
    db: AsyncSession,
    app,
    user_ids: list[int],
    title: str,
    content: str = "",
    type_: str = "system",
    extra: dict | None = None,
) -> list[tuple[int, int, "ChatMessage"]]:
    """将站内通知内容推送到即时通讯的消息通知机器人房间。
    返回 [(user_id, room_id, msg), ...]，调用方 commit 后需调用 broadcast_im_notification 推送。"""
    if not user_ids:
        return []
    import json as _json
    from sqlalchemy.sql import func

    link = _build_notification_link(type_, extra)
    card_data = _json.dumps({"title": title.strip(), "content": (content or "").strip(), "link": link, "type": type_}, ensure_ascii=False)

    result = []
    for uid in set(user_ids):
        try:
            room = await ensure_bot_room(uid, db, commit=False)
            msg = ChatMessage(
                room_id=room.id,
                sender_id=SYSTEM_BOT_ID,
                content=card_data,
                msg_type="card",
            )
            db.add(msg)
            await db.flush()
            room.updated_at = func.now()
            result.append((uid, room.id, msg))
        except Exception:
            pass
    return result


async def broadcast_im_notification(app, items: list[tuple[int, int, "ChatMessage"]]) -> None:
    """将已写入的 IM 通知消息通过 WebSocket 推送给对应用户。"""
    if not items or not hasattr(app.state, "chat_ws_connections"):
        return
    import json
    for user_id, room_id, msg in items:
        payload = json.dumps({
            "type": "chat_message",
            "room_id": room_id,
            "message": {
                "id": msg.id,
                "room_id": room_id,
                "sender_id": SYSTEM_BOT_ID,
                "sender_name": SYSTEM_BOT_NAME,
                "content": msg.content,
                "msg_type": msg.msg_type or "card",
                "created_at": iso_utc(msg.created_at),
            },
        }, ensure_ascii=False)
        for ws in list(app.state.chat_ws_connections.get(user_id, [])):
            try:
                await ws.send_text(payload)
            except Exception:
                pass


# ─── 房间列表 ───

@router.get("/rooms")
async def list_rooms(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await ensure_bot_room(user.id, db)

    my_members_r = await db.execute(
        select(ChatRoomMember).where(ChatRoomMember.user_id == user.id)
    )
    my_members = {m.room_id: m for m in my_members_r.scalars().all()}
    room_ids = list(my_members.keys())
    if not room_ids:
        return []

    r = await db.execute(
        select(ChatRoom)
        .options(selectinload(ChatRoom.members))
        .where(ChatRoom.id.in_(room_ids))
        .order_by(ChatRoom.updated_at.desc())
    )
    rooms = r.scalars().unique().all()

    result = []
    for room in rooms:
        last_msg_r = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.room_id == room.id)
            .order_by(ChatMessage.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_r.scalar_one_or_none()

        my_mem = my_members.get(room.id)
        last_read_id = (my_mem.last_read_message_id or 0) if my_mem else 0
        unread_r = await db.execute(
            select(sa_func.count(ChatMessage.id)).where(
                ChatMessage.room_id == room.id,
                ChatMessage.id > last_read_id,
                ChatMessage.sender_id != user.id,
            )
        )
        unread_count = unread_r.scalar() or 0

        member_ids = [m.user_id for m in room.members]
        display_name = room.name
        if room.type == ChatRoomType.PRIVATE:
            other_id = next((uid for uid in member_ids if uid != user.id), None)
            if other_id:
                u_r = await db.execute(select(User).where(User.id == other_id))
                other_user = u_r.scalar_one_or_none()
                if other_user:
                    display_name = other_user.real_name or other_user.username

        last_content = last_msg.content if last_msg else ""
        last_msg_type = getattr(last_msg, "msg_type", "text") if last_msg else "text"
        if last_msg_type == "image":
            last_content = "[图片]"

        result.append({
            "id": room.id,
            "name": display_name,
            "type": room.type.value if hasattr(room.type, 'value') else room.type,
            "owner_id": room.owner_id,
            "member_ids": member_ids,
            "member_count": len(member_ids),
            "unread_count": unread_count,
            "last_message": {
                "content": last_content,
                "msg_type": last_msg_type,
                "created_at": iso_utc(last_msg.created_at) if last_msg else None,
                "sender_id": last_msg.sender_id if last_msg else None,
            } if last_msg else None,
            "created_at": iso_utc(room.created_at),
            "updated_at": iso_utc(room.updated_at),
        })
    return result


# ─── 标记房间已读 ───

@router.post("/rooms/{room_id}/read")
async def mark_room_read(
    room_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mem_r = await db.execute(
        select(ChatRoomMember).where(
            ChatRoomMember.room_id == room_id,
            ChatRoomMember.user_id == user.id,
        )
    )
    mem = mem_r.scalar_one_or_none()
    if not mem:
        raise HTTPException(403, "你不是该房间成员")

    last_msg_r = await db.execute(
        select(ChatMessage.id)
        .where(ChatMessage.room_id == room_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(1)
    )
    last_msg_id = last_msg_r.scalar() or 0
    mem.last_read_message_id = last_msg_id
    await db.commit()

    try:
        app = request.app
        if hasattr(app.state, 'chat_ws_connections'):
            import json
            mem_all = await db.execute(
                select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == room_id)
            )
            room_member_ids = [row[0] for row in mem_all.fetchall()]
            payload = json.dumps({
                "type": "read_receipt",
                "room_id": room_id,
                "user_id": user.id,
                "last_read_message_id": last_msg_id,
            }, ensure_ascii=False)
            for uid in room_member_ids:
                for ws in list(app.state.chat_ws_connections.get(uid, [])):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        pass
    except Exception:
        pass

    return {"ok": True, "last_read_message_id": last_msg_id}


# ─── 全局未读消息总数 ───

@router.get("/unread-total")
async def get_unread_total(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mems_r = await db.execute(
        select(ChatRoomMember).where(ChatRoomMember.user_id == user.id)
    )
    mems = mems_r.scalars().all()
    total = 0
    for mem in mems:
        last_read = mem.last_read_message_id or 0
        cnt_r = await db.execute(
            select(sa_func.count(ChatMessage.id)).where(
                ChatMessage.room_id == mem.room_id,
                ChatMessage.id > last_read,
                ChatMessage.sender_id != user.id,
            )
        )
        total += cnt_r.scalar() or 0
    return {"total": total}


# ─── 发起私聊 ───

@router.post("/private")
async def start_private_chat(
    body: StartPrivateBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if body.target_user_id == user.id:
        raise HTTPException(400, "不能与自己发起私聊")

    target_r = await db.execute(select(User).where(User.id == body.target_user_id))
    target = target_r.scalar_one_or_none()
    if not target:
        raise HTTPException(404, "用户不存在")

    my_rooms = select(ChatRoomMember.room_id).where(ChatRoomMember.user_id == user.id).subquery()
    target_rooms = select(ChatRoomMember.room_id).where(ChatRoomMember.user_id == body.target_user_id).subquery()
    r = await db.execute(
        select(ChatRoom).where(
            ChatRoom.type == ChatRoomType.PRIVATE,
            ChatRoom.id.in_(select(my_rooms.c.room_id)),
            ChatRoom.id.in_(select(target_rooms.c.room_id)),
        )
    )
    existing = r.scalar_one_or_none()
    if existing:
        return {"room_id": existing.id, "created": False}

    room = ChatRoom(name="", type=ChatRoomType.PRIVATE, owner_id=user.id)
    db.add(room)
    await db.flush()
    db.add(ChatRoomMember(room_id=room.id, user_id=user.id))
    db.add(ChatRoomMember(room_id=room.id, user_id=body.target_user_id))
    await db.commit()
    return {"room_id": room.id, "created": True}


# ─── 创建群聊 ───

@router.post("/group")
async def create_group(
    body: CreateGroupBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    name = (body.name or "").strip()
    if not name:
        raise HTTPException(400, "群聊名称不能为空")
    member_ids = list(set(body.member_ids or []))
    if user.id not in member_ids:
        member_ids.append(user.id)
    if len(member_ids) < 2:
        raise HTTPException(400, "群聊至少需要2人")

    room = ChatRoom(name=name, type=ChatRoomType.GROUP, owner_id=user.id)
    db.add(room)
    await db.flush()
    for uid in member_ids:
        db.add(ChatRoomMember(room_id=room.id, user_id=uid))

    sys_msg = ChatMessage(
        room_id=room.id,
        sender_id=SYSTEM_BOT_ID,
        content=f"群聊「{name}」已创建",
        msg_type="system",
    )
    db.add(sys_msg)
    await db.commit()
    return {"room_id": room.id}


# ─── 群聊添加成员 ───

@router.post("/rooms/{room_id}/members")
async def add_members(
    room_id: int,
    body: AddMembersBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        select(ChatRoom)
        .options(selectinload(ChatRoom.members))
        .where(ChatRoom.id == room_id)
    )
    room = r.scalar_one_or_none()
    if not room or room.type != ChatRoomType.GROUP:
        raise HTTPException(404, "群聊不存在")
    existing_ids = {m.user_id for m in room.members}
    if user.id not in existing_ids:
        raise HTTPException(403, "你不是该群成员")

    added = []
    for uid in body.member_ids:
        if uid not in existing_ids:
            db.add(ChatRoomMember(room_id=room.id, user_id=uid))
            added.append(uid)

    if added:
        names_r = await db.execute(select(User).where(User.id.in_(added)))
        names = [u.real_name or u.username for u in names_r.scalars().all()]
        sys_msg = ChatMessage(
            room_id=room.id,
            sender_id=SYSTEM_BOT_ID,
            content=f"{'、'.join(names)} 加入了群聊",
            msg_type="system",
        )
        db.add(sys_msg)
    await db.commit()
    return {"added": added}


# ─── 房间成员 ───

@router.get("/rooms/{room_id}/members")
async def get_room_members(
    room_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mem_r = await db.execute(
        select(ChatRoomMember).where(ChatRoomMember.room_id == room_id)
    )
    members = mem_r.scalars().all()
    member_ids = [m.user_id for m in members]
    if user.id not in member_ids:
        raise HTTPException(403, "你不是该房间成员")

    users_r = await db.execute(select(User).where(User.id.in_(member_ids)))
    users = users_r.scalars().all()
    user_map = {u.id: u for u in users}
    result = []
    for uid in member_ids:
        u = user_map.get(uid)
        if u:
            result.append({
                "id": u.id,
                "username": u.username,
                "real_name": u.real_name or "",
            })
    result.insert(0, {"id": SYSTEM_BOT_ID, "username": "system_bot", "real_name": SYSTEM_BOT_NAME})
    return result


# ─── 发送消息 ───

@router.post("/send")
async def send_message(
    body: SendBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    content = (body.content or "").strip()
    msg_type = (body.msg_type or "text").strip().lower()
    if msg_type == "image":
        if not content or not (content.startswith("http://") or content.startswith("https://") or content.startswith("/")):
            raise HTTPException(400, "图片消息需提供有效的图片 URL")
    elif not content:
        raise HTTPException(400, "消息不能为空")

    mem_r = await db.execute(
        select(ChatRoomMember).where(
            ChatRoomMember.room_id == body.room_id,
            ChatRoomMember.user_id == user.id,
        )
    )
    if not mem_r.scalar_one_or_none():
        raise HTTPException(403, "你不是该房间成员")

    msg = ChatMessage(
        room_id=body.room_id,
        sender_id=user.id,
        content=content,
        msg_type=body.msg_type or "text",
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    await db.flush()

    room_r = await db.execute(select(ChatRoom).options(selectinload(ChatRoom.members)).where(ChatRoom.id == body.room_id))
    room = room_r.scalar_one_or_none()
    if room:
        from sqlalchemy.sql import func
        room.updated_at = func.now()

    await db.commit()

    recipient_count = 0
    if room:
        recipient_ids = [m.user_id for m in room.members if m.user_id != user.id]
        recipient_count = len(recipient_ids)
    read_status = {"read_count": 0, "total_recipients": recipient_count} if recipient_count > 1 else {"read": False}

    reply_to_data = None
    if body.reply_to_id:
        reply_r = await db.execute(
            select(ChatMessage).where(
                ChatMessage.id == body.reply_to_id,
                ChatMessage.room_id == body.room_id,
            )
        )
        rm = reply_r.scalar_one_or_none()
        if rm:
            sender_name = SYSTEM_BOT_NAME if rm.sender_id == SYSTEM_BOT_ID else "未知"
            if rm.sender_id != SYSTEM_BOT_ID:
                reply_sender = await db.execute(select(User).where(User.id == rm.sender_id))
                ru = reply_sender.scalar_one_or_none()
                if ru:
                    sender_name = ru.real_name or ru.username
            reply_to_data = {
                "id": rm.id,
                "sender_name": sender_name,
                "content": (rm.content or "")[:100] + ("..." if len(rm.content or "") > 100 else ""),
                "msg_type": rm.msg_type,
            }

    try:
        app = request.app
        if hasattr(app.state, 'chat_ws_connections'):
            import json
            mem_all = await db.execute(
                select(ChatRoomMember.user_id).where(ChatRoomMember.room_id == body.room_id)
            )
            room_member_ids = [row[0] for row in mem_all.fetchall()]
            msg_payload = {
                "id": msg.id,
                "room_id": body.room_id,
                "sender_id": user.id,
                "sender_name": user.real_name or user.username,
                "content": content,
                "msg_type": msg.msg_type,
                "created_at": iso_utc(msg.created_at),
                "reply_to_id": body.reply_to_id,
                "reply_to": reply_to_data,
            }
            payload = json.dumps({
                "type": "chat_message",
                "room_id": body.room_id,
                "message": msg_payload,
            }, ensure_ascii=False)
            for uid in room_member_ids:
                for ws in list(app.state.chat_ws_connections.get(uid, [])):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        pass
    except Exception:
        pass

    return {
        "id": msg.id,
        "room_id": body.room_id,
        "sender_id": user.id,
        "sender_name": user.real_name or user.username,
        "content": content,
        "msg_type": msg.msg_type,
        "created_at": iso_utc(msg.created_at),
        "read_status": read_status,
        "reply_to_id": body.reply_to_id,
        "reply_to": reply_to_data,
    }


# ─── 房间消息历史 ───

def _get_message_read_status(room, msgs, user_id, members_with_read, db) -> dict:
    """为每条消息计算已读状态。members_with_read: {user_id: last_read_message_id}"""
    result = {}
    for m in msgs:
        if m.sender_id == user_id and m.sender_id != SYSTEM_BOT_ID:
            if room.type == ChatRoomType.PRIVATE:
                other_ids = [mem_id for mem_id in members_with_read if mem_id != user_id]
                read = any(members_with_read.get(oid, 0) >= m.id for oid in other_ids) if other_ids else False
                result[m.id] = {"read": read}
            else:
                recipient_ids = [mem_id for mem_id in members_with_read if mem_id != user_id]
                read_count = sum(1 for rid in recipient_ids if members_with_read.get(rid, 0) >= m.id)
                result[m.id] = {"read_count": read_count, "total_recipients": len(recipient_ids)}
    return result


@router.get("/rooms/{room_id}/messages")
async def get_room_messages(
    room_id: int,
    page: int = 1,
    page_size: int = 50,
    around_message_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    mem_r = await db.execute(
        select(ChatRoomMember).where(
            ChatRoomMember.room_id == room_id,
            ChatRoomMember.user_id == user.id,
        )
    )
    if not mem_r.scalar_one_or_none():
        raise HTTPException(403, "你不是该房间成员")

    room_r = await db.execute(
        select(ChatRoom).options(selectinload(ChatRoom.members)).where(ChatRoom.id == room_id)
    )
    room = room_r.scalar_one_or_none()
    members_with_read = {}
    if room:
        for m in room.members:
            members_with_read[m.user_id] = m.last_read_message_id or 0

    total_r = await db.execute(
        select(sa_func.count(ChatMessage.id)).where(ChatMessage.room_id == room_id)
    )
    total = total_r.scalar() or 0

    if around_message_id:
        # 以指定消息为中心，返回前后各 page_size 条（便于点击搜索结果后定位）
        anchor_r = await db.execute(
            select(ChatMessage).where(
                ChatMessage.room_id == room_id,
                ChatMessage.id == around_message_id,
            )
        )
        anchor = anchor_r.scalar_one_or_none()
        if anchor:
            half = max(1, page_size // 2)
            before_r = await db.execute(
                select(ChatMessage)
                .where(
                    ChatMessage.room_id == room_id,
                    ChatMessage.created_at <= anchor.created_at,
                    ChatMessage.id != around_message_id,
                )
                .order_by(ChatMessage.created_at.desc())
                .limit(half)
            )
            after_r = await db.execute(
                select(ChatMessage)
                .where(
                    ChatMessage.room_id == room_id,
                    ChatMessage.created_at > anchor.created_at,
                )
                .order_by(ChatMessage.created_at.asc())
                .limit(half)
            )
            before_msgs = list(reversed(before_r.scalars().all()))
            after_msgs = after_r.scalars().all()
            msgs = before_msgs + [anchor] + after_msgs
        else:
            msgs = []
    else:
        offset = (page - 1) * page_size
        msgs_r = await db.execute(
            select(ChatMessage)
            .where(ChatMessage.room_id == room_id)
            .order_by(ChatMessage.created_at.asc())
            .offset(offset)
            .limit(page_size)
        )
        msgs = msgs_r.scalars().all()

    sender_ids = list({m.sender_id for m in msgs if m.sender_id != SYSTEM_BOT_ID})
    user_map = {}
    if sender_ids:
        users_r = await db.execute(select(User).where(User.id.in_(sender_ids)))
        for u in users_r.scalars().all():
            user_map[u.id] = u.real_name or u.username

    read_status_map = _get_message_read_status(room, msgs, user.id, members_with_read, db) if room else {}

    reply_to_ids = [m.reply_to_id for m in msgs if getattr(m, "reply_to_id", None) is not None]
    reply_to_map = {}
    if reply_to_ids:
        reply_r = await db.execute(
            select(ChatMessage).where(
                ChatMessage.id.in_(reply_to_ids),
                ChatMessage.room_id == room_id,
            )
        )
        for rm in reply_r.scalars().all():
            if rm.sender_id not in user_map and rm.sender_id != SYSTEM_BOT_ID:
                ur = await db.execute(select(User).where(User.id == rm.sender_id))
                u = ur.scalar_one_or_none()
                user_map[rm.sender_id] = (u.real_name or u.username) if u else "未知"
            reply_to_map[rm.id] = {
                "id": rm.id,
                "sender_name": SYSTEM_BOT_NAME if rm.sender_id == SYSTEM_BOT_ID else user_map.get(rm.sender_id, "未知"),
                "content": (rm.content or "")[:100] + ("..." if len(rm.content or "") > 100 else ""),
                "msg_type": rm.msg_type,
            }

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "messages": [
            {
                "id": m.id,
                "room_id": m.room_id,
                "sender_id": m.sender_id,
                "sender_name": SYSTEM_BOT_NAME if m.sender_id == SYSTEM_BOT_ID else user_map.get(m.sender_id, "未知"),
                "content": m.content,
                "msg_type": m.msg_type,
                "created_at": iso_utc(m.created_at),
                "read_status": read_status_map.get(m.id),
                "reply_to_id": getattr(m, "reply_to_id", None),
                "reply_to": reply_to_map.get(m.reply_to_id) if getattr(m, "reply_to_id", None) else None,
            }
            for m in msgs
        ],
    }


# ─── 搜索聊天记录 ───

@router.get("/search")
async def search_messages(
    keyword: str = "",
    room_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """搜索聊天记录。keyword 必填；room_id 可选，不传则搜索用户参与的所有房间。"""
    keyword = (keyword or "").strip()
    if not keyword:
        return {"total": 0, "page": 1, "page_size": page_size, "rooms_summary": [], "messages": []}
    kw_escaped = escape_like(keyword)

    my_members_r = await db.execute(
        select(ChatRoomMember.room_id).where(ChatRoomMember.user_id == user.id)
    )
    room_ids = [r[0] for r in my_members_r.all()]
    if not room_ids:
        return {"total": 0, "page": 1, "page_size": page_size, "rooms_summary": [], "messages": []}

    if room_id is not None and room_id not in room_ids:
        raise HTTPException(403, "你不是该房间成员")

    base_filter = and_(
        ChatMessage.room_id.in_(room_ids if room_id is None else [room_id]),
        ChatMessage.msg_type.in_(["text", "image"]),
        ChatMessage.content.ilike(f"%{kw_escaped}%", escape="\\"),
    )
    total_r = await db.execute(select(sa_func.count(ChatMessage.id)).where(base_filter))
    total = total_r.scalar() or 0

    # 按房间统计匹配数（微信风格「共 X 条相关聊天记录」）
    rooms_summary = []
    if room_id is None:
        summary_r = await db.execute(
            select(ChatMessage.room_id, sa_func.count(ChatMessage.id).label("cnt"))
            .where(base_filter)
            .group_by(ChatMessage.room_id)
        )
        summary_rows = summary_r.all()
        room_ids_with_matches = [r[0] for r in summary_rows]
        if room_ids_with_matches:
            rooms_map = {}
            for r in (await db.execute(
                select(ChatRoom).options(selectinload(ChatRoom.members)).where(ChatRoom.id.in_(room_ids_with_matches))
            )).scalars().all():
                rooms_map[r.id] = r
            users_for_summary = set()
            for rm in rooms_map.values():
                if rm and rm.members:
                    for mm in rm.members:
                        if mm.user_id != SYSTEM_BOT_ID:
                            users_for_summary.add(mm.user_id)
            user_map_summary = {}
            if users_for_summary:
                for u in (await db.execute(select(User).where(User.id.in_(users_for_summary)))).scalars().all():
                    user_map_summary[u.id] = u.real_name or u.username
            for r0 in summary_rows:
                rid, cnt = r0[0], r0[1]
                room = rooms_map.get(rid)
                if not room:
                    continue
                if room.type == ChatRoomType.PRIVATE:
                    name = "未知"
                    for mm in (room.members or []):
                        if mm.user_id != user.id and mm.user_id != SYSTEM_BOT_ID:
                            name = user_map_summary.get(mm.user_id, "未知")
                            break
                else:
                    name = room.name or "群聊"
                rooms_summary.append({"room_id": rid, "room_name": name, "count": cnt})

    offset = (page - 1) * page_size
    msgs_r = await db.execute(
        select(ChatMessage)
        .where(base_filter)
        .order_by(ChatMessage.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    msgs = msgs_r.scalars().all()

    room_ids_in_msgs = list({m.room_id for m in msgs})
    rooms_r = await db.execute(
        select(ChatRoom)
        .options(selectinload(ChatRoom.members))
        .where(ChatRoom.id.in_(room_ids_in_msgs))
    )
    rooms = {r.id: r for r in rooms_r.scalars().all()}

    all_user_ids = {m.sender_id for m in msgs if m.sender_id != SYSTEM_BOT_ID}
    for room in rooms.values():
        if room and room.members:
            for mm in room.members:
                if mm.user_id != SYSTEM_BOT_ID:
                    all_user_ids.add(mm.user_id)
    user_map = {}
    if all_user_ids:
        users_r = await db.execute(select(User).where(User.id.in_(all_user_ids)))
        for u in users_r.scalars().all():
            user_map[u.id] = u.real_name or u.username

    def room_display_name(rid: int) -> str:
        room = rooms.get(rid)
        if not room:
            return "未知"
        if room.type == ChatRoomType.PRIVATE:
            for mm in room.members or []:
                if mm.user_id != user.id and mm.user_id != SYSTEM_BOT_ID:
                    return user_map.get(mm.user_id, "未知")
        return room.name or "群聊"

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "rooms_summary": rooms_summary,
        "messages": [
            {
                "id": m.id,
                "room_id": m.room_id,
                "room_name": room_display_name(m.room_id),
                "sender_id": m.sender_id,
                "sender_name": SYSTEM_BOT_NAME if m.sender_id == SYSTEM_BOT_ID else user_map.get(m.sender_id, "未知"),
                "content": m.content,
                "msg_type": m.msg_type,
                "created_at": iso_utc(m.created_at),
            }
            for m in msgs
        ],
    }


# ─── 可搜索的用户列表（用于发起私聊/拉人） ───

@router.get("/users")
async def list_chat_users(
    keyword: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(User).where(User.disabled == False, User.id != user.id)
    if keyword:
        kw = f"%{escape_like(keyword.strip())}%"
        q = q.where(or_(User.username.ilike(kw, escape="\\"), User.real_name.ilike(kw, escape="\\")))
    q = q.limit(50)
    r = await db.execute(q)
    users = r.scalars().all()
    return [
        {"id": u.id, "username": u.username, "real_name": u.real_name or ""}
        for u in users
    ]
