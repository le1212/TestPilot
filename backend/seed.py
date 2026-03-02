import httpx
import json

c = httpx.Client(base_url="http://localhost:8001")

env = c.post("/api/environments", json={
    "project_id": 1, "name": "Test Env",
    "base_url": "https://jsonplaceholder.typicode.com",
    "variables": {"user_id": "1"},
    "headers": {},
    "description": "JSONPlaceholder API"
}).json()
print("Environment:", env["id"], env["name"])

case1 = c.post("/api/cases", json={
    "project_id": 1, "name": "Get User Info",
    "type": "api", "priority": "high", "status": "active",
    "tags": ["smoke", "user"],
    "description": "Test getting user info from JSONPlaceholder",
    "config": {
        "method": "GET",
        "url": "https://jsonplaceholder.typicode.com/users/1",
        "headers": {},
        "params": {},
        "body": "",
        "body_type": "none",
        "assertions": [
            {"type": "status_code", "field": "", "operator": "equals", "expected": "200"},
            {"type": "json_path", "field": "name", "operator": "equals", "expected": "Leanne Graham"}
        ]
    }
}).json()
print("Case1:", case1["id"], case1["name"])

body_json = json.dumps({"title": "Test Post", "body": "Hello World", "userId": 1})
case2 = c.post("/api/cases", json={
    "project_id": 1, "name": "Create Post",
    "type": "api", "priority": "medium", "status": "active",
    "tags": ["smoke", "post"],
    "description": "Test creating a new post",
    "config": {
        "method": "POST",
        "url": "https://jsonplaceholder.typicode.com/posts",
        "headers": {"Content-Type": "application/json"},
        "params": {},
        "body": body_json,
        "body_type": "json",
        "assertions": [
            {"type": "status_code", "field": "", "operator": "equals", "expected": "201"}
        ]
    }
}).json()
print("Case2:", case2["id"], case2["name"])

case3 = c.post("/api/cases", json={
    "project_id": 1, "name": "Login Page Test",
    "type": "web", "priority": "critical", "status": "draft",
    "tags": ["ui", "login"],
    "description": "Test login page UI flow",
    "config": {
        "steps": [
            {"action": "open", "locator": "", "value": "https://example.com/login", "description": "Open login page"},
            {"action": "input", "locator": "#username", "value": "admin", "description": "Enter username"},
            {"action": "input", "locator": "#password", "value": "pass123", "description": "Enter password"},
            {"action": "click", "locator": "#login-btn", "value": "", "description": "Click login button"},
            {"action": "assert_text", "locator": ".welcome", "value": "Welcome", "description": "Verify welcome text"}
        ]
    }
}).json()
print("Case3:", case3["id"], case3["name"])

case4 = c.post("/api/cases", json={
    "project_id": 1, "name": "App Login Flow",
    "type": "app", "priority": "high", "status": "draft",
    "tags": ["mobile", "login"],
    "description": "Test mobile app login flow",
    "config": {
        "platform": "android",
        "steps": [
            {"action": "launch", "locator": "", "value": "com.example.app", "description": "Launch app"},
            {"action": "tap", "locator": "id:login_btn", "value": "", "description": "Tap login button"},
            {"action": "input", "locator": "id:username", "value": "test_user", "description": "Input username"}
        ]
    }
}).json()
print("Case4:", case4["id"], case4["name"])

case5 = c.post("/api/cases", json={
    "project_id": 1, "name": "Mini Program Order Flow",
    "type": "miniapp", "priority": "medium", "status": "draft",
    "tags": ["miniapp", "order"],
    "description": "Test mini program order flow",
    "config": {
        "steps": [
            {"action": "navigate", "locator": "", "value": "/pages/order/index", "description": "Open order page"},
            {"action": "tap", "locator": ".product-item", "value": "", "description": "Select product"},
            {"action": "tap", "locator": ".buy-btn", "value": "", "description": "Click buy"}
        ]
    }
}).json()
print("Case5:", case5["id"], case5["name"])

# Run the API test cases
print("\n--- Running API tests ---")
r1 = c.post("/api/executions/run", json={"test_case_id": case1["id"]}).json()
print(f"Run Case1: {r1['status']} ({r1['duration_ms']}ms)")

r2 = c.post("/api/executions/run", json={"test_case_id": case2["id"]}).json()
print(f"Run Case2: {r2['status']} ({r2['duration_ms']}ms)")

print("\nDone! Sample data created and tests executed.")
