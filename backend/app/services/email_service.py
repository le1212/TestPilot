"""
邮件通知服务：执行结果与缺陷流转通知。
依赖 SystemConfig 中 key="smtp" 的配置：host, port, user, password, from_addr, to_emails[], enabled.
"""
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


def _send_sync(to_emails: list[str], subject: str, body: str, config: dict) -> dict:
    """同步发送邮件，返回 {ok, message}。"""
    if not to_emails:
        return {"ok": False, "message": "未配置收件人"}
    host = (config.get("smtp_host") or "").strip()
    if not host:
        return {"ok": False, "message": "未配置 SMTP 主机"}
    try:
        port = int(config.get("smtp_port") or 465)
    except (ValueError, TypeError):
        port = 465
    user = (config.get("smtp_user") or "").strip()
    password = config.get("smtp_password") or ""
    from_addr = (config.get("from_addr") or user or "testpilot@localhost").strip()
    use_ssl = config.get("smtp_ssl", True)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = ", ".join(to_emails)
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        if use_ssl:
            with smtplib.SMTP_SSL(host, port) as server:
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, to_emails, msg.as_string())
        else:
            with smtplib.SMTP(host, port) as server:
                if port == 587:
                    server.starttls()
                if user and password:
                    server.login(user, password)
                server.sendmail(from_addr, to_emails, msg.as_string())
        return {"ok": True, "message": "发送成功"}
    except Exception as e:
        return {"ok": False, "message": str(e)}


def send_execution_notification(config: dict, case_name: str, status: str, duration_ms: int, logs_preview: str = "") -> dict:
    """发送执行结果通知。config 需包含 smtp 配置及 to_emails（或 notification_emails）。"""
    to_emails = config.get("to_emails") or config.get("notification_emails") or []
    if isinstance(to_emails, str):
        to_emails = [e.strip() for e in to_emails.split(",") if e.strip()]
    subject = f"[TestPilot] 执行结果 - {case_name} - {status}"
    body = f"""TestPilot 执行结果通知

用例名称: {case_name}
执行状态: {status}
耗时: {duration_ms} ms

--- 日志摘要 ---
{logs_preview[:1500] if logs_preview else '(无)'}
"""
    return _send_sync(to_emails, subject, body, config)


def send_defect_notification(config: dict, title: str, status: str, severity: str, jira_key: str = "", action: str = "创建") -> dict:
    """发送缺陷流转通知。action 可为 创建/更新/推送Jira/同步Jira。"""
    to_emails = config.get("to_emails") or config.get("notification_emails") or []
    if isinstance(to_emails, str):
        to_emails = [e.strip() for e in to_emails.split(",") if e.strip()]
    subject = f"[TestPilot] 缺陷{action} - {title}"
    body = f"""TestPilot 缺陷流转通知

操作: {action}
标题: {title}
状态: {status}
严重程度: {severity}
{f'Jira: {jira_key}' if jira_key else ''}
"""
    return _send_sync(to_emails, subject, body, config)


def send_allure_ready_notification(config: dict, to_email: str, report_name: str, report_id: Optional[int] = None) -> dict:
    """发送 Allure 报告生成成功邮件。to_email 为报告创建人邮箱。"""
    to_email = (to_email or "").strip()
    if not to_email:
        return {"ok": False, "message": "收件人邮箱为空"}
    subject = "[TestPilot] Allure 报告生成成功"
    body = f"""TestPilot 通知

报告「{report_name}」的 Allure HTML 已生成完成。
请登录 TestPilot 在「测试报告」中打开该报告详情，即可查看 Allure 报告。
"""
    return _send_sync([to_email], subject, body, config)
