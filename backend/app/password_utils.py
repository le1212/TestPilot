"""Password hashing with bcrypt (no passlib, compatible with bcrypt 5.x)."""
import bcrypt
import secrets
import string


def _has_letter_and_digit(s: str) -> bool:
    if not s or len(s) < 6:
        return False
    has_letter = any(c.isalpha() for c in s)
    has_digit = any(c.isdigit() for c in s)
    return has_letter and has_digit


def validate_password_rules(password: str) -> tuple[bool, str]:
    """密码须包含字母和数字。返回 (是否通过, 错误信息)。"""
    if not password or len(password) < 6:
        return False, "密码至少6位"
    if not _has_letter_and_digit(password):
        return False, "密码必须同时包含字母和数字"
    return True, ""


def generate_login_account() -> str:
    """生成9位数字登录账号（不含前导0）。"""
    first_8 = "".join(secrets.choice(string.digits[1:]) for _ in range(8))
    return first_8 + secrets.choice(string.digits)


def generate_initial_password(length: int = 9) -> str:
    """生成指定长度的字母+数字密码。"""
    chars = string.ascii_letters + string.digits
    while True:
        pwd = "".join(secrets.choice(chars) for _ in range(length))
        if _has_letter_and_digit(pwd):
            return pwd


def hash_password(password: str) -> str:
    """Return bcrypt hash as string (safe for DB)."""
    if len(password) > 72:
        password = password[:72]
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, stored_hash: str) -> bool:
    """Return True if password matches stored bcrypt hash."""
    if not stored_hash:
        return False
    if len(password) > 72:
        password = password[:72]
    try:
        return bcrypt.checkpw(password.encode("utf-8"), stored_hash.encode("utf-8"))
    except Exception:
        return False
