# -*- coding: utf-8 -*-
"""
AI 提示词模板：生成用例、生成步骤、生成缺陷、分析日志、分析报告等。
职责：给定输入 → 得到 prompt 文本，不关心调用与解析。
"""


def prompt_analyze_log(log_text: str) -> str:
    """分析执行日志的 prompt。"""
    return f"""请根据以下测试执行日志，从资深测试工程师视角给出**结构化分析**（中文）：

1. **执行摘要**：一两句话说明执行结果（通过/失败/超时等）及关键现象。
2. **根因分析**：若存在失败或错误，指出最可能的根本原因（如环境、数据、接口变更、断言条件、超时、权限等），并引用日志中的关键报错或堆栈。
3. **影响范围**：该问题可能影响哪些用例或模块（若可推断）。
4. **排查建议**：按优先级给出 2～4 条可落地的排查步骤（如检查配置、重试、查看依赖服务、对比基线等）。

请用语专业、结论明确，避免泛泛而谈。

日志内容：
```
{log_text}
```"""


def prompt_analyze_report(summary_str: str, failed_str: str) -> str:
    """分析测试报告的 prompt。"""
    return f"""请以**测试负责人/质量分析师**视角，根据以下测试报告摘要与失败/错误用例信息，用中文给出**专业分析报告**：

1. **整体结论**：通过率、执行概况；核心问题一句话概括（如「接口超时集中」「登录依赖失败导致连锁失败」）。
2. **失败归纳**：按根因或类型归纳失败用例（如环境类、数据类、断言类、接口变更类），并指出高频失败点。
3. **风险与影响**：本次失败对发布/回归的风险等级（高/中/低）及建议（是否阻塞发布、建议修复范围）。
4. **改进建议**：2～4 条可落地建议（如补充用例、环境治理、接口契约、重试策略、分层执行等），并标注优先级。

报告摘要：
{summary_str}

失败/错误用例（部分）：
{failed_str}
"""


def prompt_generate_defect(case_name: str, case_type: str, status: str, result_str: str, logs_short: str) -> str:
    """根据失败执行生成缺陷的 prompt。"""
    return f"""根据以下失败/错误的测试执行信息，以**资深测试工程师**标准生成一条缺陷的完整字段。请**仅输出一个 JSON 对象**，不要其他说明或 markdown 标记。字段说明与规范如下：

- title: 缺陷标题（中文，简明扼要，包含模块/场景+现象，如「登录接口-超时返回 504」）
- description: 缺陷描述（1～2 句，说明触发条件与现象）
- steps_to_reproduce: 复现步骤（编号列表，步骤清晰可操作，便于开发复现）
- expected_result: 预期结果（根据用例或接口契约描述）
- actual_result: 实际结果（从执行结果/日志中提炼，可引用关键报错或状态码）
- severity: 严格从以下选一。blocker=阻塞主流程/无法测试；critical=核心功能不可用；major=重要功能异常；minor=次要功能问题；trivial=界面/文案等

用例名称：{case_name}
用例类型：{case_type}
执行状态：{status}

执行结果（result）：
{result_str}

执行日志（部分）：
{logs_short}
"""


def prompt_generate_cases(
    requirement: str,
    project_name: str,
    existing: str,
    type_hint: str = "",
) -> str:
    """根据需求描述生成测试用例的 prompt。"""
    return f"""请以**资深测试架构师**标准，根据以下需求或说明生成「完整、可执行」的测试用例。要求：
- 覆盖需求中的主要功能点与关键路径，并适当考虑**正向、异常、边界**（如必填校验、错误码、空数据、超时等）。
- 用例命名与描述具体、可追溯，优先级与业务风险一致（核心流程 high/critical，次要 low/medium）。
- 每条用例必须包含完整 name、description、type、priority、config，不留空占位。{type_hint}

项目名：{project_name}
现有用例名称（避免重复）：{existing or "无"}

请**仅输出一个 JSON 数组**，不要其他说明。每个元素为对象，包含：
- name: 用例名称（必填，中文）。按「模块/场景-验证点」命名，如「登录-正确账号密码」「订单列表-分页边界」「搜索-无结果提示」。禁止「用例1」「未命名」。
- description: 用例描述（必填，一句）。说明验证什么、预期结果。
- type: 在 api/web/app/miniapp 中选一，默认 api。
- priority: 在 low/medium/high/critical 中选一。
- config: 对象。type 为 api 时必含：method, url, headers(可空对象), params(可空对象), body_type("json"), body(可选), assertions(数组)。assertions 项格式：{{"type":"status_code","field":"","operator":"equals","expected":"200"}} 或 {{"type":"json_path","field":"data.id","operator":"equals","expected":"1"}}。type 为 web/app/miniapp 时 config 含 steps 数组；可插入分组步骤 {{"action":"__group__","value":"分组名","locator":"","description":""}}；普通步骤含 action、locator（必填具体定位）、value、description。locator 须为可执行表达式：Web 用 CSS（#id、input[name="x"]、button[type="submit"]）或 xpath=//...；App 用 resource-id/content-desc/xpath；禁止「待填写」「请填写」等占位。

需求或说明：
```
{requirement}
```
"""


def prompt_generate_steps_api(requirement: str) -> str:
    """生成 API 类型步骤/配置的 prompt。"""
    return f"""请以**高级测试工程师**标准，根据以下需求或接口说明生成一条**可直接执行**的 API 测试配置。要求：method/url/params/body 与需求一致，assertions 覆盖状态码及关键业务字段（如 code、data 等）。

请**仅输出一个 JSON 对象**，不要其他说明。对象包含：
- method: 请求方法（GET/POST/PUT/DELETE 等）
- url: 完整或相对 URL
- headers: 对象（如 Content-Type、Authorization 等，可空）
- params: 对象，query 参数（可空）
- body_type: "json"
- body: 请求体（JSON 字符串，POST/PUT 时按需求填写）
- assertions: 数组。至少包含 status_code 断言；建议增加 json_path 断言校验业务字段，格式 {{"type":"status_code","field":"","operator":"equals","expected":"200"}} 或 {{"type":"json_path","field":"data.id","operator":"equals","expected":"1"}}

需求或说明：
```
{requirement}
```
"""


def prompt_generate_steps_ui(case_type: str, requirement: str, action_hint: str = "") -> str:
    """生成 Web/App/Miniapp 类型步骤的 prompt。action_hint 由调用方根据 case_type 传入。"""
    return f"""请以**高级测试工程师**标准，根据以下需求或功能说明生成「用例建议」和「完整、可执行」的测试步骤（{case_type} 类型）。步骤需覆盖前置、主流程与校验，locator 必须具体可执行，禁止占位符。

请**仅输出一个 JSON 对象**，不要其他说明。对象包含：
- case_suggestion: 对象，必填。含 name（用例名称，中文）、description（一句，验证点与预期）、priority（low/medium/high/critical 之一）。
- steps: 数组，必填。可插入分组项 {{"action":"__group__","value":"分组名称","locator":"","description":""}}（如「前置准备」「核心操作」「结果校验」）。普通步骤每项包含：
  - action: 步骤动作（见下方）
  - locator: **必填**，具体定位表达式。Web：CSS 或 xpath=//...；App：resource-id/content-desc/xpath；禁止「待填写」「请填写」。
  - value: open 填 URL；input 填输入内容；assert_text 填期望文本；assert_visible 填期望可见的元素描述（如「登录按钮」「成功提示」），便于展示与追溯，必填简短描述不可留空；sleep 填秒数
  - description: 该步操作目的（可选）

{action_hint}

需求或说明：
```
{requirement}
```
"""
