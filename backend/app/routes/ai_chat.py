# -*- coding: utf-8 -*-
"""AI 答疑：独立对话页面，会话自动保存、可查看历史。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from typing import Optional

from ..database import get_db
from ..date_utils import iso_utc
from ..models import AIConversation, AIMessage, User
from ..rate_limiter import RateLimiter
from ..config import RATE_LIMIT_AI
from ..services.ai_service import chat as ai_chat, get_ai_config
from .auth import get_current_user

_ai_limiter = RateLimiter(RATE_LIMIT_AI)

router = APIRouter(prefix="/api/ai-chat", tags=["ai-chat"])

AI_SYSTEM_PROMPT = """你是 TestPilot 平台的 AI 答疑助手，一位经验丰富的测试专家。
你擅长软件测试、自动化测试、接口测试、性能测试、安全测试等领域。
请用中文回答，回答需要专业、准确、有条理。对于代码相关问题请给出示例代码。"""

MAX_CONTEXT_MESSAGES = 20


class SendMessageBody(BaseModel):
    conversation_id: Optional[int] = None
    content: str


class RenameBody(BaseModel):
    title: str


# ─── 会话列表 ───

@router.get("/conversations")
async def list_conversations(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        select(AIConversation)
        .where(AIConversation.user_id == user.id)
        .order_by(AIConversation.updated_at.desc())
    )
    convs = r.scalars().all()
    return [
        {
            "id": c.id,
            "title": c.title,
            "created_at": iso_utc(c.created_at),
            "updated_at": iso_utc(c.updated_at),
        }
        for c in convs
    ]


# ─── 会话详情（含消息） ───

@router.get("/conversations/{conv_id}")
async def get_conversation(
    conv_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        select(AIConversation)
        .options(selectinload(AIConversation.messages))
        .where(AIConversation.id == conv_id, AIConversation.user_id == user.id)
    )
    conv = r.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "会话不存在")
    return {
        "id": conv.id,
        "title": conv.title,
        "created_at": iso_utc(conv.created_at),
        "messages": [
            {
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "created_at": iso_utc(m.created_at),
            }
            for m in conv.messages
        ],
    }


# ─── 发送消息并获取 AI 回复 ───

@router.post("/send")
async def send_message(
    body: SendMessageBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    _ai_limiter.check(request, user.id)
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(400, "消息不能为空")

    conv: AIConversation | None = None
    if body.conversation_id:
        r = await db.execute(
            select(AIConversation)
            .options(selectinload(AIConversation.messages))
            .where(AIConversation.id == body.conversation_id, AIConversation.user_id == user.id)
        )
        conv = r.scalar_one_or_none()
        if not conv:
            raise HTTPException(404, "会话不存在")

    if not conv:
        title = content[:50] + ("..." if len(content) > 50 else "")
        conv = AIConversation(user_id=user.id, title=title)
        db.add(conv)
        await db.flush()
        conv_r = await db.execute(
            select(AIConversation)
            .options(selectinload(AIConversation.messages))
            .where(AIConversation.id == conv.id)
        )
        conv = conv_r.scalar_one()

    history = []
    for m in conv.messages[-MAX_CONTEXT_MESSAGES:]:
        history.append({"role": m.role, "content": m.content})
    history.append({"role": "user", "content": content})

    user_msg = AIMessage(conversation_id=conv.id, role="user", content=content)
    db.add(user_msg)

    ai_config = await get_ai_config(db)

    await db.commit()

    messages = [{"role": "system", "content": AI_SYSTEM_PROMPT}] + history

    ai_reply = await ai_chat(messages, max_tokens=2000, config=ai_config)
    if not ai_reply:
        ai_reply = "抱歉，AI 暂时无法回复，请稍后再试。"

    ai_msg = AIMessage(conversation_id=conv.id, role="assistant", content=ai_reply)
    db.add(ai_msg)
    await db.commit()

    return {
        "conversation_id": conv.id,
        "title": conv.title,
        "user_message": {
            "id": user_msg.id,
            "role": "user",
            "content": content,
            "created_at": iso_utc(user_msg.created_at),
        },
        "ai_message": {
            "id": ai_msg.id,
            "role": "assistant",
            "content": ai_reply,
            "created_at": iso_utc(ai_msg.created_at),
        },
    }


# ─── 重命名会话 ───

@router.put("/conversations/{conv_id}")
async def rename_conversation(
    conv_id: int,
    body: RenameBody,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        select(AIConversation).where(AIConversation.id == conv_id, AIConversation.user_id == user.id)
    )
    conv = r.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "会话不存在")
    conv.title = (body.title or "").strip()[:200] or conv.title
    await db.commit()
    return {"id": conv.id, "title": conv.title}


# ─── 删除会话 ───

@router.delete("/conversations/{conv_id}")
async def delete_conversation(
    conv_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    r = await db.execute(
        select(AIConversation).where(AIConversation.id == conv_id, AIConversation.user_id == user.id)
    )
    conv = r.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "会话不存在")
    await db.delete(conv)
    await db.commit()
    return {"ok": True}
