"""
用户管理：仅管理员可访问。负责新账号创建与老账号管理（无公开注册）。
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..db_utils import escape_like
from ..date_utils import parse_date_to_utc_range
from ..models import User
from ..schemas import UserOut, UserCreate, UserCreateResult, UserUpdate, ProfileUpdate, UserProfileOut
from ..password_utils import hash_password, generate_login_account, generate_initial_password, validate_password_rules
from .auth import get_current_user, _user_to_out

router = APIRouter(prefix="/api/users", tags=["users"])


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@router.get("", response_model=list[UserOut])
async def list_users(
    date: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    stmt = select(User).order_by(User.id)
    if keyword and keyword.strip():
        from sqlalchemy import or_
        kw = escape_like(keyword.strip())
        pat = f"%{kw}%"
        stmt = stmt.where(
            or_(
                User.username.like(pat, escape="\\"),
                User.real_name.like(pat, escape="\\"),
                User.email.like(pat, escape="\\"),
            )
        )
    r = parse_date_to_utc_range(date)
    if r:
        stmt = stmt.where(User.created_at >= r[0], User.created_at < r[1])
    result = await db.execute(stmt)
    return [UserOut.model_validate(u) for u in result.scalars().all()]


@router.get("/me", response_model=UserOut)
async def get_me_profile(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.put("/me", response_model=UserOut)
async def update_me_profile(data: ProfileUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    updates = data.model_dump(exclude_unset=True)
    for k in ("email", "phone"):
        if k in updates:
            setattr(user, k, updates[k] or "")
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/options")
async def list_user_options(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """供下拉选择使用：返回 { id, username, real_name }，任意登录用户可调，显示名用 real_name 或 username"""
    result = await db.execute(select(User).where(User.disabled == False).order_by(User.id))
    return [{"id": u.id, "username": u.username, "real_name": getattr(u, "real_name", None) or ""} for u in result.scalars().all()]


@router.post("", response_model=UserCreateResult)
async def create_user(
    data: UserCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    for _ in range(20):
        login_account = generate_login_account()
        r = await db.execute(select(User).where(User.username == login_account))
        if r.scalar_one_or_none() is None:
            break
    else:
        raise HTTPException(status_code=500, detail="生成唯一登录账号失败，请重试")
    initial_password = generate_initial_password(9)
    user = User(
        username=login_account,
        real_name=(data.real_name or "").strip() or None,
        password_hash=hash_password(initial_password),
        is_admin=bool(data.is_admin),
        disabled=False,
        email=(data.email or "").strip() or None,
        phone=(data.phone or "").strip() or None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserCreateResult(
        user=_user_to_out(user),
        login_account=login_account,
        initial_password=initial_password,
    )


@router.get("/{user_id}/profile", response_model=UserProfileOut)
async def get_user_profile(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """任意登录用户可查看他人基础资料（用于聊天中点击头像）"""
    r = await db.execute(select(User).where(User.id == user_id, User.disabled == False))
    u = r.scalar_one_or_none()
    if not u:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserProfileOut(
        id=u.id,
        username=u.username,
        real_name=getattr(u, "real_name", None) or "",
        email=getattr(u, "email", None) or "",
        phone=getattr(u, "phone", None) or "",
    )


@router.get("/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    return UserOut.model_validate(user)


@router.put("/{user_id}", response_model=UserOut)
async def update_user(
    user_id: int,
    data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    updates = data.model_dump(exclude_unset=True)
    if "password" in updates and updates["password"]:
        new_pwd = updates.pop("password")
        ok, err = validate_password_rules(new_pwd)
        if not ok:
            raise HTTPException(status_code=400, detail=err)
        user.password_hash = hash_password(new_pwd)
    for k in ("email", "phone"):
        if k in updates:
            setattr(user, k, (updates[k] or "").strip() or None)
    for k in ("real_name", "is_admin", "disabled"):
        if k in updates:
            setattr(user, k, updates[k])
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    if admin.id == user_id:
        raise HTTPException(status_code=400, detail="不能删除自己的账号")
    r = await db.execute(select(User).where(User.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    await db.delete(user)
    await db.commit()
    return {"ok": True}
