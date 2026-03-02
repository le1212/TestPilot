"""
登录与鉴权：仅登录，无注册。登录验证：同一 IP 连续失败 N 次锁定 M 分钟。
"""
import time
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import User
from ..password_utils import verify_password, hash_password, validate_password_rules
from ..schemas import LoginRequest, TokenResponse, UserOut, ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest
from ..config import JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRE_HOURS, LOGIN_MAX_FAILED, LOGIN_LOCK_SECONDS
from ..logging_config import get_logger

logger = get_logger("auth")

_LOGIN_FAILED: dict[str, tuple[int, float]] = {}
_LOGIN_FAILED_LAST_CLEANUP: float = time.time()
_LOGIN_CLEANUP_INTERVAL = 300  # seconds


def _client_ip(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _cleanup_login_failed() -> None:
    global _LOGIN_FAILED_LAST_CLEANUP
    now = time.time()
    if now - _LOGIN_FAILED_LAST_CLEANUP < _LOGIN_CLEANUP_INTERVAL:
        return
    _LOGIN_FAILED_LAST_CLEANUP = now
    stale = [ip for ip, (count, lock_until) in _LOGIN_FAILED.items()
             if lock_until and now > lock_until + LOGIN_LOCK_SECONDS]
    for ip in stale:
        del _LOGIN_FAILED[ip]


def _check_login_lock(ip: str) -> None:
    _cleanup_login_failed()
    now = time.time()
    if ip in _LOGIN_FAILED:
        count, lock_until = _LOGIN_FAILED[ip]
        if now < lock_until:
            raise HTTPException(
                status_code=429,
                detail=f"登录尝试过多，请 {int(lock_until - now) // 60} 分钟后再试",
            )
        if count >= LOGIN_MAX_FAILED:
            _LOGIN_FAILED[ip] = (0, now + LOGIN_LOCK_SECONDS)
            raise HTTPException(status_code=429, detail=f"登录尝试过多，请 {LOGIN_LOCK_SECONDS // 60} 分钟后再试")
    return None


def _record_login_failed(ip: str) -> None:
    now = time.time()
    if ip not in _LOGIN_FAILED:
        _LOGIN_FAILED[ip] = (1, 0)
    else:
        count, lock_until = _LOGIN_FAILED[ip]
        if now >= lock_until:
            _LOGIN_FAILED[ip] = (1, 0)
        else:
            count += 1
            if count >= LOGIN_MAX_FAILED:
                _LOGIN_FAILED[ip] = (count, now + LOGIN_LOCK_SECONDS)
            else:
                _LOGIN_FAILED[ip] = (count, lock_until)


def _clear_login_failed(ip: str) -> None:
    _LOGIN_FAILED.pop(ip, None)


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _create_token(user_id: int, username: str, token_version: int = 0) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRE_HOURS)
    payload = {"sub": str(user_id), "username": username, "exp": expire, "v": token_version}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _user_to_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        username=user.username,
        real_name=getattr(user, "real_name", None) or None,
        email=getattr(user, "email", None) or None,
        phone=getattr(user, "phone", None) or None,
        is_admin=bool(user.is_admin),
        disabled=bool(user.disabled),
        created_at=user.created_at,
    )


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = int(payload.get("sub") or 0)
        if not user_id:
            raise HTTPException(status_code=401, detail="无效的登录凭证")
    except JWTError:
        raise HTTPException(status_code=401, detail="未登录或登录已过期")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="用户不存在")
    token_ver = getattr(user, "token_version", 0)
    if payload.get("v", 0) != token_ver:
        raise HTTPException(status_code=401, detail="登录已失效，请重新登录")
    if user.disabled:
        raise HTTPException(status_code=403, detail="账号已停用")
    return user


async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


@router.post("/login", response_model=TokenResponse)
async def login(data: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ip = _client_ip(request)
    _check_login_lock(ip)
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        _record_login_failed(ip)
        logger.warning("Login failed for user=%s ip=%s", data.username, ip)
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    if user.disabled:
        _record_login_failed(ip)
        raise HTTPException(status_code=403, detail="账号已停用")
    _clear_login_failed(ip)
    token = _create_token(user.id, user.username, getattr(user, "token_version", 0))
    logger.info("Login success user=%s id=%d ip=%s", user.username, user.id, ip)

    warnings: list[str] = []
    if data.password == "admin123":
        warnings.append("您正在使用默认密码，请尽快前往「修改密码」中修改，以保障账号安全。")

    return TokenResponse(
        token=token,
        user=_user_to_out(user),
        warnings=warnings,
    )


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return _user_to_out(user)


@router.post("/change-password")
async def change_password(data: ChangePasswordRequest, request: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if not verify_password(data.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="原密码错误")
    ok, err = validate_password_rules(data.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    logger.info("Password changed user=%s id=%d", user.username, user.id)
    from ..audit import log_audit
    await log_audit(db, user_id=user.id, action="change_password", target_type="user", target_id=user.id, ip_address=_client_ip(request))
    return {"ok": True, "message": "密码已修改"}


@router.post("/forgot-password")
async def forgot_password(data: ForgotPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    email = (data.email or "").strip()
    if not email:
        raise HTTPException(status_code=400, detail="请输入邮箱")
    r = await db.execute(select(User).where(User.email == email))
    user = r.scalar_one_or_none()
    if not user or user.disabled:
        return {"ok": True, "message": "若该邮箱已注册，将收到重置链接"}
    import secrets
    user.reset_token = secrets.token_urlsafe(32)
    user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()
    from ..config import FRONTEND_URL
    frontend_base = FRONTEND_URL or str(request.base_url).rstrip("/")
    reset_link = f"{frontend_base}/reset-password?token={user.reset_token}"
    try:
        from ..routes.settings import _get_smtp_config
        config = await _get_smtp_config(db)
        if config.get("smtp_host") and config.get("from_addr"):
            from ..services.email_service import _send_sync
            body = f"您正在找回 TestPilot 登录密码。请在一小时内打开以下链接设置新密码（密码须包含字母和数字）：\n\n{reset_link}\n\n如非本人操作请忽略。\n\n（若系统未配置 FRONTEND_URL，请将链接中的域名改为实际前端地址）"
            to_emails = [email]
            result = _send_sync(to_emails, "[TestPilot] 找回密码", body, config)
            if not result.get("ok"):
                return {"ok": False, "message": result.get("message", "邮件发送失败")}
        else:
            return {"ok": False, "message": "系统未配置邮件，无法发送重置链接。请联系管理员。"}
    except Exception as e:
        logger.error("forgot_password email error: %s", e)
        return {"ok": False, "message": str(e)}
    return {"ok": True, "message": "若该邮箱已注册，将收到重置链接"}


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, request: Request, db: AsyncSession = Depends(get_db)):
    ok, err = validate_password_rules(data.new_password)
    if not ok:
        raise HTTPException(status_code=400, detail=err)
    r = await db.execute(select(User).where(User.reset_token == data.token))
    user = r.scalar_one_or_none()
    if not user or not user.reset_token_expires or user.reset_token_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="链接无效或已过期")
    user.password_hash = hash_password(data.new_password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    logger.info("Password reset via token user=%s id=%d", user.username, user.id)
    from ..audit import log_audit
    await log_audit(db, user_id=user.id, action="reset_password", target_type="user", target_id=user.id, ip_address=_client_ip(request))
    return {"ok": True, "message": "密码已重置"}
