# Stage 1: Build frontend
FROM node:20-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci || npm install
COPY frontend/ .
RUN npm run build

# Stage 2: Production image
FROM python:3.11-slim
WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY --from=frontend-build /build/dist ./frontend/dist/

RUN mkdir -p /app/backend/data /app/frontend-serve

COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV JWT_SECRET="" \
    DATABASE_URL="sqlite+aiosqlite:///./data/testplatform.db" \
    CORS_ORIGINS="" \
    LOG_LEVEL="INFO"

EXPOSE 8001

WORKDIR /app/backend
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
