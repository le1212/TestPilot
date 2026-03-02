from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import Optional
from ..database import get_db
from ..date_utils import parse_date_to_utc_range
from ..models import Environment, Project
from ..schemas import EnvironmentCreate, EnvironmentUpdate, EnvironmentOut

router = APIRouter(prefix="/api/environments", tags=["environments"])


@router.get("", response_model=list[EnvironmentOut])
async def list_environments(
    project_id: Optional[int] = Query(None),
    date: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Environment).order_by(Environment.updated_at.desc())
    if project_id:
        stmt = stmt.where(Environment.project_id == project_id)
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(Environment.updated_at >= r[0], Environment.updated_at < r[1])
    result = await db.execute(stmt)
    envs = result.scalars().all()
    proj_ids = list({e.project_id for e in envs if e.project_id})
    proj_map: dict[int, str] = {}
    if proj_ids:
        pr = await db.execute(select(Project.id, Project.name).where(Project.id.in_(proj_ids)))
        proj_map = {r[0]: r[1] for r in pr.all()}
    out = []
    for e in envs:
        o = EnvironmentOut.model_validate(e)
        o.project_name = proj_map.get(e.project_id, "")
        out.append(o)
    return out


@router.post("", response_model=EnvironmentOut)
async def create_environment(data: EnvironmentCreate, db: AsyncSession = Depends(get_db)):
    env = Environment(**data.model_dump())
    db.add(env)
    await db.commit()
    await db.refresh(env)
    return EnvironmentOut.model_validate(env)


@router.get("/{env_id}", response_model=EnvironmentOut)
async def get_environment(env_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Environment).where(Environment.id == env_id))
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(404, "Environment not found")
    return EnvironmentOut.model_validate(env)


@router.put("/{env_id}", response_model=EnvironmentOut)
async def update_environment(env_id: int, data: EnvironmentUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Environment).where(Environment.id == env_id))
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(404, "Environment not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(env, field, value)

    await db.commit()
    await db.refresh(env)
    return EnvironmentOut.model_validate(env)


@router.delete("/{env_id}")
async def delete_environment(env_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Environment).where(Environment.id == env_id))
    env = result.scalar_one_or_none()
    if not env:
        raise HTTPException(404, "Environment not found")

    await db.delete(env)
    await db.commit()
    return {"ok": True}
