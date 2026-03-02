import json
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional

from ..database import get_db
from ..models import SystemConfig
from ..services.jira_service import test_connection
from .auth import get_current_admin

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/ping")
async def settings_ping():
    """探活：返回 200 表示本模块已加载。"""
    return {"ok": True, "message": "settings API loaded"}


class JiraConfigBody(BaseModel):
    jira_url: Optional[str] = None
    jira_username: Optional[str] = None
    jira_api_token: Optional[str] = None
    jira_project_key: Optional[str] = None
    jira_enabled: Optional[bool] = None


async def _get_jira_config(db: AsyncSession) -> dict:
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "jira"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


@router.get("/jira")
async def get_jira_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_jira_config(db)
    # 不返回 api_token 明文
    if config.get("jira_api_token"):
        config["jira_api_token"] = "********"
    return config


@router.put("/jira")
async def update_jira_settings(body: JiraConfigBody, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_jira_config(db)
    updates = body.model_dump(exclude_unset=True)
    if "jira_api_token" in updates and updates["jira_api_token"] == "********":
        del updates["jira_api_token"]
    config.update(updates)

    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "jira"))
    row = r.scalar_one_or_none()
    if row:
        row.value = json.dumps(config, ensure_ascii=False)
    else:
        row = SystemConfig(key="jira", value=json.dumps(config, ensure_ascii=False))
        db.add(row)
    await db.commit()

    out = {**config}
    if out.get("jira_api_token"):
        out["jira_api_token"] = "********"
    return out


@router.post("/jira/test")
async def test_jira_settings(body: JiraConfigBody, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    import asyncio
    config = await _get_jira_config(db)
    config.update(body.model_dump(exclude_unset=True))
    if body.jira_api_token and body.jira_api_token != "********":
        config["jira_api_token"] = body.jira_api_token
    result = await asyncio.to_thread(test_connection, config)
    return result


# ─── SMTP 邮件通知 ───

class SmtpConfigBody(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_ssl: Optional[bool] = None
    from_addr: Optional[str] = None
    to_emails: Optional[list[str]] = None  # 通知收件人列表
    enabled: Optional[bool] = None


async def _get_smtp_config(db: AsyncSession) -> dict:
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "smtp"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


@router.get("/smtp")
async def get_smtp_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_smtp_config(db)
    if config.get("smtp_password"):
        config["smtp_password"] = "********"
    return config


@router.put("/smtp")
async def update_smtp_settings(body: SmtpConfigBody, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_smtp_config(db)
    updates = body.model_dump(exclude_unset=True)
    if updates.get("smtp_password") == "********":
        del updates["smtp_password"]
    config.update(updates)
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "smtp"))
    row = r.scalar_one_or_none()
    if row:
        row.value = json.dumps(config, ensure_ascii=False)
    else:
        row = SystemConfig(key="smtp", value=json.dumps(config, ensure_ascii=False))
        db.add(row)
    await db.commit()
    out = {**config}
    if out.get("smtp_password"):
        out["smtp_password"] = "********"
    return out


@router.post("/smtp/test")
async def test_smtp_settings(body: SmtpConfigBody, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    import asyncio
    from ..services.email_service import _send_sync
    config = await _get_smtp_config(db)
    config.update(body.model_dump(exclude_unset=True))
    if body.smtp_password and body.smtp_password != "********":
        config["smtp_password"] = body.smtp_password
    to_emails = config.get("to_emails") or config.get("notification_emails") or []
    if isinstance(to_emails, str):
        to_emails = [e.strip() for e in to_emails.split(",") if e.strip()]
    if not to_emails:
        return {"ok": False, "message": "请先配置收件人 to_emails"}
    return await asyncio.to_thread(_send_sync, to_emails, "[TestPilot] 邮件配置测试", "这是一封测试邮件，说明 SMTP 配置正确。", config)


# ─── AI 模型设置 ───

class AiConfigBody(BaseModel):
    provider: Optional[str] = None   # openai | openai_compatible | dashscope | deepseek | mock
    model: Optional[str] = None
    base_url: Optional[str] = None
    ai_api_key: Optional[str] = None  # 全局 API Key，保存于数据库，供所有 AI 功能使用


async def _get_ai_config(db: AsyncSession) -> dict:
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "ai"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


@router.get("/ai")
async def get_ai_settings(db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_ai_config(db)
    # 不向前端返回 API Key 明文，仅用于展示“已配置”
    if config.get("ai_api_key"):
        config["ai_api_key"] = "********"
    return config


@router.put("/ai")
async def update_ai_settings(body: AiConfigBody, db: AsyncSession = Depends(get_db), _=Depends(get_current_admin)):
    config = await _get_ai_config(db)
    updates = body.model_dump(exclude_unset=True)
    if "ai_api_key" in updates and (updates["ai_api_key"] == "********" or updates["ai_api_key"] == ""):
        del updates["ai_api_key"]
    config.update(updates)
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "ai"))
    row = r.scalar_one_or_none()
    if row:
        row.value = json.dumps(config, ensure_ascii=False)
    else:
        row = SystemConfig(key="ai", value=json.dumps(config, ensure_ascii=False))
        db.add(row)
    await db.commit()
    out = await _get_ai_config(db)
    if out.get("ai_api_key"):
        out["ai_api_key"] = "********"
    return out
