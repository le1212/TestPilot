# -*- coding: utf-8 -*-
"""
AI 服务：支持 OpenAI、开放兼容接口（通义/智谱等）、模拟演示三种模式。
API Key 从环境变量读取：AI_API_KEY（开放兼容时用）或 OPENAI_API_KEY（OpenAI 时用）。
"""
import os
import json
from typing import Optional

# 最大单次请求 token 估算（中文约 1.5 字/token），用于截断过长输入
MAX_INPUT_CHARS = 12000
# 生成用例/步骤时的输入与条数限制
MAX_REQUIREMENT_CHARS = 6000
MAX_GENERATED_CASES = 15
MAX_GENERATED_STEPS = 50
MAX_EXISTING_CASE_NAMES = 30

# Web 步骤动作：与 web_executor、前端 CaseEditor webActions 保持一致，AI 提示与规范化均基于此
WEB_ACTIONS = (
    "open", "sleep", "click", "input", "clear", "select", "wait",
    "assert_text", "assert_visible", "assert_title", "screenshot",
    "scroll", "hover", "switch_frame", "execute_js",
)
WEB_ACTIONS_SET = frozenset(WEB_ACTIONS)
# AI 常出的非标准名 → 系统支持名
WEB_ACTION_ALIASES = {
    "navigate": "open",
    "wait_for_page": "wait", "wait_for_presence": "wait", "wait_for_element": "wait",
    "assert_element": "assert_visible", "assert": "assert_visible",
    "execute_script": "execute_js", "set_network": "execute_js",
}


def _normalize_web_action(action: str) -> str:
    """将任意 action 规范为系统支持的 WEB_ACTIONS 之一：先别名，再语义回退，最后用 wait（避免误用 open 改变语义）。"""
    if not action or not isinstance(action, str):
        return "wait"
    a = action.strip().lower()
    a = WEB_ACTION_ALIASES.get(a, a)
    if a in WEB_ACTIONS_SET:
        return a
    # 语义回退：按含义映射到最接近的系统动作，避免一律 open 造成错误
    if "assert" in a or "check" in a or "verify" in a:
        if "title" in a:
            return "assert_title"
        if "text" in a:
            return "assert_text"
        return "assert_visible"
    if a in ("input", "type", "fill", "set_text", "send_key", "send_keys", "enter"):
        return "input"
    if a in ("click", "submit", "press", "tap", "button", "submit_form"):
        return "click"
    if a in ("sleep", "delay"):
        return "sleep"
    if "wait" in a:
        return "wait"
    if "scroll" in a:
        return "scroll"
    if a in ("screenshot", "capture", "snapshot"):
        return "screenshot"
    if a in ("hover", "mouse_over", "mouseover"):
        return "hover"
    if a in ("select", "dropdown", "choose", "option"):
        return "select"
    if "clear" in a or a in ("clear_text", "reset"):
        return "clear"
    if a in ("execute_js", "execute_script", "script", "eval", "js"):
        return "execute_js"
    if a in ("open", "navigate", "go", "visit", "get", "url"):
        return "open"
    if "frame" in a or "iframe" in a:
        return "switch_frame"
    # 无法推断时用 wait，副作用最小，不会误打开页面
    return "wait"

# 资深测试专家角色：用于所有 AI 分析/生成，提升建议的专业度与深度
SYSTEM_ROLE_SENIOR_TEST = """你是一位资深测试架构师/高级测试工程师，具备多年测试设计、自动化与质量保障经验。请以专业、严谨的方式作答：
- 输出结构化、可执行、可追溯的内容
- 遵循测试设计最佳实践（等价类、边界值、场景覆盖、风险驱动）
- 考虑正向与异常场景、边界与并发等
- 使用准确的技术术语，避免模糊表述
- 给出的建议需具备可落地性，并注明优先级或风险等级"""


def _get_config_from_db(db_getter) -> dict:
    """从数据库读取 key=ai 的配置。db_getter 为 async 函数 () -> dict。"""
    try:
        import asyncio
        loop = asyncio.get_event_loop()
        if loop.is_running():
            return {}
        return loop.run_until_complete(db_getter())
    except Exception:
        return {}


async def get_ai_config(db) -> dict:
    """从 SystemConfig 读取 AI 配置。"""
    from sqlalchemy import select
    from ..models import SystemConfig
    r = await db.execute(select(SystemConfig).where(SystemConfig.key == "ai"))
    row = r.scalar_one_or_none()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except Exception:
        return {}


def _messages_with_system(user_content: str, system: Optional[str] = None) -> list:
    """构建带系统角色的消息列表，用于专业级 AI 分析/生成。"""
    system = system or SYSTEM_ROLE_SENIOR_TEST
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": user_content},
    ]


def _truncate(text: str, max_chars: int = MAX_INPUT_CHARS) -> str:
    if not text or len(text) <= max_chars:
        return text or ""
    return text[:max_chars] + "\n\n...[内容已截断]"


def _extract_json_from_response(raw: str, expect: str = "array"):
    """
    从 AI 回复中提取并解析 JSON。expect 为 "object" 或 "array"。
    返回 (parsed, error)：成功时 error 为 None，失败时 parsed 为 None、error 为简短原因。
    """
    if not raw or not (raw := raw.strip()):
        return None, "回复为空"
    s = raw
    if "```" in s:
        for part in s.split("```"):
            part = part.strip()
            if part.startswith("json"):
                part = part[4:].strip()
            if part.startswith("{") or part.startswith("["):
                s = part
                break
    s = s.strip()
    try:
        obj = json.loads(s)
        if expect == "object" and not isinstance(obj, dict):
            return None, "期望对象，得到其他类型"
        if expect == "array" and not isinstance(obj, list):
            return None, "期望数组，得到其他类型"
        return obj, None
    except json.JSONDecodeError as e:
        return None, f"JSON 解析失败: {e}"


def _default_fallback_case() -> dict:
    """解析失败或无有效用例时的兜底单条用例。带 _fallback 标识供前端提示。"""
    return {
        "name": "示例接口用例",
        "description": "请根据需求在用例管理中编辑完善",
        "type": "api",
        "priority": "medium",
        "config": {
            "method": "GET",
            "url": "/api/health",
            "headers": {},
            "params": {},
            "body_type": "json",
            "body": "",
            "assertions": [{"type": "status_code", "field": "", "operator": "equals", "expected": "200"}],
            "timeout_seconds": 30,
        },
        "_fallback": True,
    }


async def chat(messages: list[dict], max_tokens: int = 2000, db=None, config: dict | None = None) -> str:
    """
    调用配置的 AI 模型，返回助手回复文本。
    messages: [{"role": "user"|"system"|"assistant", "content": "..."}]
    若未配置或 provider 为 mock，返回模拟内容。
    config: 可预先传入已读取的 AI 配置，避免在长时间调用期间占用 db session。
    """
    if config is None:
        config = await get_ai_config(db) if db else {}
    provider = (config.get("provider") or "").strip().lower()
    model = (config.get("model") or "gpt-4o-mini").strip()
    base_url = (config.get("base_url") or "").strip()
    # 优先使用系统设置中保存的 API Key（全局），其次环境变量
    api_key = (config.get("ai_api_key") or "").strip() or os.environ.get("AI_API_KEY") or os.environ.get("OPENAI_API_KEY") or ""

    if provider == "mock" or not provider:
        return _mock_response(messages)

    if not api_key:
        return "未配置 API Key。请到「系统设置 → AI 模型」中填写 API Key（全局生效），或选择「模拟演示」。"

    use_openai = provider == "openai"
    if use_openai:
        base_url = None
    else:
        # 开放兼容：dashscope、deepseek、其他，用 base_url + api_key
        if not base_url and provider == "dashscope":
            base_url = "https://dashscope.aliyuncs.com/compatible-mode/v1"
        if not base_url and provider == "deepseek":
            base_url = "https://api.deepseek.com/v1"
        if provider == "openai_compatible" and not base_url:
            return "请先在系统设置中填写「其他开放兼容接口」的 API 接口地址（Base URL）。"

    try:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(
            api_key=api_key or "sk-dummy",
            base_url=base_url if not use_openai else None,
        )
        resp = await client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
        )
        if resp.choices and len(resp.choices) > 0:
            return (resp.choices[0].message.content or "").strip()
        return ""
    except Exception as e:
        err_str = str(e).lower()
        if "model not exist" in err_str or "invalid_request_error" in err_str and "model" in err_str:
            return (
                "AI 调用失败：当前配置的「模型名称」在该提供商下不存在或已变更。\n\n"
                "请到「系统设置 → AI 模型」中检查并修改「模型名称」，必须与所选提供商文档一致，例如：\n"
                "• OpenAI：gpt-4o-mini、gpt-4o、gpt-3.5-turbo\n"
                "• DeepSeek：deepseek-chat、deepseek-reasoner\n"
                "• 通义：qwen-turbo、qwen-plus、qwen-max\n"
                "若不确定，请到对应平台官网查看当前可用的模型 ID。"
            )
        return f"AI 调用失败: {str(e)}"


def _mock_response(messages: list[dict]) -> str:
    """模拟回复，便于无 API Key 时体验功能。"""
    last = ""
    for m in reversed(messages):
        if m.get("role") == "user" and m.get("content"):
            last = m["content"]
            break
    if "日志" in last or "log" in last.lower():
        return "【模拟分析】\n这是一段测试执行日志的模拟分析结果。实际使用时请在「系统设置」中配置 AI 提供商与 API Key（如 OpenAI、通义千问等），即可获得真实的日志摘要、异常定位与原因推测。"
    if "报告" in last or "report" in last.lower():
        return "【模拟分析】\n这是测试报告的模拟分析。配置真实 AI 后，将得到失败原因归纳、风险点与改进建议。"
    if "缺陷" in last or "defect" in last.lower():
        return "【模拟】配置 AI 后可根据失败执行自动生成缺陷标题、复现步骤与预期/实际结果。"
    if "用例" in last or "case" in last.lower():
        return "【模拟】配置 AI 后可根据需求描述或接口文档自动生成测试用例建议。"
    return "【模拟演示】请到系统设置中配置 AI 模型与 API Key 以使用真实分析能力。"


async def analyze_log(log_text: str, db) -> str:
    """分析执行日志，返回结构化摘要、根因分析与排查建议。"""
    from .prompts import prompt_analyze_log
    log_text = _truncate(log_text or "")
    prompt = prompt_analyze_log(log_text)
    return await chat(_messages_with_system(prompt), max_tokens=1200, db=db)


async def analyze_report(summary: dict, details: list, db) -> str:
    """分析测试报告，返回专业结论、失败归纳、风险点与改进建议。"""
    from .prompts import prompt_analyze_report
    summary_str = json.dumps(summary, ensure_ascii=False, indent=2)[:4000]
    failed = [d for d in (details or []) if d.get("status") in ("failed", "error")]
    failed_str = json.dumps(failed[:20], ensure_ascii=False, indent=2)[:6000]
    prompt = prompt_analyze_report(summary_str, failed_str)
    return await chat(_messages_with_system(prompt), max_tokens=1500, db=db)


def _ensure_str(val, max_len: int = 2000) -> str:
    """将缺陷字段值规范化为字符串。"""
    if val is None:
        return ""
    if isinstance(val, str):
        return val[:max_len]
    if isinstance(val, (list, tuple)):
        return "\n".join(f"{i+1}. {x}" if isinstance(x, str) else str(x) for i, x in enumerate(val[:50]))[:max_len]
    return str(val)[:max_len]


async def generate_defect_from_execution(
    case_name: str,
    case_type: str,
    status: str,
    result: dict,
    logs: str,
    db,
) -> dict:
    """根据失败执行生成缺陷字段。使用统一解析，解析失败时返回兜底并带 _fallback 标识。"""
    from .prompts import prompt_generate_defect
    logs_short = _truncate(logs or "", 3000)
    result_str = json.dumps(result, ensure_ascii=False)[:2000]
    prompt = prompt_generate_defect(case_name, case_type, status, result_str, logs_short)
    raw = await chat(_messages_with_system(prompt), max_tokens=800, db=db)
    obj, parse_err = _extract_json_from_response(raw, expect="object")
    if parse_err is not None or not isinstance(obj, dict):
        fallback = {
            "title": f"{case_name} 执行失败",
            "description": raw[:500] if raw else "由 AI 根据执行记录生成，请完善描述。",
            "steps_to_reproduce": "1. 执行该用例\n2. 查看执行结果与日志",
            "expected_result": "用例通过",
            "actual_result": (logs_short[:500] if logs_short else "见执行日志"),
            "severity": "major",
            "_fallback": True,
        }
        return fallback
    out = {
        "title": (obj.get("title") or "执行失败")[:200],
        "description": _ensure_str(obj.get("description"), 2000),
        "steps_to_reproduce": _ensure_str(obj.get("steps_to_reproduce"), 2000),
        "expected_result": _ensure_str(obj.get("expected_result"), 1000),
        "actual_result": _ensure_str(obj.get("actual_result"), 1000),
        "severity": (obj.get("severity") or "major").lower(),
    }
    if out["severity"] not in ("blocker", "critical", "major", "minor", "trivial"):
        out["severity"] = "major"
    return out


async def generate_cases(requirement: str, project_name: str, existing_case_names: list, preferred_type: Optional[str] = None, db=None) -> tuple[list[dict], list[str]]:
    """根据需求描述生成测试用例建议。返回 (cases, warnings)。"""
    from .prompts import prompt_generate_cases
    requirement = _truncate(requirement or "", MAX_REQUIREMENT_CHARS)
    existing = "\n".join((existing_case_names or [])[:MAX_EXISTING_CASE_NAMES])
    type_hint = ""
    if preferred_type and preferred_type.strip().lower() in ("api", "web", "app", "miniapp"):
        type_hint = f"\n- 本批用例请优先生成类型为 **{preferred_type.strip().lower()}** 的用例（若需求不适用可生成其他类型）。"
    prompt = prompt_generate_cases(requirement, project_name, existing, type_hint)
    raw = await chat(_messages_with_system(prompt), max_tokens=4000, db=db)
    arr, parse_err = _extract_json_from_response(raw, expect="array")
    if parse_err is not None:
        return ([_default_fallback_case()], [f"解析失败（{parse_err}），已使用默认示例，请人工修改。"])
    if not isinstance(arr, list):
        arr = [arr]
    out = []
    warnings = []
    try:
        for i, item in enumerate(arr[:MAX_GENERATED_CASES]):
            if not isinstance(item, dict):
                continue
            ctype = (item.get("type") or "api").lower()
            if ctype not in ("api", "web", "app", "miniapp"):
                ctype = "api"
            priority = (item.get("priority") or "medium").lower()
            if priority not in ("low", "medium", "high", "critical"):
                priority = "medium"
            raw_cfg = item.get("config") if isinstance(item.get("config"), dict) else {}
            config = _normalize_case_config(ctype, raw_cfg)
            out.append({
                "name": (item.get("name") or f"生成的用例 {i+1}")[:200],
                "description": (item.get("description") or "")[:500],
                "type": ctype,
                "priority": priority,
                "config": config,
            })
        return (out, warnings)
    except Exception as e:
        return ([_default_fallback_case()], [f"处理失败（{e}），已使用默认示例，请人工修改。"])


def _normalize_case_config(case_type: str, raw: dict) -> dict:
    """将 AI 返回的 config 规范化为平台可执行的格式（含完整步骤与断言结构）。"""
    if case_type == "api":
        method = (raw.get("method") or "GET").upper()
        url = (raw.get("url") or "").strip()
        headers = raw.get("headers")
        if not isinstance(headers, dict):
            headers = {}
        params = raw.get("params")
        if not isinstance(params, dict):
            params = {}
        body_type = raw.get("body_type") or "json"
        body = raw.get("body") if raw.get("body") is not None else ""
        assertions = raw.get("assertions") or []
        if isinstance(assertions, list):
            normalized_assertions = []
            for a in assertions:
                if isinstance(a, dict) and a.get("type"):
                    normalized_assertions.append({
                        "type": a.get("type", "status_code"),
                        "field": a.get("field", ""),
                        "operator": a.get("operator", "equals"),
                        "expected": str(a.get("expected", "")),
                    })
                elif isinstance(a, str):
                    if "=" in a:
                        k, v = a.split("=", 1)
                        k, v = k.strip().lower(), v.strip()
                        if k == "status_code":
                            normalized_assertions.append({"type": "status_code", "field": "", "operator": "equals", "expected": v})
                        else:
                            normalized_assertions.append({"type": "json_path", "field": k, "operator": "equals", "expected": v})
                    else:
                        normalized_assertions.append({"type": "status_code", "field": "", "operator": "equals", "expected": "200"})
            assertions = normalized_assertions
        if not assertions:
            assertions = [{"type": "status_code", "field": "", "operator": "equals", "expected": "200"}]
        return {
            "method": method,
            "url": url,
            "headers": headers,
            "params": params,
            "body_type": body_type,
            "body": body,
            "assertions": assertions,
            "timeout_seconds": int(raw.get("timeout_seconds", 30)) if isinstance(raw.get("timeout_seconds"), (int, float)) else 30,
        }
    if case_type == "web":
        steps = raw.get("steps")
        if not isinstance(steps, list):
            steps = [{"action": "open", "value": raw.get("url") or raw.get("value") or "", "locator": "", "description": ""}]
        # 统一 Web 步骤 action 为系统支持词（别名 + 语义回退）
        normalized_steps = []
        for s in steps:
            if not isinstance(s, dict):
                continue
            a = (s.get("action") or "").strip().lower()
            if a != "__group__":
                a = _normalize_web_action(a)
            val = str(s.get("value") or ("未命名分组" if a == "__group__" else "")).strip()
            desc = (s.get("description") or "").strip()
            # 断言可见：value 为空时用 description 或默认，保证值/输出有内容
            if a == "assert_visible" and not val:
                val = desc or "元素可见"
            normalized_steps.append({
                "action": a,
                "locator": (s.get("locator") or "").strip(),
                "value": val,
                "description": desc,
            })
        return {"browser": raw.get("browser") or "edge", "steps": normalized_steps}
    if case_type == "app":
        steps = raw.get("steps")
        if not isinstance(steps, list):
            steps = []
        return {"platform": raw.get("platform") or "android", "steps": steps}
    if case_type == "miniapp":
        steps = raw.get("steps")
        if not isinstance(steps, list):
            steps = []
        return {"steps": steps}
    return raw


async def generate_steps(requirement: str, case_type: str, db) -> dict:
    """根据需求描述，在当前用例类型下生成测试步骤或配置建议。返回 { steps, config_suggestion?, warnings? }。"""
    from .prompts import prompt_generate_steps_api, prompt_generate_steps_ui
    requirement = _truncate(requirement or "", MAX_REQUIREMENT_CHARS)
    case_type = (case_type or "api").lower()
    if case_type not in ("api", "web", "app", "miniapp"):
        case_type = "api"

    if case_type == "api":
        prompt = prompt_generate_steps_api(requirement)
    else:
        action_hint = {
            "web": f"action **必须且仅从**本系统支持的下列值中选一：{', '.join(WEB_ACTIONS)}。禁止使用 assert、navigate、wait_for_page、assert_element、execute_script（用 execute_js）、set_network 等非列表值。locator 必须为具体 CSS 或 xpath=//...。",
            "app": "action 可选: tap, input, swipe, long_press, wait, assert_text, back, screenshot, launch, close_app。locator 用 resource-id、content-desc 或 xpath。",
            "miniapp": "action 可选: navigate, tap, input, swipe, wait, assert_text, screenshot, call_api, get_data。locator 用组件属性或语义。",
        }.get(case_type, "")
        prompt = prompt_generate_steps_ui(case_type, requirement, action_hint)

    raw = await chat(_messages_with_system(prompt), max_tokens=2500, db=db)
    if case_type == "api":
        obj, parse_err = _extract_json_from_response(raw, expect="object")
        if parse_err is not None or not isinstance(obj, dict):
            resp = _default_steps_response(case_type)
            resp["warnings"] = [f"解析失败（{parse_err or '非对象'}），已使用默认示例，请人工修改。"]
            return resp
        config = _normalize_case_config("api", obj)
        return {"steps": [], "config_suggestion": config}
    # web / app / miniapp：优先解析为对象（含 case_suggestion + steps），兼容仅数组
    obj, parse_err_obj = _extract_json_from_response(raw, expect="object")
    arr, _ = _extract_json_from_response(raw, expect="array")
    case_suggestion = None
    if isinstance(obj, dict) and isinstance(obj.get("steps"), list):
        arr = obj["steps"]
        cs = obj.get("case_suggestion")
        if isinstance(cs, dict) and (cs.get("name") or cs.get("description") or cs.get("priority")):
            case_suggestion = {
                "name": (cs.get("name") or "").strip()[:200] or None,
                "description": (cs.get("description") or "").strip()[:500] or None,
                "priority": (cs.get("priority") or "medium").strip().lower() or "medium",
            }
            if case_suggestion["priority"] not in ("low", "medium", "high", "critical"):
                case_suggestion["priority"] = "medium"
    elif not isinstance(arr, list):
        arr = []
    steps = []
    steps_warnings = []
    for i, item in enumerate(arr[:MAX_GENERATED_STEPS]):
        if not isinstance(item, dict):
            continue
        action = (item.get("action") or "").strip()
        action_lower = action.lower() if action else "open"
        # Web 类型：强制为系统支持动作（别名 + 语义回退，未知用 wait）
        if case_type == "web" and action_lower:
            action_lower = _normalize_web_action(action_lower)
        locator = (item.get("locator") or "").strip()
        value = item.get("value")
        if value is None:
            value = ""
        value = str(value).strip()
        description = (item.get("description") or "").strip()
        # 保留分组步骤 __group__，便于前端按分组展示
        if action_lower == "__group__":
            steps.append({
                "action": "__group__",
                "locator": "",
                "value": value or "未命名分组",
                "description": description,
            })
            continue
        # 断言可见：若 AI 未填 value，用 description 或默认描述，保证「值/输出」有内容
        if action_lower == "assert_visible" and not value:
            value = description or "元素可见"
        steps.append({
            "action": action_lower or "open",
            "locator": locator,
            "value": value,
            "description": description,
        })
    if not steps:
        steps = [{"action": "open", "locator": "", "value": "", "description": "根据需求补充 URL 与步骤"}]
        steps_warnings.append("解析失败，已使用默认步骤，请人工修改。")
    result = {"steps": steps}
    if case_suggestion is not None:
        result["case_suggestion"] = case_suggestion
    if steps_warnings:
        result["warnings"] = steps_warnings
    return result


def _default_steps_response(case_type: str) -> dict:
    """解析失败时的兜底返回，与 _normalize_case_config 产出一致。"""
    if case_type == "api":
        config = _normalize_case_config("api", {
            "method": "GET",
            "url": "/api/example",
            "headers": {},
            "params": {},
            "body_type": "json",
            "body": "",
            "assertions": [],
        })
        return {"steps": [], "config_suggestion": config}
    return {"steps": [{"action": "open", "locator": "", "value": "", "description": "根据需求补充 URL 与步骤"}]}
