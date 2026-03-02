from collections import defaultdict
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from ..database import get_db
from ..models import Project, TestCase, TestExecution, ExecutionStatus, Defect, DefectStatus
from ..schemas import DashboardStats, ExecutionOut

# 近 7 日趋势统一按此时区做“自然日”归属，避免 2/28 执行被误算到 3/1
TREND_TIMEZONE = ZoneInfo("Asia/Shanghai")

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("", response_model=DashboardStats)
async def get_dashboard(db: AsyncSession = Depends(get_db)):
    proj_count = (await db.execute(select(func.count()).select_from(Project))).scalar() or 0
    case_count = (await db.execute(select(func.count()).select_from(TestCase))).scalar() or 0
    exec_count = (await db.execute(select(func.count()).select_from(TestExecution))).scalar() or 0

    passed_count = (await db.execute(
        select(func.count()).where(TestExecution.status == ExecutionStatus.PASSED)
    )).scalar() or 0
    pass_rate = round(passed_count / exec_count * 100, 1) if exec_count > 0 else 0

    type_result = await db.execute(
        select(TestCase.type, func.count()).group_by(TestCase.type)
    )
    cases_by_type = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in type_result.all()}

    priority_result = await db.execute(
        select(TestCase.priority, func.count()).group_by(TestCase.priority)
    )
    cases_by_priority = {row[0].value if hasattr(row[0], 'value') else row[0]: row[1] for row in priority_result.all()}

    recent_stmt = select(TestExecution).order_by(TestExecution.created_at.desc()).limit(10)
    recent_result = await db.execute(recent_stmt)
    recent_execs = []
    for ex in recent_result.scalars().all():
        case_result = await db.execute(select(TestCase).where(TestCase.id == ex.test_case_id))
        case = case_result.scalar_one_or_none()
        eo = ExecutionOut.model_validate(ex)
        eo.case_name = case.name if case else ""
        eo.case_type = case.type.value if case else ""
        recent_execs.append(eo)

    # 近 7 日执行趋势：固定用 Asia/Shanghai 做“自然日”，在应用层按日聚合，避免 2/28 执行被误算到 3/1
    execution_trend = []
    now_tz = datetime.now(TREND_TIMEZONE)
    today = now_tz.date()
    # 7 个自然日 [today-6, ..., today]
    trend_days = [today - timedelta(days=d) for d in range(6, -1, -1)]
    day_start_utc = datetime(trend_days[0].year, trend_days[0].month, trend_days[0].day, tzinfo=TREND_TIMEZONE).astimezone(timezone.utc)
    day_end_utc = datetime(trend_days[-1].year, trend_days[-1].month, trend_days[-1].day, tzinfo=TREND_TIMEZONE) + timedelta(days=1)
    day_end_utc = day_end_utc.astimezone(timezone.utc)
    # 拉取该 UTC 时间范围内的全部执行（只取 created_at、status），在内存中按“上海日期”分组
    stmt = select(TestExecution.created_at, TestExecution.status).where(
        TestExecution.created_at >= day_start_utc,
        TestExecution.created_at < day_end_utc,
    )
    rows = (await db.execute(stmt)).all()
    by_date_total: dict[str, int] = defaultdict(int)
    by_date_passed: dict[str, int] = defaultdict(int)
    for created_at, status in rows:
        if created_at is None:
            continue
        if getattr(created_at, "tzinfo", None) is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        local_dt = created_at.astimezone(TREND_TIMEZONE)
        d = local_dt.date().isoformat()
        by_date_total[d] += 1
        if status == ExecutionStatus.PASSED:
            by_date_passed[d] += 1
    for day in trend_days:
        d = day.isoformat()
        total_n = by_date_total[d]
        passed_n = by_date_passed[d]
        execution_trend.append({
            "date": d,
            "total": total_n,
            "passed": passed_n,
            "pass_rate": round(passed_n / total_n * 100, 1) if total_n > 0 else 0,
        })

    # 最近用例：按更新时间倒序，取 5 条
    recent_cases_stmt = select(TestCase).order_by(TestCase.updated_at.desc()).limit(5)
    recent_cases_result = await db.execute(recent_cases_stmt)
    recent_cases = [
        {"id": c.id, "name": c.name, "project_id": c.project_id, "updated_at": c.updated_at.isoformat() if c.updated_at else None}
        for c in recent_cases_result.scalars().all()
    ]

    # 待处理缺陷：状态为 open 或 in_progress，取 5 条
    pending_defects_stmt = (
        select(Defect)
        .where(Defect.status.in_([DefectStatus.OPEN, DefectStatus.IN_PROGRESS]))
        .order_by(Defect.updated_at.desc())
        .limit(5)
    )
    pending_defects_result = await db.execute(pending_defects_stmt)
    pending_defects = [
        {"id": d.id, "title": d.title, "status": d.status.value if hasattr(d.status, "value") else str(d.status), "project_id": d.project_id}
        for d in pending_defects_result.scalars().all()
    ]

    # 今日执行：当天执行记录，取 5 条
    today_start = datetime(today.year, today.month, today.day, tzinfo=TREND_TIMEZONE).astimezone(timezone.utc)
    today_end = today_start + timedelta(days=1)
    today_exec_stmt = (
        select(TestExecution)
        .where(TestExecution.created_at >= today_start, TestExecution.created_at < today_end)
        .order_by(TestExecution.created_at.desc())
        .limit(5)
    )
    today_exec_result = await db.execute(today_exec_stmt)
    today_execs = []
    for ex in today_exec_result.scalars().all():
        case_result = await db.execute(select(TestCase).where(TestCase.id == ex.test_case_id))
        case = case_result.scalar_one_or_none()
        today_execs.append({
            "id": ex.id,
            "case_name": case.name if case else "",
            "status": ex.status.value if hasattr(ex.status, "value") else str(ex.status),
            "created_at": ex.created_at.isoformat() if ex.created_at else None,
        })

    return DashboardStats(
        total_projects=proj_count,
        total_cases=case_count,
        total_executions=exec_count,
        pass_rate=pass_rate,
        cases_by_type=cases_by_type,
        cases_by_priority=cases_by_priority,
        recent_executions=recent_execs,
        execution_trend=execution_trend,
        recent_cases=recent_cases,
        pending_defects=pending_defects,
        today_executions=today_execs,
    )
