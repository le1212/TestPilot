import os
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import FileResponse

from .auth import get_current_user
from ..models import User

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("")
async def upload_file(file: UploadFile = File(...), user: User = Depends(get_current_user)):
    allowed = False
    if file.content_type:
        if file.content_type.startswith("image/"):
            allowed = True
        if file.content_type in ("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"):
            allowed = True
    fn = (file.filename or "").lower()
    if fn.endswith(".xlsx") or fn.endswith(".xls"):
        allowed = True
    if not allowed:
        raise HTTPException(400, "仅支持图片或 Excel 文件（.xlsx/.xls）")

    max_size = 10 * 1024 * 1024
    contents = await file.read()
    if len(contents) > max_size:
        raise HTTPException(400, "File too large (max 10MB)")

    os.makedirs(UPLOAD_DIR, exist_ok=True)

    ext = os.path.splitext(file.filename or "file.png")[1] or ".png"
    date_prefix = datetime.now().strftime("%Y%m%d")
    filename = f"{date_prefix}_{uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as f:
        f.write(contents)

    return {"filename": filename, "url": f"/api/uploads/{filename}", "size": len(contents)}


@router.get("/{filename}")
async def get_file(filename: str):
    filepath = os.path.join(UPLOAD_DIR, filename)
    if not os.path.realpath(filepath).startswith(os.path.realpath(UPLOAD_DIR)):
        raise HTTPException(400, "Invalid filename")
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath)
