# -*- coding: utf-8 -*-
"""AI 分析/生成接口：日志分析、报告分析、生成缺陷、生成用例。"""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from ..config import RATE_LIMIT_AI
from ..database import get_db
from ..models import TestExecution, TestCase, TestReport, User
from ..rate_limiter import RateLimiter
from ..services.ai_service import (
    get_ai_config,
    analyze_log,
    analyze_report,
    generate_defect_from_execution,
    generate_cases,
    generate_steps,
)
from .auth import get_current_user

_ai_limiter = RateLimiter(RATE_LIMIT_AI)

router = APIRouter(prefix="/api/ai", tags=["ai"])


class AnalyzeLogBody(BaseModel):
    log_text: Optional[str] = None
    execution_id: Optional[int] = None


class AnalyzeReportBody(BaseModel):
    report_id: int


class GenerateDefectBody(BaseModel):
    execution_id: int


class GenerateCasesBody(BaseModel):
    project_id: int
    requirement: str
    preferred_type: Optional[str] = None  # api / web / app / miniapp，空或未指定则不限制


class GenerateStepsBody(BaseModel):
    case_type: str
    requirement: str


@router.post("/analyze-log")
async def post_analyze_log(
    body: AnalyzeLogBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """分析执行日志，返回 AI 摘要与建议。"""
    _ai_limiter.check(request, user.id)
    log_text = body.log_text
    if body.execution_id and not log_text:
        r = await db.execute(select(TestExecution).where(TestExecution.id == body.execution_id))
        ex = r.scalar_one_or_none()
        if not ex:
            raise HTTPException(404, "执行记录不存在")
        log_text = ex.logs or ""
    if not (log_text or "").strip():
        raise HTTPException(400, "请提供 log_text 或 execution_id")
    result = await analyze_log(log_text, db)
    return {"analysis": result}


@router.post("/analyze-report")
async def post_analyze_report(
    body: AnalyzeReportBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """分析测试报告，返回失败归纳与改进建议。"""
    _ai_limiter.check(request, user.id)
    r = await db.execute(select(TestReport).where(TestReport.id == body.report_id))
    report = r.scalar_one_or_none()
    if not report:
        raise HTTPException(404, "报告不存在")
    summary = report.summary or {}
    details = report.details or []
    result = await analyze_report(summary, details, db)
    return {"analysis": result}


@router.post("/generate-defect")
async def post_generate_defect(
    body: GenerateDefectBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据失败执行记录生成缺陷草稿（标题、描述、复现步骤等）。仅创建人、管理员、协作者可调用。"""
    _ai_limiter.check(request, user.id)
    r = await db.execute(select(TestExecution).where(TestExecution.id == body.execution_id))
    execution = r.scalar_one_or_none()
    if not execution:
        raise HTTPException(404, "执行记录不存在")
    case_r = await db.execute(select(TestCase).where(TestCase.id == execution.test_case_id))
    case = case_r.scalar_one_or_none()
    if not case:
        raise HTTPException(404, "关联用例不存在")
    created_by_id = getattr(execution, "created_by_id", None)
    case_created_by_id = getattr(case, "created_by_id", None)
    case_collaborator_ids = list(getattr(case, "collaborator_ids", None) or [])
    if not (
        user.is_admin
        or (created_by_id is not None and created_by_id == user.id)
        or (case_created_by_id is not None and case_created_by_id == user.id)
        or (user.id in case_collaborator_ids)
    ):
        raise HTTPException(403, "仅创建人、管理员、协作者可执行该功能")
    project_id = case.project_id
    case_name = case.name
    case_type = getattr(case.type, "value", str(case.type))
    status = getattr(execution.status, "value", str(execution.status))
    result = execution.result or {}
    logs = execution.logs or ""
    fields = await generate_defect_from_execution(
        case_name=case_name,
        case_type=case_type,
        status=status,
        result=result,
        logs=logs,
        db=db,
    )
    fields["project_id"] = project_id
    fields["execution_id"] = body.execution_id
    fields["test_case_id"] = case.id
    return fields


@router.post("/generate-cases")
async def post_generate_cases(
    body: GenerateCasesBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据需求描述生成测试用例建议列表。"""
    _ai_limiter.check(request, user.id)
    from ..models import Project
    r = await db.execute(select(Project).where(Project.id == body.project_id))
    project = r.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "项目不存在")
    case_list = await db.execute(
        select(TestCase.name).where(TestCase.project_id == body.project_id).limit(100)
    )
    existing_names = [row[0] for row in case_list.fetchall()]
    cases, warnings = await generate_cases(
        requirement=body.requirement,
        project_name=project.name,
        existing_case_names=existing_names,
        preferred_type=body.preferred_type or None,
        db=db,
    )
    return {"cases": cases, "warnings": warnings}


@router.post("/generate-steps")
async def post_generate_steps(
    body: GenerateStepsBody,
    request: Request,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据需求描述，在当前用例类型下生成测试步骤或配置建议（用例内生成步骤与数据）。"""
    _ai_limiter.check(request, user.id)
    result = await generate_steps(
        requirement=body.requirement,
        case_type=body.case_type,
        db=db,
    )
    return result


@router.get("/settings")
async def get_ai_settings_public(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """获取当前 AI 配置（不含 API Key），用于前端展示是否已配置。"""
    config = await get_ai_config(db)
    return {
        "provider": config.get("provider") or "mock",
        "model": config.get("model") or "",
        "base_url": config.get("base_url") or "",
    }
