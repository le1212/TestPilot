import os
import sys
import asyncio

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from fastapi import FastAPI, Depends
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from .database import get_db
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from contextlib import asynccontextmanager
from .database import init_db, async_session
from .config import CORS_ORIGINS, _JWT_IS_DEFAULT, JWT_SECRET, JWT_ALGORITHM, APP_VERSION
from .logging_config import setup_logging, get_logger
from .routes import projects, cases, environments, execution, dashboard, defects, reports, logs, uploads, settings, auth, users, notifications, ai, groups, ai_chat, chat
from .routes.auth import get_current_user

setup_logging()
logger = get_logger("main")


class UTF8CharsetMiddleware(BaseHTTPMiddleware):
    """确保 JSON 响应带 charset=utf-8，避免中文在部分环境下乱码。"""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        ct = response.headers.get("content-type", "")
        if "application/json" in ct and "charset" not in ct:
            response.headers["content-type"] = "application/json; charset=utf-8"
        return response


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error("init_db error: %s", e, exc_info=True)
        raise
    if _JWT_IS_DEFAULT:
        logger.warning("JWT_SECRET is using default value — set JWT_SECRET env var for production!")
    if CORS_ORIGINS == ["*"]:
        logger.warning("CORS allows all origins — set CORS_ORIGINS env var to restrict in production")
    app.state.ws_connections: dict[int, list] = {}
    app.state.chat_ws_connections: dict[int, list] = {}

    async def broadcast_ws(msg: dict):
        import json
        raw = json.dumps(msg, ensure_ascii=False)
        target_uid = msg.get("user_id")
        if target_uid:
            for ws in list(app.state.ws_connections.get(target_uid, [])):
                try:
                    await ws.send_text(raw)
                except Exception:
                    pass
        else:
            for uid_conns in app.state.ws_connections.values():
                for ws in list(uid_conns):
                    try:
                        await ws.send_text(raw)
                    except Exception:
                        pass
    app.state.broadcast_ws = broadcast_ws
    logger.info("TestPilot backend started")
    yield


app = FastAPI(
    title="TestPilot - Visual Test Platform",
    description="Unified test automation platform for API, Web, App, and Mini-program testing",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.add_middleware(UTF8CharsetMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/settings/ping")
async def settings_ping():
    return {"ok": True, "message": "settings API loaded"}

app.include_router(auth.router)
app.include_router(settings.router, dependencies=[Depends(get_current_user)])
app.include_router(projects.router, dependencies=[Depends(get_current_user)])
app.include_router(cases.router, dependencies=[Depends(get_current_user)])
app.include_router(groups.router, dependencies=[Depends(get_current_user)])
app.include_router(environments.router, dependencies=[Depends(get_current_user)])
app.include_router(execution.router, dependencies=[Depends(get_current_user)])
app.include_router(dashboard.router, dependencies=[Depends(get_current_user)])
app.include_router(defects.router, dependencies=[Depends(get_current_user)])
app.include_router(reports.router, dependencies=[Depends(get_current_user)])
app.include_router(logs.router, dependencies=[Depends(get_current_user)])
app.include_router(uploads.router)
app.include_router(users.router, dependencies=[Depends(get_current_user)])
app.include_router(notifications.router, dependencies=[Depends(get_current_user)])
app.include_router(ai.router, dependencies=[Depends(get_current_user)])
app.include_router(ai_chat.router, dependencies=[Depends(get_current_user)])
app.include_router(chat.router, dependencies=[Depends(get_current_user)])

BASE_DIR = os.path.dirname(os.path.dirname(__file__))
ALLURE_REPORTS_DIR = os.path.join(BASE_DIR, "allure-reports")
os.makedirs(ALLURE_REPORTS_DIR, exist_ok=True)
app.mount("/api/allure", StaticFiles(directory=ALLURE_REPORTS_DIR, html=True), name="allure")


@app.get("/")
async def root():
    return RedirectResponse(url="/docs")


@app.websocket("/ws/notifications")
async def ws_notifications(websocket):
    from starlette.websockets import WebSocket, WebSocketDisconnect
    token = websocket.query_params.get("token")
    user_id: int | None = None
    if token:
        try:
            from jose import jwt as _jwt
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = int(payload.get("sub") or 0)
        except Exception:
            pass
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await websocket.accept()
    conns = app.state.ws_connections.setdefault(user_id, [])
    conns.append(websocket)
    try:
        while True:
            try:
                _ = await websocket.receive_text()
            except (WebSocketDisconnect, Exception):
                break
    finally:
        conns = app.state.ws_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns and user_id in app.state.ws_connections:
            del app.state.ws_connections[user_id]


@app.websocket("/ws/chat")
async def ws_chat(websocket):
    from starlette.websockets import WebSocketDisconnect
    token = websocket.query_params.get("token")
    user_id: int | None = None
    if token:
        try:
            from jose import jwt as _jwt
            payload = _jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = int(payload.get("sub") or 0)
        except Exception:
            pass
    if not user_id:
        await websocket.close(code=4001, reason="Unauthorized")
        return
    await websocket.accept()
    conns = app.state.chat_ws_connections.setdefault(user_id, [])
    conns.append(websocket)
    try:
        while True:
            try:
                _ = await websocket.receive_text()
            except (WebSocketDisconnect, Exception):
                break
    finally:
        conns = app.state.chat_ws_connections.get(user_id, [])
        if websocket in conns:
            conns.remove(websocket)
        if not conns and user_id in app.state.chat_ws_connections:
            del app.state.chat_ws_connections[user_id]


@app.get("/api/health")
async def health():
    """健康检查，含 DB 探针。"""
    db_ok = False
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        pass
    try:
        from .services.web_executor import execute_web
        web_engine = True
    except Exception:
        web_engine = False
    status = "ok" if db_ok else "degraded"
    return {
        "status": status,
        "platform": "TestPilot",
        "version": APP_VERSION,
        "checks": {
            "database": db_ok,
            "web_engine": web_engine,
            "settings_api": True,
        },
    }


@app.get("/api/ready")
async def readiness():
    """就绪探针：DB 可用时返回 200，否则 503。"""
    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception:
        from fastapi.responses import JSONResponse
        return JSONResponse({"ready": False}, status_code=503)
    return {"ready": True}
