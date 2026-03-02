"""
Web 类型用例执行引擎：使用 Selenium 驱动浏览器执行步骤。
用例 config 格式: { "browser": "edge"|"chrome", "steps": [ { "action", "locator", "value", "description" } ] }
定位器支持：css=、xpath=、id=、name=（元素 name 属性），不写前缀时按 CSS 选择器处理。
"""
import time

# 可选浏览器：edge（默认）、chrome
DEFAULT_BROWSER = "edge"


def _by_selector(locator_str: str):
    """解析定位串为 (By.XXX, value)。支持 css=、xpath=、id=、name=，默认按 CSS。"""
    from selenium.webdriver.common.by import By
    s = (locator_str or "").strip()
    if s.startswith("xpath="):
        return (By.XPATH, s[6:].strip())
    if s.startswith("id="):
        return (By.ID, s[3:].strip())
    if s.startswith("name="):
        return (By.NAME, s[5:].strip())
    if s.startswith("css="):
        return (By.CSS_SELECTOR, s[4:].strip())
    return (By.CSS_SELECTOR, s if s else "body")


def execute_web(
    config: dict,
    env_base_url: str = "",
    env_variables: dict = None,
) -> dict:
    """
    同步执行 Web 步骤（由路由层用 asyncio.to_thread 调用）。
    返回: { "result": { "passed", "steps_result", "error" }, "logs": str, "duration_ms": int }
    """
    raw_steps = config.get("steps") or []
    # 前端分组标题（action __group__）仅用于展示，执行时过滤掉
    steps = [s for s in raw_steps if (s.get("action") or "").strip().lower() != "__group__"]
    if not steps:
        return {
            "result": {
                "passed": False,
                "error": "用例无有效步骤（仅有分组标题时不会执行任何操作）",
                "steps_result": [],
            },
            "logs": "[提示] 当前用例的步骤列表中仅有分组标题（如「前置条件」「登录功能」），没有可执行的步骤。请在编辑用例时在分组下添加具体步骤。\n",
            "duration_ms": 0,
        }
    browser = (config.get("browser") or DEFAULT_BROWSER).strip().lower()
    if browser not in ("chrome", "edge"):
        browser = DEFAULT_BROWSER
    base_url = (config.get("base_url") or env_base_url or "").rstrip("/")
    env_variables = env_variables or {}

    logs = []
    steps_result = []
    passed = True
    error_msg = None
    screenshot_base64 = None  # 最后一张截图（兼容旧前端）
    screenshots = []  # 多张截图列表：步骤中的「截图」、失败时、结束时
    start = time.time()

    def _replace_vars(s: str) -> str:
        if not s or not env_variables:
            return s or ""
        out = s
        for k, v in env_variables.items():
            out = out.replace("{{" + str(k) + "}}", str(v))
        return out

    try:
        from selenium import webdriver
        from selenium.webdriver.support.ui import WebDriverWait, Select
        from selenium.webdriver.support import expected_conditions as EC
        from selenium.webdriver.common.action_chains import ActionChains
        from selenium.common.exceptions import TimeoutException as SeleniumTimeoutException
    except ImportError:
        return {
            "result": {
                "passed": False,
                "error": "未安装 Selenium。请执行: pip install selenium webdriver-manager",
                "steps_result": [],
            },
            "logs": "[错误] 未安装 selenium 或 webdriver-manager。请在 backend 目录执行: pip install selenium webdriver-manager\n",
            "duration_ms": int((time.time() - start) * 1000),
        }

    driver = None
    try:
        if browser == "edge":
            import os
            import shutil
            from selenium.webdriver.edge.options import Options as EdgeOptions
            from selenium.webdriver.edge.service import Service as EdgeService
            # 驱动路径：环境变量 EDGE_DRIVER_PATH 或 backend 目录下 .edge_driver_path 文件内容
            def _get_edge_driver_path():
                p = os.environ.get("EDGE_DRIVER_PATH", "").strip()
                if p and os.path.isfile(p):
                    return p
                try:
                    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    path_file = os.path.join(backend_root, ".edge_driver_path")
                    if os.path.isfile(path_file):
                        with open(path_file, "r", encoding="utf-8") as f:
                            p = (f.read() or "").strip()
                        if p and os.path.isfile(p):
                            return p
                except Exception:
                    pass
                return None
            options = EdgeOptions()
            options.add_argument("--headless")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-software-rasterizer")
            options.add_argument("--disable-extensions")
            options.add_argument("--window-size=1280,720")
            options.page_load_strategy = "eager"  # 不等全部资源加载，DOM 就绪即返回，减少超时/崩溃
            options.add_experimental_option("excludeSwitches", ["ignore-certificate-errors"])
            def _make_edge_service():
                edge_path = _get_edge_driver_path()
                if edge_path:
                    return EdgeService(executable_path=edge_path)
                return EdgeService()
            def _clear_driver_caches():
                cleared = []
                home = os.path.expanduser("~")
                for name in [".wdm", os.path.join(".cache", "selenium")]:
                    path = os.path.join(home, name)
                    if os.path.isdir(path):
                        try:
                            shutil.rmtree(path)
                            cleared.append(path)
                        except Exception:
                            pass
                return cleared
            def _start_edge():
                return webdriver.Edge(service=_make_edge_service(), options=options)
            try:
                driver = _start_edge()
            except Exception as e1:
                err_msg = str(e1).lower()
                # Unable to obtain driver / driver_location：无可用 Edge 驱动时尝试回退到 Chrome
                if "unable to obtain driver" in err_msg or "driver_location" in err_msg or "driver for microsoftedge" in err_msg:
                    logs.append("[驱动] Edge 驱动不可用，尝试使用 Chrome: " + str(e1)[:80])
                    try:
                        from selenium.webdriver.chrome.options import Options as ChromeOptions
                        co = ChromeOptions()
                        co.add_argument("--headless")
                        co.add_argument("--no-sandbox")
                        co.add_argument("--disable-dev-shm-usage")
                        co.add_argument("--disable-gpu")
                        co.add_argument("--disable-software-rasterizer")
                        co.add_argument("--disable-extensions")
                        co.add_argument("--window-size=1280,720")
                        co.page_load_strategy = "eager"
                        driver = webdriver.Chrome(options=co)
                        logs.append("[浏览器] 已回退为 Chrome（Edge 驱动不可用）")
                    except Exception:
                        raise e1
                elif "version" in err_msg or "session not created" in err_msg:
                    cleared = _clear_driver_caches()
                    if cleared:
                        logs.append("[驱动] 已清除缓存: " + ", ".join(cleared) + "，正在重试…")
                    try:
                        driver = _start_edge()
                    except Exception:
                        raise e1
                else:
                    raise e1
            if driver and "Chrome" not in (logs[-1] if logs else ""):
                logs.append("[浏览器] Microsoft Edge (Chromium)")
                if _get_edge_driver_path():
                    logs.append("[驱动] 使用 .edge_driver_path 或 EDGE_DRIVER_PATH 指定路径")
                else:
                    logs.append("[驱动] 由 Selenium Manager 自动匹配当前 Edge 版本")
        else:
            import os
            from selenium.webdriver.chrome.options import Options as ChromeOptions
            from selenium.webdriver.chrome.service import Service as ChromeService
            def _get_chrome_driver_path():
                p = os.environ.get("CHROME_DRIVER_PATH", "").strip()
                if p and os.path.isfile(p):
                    return p
                try:
                    backend_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
                    path_file = os.path.join(backend_root, ".chrome_driver_path")
                    if os.path.isfile(path_file):
                        with open(path_file, "r", encoding="utf-8") as f:
                            p = (f.read() or "").strip()
                        if p and os.path.isfile(p):
                            return p
                except Exception:
                    pass
                return None
            options = ChromeOptions()
            options.add_argument("--headless")
            options.add_argument("--no-sandbox")
            options.add_argument("--disable-dev-shm-usage")
            options.add_argument("--disable-gpu")
            options.add_argument("--disable-software-rasterizer")
            options.add_argument("--disable-extensions")
            options.add_argument("--window-size=1280,720")
            options.page_load_strategy = "eager"
            options.add_experimental_option("excludeSwitches", ["ignore-certificate-errors"])
            def _start_chrome():
                path = _get_chrome_driver_path()
                if path:
                    return webdriver.Chrome(service=ChromeService(executable_path=path), options=options)
                return webdriver.Chrome(options=options)
            try:
                driver = _start_chrome()
            except Exception as e1:
                err_msg = str(e1).lower()
                if "unable to obtain driver" in err_msg or "driver_location" in err_msg or "driver for chrome" in err_msg:
                    logs.append("[驱动] Selenium Manager 未获取到 Chrome 驱动，尝试 webdriver-manager: " + str(e1)[:80])
                    try:
                        from webdriver_manager.chrome import ChromeDriverManager
                        path = ChromeDriverManager().install()
                        driver = webdriver.Chrome(service=ChromeService(executable_path=path), options=options)
                        logs.append("[驱动] 已通过 webdriver-manager 安装并启用 ChromeDriver")
                    except Exception:
                        raise RuntimeError(
                            "Chrome 驱动获取失败。请任选其一：1) 在 backend 目录新建 .chrome_driver_path 文件，内容写 chromedriver.exe 的完整路径；"
                            " 2) 设置环境变量 CHROME_DRIVER_PATH 指向 chromedriver；"
                            " 3) 确保本机已安装 Chrome 并联网，以便 webdriver-manager 下载驱动。原始错误: " + str(e1)
                        ) from e1
                else:
                    raise
            logs.append("[浏览器] Chrome")
            if _get_chrome_driver_path():
                logs.append("[驱动] 使用 .chrome_driver_path 或 CHROME_DRIVER_PATH 指定路径")
            else:
                logs.append("[驱动] 由 Selenium Manager 或 webdriver-manager 匹配当前 Chrome 版本")
        driver.implicitly_wait(10)
        driver.set_page_load_timeout(30)

        for i, step in enumerate(steps):
            action = (step.get("action") or "").strip().lower()
            # 兼容别名后仅允许系统动作，未识别的按语义回退，最后用 wait（避免误用 open）
            _alias = {"navigate": "open", "wait_for_page": "wait", "wait_for_presence": "wait", "wait_for_element": "wait",
                      "assert_element": "assert_visible", "assert": "assert_visible", "execute_script": "execute_js", "set_network": "execute_js"}
            action = _alias.get(action, action) or "wait"
            _allowed = {"open", "sleep", "click", "input", "clear", "select", "wait", "assert_text", "assert_visible", "assert_title", "screenshot", "scroll", "hover", "switch_frame", "execute_js"}
            if action not in _allowed:
                # 简单语义回退，与 ai_service 一致
                if "assert" in action or "check" in action:
                    action = "assert_visible"
                elif action in ("input", "type", "fill"):
                    action = "input"
                elif action in ("click", "submit", "tap"):
                    action = "click"
                elif "scroll" in action:
                    action = "scroll"
                elif action in ("screenshot", "capture"):
                    action = "screenshot"
                elif action in ("hover", "mouse_over"):
                    action = "hover"
                elif action in ("select", "dropdown"):
                    action = "select"
                elif "clear" in action:
                    action = "clear"
                elif action in ("execute_js", "script"):
                    action = "execute_js"
                else:
                    action = "wait"
            locator_str = _replace_vars((step.get("locator") or "").strip())
            value = _replace_vars((step.get("value") or "").strip())
            desc = (step.get("description") or "").strip() or f"步骤{i+1}"

            step_ok = True
            step_log = ""
            try:
                if action == "open":
                    url = value or locator_str
                    if base_url and url and not url.startswith("http"):
                        url = base_url + ("/" if url else "") + url.lstrip("/")
                    if not url:
                        step_ok = False
                        step_log = "打开页面需要填写 URL 或定位框"
                    else:
                        try:
                            driver.get(url)
                            step_log = f"已打开: {url}"
                        except SeleniumTimeoutException:
                            try:
                                driver.execute_script("window.stop();")
                            except Exception:
                                pass
                            step_log = f"已打开(加载超时已停止): {url}"
                            logs.append(f"[步骤{i+1}] {desc} - [提示] 页面加载超时，已停止加载继续执行")
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "click":
                    if not locator_str:
                        step_ok = False
                        step_log = "点击需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.element_to_be_clickable((by, val)))
                        el.click()
                        step_log = f"已点击: {locator_str}"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "input":
                    if not locator_str:
                        step_ok = False
                        step_log = "输入需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, val)))
                        el.clear()
                        el.send_keys(value)
                        step_log = f"已输入: {value[:50]}..."
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "clear":
                    if not locator_str:
                        step_ok = False
                        step_log = "清除需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, val)))
                        el.clear()
                        step_log = "已清除"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "select":
                    if not locator_str:
                        step_ok = False
                        step_log = "选择下拉需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, val)))
                        Select(el).select_by_visible_text(value) if value else Select(el).select_by_index(0)
                        step_log = f"已选择: {value}"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "wait":
                    sel = locator_str or "body"
                    timeout_s = min((int(value) / 1000.0) if value.isdigit() else 5.0, 30.0)
                    by, val = _by_selector(sel)
                    WebDriverWait(driver, timeout_s).until(EC.visibility_of_element_located((by, val)))
                    step_log = f"已等待元素: {sel}"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "sleep":
                    # 固定等待 N 秒（值/输入内容填秒数，如 2 或 3），不依赖元素定位，常用于打开页面后等待加载
                    sec = 2.0
                    if value and str(value).replace(".", "").isdigit():
                        sec = min(float(value), 30.0)
                    if sec > 0:
                        time.sleep(sec)
                    step_log = f"已固定等待 {sec} 秒"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "assert_text":
                    if not locator_str:
                        step_ok = False
                        step_log = "断言文本需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, val)))
                        text = (el.text or "").strip()
                        if value and value not in text:
                            step_ok = False
                            step_log = f"断言失败: 期望包含「{value}」，实际「{text[:100]}」"
                        else:
                            step_log = f"断言通过: {text[:80]}..."
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "assert_visible":
                    if not locator_str:
                        step_ok = False
                        step_log = "断言可见需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = driver.find_element(by, val)
                        if not el.is_displayed():
                            step_ok = False
                            step_log = f"元素不可见: {locator_str}"
                        else:
                            step_log = "元素可见"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "assert_title":
                    # 断言页面标题：value 填期望标题或部分文本，locator 可不填
                    actual = (driver.title or "").strip()
                    if value and value not in actual:
                        step_ok = False
                        step_log = f"断言标题失败: 期望包含「{value}」，实际「{actual[:100]}」"
                    else:
                        step_log = f"断言标题通过: {actual[:80]}..."
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "screenshot":
                    try:
                        b64 = driver.get_screenshot_as_base64()
                        screenshots.append(b64)
                        screenshot_base64 = b64
                        step_log = "已保存截图"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")
                    except Exception as ex:
                        step_log = f"截图失败: {ex}"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "scroll":
                    px = int(value) if value and value.isdigit() else 300
                    driver.execute_script(f"window.scrollBy(0, {px});")
                    step_log = "已滚动"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "hover":
                    if not locator_str:
                        step_ok = False
                        step_log = "悬停需要填写定位器"
                    else:
                        by, val = _by_selector(locator_str)
                        el = WebDriverWait(driver, 10).until(EC.presence_of_element_located((by, val)))
                        ActionChains(driver).move_to_element(el).perform()
                        step_log = "已悬停"
                        logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "switch_frame":
                    if locator_str.isdigit():
                        driver.switch_to.frame(int(locator_str))
                    elif locator_str:
                        by, val = _by_selector(locator_str)
                        frame_el = driver.find_element(by, val)
                        driver.switch_to.frame(frame_el)
                    else:
                        driver.switch_to.default_content()
                    step_log = "已切换 iframe"
                    logs.append(f"[步骤{i+1}] {desc} - {step_log}")

                elif action == "execute_js":
                    js = value or locator_str
                    if js:
                        ret = driver.execute_script(js)
                        step_log = f"执行结果: {ret}"
                    else:
                        step_ok = False
                        step_log = "执行JS需要填写脚本"
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
                # 步骤失败时立即截图，便于定位错误
                if driver:
                    try:
                        b64 = driver.get_screenshot_as_base64()
                        screenshots.append(b64)
                        screenshot_base64 = b64
                        logs.append("[截图] 已保存失败时页面截图")
                    except Exception:
                        pass

            steps_result.append({"index": i + 1, "action": action, "passed": step_ok, "message": step_log})
            if not step_ok:
                passed = False
                break

    except Exception as e:
        passed = False
        error_msg = str(e)
        logs.append(f"[错误] {error_msg}")
    finally:
        if driver:
            try:
                # 结束时再截一张图（若尚未截图则作为结果图）
                b64 = None
                try:
                    b64 = driver.get_screenshot_as_base64()
                except Exception:
                    pass
                if b64:
                    screenshots.append(b64)
                    if screenshot_base64 is None:
                        screenshot_base64 = b64
                    if not any("[截图]" in ln for ln in logs):
                        logs.append("[截图] 已保存执行结束时页面截图")
            except Exception:
                pass
            try:
                driver.quit()
            except Exception:
                pass

    duration_ms = int((time.time() - start) * 1000)
    result_payload = {
        "passed": passed,
        "steps_result": steps_result,
        "error": error_msg,
    }
    if screenshot_base64:
        result_payload["screenshot_base64"] = screenshot_base64
    if screenshots:
        result_payload["screenshots"] = screenshots
    return {
        "result": result_payload,
        "logs": "\n".join(logs) if logs else "(无日志)",
        "duration_ms": duration_ms,
    }
