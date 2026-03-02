"""用例分组：按项目下的分组展示；仅创建人、管理员、协作者可删除分组和在该分组下新建用例。"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional

from ..database import get_db
from ..models import CaseGroup, TestCase, Project, User
from ..schemas import CaseGroupCreate, CaseGroupUpdate, CaseGroupOut
from .auth import get_current_user
from .projects import _can_access_project

router = APIRouter(prefix="/api/groups", tags=["case-groups"])


def _can_manage_group(user: User, group: CaseGroup) -> bool:
    """创建人、管理员或协作者可管理分组（删除、编辑、在该分组下新建用例）。"""
    if not user:
        return False
    if user.is_admin:
        return True
    if group.created_by_id and group.created_by_id == user.id:
        return True
    cids = getattr(group, "collaborator_ids", None)
    if isinstance(cids, list) and user.id in cids:
        return True
    return False


@router.get("", response_model=list[CaseGroupOut])
async def list_groups(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    if not project_id:
        return []
    stmt = select(CaseGroup).where(CaseGroup.project_id == project_id).order_by(CaseGroup.sort_order.asc(), CaseGroup.id.asc())
    result = await db.execute(stmt)
    groups = result.scalars().all()
    out = []
    for g in groups:
        count_result = await db.execute(select(func.count()).select_from(TestCase).where(TestCase.group_id == g.id))
        case_count = count_result.scalar() or 0
        o = CaseGroupOut.model_validate(g)
        o.case_count = case_count
        out.append(o)
    return out


@router.post("", response_model=CaseGroupOut)
async def create_group(data: CaseGroupCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not user:
        raise HTTPException(401, "未登录")
    result = await db.execute(select(Project).where(Project.id == data.project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "项目不存在")
    if not _can_access_project(user, project):
        raise HTTPException(403, "无权限在该项目下创建分组")
    group = CaseGroup(project_id=data.project_id, name=(data.name or "").strip() or "未命名分组", created_by_id=user.id)
    db.add(group)
    await db.commit()
    await db.refresh(group)
    o = CaseGroupOut.model_validate(group)
    o.case_count = 0
    return o


@router.put("/{group_id}", response_model=CaseGroupOut)
async def update_group(
    group_id: int,
    data: CaseGroupUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(CaseGroup).where(CaseGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "分组不存在")
    if not _can_manage_group(user, group):
        raise HTTPException(403, "仅创建人、管理员或协作者可编辑分组")
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "name" and value is not None:
            setattr(group, field, (value or "").strip() or "未命名分组")
        else:
            setattr(group, field, value)
    await db.commit()
    await db.refresh(group)
    count_result = await db.execute(select(func.count()).select_from(TestCase).where(TestCase.group_id == group.id))
    o = CaseGroupOut.model_validate(group)
    o.case_count = count_result.scalar() or 0
    return o


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(CaseGroup).where(CaseGroup.id == group_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(404, "分组不存在")
    if not _can_manage_group(user, group):
        raise HTTPException(403, "仅创建人、管理员或协作者可删除分组")
    # 删除该分组下的所有用例，再删除分组
    await db.execute(delete(TestCase).where(TestCase.group_id == group_id))
    await db.delete(group)
    await db.commit()
    return {"ok": True}
