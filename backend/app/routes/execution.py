import asyncio
import base64
import copy
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..db_utils import escape_like
from ..models import TestCase, TestExecution, Environment, ExecutionStatus, CaseStatus, SystemConfig, User, Project
from ..schemas import ExecutionCreate, ExecutionBatchCreate, ExecutionOut, ExecutionListOut
from ..user_utils import get_user_display_with_account
from ..services.executor import TestExecutor, _excel_rows, _replace_row_variables
from .auth import get_current_user
from .cases import can_run_case
from ..services.web_executor import execute_web
from ..services.app_executor import execute_app
from ..services.miniapp_executor import execute_miniapp
from ..rate_limiter import RateLimiter
from ..config import RATE_LIMIT_EXECUTION
from ..logging_config import get_logger

logger = get_logger("execution")
_exec_limiter = RateLimiter(RATE_LIMIT_EXECUTION)

UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "uploads")

# 截图保存目录（backend/screenshots）
SCREENSHOTS_BASE = os.path.join(os.path.dirname(__file__), "..", "..", "screenshots")

router = APIRouter(prefix="/api/executions", tags=["executions"])


def _save_screenshots(execution_id: int, screenshots: list[str]) -> list[str]:
    """将 base64 截图保存到 screenshots/{execution_id}/1.png, 2.png ... 返回绝对路径列表。"""
    if not screenshots:
        return []
    out_dir = os.path.join(SCREENSHOTS_BASE, str(execution_id))
    try:
        os.makedirs(out_dir, exist_ok=True)
    except OSError:
        return []
    paths = []
    for i, b64 in enumerate(screenshots, 1):
        try:
            raw = base64.b64decode(b64)
            path = os.path.join(out_dir, f"{i}.png")
            with open(path, "wb") as f:
                f.write(raw)
            paths.append(os.path.abspath(path))
        except Exception:
            pass
    return paths


async def _try_send_execution_email(db: AsyncSession, execution: TestExecution, case_name: str, case_type: str):
    """若启用 SMTP 且配置了收件人，则异步发送执行结果邮件（不阻塞）。"""
    try:
        r = await db.execute(select(SystemConfig).where(SystemConfig.key == "smtp"))
        row = r.scalar_one_or_none()
        if not row or not row.value:
            return
        import json
        config = json.loads(row.value)
        if not config.get("enabled"):
            return
        to_emails = config.get("to_emails") or config.get("notification_emails") or []
        if isinstance(to_emails, str):
            to_emails = [e.strip() for e in to_emails.split(",") if e.strip()]
        if not to_emails:
            return
        from ..services.email_service import send_execution_notification
        status_val = getattr(execution.status, "value", str(execution.status))
        asyncio.create_task(
            asyncio.to_thread(
                send_execution_notification,
                config,
                case_name,
                status_val,
                execution.duration_ms or 0,
                (execution.logs or "")[:1500],
            )
        )
    except Exception:
        pass


# 与仪表盘近7日趋势一致：按“自然日”使用上海时区，当天的执行记录归属到当天
_LIST_TZ = ZoneInfo("Asia/Shanghai")


@router.get("", response_model=ExecutionListOut)
async def list_executions(
    test_case_id: int | None = None,
    status: str | None = None,
    date: str | None = None,
    keyword: str | None = None,
    project_id: int | None = None,
    sort_by: str | None = None,
    page: int = 1,
    page_size: int = 50,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import case as sa_case
    if sort_by == "failed_first":
        status_order = sa_case(
            (TestExecution.status == "failed", 0),
            (TestExecution.status == "error", 0),
            (TestExecution.status == "passed", 1),
            else_=2,
        )
        stmt = select(TestExecution).order_by(status_order.asc(), TestExecution.created_at.desc())
    else:
        stmt = select(TestExecution).order_by(TestExecution.created_at.desc())
    if test_case_id:
        stmt = stmt.where(TestExecution.test_case_id == test_case_id)
    if status:
        stmt = stmt.where(TestExecution.status == status)
    need_join = (keyword and keyword.strip()) or project_id
    if need_join:
        stmt = stmt.join(TestCase, TestExecution.test_case_id == TestCase.id)
        if keyword and keyword.strip():
            kw = escape_like(keyword.strip())
            stmt = stmt.where(TestCase.name.like(f"%{kw}%", escape="\\"))
        if project_id:
            stmt = stmt.where(TestCase.project_id == project_id)

    count_stmt = select(func.count()).select_from(TestExecution)
    if test_case_id:
        count_stmt = count_stmt.where(TestExecution.test_case_id == test_case_id)
    if status:
        count_stmt = count_stmt.where(TestExecution.status == status)
    if need_join:
        count_stmt = count_stmt.join(TestCase, TestExecution.test_case_id == TestCase.id)
        if keyword and keyword.strip():
            kw = escape_like(keyword.strip())
            count_stmt = count_stmt.where(TestCase.name.like(f"%{kw}%", escape="\\"))
        if project_id:
            count_stmt = count_stmt.where(TestCase.project_id == project_id)

    if date:
        try:
            from datetime import date as date_type
            y, m, d = map(int, date.split("-"))
            day = date_type(y, m, d)
            day_start = datetime(day.year, day.month, day.day, tzinfo=_LIST_TZ)
            day_end = day_start + timedelta(days=1)
            day_start_utc = day_start.astimezone(timezone.utc)
            day_end_utc = day_end.astimezone(timezone.utc)
            stmt = stmt.where(
                TestExecution.created_at >= day_start_utc,
                TestExecution.created_at < day_end_utc,
            )
            count_stmt = count_stmt.where(
                TestExecution.created_at >= day_start_utc,
                TestExecution.created_at < day_end_utc,
            )
        except (ValueError, TypeError):
            pass
    total_result = await db.execute(count_stmt)
    total = total_result.scalar() or 0

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(stmt)
    executions = result.scalars().all()

    creator_ids = [ex.created_by_id for ex in executions if getattr(ex, "created_by_id", None)]
    name_map = await get_user_display_with_account(db, creator_ids)

    case_ids = list({ex.test_case_id for ex in executions})
    case_map: dict[int, TestCase] = {}
    if case_ids:
        case_result = await db.execute(select(TestCase).where(TestCase.id.in_(case_ids)))
        case_map = {c.id: c for c in case_result.scalars().all()}

    env_ids = list({ex.environment_id for ex in executions if getattr(ex, "environment_id", None)})
    env_map: dict[int, str] = {}
    if env_ids:
        env_result = await db.execute(select(Environment).where(Environment.id.in_(env_ids)))
        for e in env_result.scalars().all():
            env_map[e.id] = e.name or ""

    proj_ids = list({c.project_id for c in case_map.values() if c.project_id})
    proj_map: dict[int, str] = {}
    if proj_ids:
        pr = await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))
        proj_map = {r[0]: r[1] for r in pr.all()}

    out = []
    for ex in executions:
        case = case_map.get(ex.test_case_id)
        eo = ExecutionOut.model_validate(ex)
        eo.case_name = case.name if case else ""
        eo.case_type = case.type.value if case else ""
        eo.created_by_name = name_map.get(ex.created_by_id, "") if getattr(ex, "created_by_id", None) else None
        eo.environment_name = env_map.get(ex.environment_id, "") if getattr(ex, "environment_id", None) else None
        eo.project_name = proj_map.get(case.project_id, "") if case else ""
        out.append(eo)
    return ExecutionListOut(data=out, total=total)


@router.post("/run", response_model=ExecutionOut)
async def run_test(data: ExecutionCreate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _exec_limiter.check(request, user.id)
    case_result = await db.execute(select(TestCase).where(TestCase.id == data.test_case_id))
    case = case_result.scalar_one_or_none()
    if not case:
        raise HTTPException(404, "TestCase not found")
    if not can_run_case(user, case):
        raise HTTPException(403, "仅创建人、管理员或协作者可执行该用例")
    if case.status != CaseStatus.ACTIVE:
        raise HTTPException(400, "状态非启用，不可执行")

    env = None
    if data.environment_id:
        env_result = await db.execute(select(Environment).where(Environment.id == data.environment_id))
        env = env_result.scalar_one_or_none()

    execution = TestExecution(
        test_case_id=case.id,
        environment_id=data.environment_id,
        status=ExecutionStatus.RUNNING,
        started_at=datetime.now(timezone.utc),
        created_by_id=user.id,
    )
    db.add(execution)
    await db.commit()
    await db.refresh(execution)

    # 优先使用请求里的 run_type/run_config（用例编辑页传入），否则用数据库
    type_val = (data.run_type or getattr(case.type, "value", None) or str(case.type)).lower().strip()
    run_config = data.run_config if data.run_config is not None else (case.config or {})
    env_base = env.base_url if env else ""
    env_vars = env.variables if env else {}
    env_hdrs = env.headers if env else {}

    try:
        data_driver = run_config.get("data_driver") or {}
        if (type_val in ("web", "app", "miniapp")) and data_driver.get("enabled") and data_driver.get("file_url"):
            file_url = data_driver.get("file_url", "")
            filename = file_url.split("/")[-1].split("?")[0] if file_url else ""
            file_path = os.path.join(UPLOADS_DIR, filename) if filename else ""
            sheet_name = data_driver.get("sheet_name") or None
            rows = _excel_rows(file_path, sheet_name)
            if not rows:
                exec_result = {
                    "result": {"passed": False, "error": "Excel 无数据或文件不存在"},
                    "logs": f"[数据驱动] 未读取到行数据: {file_path}",
                    "duration_ms": 0,
                }
            else:
                def _run_one_row(row_cfg: dict):
                    if type_val == "web":
                        return execute_web(row_cfg, env_base, env_vars)
                    if type_val == "app":
                        return execute_app(row_cfg, env_vars)
                    if type_val == "miniapp":
                        return execute_miniapp(row_cfg, env_vars)
                    return None
                all_results = []
                for i, row in enumerate(rows):
                    row_config = copy.deepcopy(run_config)
                    row_config.pop("data_driver", None)
                    row_config = _replace_row_variables(row_config, row)
                    one = await asyncio.to_thread(_run_one_row, row_config)
                    if one:
                        all_results.append(one)
                if not all_results:
                    exec_result = {"result": {"passed": False, "error": "数据驱动执行无结果"}, "logs": "", "duration_ms": 0}
                else:
                    all_passed = all((r.get("result") or {}).get("passed", False) for r in all_results)
                    combined_logs = "\n".join([f"[数据驱动 第{i+1}行] " + (r.get("logs") or "") for i, r in enumerate(all_results)])
                    total_ms = sum(r.get("duration_ms", 0) for r in all_results)
                    passed_count = sum(1 for r in all_results if (r.get("result") or {}).get("passed"))
                    exec_result = {
                        "result": {"passed": all_passed, "data_driver_rows": len(all_results), "passed_count": passed_count},
                        "logs": combined_logs,
                        "duration_ms": total_ms,
                    }
        elif type_val == "api":
            exec_result = await TestExecutor.execute_api(
                config=run_config,
                env_base_url=env_base,
                env_headers=env_hdrs,
                env_variables=env_vars,
            )
        elif type_val == "web":
            exec_result = await asyncio.to_thread(
                execute_web,
                run_config,
                env_base,
                env_vars,
            )
        elif type_val == "app":
            exec_result = await asyncio.to_thread(
                execute_app,
                run_config,
                env_vars,
            )
        elif type_val == "miniapp":
            exec_result = await asyncio.to_thread(
                execute_miniapp,
                run_config,
                env_vars,
            )
        else:
            exec_result = {
                "result": {"passed": False, "error": f"暂未实现 {type_val} 类型的执行引擎（占位逻辑）"},
                "logs": f"[提示] 当前用例类型：{type_val}，执行引擎尚未接入。\n[提示] 用例：{case.name}",
                "duration_ms": 0,
            }

        execution.status = ExecutionStatus.PASSED if exec_result["result"].get("passed") else ExecutionStatus.FAILED
        result_payload = exec_result["result"]
        # Web 执行：将截图保存到磁盘并记录路径，便于告知用户保存位置
        if type_val == "web" and result_payload.get("screenshots"):
            paths = _save_screenshots(execution.id, result_payload["screenshots"])
            if paths:
                result_payload["screenshot_paths"] = paths
        execution.result = result_payload
        execution.logs = exec_result["logs"]
        execution.duration_ms = exec_result["duration_ms"]

    except Exception as e:
        execution.status = ExecutionStatus.ERROR
        execution.result = {"error": str(e)}
        execution.logs = f"[ERROR] {str(e)}"

    execution.finished_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(execution)

    # 邮件通知：执行结果（不阻塞响应）
    await _try_send_execution_email(db, execution, case.name, type_val)
    # 站内通知：创建者、执行者、协作者、管理员
    try:
        from .notifications import create_and_broadcast, get_notification_target_user_ids
        status_val = getattr(execution.status, "value", str(execution.status))
        target_ids = await get_notification_target_user_ids(db, case=case, execution=execution)
        await create_and_broadcast(
            db, request.app,
            title=f"执行完成：{case.name}",
            content=f"状态 {status_val}，耗时 {execution.duration_ms or 0}ms",
            type="execution",
            extra={"execution_id": execution.id, "case_name": case.name, "status": status_val},
            target_user_ids=target_ids,
        )
    except Exception:
        pass

    eo = ExecutionOut.model_validate(execution)
    eo.case_name = case.name
    eo.case_type = type_val or getattr(case.type, "value", None) or str(case.type)
    return eo


@router.post("/batch-run", response_model=list[ExecutionOut])
async def batch_run(data: ExecutionBatchCreate, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _exec_limiter.check(request, user.id)
    results = []
    for case_id in data.test_case_ids:
        single = ExecutionCreate(test_case_id=case_id, environment_id=data.environment_id)
        result = await run_test(single, request=request, db=db, user=user)
        results.append(result)
    return results


@router.get("/{execution_id}", response_model=ExecutionOut)
async def get_execution(execution_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(TestExecution).where(TestExecution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, "Execution not found")

    case_result = await db.execute(select(TestCase).where(TestCase.id == execution.test_case_id))
    case = case_result.scalar_one_or_none()

    eo = ExecutionOut.model_validate(execution)
    eo.case_name = case.name if case else ""
    eo.case_type = case.type.value if case else ""
    if getattr(execution, "environment_id", None):
        env_r = await db.execute(select(Environment).where(Environment.id == execution.environment_id))
        env = env_r.scalar_one_or_none()
        eo.environment_name = env.name if env else ""
    if getattr(execution, "created_by_id", None):
        name_map = await get_user_display_with_account(db, [execution.created_by_id])
        eo.created_by_name = name_map.get(execution.created_by_id, "")
    if case is not None:
        eo.case_created_by_id = getattr(case, "created_by_id", None)
        eo.case_collaborator_ids = list(getattr(case, "collaborator_ids", None) or [])
    return eo


@router.delete("/{execution_id}")
async def delete_execution(execution_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    from ..models import Defect
    result = await db.execute(select(TestExecution).where(TestExecution.id == execution_id))
    execution = result.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, "Execution not found")
    if not (user.is_admin or (execution.created_by_id and execution.created_by_id == user.id)):
        raise HTTPException(403, "仅创建人或管理员可删除")
    defect_result = await db.execute(select(Defect).where(Defect.execution_id == execution_id))
    for defect in defect_result.scalars().all():
        defect.execution_id = None
    await db.delete(execution)
    await db.commit()
    return {"ok": True}
