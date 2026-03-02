"""
App 类型用例执行引擎：使用 Appium 驱动移动设备执行步骤。
用例 config 格式: { "platform": "android"|"ios", "steps": [ { "action", "locator", "value", "description" } ], "appium_server_url", "capabilities" }
"""
import time
from typing import Any


def execute_app(
    config: dict,
    env_variables: dict = None,
) -> dict:
    """
    同步执行 App 步骤（由路由层用 asyncio.to_thread 调用）。
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
    platform = (config.get("platform") or "android").lower()
    server_url = (config.get("appium_server_url") or "http://127.0.0.1:4723").rstrip("/")
    capabilities = config.get("capabilities") or {}
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

    try:
        from appium import webdriver
        from appium.webdriver.common.appiumby import AppiumBy
    except ImportError:
        return {
            "result": {
                "passed": False,
                "error": "未安装 Appium 客户端。请执行: pip install Appium-Python-Client",
                "steps_result": [],
            },
            "logs": "[错误] 未安装 Appium-Python-Client。请执行: pip install Appium-Python-Client\n并确保本机已启动 Appium Server（如 appium -a 127.0.0.1 -p 4723）及模拟器/真机。\n",
            "duration_ms": int((time.time() - start) * 1000),
        }

    default_caps = {
        "platformName": "Android" if platform == "android" else "iOS",
        "automationName": "UiAutomator2" if platform == "android" else "XCUITest",
        "deviceName": capabilities.get("deviceName") or ("Android" if platform == "android" else "iPhone"),
    }
    caps = {**default_caps, **capabilities}

    driver = None
    try:
        try:
            from appium.options.android import UiAutomator2Options
            from appium.options.ios import XCUITestOptions
            opts = UiAutomator2Options().load_capabilities(caps) if platform == "android" else XCUITestOptions().load_capabilities(caps)
            driver = webdriver.Remote(server_url, options=opts)
        except (ImportError, AttributeError):
            driver = webdriver.Remote(server_url, desired_capabilities=caps)
        logs.append(f"[连接] Appium Server: {server_url}")

        def _by(locator: str):
            """将定位串解析为 (By, value)。支持 id=、xpath=、text=、content-desc=、class= 等前缀。"""
            s = (locator or "").strip()
            if s.startswith("id="):
                return (AppiumBy.ID, s[3:].strip())
            if s.startswith("xpath="):
                return (AppiumBy.XPATH, s[6:].strip())
            if s.startswith("text="):
                return (AppiumBy.ANDROID_UIAUTOMATOR, f'new UiSelector().text("{s[5:].strip()}")') if platform == "android" else (AppiumBy.IOS_PREDICATE, f'label == "{s[5:].strip()}"')
            if s.startswith("content-desc="):
                return (AppiumBy.ACCESSIBILITY_ID, s[13:].strip())
            if s.startswith("class="):
                return (AppiumBy.CLASS_NAME, s[6:].strip())
            return (AppiumBy.XPATH, s if s else "//*")

        for i, step in enumerate(steps):
            action = (step.get("action") or "").strip().lower()
            locator_str = _replace_vars((step.get("locator") or "").strip())
            value = _replace_vars((step.get("value") or "").strip())
            desc = (step.get("description") or "").strip() or f"步骤{i+1}"

            step_ok = True
            step_log = ""
            try:
                if action == "launch":
                    step_log = "应用已通过 capabilities 启动"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "close_app":
                    if driver:
                        driver.terminate_app(driver.current_package)
                    step_log = "已关闭应用"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "tap" or action == "click":
                    if not locator_str:
                        step_ok = False
                        step_log = "点击需要填写定位器"
                    else:
                        by, val = _by(locator_str)
                        el = driver.find_element(by=by, value=val)
                        el.click()
                        step_log = f"已点击: {locator_str}"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "input":
                    if not locator_str:
                        step_ok = False
                        step_log = "输入需要填写定位器"
                    else:
                        by, val = _by(locator_str)
                        el = driver.find_element(by=by, value=val)
                        el.send_keys(value)
                        step_log = f"已输入: {value[:50]}..."
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "swipe":
                    # value 格式可选: "left|right|up|down" 或 "x1,y1,x2,y2"
                    w = driver.get_window_size()
                    if "left" in value:
                        driver.swipe(w["width"] * 3 // 4, w["height"] // 2, w["width"] // 4, w["height"] // 2, 300)
                    elif "right" in value:
                        driver.swipe(w["width"] // 4, w["height"] // 2, w["width"] * 3 // 4, w["height"] // 2, 300)
                    elif "up" in value:
                        driver.swipe(w["width"] // 2, w["height"] * 3 // 4, w["width"] // 2, w["height"] // 4, 300)
                    else:
                        driver.swipe(w["width"] // 2, w["height"] // 4, w["width"] // 2, w["height"] * 3 // 4, 300)
                    step_log = f"已滑动: {value or 'down'}"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "long_press":
                    if not locator_str:
                        step_ok = False
                        step_log = "长按需要填写定位器"
                    else:
                        from selenium.webdriver.common.action_chains import ActionChains
                        by, val = _by(locator_str)
                        el = driver.find_element(by=by, value=val)
                        ActionChains(driver).click_and_hold(el).pause(1.5).release().perform()
                        step_log = "已长按"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "wait":
                    sel = locator_str or "//*"
                    by, val = _by(sel)
                    timeout = int(value) / 1000.0 if value.isdigit() else 5.0
                    from selenium.webdriver.support.ui import WebDriverWait
                    from selenium.webdriver.support import expected_conditions as EC
                    WebDriverWait(driver, min(timeout, 30)).until(EC.presence_of_element_located((by, val)))
                    step_log = f"已等待元素: {locator_str}"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "assert_text":
                    if not locator_str:
                        step_ok = False
                        step_log = "断言文本需要填写定位器"
                    else:
                        by, val = _by(locator_str)
                        el = driver.find_element(by=by, value=val)
                        text = (el.text or "").strip()
                        if value and value not in text:
                            step_ok = False
                            step_log = f"断言失败: 期望包含「{value}」，实际「{text[:100]}」"
                        else:
                            step_log = f"断言通过: {text[:80]}..."
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "back":
                    driver.back()
                    step_log = "已返回"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "screenshot":
                    step_log = "截图已跳过(未保存路径)"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                else:
                    if action:
                        step_ok = False
                        step_log = f"未知操作: {action}"
                    else:
                        step_log = "跳过(未选择操作)"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

            except Exception as e:
                step_ok = False
                step_log = str(e)
                logs.append(f"[步骤{i+1}] {desc} - [异常] {step_log}")
                error_msg = step_log

            steps_result.append({"index": i + 1, "action": action, "passed": step_ok, "message": step_log})
            if not step_ok:
                passed = False
                break

    except Exception as e:
        passed = False
        error_msg = str(e)
        logs.append(f"[错误] {error_msg}")
        if "Connection refused" in str(e) or "Failed to establish" in str(e):
            logs.append("[提示] 请确认 Appium Server 已启动（如 appium -a 127.0.0.1 -p 4723）且设备/模拟器已连接。")
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass

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
