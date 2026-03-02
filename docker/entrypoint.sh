#!/bin/sh
# Copy frontend dist to shared volume so Nginx can serve it directly
if [ -d /app/frontend/dist ]; then
    cp -r /app/frontend/dist/* /app/frontend-serve/ 2>/dev/null || true
fi

exec "$@"
