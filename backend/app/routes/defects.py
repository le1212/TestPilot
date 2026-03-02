import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from ..database import get_db
from ..db_utils import escape_like
from ..date_utils import parse_date_to_utc_range
from ..models import Defect, DefectStatus, DefectSeverity, TestCase, Project, SystemConfig, User, DefectComment, DefectLog
from ..schemas import DefectCreate, DefectUpdate, DefectOut, DefectBatchUpdate, DefectCommentCreate, DefectCommentOut, DefectLogOut
from ..user_utils import get_user_display_with_account
from .auth import get_current_user
from .notifications import get_assignee_user_id
from ..services.jira_service import push_defect_to_jira as jira_push, sync_defect_status as jira_sync

router = APIRouter(prefix="/api/defects", tags=["defects"])

STATUS_LABELS = {"open": "待处理", "in_progress": "处理中", "fixed": "已修复", "pending_verification": "待验证", "verified": "已验证", "closed": "已关闭", "rejected": "已拒绝"}
SEVERITY_LABELS = {"blocker": "阻塞", "critical": "严重", "major": "一般", "minor": "次要", "trivial": "轻微"}


async def _append_defect_log(db: AsyncSession, defect_id: int, user_id: Optional[int], action_message: str):
    log = DefectLog(defect_id=defect_id, user_id=user_id, action_message=action_message)
    db.add(log)
    await db.commit()


async def _can_edit_defect(db: AsyncSession, defect: Defect, user: User) -> bool:
    """仅创建人、管理员、被指派人可编辑/推送到 Jira。"""
    if user.is_admin:
        return True
    if getattr(defect, "created_by_id", None) and defect.created_by_id == user.id:
        return True
    assignee_id = await get_assignee_user_id(db, defect)
    if assignee_id and assignee_id == user.id:
        return True
    return False


async def _can_edit_assignee(db: AsyncSession, defect: Defect, user: User) -> bool:
    """仅管理员、当前被指派人可修改「指派给」。创建人只有在本人为被指派人时方可修改。"""
    if user.is_admin:
        return True
    assignee_id = await get_assignee_user_id(db, defect)
    if assignee_id and assignee_id == user.id:
        return True
    return False


async def _enrich(defect: Defect, db: AsyncSession, name_map: dict[int, str] | None = None) -> DefectOut:
    out = DefectOut.model_validate(defect)
    if defect.test_case_id:
        r = await db.execute(select(TestCase).where(TestCase.id == defect.test_case_id))
        c = r.scalar_one_or_none()
        out.case_name = c.name if c else ""
    r = await db.execute(select(Project).where(Project.id == defect.project_id))
    p = r.scalar_one_or_none()
    out.project_name = p.name if p else ""
    if name_map is not None and getattr(defect, "created_by_id", None):
        out.created_by_name = name_map.get(defect.created_by_id, "")
    elif getattr(defect, "created_by_id", None):
        name_map_single = await get_user_display_with_account(db, [defect.created_by_id])
        out.created_by_name = name_map_single.get(defect.created_by_id, "")
    return out


@router.get("", response_model=list[DefectOut])
async def list_defects(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    assignee: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Defect)
    if project_id:
        stmt = stmt.where(Defect.project_id == project_id)
    if status:
        stmt = stmt.where(Defect.status == status)
    if severity:
        stmt = stmt.where(Defect.severity == severity)
    if keyword:
        kw = escape_like(keyword.strip())
        stmt = stmt.where(Defect.title.like(f"%{kw}%", escape="\\"))
    if assignee is not None and assignee != "":
        stmt = stmt.where(Defect.assignee == assignee)
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(Defect.created_at >= r[0], Defect.created_at < r[1])

    stmt = stmt.order_by(Defect.updated_at.desc())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    defects = result.scalars().all()
    creator_ids = [d.created_by_id for d in defects if getattr(d, "created_by_id", None)]
    name_map = await get_user_display_with_account(db, creator_ids)
    out = []
    for d in defects:
        out.append(await _enrich(d, db, name_map))
    return out


@router.get("/count")
async def count_defects(
    project_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(func.count()).select_from(Defect)
    if project_id:
        stmt = stmt.where(Defect.project_id == project_id)
    if status:
        stmt = stmt.where(Defect.status == status)
    result = await db.execute(stmt)
    return {"count": result.scalar() or 0}


@router.get("/stats")
async def defect_stats(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    base = select(func.count()).select_from(Defect)
    if project_id:
        base = base.where(Defect.project_id == project_id)

    total = (await db.execute(base)).scalar() or 0

    by_status = {}
    status_q = select(Defect.status, func.count()).group_by(Defect.status)
    if project_id:
        status_q = status_q.where(Defect.project_id == project_id)
    for row in (await db.execute(status_q)).all():
        by_status[row[0].value if hasattr(row[0], 'value') else row[0]] = row[1]

    by_severity = {}
    sev_q = select(Defect.severity, func.count()).group_by(Defect.severity)
    if project_id:
        sev_q = sev_q.where(Defect.project_id == project_id)
    for row in (await db.execute(sev_q)).all():
        by_severity[row[0].value if hasattr(row[0], 'value') else row[0]] = row[1]

    return {"total": total, "by_status": by_status, "by_severity": by_severity}


@router.post("", response_model=DefectOut)
async def create_defect(data: DefectCreate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    defect = Defect(**data.model_dump(), created_by_id=user.id)
    db.add(defect)
    await db.commit()
    await db.refresh(defect)
    try:
        await _append_defect_log(db, defect.id, user.id, "创建了缺陷")
    except Exception:
        pass
    await _try_send_defect_email(db, defect, "创建")
    try:
        from .notifications import create_and_broadcast, get_notification_target_user_ids, get_assignee_user_id
        target_ids = await get_notification_target_user_ids(db, defect=defect)
        if target_ids:
            operator_display = (getattr(user, "real_name", None) and f"{user.real_name}({user.username})") or user.username or "系统"
            assignee_display = (defect.assignee and defect.assignee.strip()) or "未指派"
            assignee_id = await get_assignee_user_id(db, defect)
            extra_payload = {"defect_id": defect.id}
            content = data.description or ""
            if assignee_id:
                title_to_assignee = f"【新建缺陷】{operator_display} 将《{defect.title}》缺陷流转给您 {assignee_display}"
                await create_and_broadcast(db, request.app, title=title_to_assignee, content=content, type="defect", extra=extra_payload, target_user_ids=[assignee_id])
            other_ids = [i for i in target_ids if i != assignee_id]
            if other_ids:
                title_to_others = f"【新建缺陷】{operator_display} 将《{defect.title}》缺陷流转给 {assignee_display}"
                await create_and_broadcast(db, request.app, title=title_to_others, content=content, type="defect", extra=extra_payload, target_user_ids=other_ids)
    except Exception:
        pass
    return await _enrich(defect, db)


@router.get("/{defect_id}", response_model=DefectOut)
async def get_defect(defect_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Defect).where(Defect.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(404, "Defect not found")
    return await _enrich(defect, db)


@router.get("/{defect_id}/comments", response_model=list[DefectCommentOut])
async def list_defect_comments(defect_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await db.execute(select(Defect).where(Defect.id == defect_id))
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Defect not found")
    result = await db.execute(select(DefectComment).where(DefectComment.defect_id == defect_id).order_by(DefectComment.created_at.asc()))
    comments = result.scalars().all()
    user_ids = list({c.user_id for c in comments})
    name_map = await get_user_display_with_account(db, user_ids)
    out = []
    for c in comments:
        display = name_map.get(c.user_id) or str(c.user_id)
        out.append(DefectCommentOut(id=c.id, defect_id=c.defect_id, user_id=c.user_id, user_display=display, content=c.content, created_at=c.created_at))
    return out


@router.post("/{defect_id}/comments", response_model=DefectCommentOut)
async def add_defect_comment(defect_id: int, data: DefectCommentCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await db.execute(select(Defect).where(Defect.id == defect_id))
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Defect not found")
    if not (data.content and data.content.strip()):
        raise HTTPException(400, "评论内容不能为空")
    comment = DefectComment(defect_id=defect_id, user_id=user.id, content=data.content.strip())
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    try:
        await _append_defect_log(db, defect_id, user.id, "添加了评论")
    except Exception:
        pass
    display = (getattr(user, "real_name", None) or "").strip()
    display = f"{display}({user.username})" if display and user.username else (user.username or display or str(user.id))
    return DefectCommentOut(id=comment.id, defect_id=comment.defect_id, user_id=comment.user_id, user_display=display, content=comment.content, created_at=comment.created_at)


@router.get("/{defect_id}/logs", response_model=list[DefectLogOut])
async def list_defect_logs(defect_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await db.execute(select(Defect).where(Defect.id == defect_id))
    if not r.scalar_one_or_none():
        raise HTTPException(404, "Defect not found")
    result = await db.execute(select(DefectLog).where(DefectLog.defect_id == defect_id).order_by(DefectLog.created_at.asc()))
    logs = result.scalars().all()
    user_ids = list({lg.user_id for lg in logs if lg.user_id})
    name_map = await get_user_display_with_account(db, user_ids) if user_ids else {}
    out = []
    for lg in logs:
        display = name_map.get(lg.user_id, "系统") if lg.user_id else "系统"
        out.append(DefectLogOut(id=lg.id, defect_id=lg.defect_id, user_id=lg.user_id, user_display=display, action_message=lg.action_message, created_at=lg.created_at))
    return out


@router.put("/{defect_id}", response_model=DefectOut)
async def update_defect(defect_id: int, data: DefectUpdate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Defect).where(Defect.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(404, "Defect not found")
    if not await _can_edit_defect(db, defect, user):
        raise HTTPException(403, "仅创建人、管理员、被指派人可编辑缺陷")

    dump = data.model_dump(exclude_unset=True)
    can_edit_assignee = await _can_edit_assignee(db, defect, user)
    if "assignee" in dump and not can_edit_assignee:
        dump.pop("assignee")
    if "status" in dump and not can_edit_assignee:
        dump.pop("status")
    if "severity" in dump and not can_edit_assignee:
        dump.pop("severity")
    old_status = getattr(defect.status, "value", str(defect.status)) if getattr(defect, "status", None) else None
    old_assignee = (getattr(defect, "assignee", None) or "").strip()
    old_severity = getattr(defect.severity, "value", str(defect.severity)) if getattr(defect, "severity", None) else None
    old_priority = getattr(defect, "priority", None) or "medium"
    old_title = getattr(defect, "title", None) or ""
    old_description = getattr(defect, "description", None) or ""
    old_steps = getattr(defect, "steps_to_reproduce", None) or ""
    old_expected = getattr(defect, "expected_result", None) or ""
    old_actual = getattr(defect, "actual_result", None) or ""
    old_screenshots = getattr(defect, "screenshots", None) or []

    for field, value in dump.items():
        setattr(defect, field, value)

    await db.commit()
    await db.refresh(defect)
    try:
        if "status" in dump:
            new_status = getattr(defect.status, "value", str(defect.status))
            if new_status != old_status:
                label = STATUS_LABELS.get(new_status, new_status)
                await _append_defect_log(db, defect.id, user.id, f"将状态改为 {label}")
        if "assignee" in dump:
            new_assignee = (defect.assignee or "").strip() or "未指派"
            if new_assignee != (old_assignee or "未指派"):
                await _append_defect_log(db, defect.id, user.id, f"指派给 {new_assignee}")
        if "severity" in dump:
            new_sev = getattr(defect.severity, "value", str(defect.severity))
            if new_sev != old_severity:
                label = SEVERITY_LABELS.get(new_sev, new_sev)
                await _append_defect_log(db, defect.id, user.id, f"将严重程度改为 {label}")
        if "priority" in dump:
            new_pri = getattr(defect, "priority", None) or "medium"
            if new_pri != old_priority:
                pri_labels = {"low": "低", "medium": "中", "high": "高", "critical": "严重"}
                await _append_defect_log(db, defect.id, user.id, f"将优先级改为 {pri_labels.get(new_pri, new_pri)}")
        content_keys = ("title", "description", "steps_to_reproduce", "expected_result", "actual_result", "screenshots")
        if any(k in dump for k in content_keys):
            changed = False
            if "title" in dump and (defect.title or "") != old_title:
                changed = True
            if "description" in dump and (defect.description or "") != old_description:
                changed = True
            if "steps_to_reproduce" in dump and (defect.steps_to_reproduce or "") != old_steps:
                changed = True
            if "expected_result" in dump and (defect.expected_result or "") != old_expected:
                changed = True
            if "actual_result" in dump and (defect.actual_result or "") != old_actual:
                changed = True
            if "screenshots" in dump and (defect.screenshots or []) != old_screenshots:
                changed = True
            if changed:
                await _append_defect_log(db, defect.id, user.id, "编辑了缺陷")
    except Exception:
        pass
    await _try_send_defect_email(db, defect, "更新")
    try:
        from .notifications import create_and_broadcast, get_notification_target_user_ids, get_assignee_user_id
        target_ids = await get_notification_target_user_ids(db, defect=defect)
        if target_ids:
            operator_display = (getattr(user, "real_name", None) and f"{user.real_name}({user.username})") or user.username or "系统"
            assignee_display = (defect.assignee and defect.assignee.strip()) or "未指派"
            assignee_id = await get_assignee_user_id(db, defect)
            extra_payload = {"defect_id": defect.id}
            if assignee_id:
                title_to_assignee = f"【缺陷更新】{operator_display} 将《{defect.title}》缺陷流转给您 {assignee_display}"
                await create_and_broadcast(db, request.app, title=title_to_assignee, content="", type="defect", extra=extra_payload, target_user_ids=[assignee_id])
            other_ids = [i for i in target_ids if i != assignee_id]
            if other_ids:
                title_to_others = f"【缺陷更新】{operator_display} 将《{defect.title}》缺陷流转给 {assignee_display}"
                await create_and_broadcast(db, request.app, title=title_to_others, content="", type="defect", extra=extra_payload, target_user_ids=other_ids)
    except Exception:
        pass
    return await _enrich(defect, db)


@router.post("/batch-update")
async def batch_update_defects(data: DefectBatchUpdate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """批量修改缺陷：状态、严重程度、优先级、指派。仅对有编辑权限的缺陷生效。"""
    updated = 0
    for did in data.defect_ids:
        result = await db.execute(select(Defect).where(Defect.id == did))
        defect = result.scalar_one_or_none()
        if not defect or not await _can_edit_defect(db, defect, user):
            continue
        can_edit_assignee = await _can_edit_assignee(db, defect, user)
        if data.status is not None and can_edit_assignee:
            defect.status = DefectStatus(data.status)
        if data.severity is not None and can_edit_assignee:
            defect.severity = DefectSeverity(data.severity)
        if data.priority is not None:
            defect.priority = data.priority
        if data.assignee is not None and can_edit_assignee:
            defect.assignee = data.assignee
        updated += 1
    await db.commit()
    return {"ok": True, "updated": updated}


@router.delete("/{defect_id}")
async def delete_defect(defect_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Defect).where(Defect.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(404, "Defect not found")
    if not user.is_admin:
        raise HTTPException(403, "仅管理员可删除缺陷")

    await db.delete(defect)
    await db.commit()
    return {"ok": True}


async def _get_jira_config(db: AsyncSession) -> dict:
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "jira"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


async def _get_smtp_config(db: AsyncSession) -> dict:
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "smtp"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


async def _try_send_defect_email(db: AsyncSession, defect: Defect, action: str):
    """若启用 SMTP，则异步发送缺陷流转通知。"""
    try:
        config = await _get_smtp_config(db)
        if not config.get("enabled"):
            return
        import asyncio
        from ..services.email_service import send_defect_notification
        status_val = getattr(defect.status, "value", str(defect.status))
        severity_val = getattr(defect.severity, "value", str(defect.severity))
        asyncio.create_task(
            asyncio.to_thread(
                send_defect_notification,
                config,
                defect.title,
                status_val,
                severity_val,
                defect.jira_key or "",
                action,
            )
        )
    except Exception:
        pass


@router.post("/{defect_id}/push-jira")
async def push_defect_to_jira(defect_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Defect).where(Defect.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(404, "缺陷不存在")
    if not await _can_edit_defect(db, defect, user):
        raise HTTPException(403, "仅创建人、管理员、被指派人可推送到 Jira")

    config = await _get_jira_config(db)
    if not config.get("jira_enabled") and not config.get("jira_url"):
        raise HTTPException(400, "请先在系统设置中配置并启用 Jira")

    out = jira_push(defect, config)
    if out.get("ok") and out.get("jira_key"):
        defect.jira_key = out["jira_key"]
        await db.commit()
        await db.refresh(defect)
        try:
            await _append_defect_log(db, defect.id, user.id, "推送到 Jira")
        except Exception:
            pass
        await _try_send_defect_email(db, defect, "推送Jira")
    try:
        from .notifications import create_and_broadcast, get_notification_target_user_ids
        target_ids = await get_notification_target_user_ids(db, defect=defect)
        await create_and_broadcast(db, request.app, title=f"缺陷推送 Jira：{defect.title}", content=out.get("jira_key", "") or "", type="defect", extra={"defect_id": defect.id}, target_user_ids=target_ids)
    except Exception:
        pass
    return {"ok": out["ok"], "jira_key": out.get("jira_key"), "message": out.get("message", "")}


@router.post("/{defect_id}/sync-jira")
async def sync_defect_from_jira(defect_id: int, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(Defect).where(Defect.id == defect_id))
    defect = result.scalar_one_or_none()
    if not defect:
        raise HTTPException(404, "缺陷不存在")
    if not await _can_edit_defect(db, defect, user):
        raise HTTPException(403, "仅创建人、管理员、被指派人可同步 Jira 状态")

    config = await _get_jira_config(db)
    out = jira_sync(defect, config)
    if out.get("ok") and out.get("platform_status"):
        defect.status = out["platform_status"]
        await db.commit()
        await db.refresh(defect)
        try:
            await _append_defect_log(db, defect.id, user.id, "从 Jira 同步了状态")
        except Exception:
            pass
        await _try_send_defect_email(db, defect, "同步Jira")
    try:
        from .notifications import create_and_broadcast, get_notification_target_user_ids
        target_ids = await get_notification_target_user_ids(db, defect=defect)
        await create_and_broadcast(db, request.app, title=f"缺陷同步 Jira：{defect.title}", content="", type="defect", extra={"defect_id": defect.id}, target_user_ids=target_ids)
    except Exception:
        pass
    return {"ok": out.get("ok", False), "jira_status": out.get("jira_status"), "platform_status": out.get("platform_status"), "message": out.get("message", "")}
