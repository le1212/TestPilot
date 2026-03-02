from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..database import get_db
from ..db_utils import escape_like
from ..date_utils import parse_date_to_utc_range
from ..models import TestExecution, TestCase, Project
from ..schemas import LogEntry
from ..user_utils import get_user_display_with_account

router = APIRouter(prefix="/api/logs", tags=["logs"])


@router.get("", response_model=list[LogEntry])
async def list_logs(
    test_case_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TestExecution).order_by(TestExecution.created_at.desc())
    if test_case_id:
        stmt = stmt.where(TestExecution.test_case_id == test_case_id)
    if status:
        stmt = stmt.where(TestExecution.status == status)
    need_case_join = bool(project_id) or bool(keyword and keyword.strip())
    if need_case_join:
        stmt = stmt.join(TestCase, TestExecution.test_case_id == TestCase.id)
        if project_id:
            stmt = stmt.where(TestCase.project_id == project_id)
    if keyword and keyword.strip():
        kw = escape_like(keyword.strip())
        stmt = stmt.where(TestExecution.logs.like(f"%{kw}%", escape="\\"))
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(TestExecution.created_at >= r[0], TestExecution.created_at < r[1])
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    executions = result.scalars().all()
    creator_ids = [ex.created_by_id for ex in executions if getattr(ex, "created_by_id", None)]
    name_map = await get_user_display_with_account(db, creator_ids)
    entries = []

    case_ids = list({ex.test_case_id for ex in executions})
    case_map = {}
    if case_ids:
        cr = await db.execute(select(TestCase).where(TestCase.id.in_(case_ids)))
        case_map = {c.id: c for c in cr.scalars().all()}

    proj_ids = list({c.project_id for c in case_map.values() if c.project_id})
    proj_map: dict[int, str] = {}
    if proj_ids:
        pr = await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))
        proj_map = {r[0]: r[1] for r in pr.all()}

    for ex in executions:
        log_text = ex.logs or ""
        case = case_map.get(ex.test_case_id)
        created_by_name = name_map.get(ex.created_by_id, "") if getattr(ex, "created_by_id", None) else None

        entries.append(LogEntry(
            id=ex.id,
            execution_id=ex.id,
            created_by_id=getattr(ex, 'created_by_id', None),
            created_by_name=created_by_name,
            project_name=proj_map.get(case.project_id, "") if case else "",
            case_name=case.name if case else "",
            case_type=case.type.value if case else "",
            status=ex.status.value if hasattr(ex.status, 'value') else ex.status,
            logs=log_text,
            duration_ms=ex.duration_ms or 0,
            created_at=ex.created_at,
        ))

    return entries


@router.get("/{execution_id}", response_model=LogEntry)
async def get_log(execution_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestExecution).where(TestExecution.id == execution_id))
    ex = result.scalar_one_or_none()
    if not ex:
        from fastapi import HTTPException
        raise HTTPException(404, "Execution not found")

    case_r = await db.execute(select(TestCase).where(TestCase.id == ex.test_case_id))
    case = case_r.scalar_one_or_none()

    created_by_id = getattr(ex, 'created_by_id', None)
    created_by_name = None
    if created_by_id:
        name_map = await get_user_display_with_account(db, [created_by_id])
        created_by_name = name_map.get(created_by_id, "")
    project_name = ""
    if case and case.project_id:
        pr = await db.execute(select(Project.name).where(Project.id == case.project_id))
        pn = pr.scalar_one_or_none()
        project_name = pn or ""
    return LogEntry(
        id=ex.id,
        execution_id=ex.id,
        created_by_id=created_by_id,
        created_by_name=created_by_name,
        project_name=project_name,
        case_name=case.name if case else "",
        case_type=case.type.value if case else "",
        status=ex.status.value if hasattr(ex.status, 'value') else ex.status,
        logs=ex.logs or "",
        duration_ms=ex.duration_ms or 0,
        created_at=ex.created_at,
    )
