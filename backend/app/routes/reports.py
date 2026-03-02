from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..database import get_db
from ..db_utils import escape_like
from ..date_utils import parse_date_to_utc_range
from ..models import TestReport, TestExecution, TestCase, Project, User
from ..schemas import ReportCreate, ReportOut
from ..user_utils import get_user_display_with_account
from .auth import get_current_user
from ..services.allure_service import AllureService
import os
import asyncio
from ..database import async_session
from datetime import datetime, timezone


def _iso_utc(dt: Optional[datetime]) -> str:
    if not dt:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


async def _async_generate_allure_html(report_id: int, created_by_id: int | None, app):
    # Run html generation in a background task and update report.summary["allure"]
    html = await asyncio.to_thread(AllureService.generate_html, report_id)
    async with async_session() as session:
        r = await session.execute(select(TestReport).where(TestReport.id == report_id))
        report = r.scalar_one_or_none()
        if not report:
            return

        prev = report.summary or {}
        allure_prev = (prev.get("allure") or {}) if isinstance(prev, dict) else {}
        allure_prev = {**allure_prev, **{
            "html_ready": bool(html.get("ok")),
            "html_url": f"/api/allure/{report_id}/index.html" if html.get("ok") else None,
            "reason": html.get("reason"),
            "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "status": "ready" if html.get("ok") else "failed",
        }}
        if isinstance(prev, dict):
            report.summary = {**prev, "allure": allure_prev}
        else:
            report.summary = {"allure": allure_prev}
        await session.commit()

        if html.get("ok") and created_by_id:
            from .notifications import create_and_broadcast
            await create_and_broadcast(
                session, app,
                title="Allure 报告生成成功",
                content=f"报告「{getattr(report, 'name', '')}」的 Allure HTML 已生成，可前往测试报告详情中查看。",
                type="system",
                target_user_ids=[created_by_id],
            )
            user_r = await session.execute(select(User).where(User.id == created_by_id))
            creator = user_r.scalar_one_or_none()
            if creator and getattr(creator, "email", None) and (creator.email or "").strip():
                from .settings import _get_smtp_config
                from ..services.email_service import send_allure_ready_notification
                smtp_config = await _get_smtp_config(session)
                if smtp_config.get("smtp_host") and smtp_config.get("from_addr"):
                    await asyncio.to_thread(
                        send_allure_ready_notification,
                        smtp_config,
                        (creator.email or "").strip(),
                        getattr(report, "name", "") or f"报告#{report_id}",
                        report_id,
                    )

router = APIRouter(prefix="/api/reports", tags=["reports"])


async def _enrich_report(report: TestReport, db: AsyncSession, name_map: dict | None = None) -> ReportOut:
    out = ReportOut.model_validate(report)
    r = await db.execute(select(Project).where(Project.id == report.project_id))
    p = r.scalar_one_or_none()
    out.project_name = p.name if p else ""
    if name_map is not None and getattr(report, "created_by_id", None):
        out.created_by_name = name_map.get(report.created_by_id, "")
    elif getattr(report, "created_by_id", None):
        single_map = await get_user_display_with_account(db, [report.created_by_id])
        out.created_by_name = single_map.get(report.created_by_id, "")
    return out


@router.get("", response_model=list[ReportOut])
async def list_reports(
    project_id: Optional[int] = Query(None),
    date: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(TestReport).order_by(TestReport.created_at.desc())
    if project_id:
        stmt = stmt.where(TestReport.project_id == project_id)
    if keyword and keyword.strip():
        kw = escape_like(keyword.strip())
        stmt = stmt.where(TestReport.name.like(f"%{kw}%", escape="\\"))
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(TestReport.created_at >= r[0], TestReport.created_at < r[1])
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    reports = result.scalars().all()
    creator_ids = [r.created_by_id for r in reports if getattr(r, "created_by_id", None)]
    name_map = await get_user_display_with_account(db, creator_ids)
    out = []
    for r in reports:
        out.append(await _enrich_report(r, db, name_map))
    return out


@router.post("", response_model=ReportOut)
async def create_report(data: ReportCreate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    execution_ids = []
    for x in (data.execution_ids or []):
        try:
            v = int(x)
            if v > 0:
                execution_ids.append(v)
        except (TypeError, ValueError):
            pass

    if not execution_ids:
        stmt = select(TestExecution).order_by(TestExecution.created_at.desc()).limit(100)
        result = await db.execute(stmt)
        execution_ids = [e.id for e in result.scalars().all()]

    details = []
    total = passed = failed = error = 0
    total_duration = 0

    status_filter = (data.status_filter or "").strip().lower() or None  # 仅包含指定状态的执行

    for eid in execution_ids:
        r = await db.execute(select(TestExecution).where(TestExecution.id == eid))
        ex = r.scalar_one_or_none()
        if not ex:
            continue

        st = ex.status.value if hasattr(ex.status, 'value') else ex.status
        if status_filter and st != status_filter:
            continue  # 未通过状态过滤则跳过，不加入报告与 Allure

        case_r = await db.execute(select(TestCase).where(TestCase.id == ex.test_case_id))
        case = case_r.scalar_one_or_none()

        total += 1
        total_duration += ex.duration_ms or 0
        if st == "passed":
            passed += 1
        elif st == "failed":
            failed += 1
        elif st == "error":
            error += 1

        details.append({
            "execution_id": ex.id,
            "case_id": ex.test_case_id,
            "case_name": case.name if case else "",
            "case_type": case.type.value if case else "",
            "status": st,
            "duration_ms": ex.duration_ms or 0,
            "assertions": ex.result.get("assertions", []) if ex.result else [],
            "error": ex.result.get("error") if ex.result else None,
            "logs": ex.logs or "",
            "created_at": _iso_utc(ex.created_at),
            "screenshot_paths": ex.result.get("screenshot_paths", []) if ex.result else [],
        })

    rate = f"{round(passed / total * 100, 1)}" if total > 0 else "0"
    execution_ids_in_report = [d["execution_id"] for d in details]

    summary = {
        "total": total, "passed": passed, "failed": failed, "error": error,
        "skipped": total - passed - failed - error,
        "pass_rate": rate,
        "total_duration_ms": total_duration,
    }

    report = TestReport(
        project_id=data.project_id,
        created_by_id=user.id,
        name=data.name,
        summary=summary,
        execution_ids=execution_ids_in_report,
        total=total,
        passed=passed,
        failed=failed,
        error=error,
        pass_rate=rate,
        duration_ms=total_duration,
        details=details,
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    # Generate Allure results (fast) then generate HTML asynchronously (may be slow)
    allure_results = AllureService.generate_results(report)
    allure_cli = AllureService.allure_cmd()
    allure_info = {
        "results_dir": allure_results.get("results_dir"),
        "generated": allure_results.get("generated", 0),
        "html_ready": False,
        "html_url": None,
        "reason": None,
        "cli": allure_cli,
        "server_url": os.getenv("ALLURE_SERVER_URL", "") or None,
        "status": "generating" if allure_cli else "cli_missing",
    }

    try:
        report.summary = {**(report.summary or {}), "allure": allure_info}
    except Exception:
        report.summary = {"allure": allure_info}

    await db.commit()
    await db.refresh(report)

    if allure_cli:
        asyncio.create_task(_async_generate_allure_html(int(report.id), getattr(report, "created_by_id", None), request.app))
    return await _enrich_report(report, db)


@router.get("/{report_id}", response_model=ReportOut)
async def get_report(report_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestReport).where(TestReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")
    return await _enrich_report(report, db)


@router.delete("/{report_id}")
async def delete_report(report_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(select(TestReport).where(TestReport.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "Report not found")
    if not (user.is_admin or (report.created_by_id and report.created_by_id == user.id)):
        raise HTTPException(403, "仅创建人或管理员可删除")
    await db.delete(report)
    await db.commit()
    return {"ok": True}
