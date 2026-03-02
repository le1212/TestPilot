"""数据库查询辅助：LIKE 通配符转义等。"""


def escape_like(s: str) -> str:
    """转义 SQL LIKE 中的 % 和 _，避免用户输入被当作通配符。"""
    if not s:
        return s
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
