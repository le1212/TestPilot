# Jira REST API 集成：推送缺陷、同步状态、测试连接
import base64
from typing import Any
import httpx

# severity -> Jira priority name
SEVERITY_TO_PRIORITY = {
    "blocker": "Highest",
    "critical": "High",
    "major": "Medium",
    "minor": "Low",
    "trivial": "Lowest",
}

# status -> Jira status name (可选，用于同步)
STATUS_MAP = {
    "open": "To Do",
    "in_progress": "In Progress",
    "fixed": "Done",
    "verified": "Done",
    "closed": "Done",
    "rejected": "Won't Do",
}


def _auth_headers(config: dict) -> dict:
    (config.get("jira_url") or "").rstrip("/")
    username = config.get("jira_username") or ""
    api_token = config.get("jira_api_token") or ""
    token = base64.b64encode(f"{username}:{api_token}".encode()).decode()
    return {"Authorization": f"Basic {token}", "Content-Type": "application/json"}


def test_connection(config: dict) -> dict:
    """测试 Jira 连接。返回 { "ok": bool, "message": str, "projects": list }"""
    url = (config.get("jira_url") or "").rstrip("/")
    if not url:
        return {"ok": False, "message": "请填写 Jira 地址"}
    try:
        with httpx.Client(timeout=15) as client:
            r = client.get(
                f"{url}/rest/api/2/myself",
                headers=_auth_headers(config),
            )
            if r.status_code == 200:
                proj_r = client.get(f"{url}/rest/api/2/project", headers=_auth_headers(config))
                projects = []
                if proj_r.status_code == 200:
                    projects = [{"key": p.get("key"), "name": p.get("name")} for p in proj_r.json()]
                return {"ok": True, "message": "连接成功", "projects": projects}
            return {"ok": False, "message": r.text[:500] or f"HTTP {r.status_code}"}
    except Exception as e:
        return {"ok": False, "message": str(e)[:500]}


def push_defect_to_jira(defect: Any, config: dict) -> dict:
    """
    将平台缺陷推送到 Jira。defect 需有 title, description, severity, steps_to_reproduce, expected_result, actual_result, screenshots(list of url).
    返回 { "ok": bool, "jira_key": str | None, "message": str }
    """
    url = (config.get("jira_url") or "").rstrip("/")
    project_key = config.get("jira_project_key") or ""
    if not url or not project_key:
        return {"ok": False, "jira_key": None, "message": "未配置 Jira 地址或项目 Key"}

    desc_parts = []
    if getattr(defect, "description", None):
        desc_parts.append(defect.description)
    if getattr(defect, "steps_to_reproduce", None):
        desc_parts.append("\n\n复现步骤:\n" + defect.steps_to_reproduce)
    if getattr(defect, "expected_result", None):
        desc_parts.append("\n预期结果: " + defect.expected_result)
    if getattr(defect, "actual_result", None):
        desc_parts.append("\n实际结果: " + defect.actual_result)
    description = "\n".join(desc_parts) or "无描述"

    priority = SEVERITY_TO_PRIORITY.get((getattr(defect, "severity", None) or "major").lower(), "Medium")

    payload = {
        "fields": {
            "project": {"key": project_key},
            "summary": getattr(defect, "title", "缺陷"),
            "description": description,
            "issuetype": {"name": "Bug"},
            "priority": {"name": priority},
        }
    }

    try:
        with httpx.Client(timeout=15) as client:
            r = client.post(
                f"{url}/rest/api/2/issue",
                headers=_auth_headers(config),
                json=payload,
            )
            if r.status_code in (200, 201):
                data = r.json()
                key = data.get("key")
                return {"ok": True, "jira_key": key, "message": f"已创建 {key}"}
            return {"ok": False, "jira_key": None, "message": (r.text or f"HTTP {r.status_code}")[:500]}
    except Exception as e:
        return {"ok": False, "jira_key": None, "message": str(e)[:500]}


def sync_defect_status(defect: Any, config: dict) -> dict:
    """从 Jira 拉取最新状态并映射回平台状态。返回 { "ok": bool, "jira_status": str, "platform_status": str }"""
    jira_key = getattr(defect, "jira_key", None) or ""
    if not jira_key:
        return {"ok": False, "jira_status": "", "platform_status": "", "message": "该缺陷未关联 Jira"}

    url = (config.get("jira_url") or "").rstrip("/")
    if not url:
        return {"ok": False, "jira_status": "", "platform_status": "", "message": "未配置 Jira 地址"}

    try:
        with httpx.Client(timeout=10) as client:
            r = client.get(
                f"{url}/rest/api/2/issue/{jira_key}?fields=status",
                headers=_auth_headers(config),
            )
            if r.status_code != 200:
                return {"ok": False, "jira_status": "", "platform_status": "", "message": r.text[:300]}

            data = r.json()
            jira_status = (data.get("fields") or {}).get("status", {}).get("name", "")
            # 映射：Done/Closed -> closed，Resolved -> fixed，Ready for Test/待验证 -> pending_verification，In Progress -> in_progress，Verified -> verified，其余 -> open
            jira_lower = jira_status.lower()
            if "done" in jira_lower or "closed" in jira_lower:
                platform_status = "closed"
            elif "resolved" in jira_lower or "fixed" in jira_lower:
                platform_status = "fixed"
            elif "verified" in jira_lower:
                platform_status = "verified"
            elif "ready" in jira_lower and ("test" in jira_lower or "verify" in jira_lower) or "pending" in jira_lower and "verif" in jira_lower:
                platform_status = "pending_verification"
            elif "progress" in jira_lower:
                platform_status = "in_progress"
            else:
                platform_status = "open"

            return {"ok": True, "jira_status": jira_status, "platform_status": platform_status}
    except Exception as e:
        return {"ok": False, "jira_status": "", "platform_status": "", "message": str(e)[:300]}
