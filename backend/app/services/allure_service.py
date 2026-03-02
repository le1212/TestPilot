import os
import json
import uuid
import hashlib
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Any


def _epoch_ms(dt: Any) -> int:
    if not dt:
        return int(datetime.now(timezone.utc).timestamp() * 1000)
    if isinstance(dt, str):
        # best effort parse
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except Exception:
            return int(datetime.now(timezone.utc).timestamp() * 1000)
    if getattr(dt, "tzinfo", None) is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


class AllureService:
    """
    Convert TestPilot executions into Allure2 results and (optionally) HTML report.

    Notes:
    - 生成 HTML 需要本机已安装 Allure CLI（`allure` 命令可用）。
    - 即使没有 CLI，也会生成 allure-results，便于接入外部 Allure Server。
    """

    @staticmethod
    def base_dir() -> str:
        # backend/
        return os.path.dirname(os.path.dirname(os.path.dirname(__file__)))

    @staticmethod
    def results_dir(report_id: int) -> str:
        return os.path.join(AllureService.base_dir(), "allure-results", str(report_id))

    @staticmethod
    def html_dir(report_id: int) -> str:
        return os.path.join(AllureService.base_dir(), "allure-reports", str(report_id))

    @staticmethod
    def allure_cmd() -> str | None:
        return shutil.which("allure")

    @staticmethod
    def generate_results(report: Any) -> dict[str, Any]:
        """
        report: TestReport ORM instance with .details list
        returns: {"ok": bool, "results_dir": str, "generated": int}
        """
        rid = int(getattr(report, "id"))
        out_dir = AllureService.results_dir(rid)
        os.makedirs(out_dir, exist_ok=True)

        # minimal environment file
        env_path = os.path.join(out_dir, "environment.properties")
        try:
            with open(env_path, "w", encoding="utf-8") as f:
                f.write("generator=TestPilot\n")
                f.write(f"report_id={rid}\n")
        except Exception:
            pass

        generated = 0
        for item in (getattr(report, "details") or []):
            try:
                case_name = item.get("case_name") or f"case_{item.get('case_id')}"
                suite = f"project_{getattr(report, 'project_id', '')}"
                full_name = f"{suite}::{case_name}"

                exec_id = item.get("execution_id")
                raw_status = (item.get("status") or "unknown").lower()
                status = "passed"
                if raw_status == "passed":
                    status = "passed"
                elif raw_status == "failed":
                    status = "failed"
                elif raw_status in ("error", "broken"):
                    status = "broken"
                else:
                    status = "skipped"

                history_id = hashlib.md5(full_name.encode("utf-8")).hexdigest()
                result_uuid = uuid.uuid4().hex

                start_ms = _epoch_ms(item.get("created_at"))
                stop_ms = start_ms + int(item.get("duration_ms") or 0)

                # attachments
                attachments = []
                log_text = item.get("logs") or ""
                if log_text:
                    att_name = f"{result_uuid}-log.txt"
                    with open(os.path.join(out_dir, att_name), "w", encoding="utf-8") as f:
                        f.write(log_text)
                    attachments.append({"name": "执行日志", "source": att_name, "type": "text/plain"})

                error_text = item.get("error")
                if error_text:
                    att_name = f"{result_uuid}-error.txt"
                    with open(os.path.join(out_dir, att_name), "w", encoding="utf-8") as f:
                        f.write(str(error_text))
                    attachments.append({"name": "错误信息", "source": att_name, "type": "text/plain"})

                # 执行截图：从 screenshot_paths 复制到 allure-results 并加入附件
                for idx, abs_path in enumerate(item.get("screenshot_paths") or [], 1):
                    try:
                        if os.path.isfile(abs_path):
                            att_name = f"{result_uuid}-screenshot-{idx}.png"
                            dest = os.path.join(out_dir, att_name)
                            shutil.copy2(abs_path, dest)
                            attachments.append({"name": f"截图 {idx}", "source": att_name, "type": "image/png"})
                    except Exception:
                        pass

                assertions = item.get("assertions") or []
                step_status = "passed" if status == "passed" else ("failed" if status == "failed" else "broken")
                steps = []
                if assertions:
                    for a in assertions:
                        steps.append({
                            "name": a.get("message") or "断言",
                            "status": "passed" if a.get("passed") else "failed",
                            "stage": "finished",
                        })
                else:
                    steps.append({"name": "执行", "status": step_status, "stage": "finished"})

                result_obj = {
                    "uuid": result_uuid,
                    "historyId": history_id,
                    "name": case_name,
                    "fullName": full_name,
                    "status": status,
                    "stage": "finished",
                    "start": start_ms,
                    "stop": stop_ms,
                    "labels": [
                        {"name": "suite", "value": suite},
                        {"name": "framework", "value": "TestPilot"},
                        {"name": "language", "value": "python"},
                    ],
                    "links": [],
                    "steps": steps,
                    "attachments": attachments,
                    "parameters": [
                        {"name": "execution_id", "value": str(exec_id)},
                        {"name": "case_type", "value": str(item.get("case_type") or "")},
                    ],
                }

                with open(os.path.join(out_dir, f"{result_uuid}-result.json"), "w", encoding="utf-8") as f:
                    json.dump(result_obj, f, ensure_ascii=False)

                # container (simple)
                container_obj = {
                    "uuid": uuid.uuid4().hex,
                    "name": case_name,
                    "children": [result_uuid],
                    "start": start_ms,
                    "stop": stop_ms,
                }
                with open(os.path.join(out_dir, f"{container_obj['uuid']}-container.json"), "w", encoding="utf-8") as f:
                    json.dump(container_obj, f, ensure_ascii=False)

                generated += 1
            except Exception:
                continue

        return {"ok": True, "results_dir": out_dir, "generated": generated}

    @staticmethod
    def generate_html(report_id: int) -> dict[str, Any]:
        cmd = AllureService.allure_cmd()
        if not cmd:
            return {"ok": False, "reason": "未检测到 Allure CLI（allure 命令不可用）"}

        results_dir = AllureService.results_dir(report_id)
        out_dir = AllureService.html_dir(report_id)
        os.makedirs(out_dir, exist_ok=True)

        try:
            subprocess.run(
                [cmd, "generate", results_dir, "-o", out_dir, "--clean"],
                check=True,
                capture_output=True,
                text=True,
            )
            return {"ok": True, "html_dir": out_dir, "index": os.path.join(out_dir, "index.html")}
        except subprocess.CalledProcessError as e:
            return {"ok": False, "reason": (e.stderr or e.stdout or str(e))[:2000]}

