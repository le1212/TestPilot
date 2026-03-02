from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
from ..database import get_db
from ..date_utils import parse_date_to_utc_range
from ..models import Project, TestCase, User
from ..schemas import ProjectCreate, ProjectUpdate, ProjectOut
from ..user_utils import get_user_display_with_account
from .auth import get_current_user

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _can_manage_project(user: User, project: Project) -> bool:
    """仅负责人或管理员可编辑、删除项目。"""
    if not user:
        return False
    if user.is_admin:
        return True
    if project.created_by_id and project.created_by_id == user.id:
        return True
    return False


def _can_access_project(user: User, project: Project) -> bool:
    """可查看项目：管理员、负责人、成员，或旧数据（无 created_by_id）。"""
    if not user:
        return False
    if user.is_admin:
        return True
    if project.created_by_id is None:
        return True  # 兼容旧数据：无负责人时所有人可见
    if project.created_by_id == user.id:
        return True
    member_ids = getattr(project, "member_ids", None)
    if isinstance(member_ids, list) and user.id in member_ids:
        return True
    return False


def _parse_member_ids(member_ids) -> list:
    if isinstance(member_ids, list):
        return member_ids
    if isinstance(member_ids, str):
        import json
        try:
            return json.loads(member_ids) if member_ids.strip() else []
        except Exception:
            return []
    return []


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Project).order_by(Project.updated_at.desc())
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(Project.updated_at >= r[0], Project.updated_at < r[1])
    result = await db.execute(stmt)
    all_projects = result.scalars().all()
    projects = [p for p in all_projects if _can_access_project(user, p)]

    out = []
    owner_ids = [p.created_by_id for p in projects if getattr(p, "created_by_id", None)]
    names = await get_user_display_with_account(db, owner_ids)
    for p in projects:
        count_stmt = select(func.count()).where(TestCase.project_id == p.id)
        count_result = await db.execute(count_stmt)
        case_count = count_result.scalar() or 0
        po = ProjectOut.model_validate(p)
        po.case_count = case_count
        po.created_by_id = getattr(p, "created_by_id", None)
        mids = getattr(p, "member_ids", None)
        po.member_ids = _parse_member_ids(mids) if mids is not None else []
        po.created_by_name = names.get(p.created_by_id, "") if getattr(p, "created_by_id", None) else None
        out.append(po)
    return out


@router.post("", response_model=ProjectOut)
async def create_project(
    data: ProjectCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    project = Project(
        name=data.name,
        description=data.description,
        created_by_id=user.id,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    po = ProjectOut.model_validate(project)
    po.case_count = 0
    po.created_by_id = user.id
    po.member_ids = _parse_member_ids(getattr(project, "member_ids", None))
    po.created_by_name = (user.real_name or "").strip() and f"{(user.real_name or '').strip()}({user.username})" or user.username
    return po


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not _can_access_project(user, project):
        raise HTTPException(403, "无权限查看该项目")

    count_stmt = select(func.count()).where(TestCase.project_id == project.id)
    count_result = await db.execute(count_stmt)
    case_count = count_result.scalar() or 0
    po = ProjectOut.model_validate(project)
    po.case_count = case_count
    po.created_by_id = getattr(project, "created_by_id", None)
    po.member_ids = _parse_member_ids(getattr(project, "member_ids", None))
    if po.created_by_id:
        names = await get_user_display_with_account(db, [po.created_by_id])
        po.created_by_name = names.get(po.created_by_id, "")
    return po


@router.put("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    data: ProjectUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not _can_manage_project(user, project):
        raise HTTPException(403, "仅项目负责人或管理员可编辑项目")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(project, field, value)

    await db.commit()
    await db.refresh(project)
    count_stmt = select(func.count()).where(TestCase.project_id == project.id)
    count_result = await db.execute(count_stmt)
    case_count = count_result.scalar() or 0
    po = ProjectOut.model_validate(project)
    po.case_count = case_count
    po.created_by_id = getattr(project, "created_by_id", None)
    po.member_ids = _parse_member_ids(getattr(project, "member_ids", None))
    if po.created_by_id:
        names = await get_user_display_with_account(db, [po.created_by_id])
        po.created_by_name = names.get(po.created_by_id, "")
    return po


@router.delete("/{project_id}")
async def delete_project(
    project_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    if not _can_manage_project(user, project):
        raise HTTPException(403, "仅项目负责人或管理员可删除项目")

    await db.delete(project)
    await db.commit()
    return {"ok": True}
