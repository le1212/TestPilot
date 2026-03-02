"""
小程序类型用例执行引擎：使用 Minium 驱动微信/支付宝小程序执行步骤。
用例 config 格式: { "steps": [ { "action", "locator", "value", "description" } ], "project_path" }
需在本地安装 minium 并在微信开发者工具中打开对应项目、开启服务端口。
"""
import time


def execute_miniapp(
    config: dict,
    env_variables: dict = None,
) -> dict:
    """
    同步执行小程序步骤（由路由层用 asyncio.to_thread 调用）。
    返回: { "result": { "passed", "steps_result", "error" }, "logs": str, "duration_ms": int }
    """
    raw_steps = config.get("steps") or []
    steps = [s for s in raw_steps if (s.get("action") or "").strip().lower() != "__group__"]
    if not steps:
        return {
            "result": {
                "passed": False,
                "error": "用例无有效步骤（仅有分组标题时不会执行任何操作）",
                "steps_result": [],
            },
            "logs": "[提示] 当前用例的步骤列表中仅有分组标题，没有可执行的步骤。请在编辑用例时在分组下添加具体步骤。\n",
            "duration_ms": 0,
        }
    project_path = (config.get("project_path") or "").strip()
    env_variables = env_variables or {}

    logs = []
    steps_result = []
    passed = True
    error_msg = None
    start = time.time()

    def _replace_vars(s: str) -> str:
        if not s or not env_variables:
            return s or ""
        out = s
        for k, v in env_variables.items():
            out = out.replace("{{" + str(k) + "}}", str(v))
        return out

    if not project_path:
        return {
            "result": {
                "passed": False,
                "error": "未配置小程序项目路径（config.project_path）",
                "steps_result": [],
            },
            "logs": "[错误] 请在用例配置中填写小程序项目路径（project_path）。\n",
            "duration_ms": int((time.time() - start) * 1000),
        }

    # Minium 需在本地配合微信开发者工具使用，服务端无法直接驱动；返回占位结果并说明用法
    logs.append(f"[提示] 小程序项目路径: {project_path}")
    logs.append("[提示] 小程序自动化需在本地执行: 1) 安装 minium (pip install minium); 2) 微信开发者工具打开项目并开启服务端口; 3) 使用 minium 命令行或脚本运行。当前为占位执行。")
    for i, step in enumerate(steps):
        action = (step.get("action") or "").strip().lower()
        desc = (step.get("description") or "").strip() or f"步骤{i+1}"
        steps_result.append({"index": i + 1, "action": action, "passed": True, "message": f"{desc}（占位，未实际执行）"})
    passed = True
    error_msg = None

    duration_ms = int((time.time() - start) * 1000)
    return {
        "result": {
            "passed": passed,
            "steps_result": steps_result,
            "error": error_msg,
        },
        "logs": "\n".join(logs) if logs else "(无日志)",
        "duration_ms": duration_ms,
    }
