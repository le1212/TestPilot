"""按自然日（Asia/Shanghai）解析日期，供列表日期筛选使用。"""
from datetime import date as date_type, datetime, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

TZ = ZoneInfo("Asia/Shanghai")


def iso_utc(dt: Optional[datetime]) -> Optional[str]:
    """将 datetime 序列化为 ISO 字符串并统一为 UTC（带 Z），供前端正确转本地时间。"""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def parse_date_to_utc_range(date_str: Optional[str]) -> Optional[tuple[datetime, datetime]]:
    """将 YYYY-MM-DD 转为该日 0:00~24:00 在上海时区对应的 UTC 范围。无效则返回 None。"""
    if not date_str or not isinstance(date_str, str):
        return None
    try:
        parts = date_str.strip().split("-")
        if len(parts) != 3:
            return None
        y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
        day = date_type(y, m, d)
        start = datetime(day.year, day.month, day.day, tzinfo=TZ)
        end = start + timedelta(days=1)
        return (start.astimezone(timezone.utc), end.astimezone(timezone.utc))
    except (ValueError, TypeError):
        return None
