#!/usr/bin/env bash
# Build the image and (re)start the container. The SQLite db lives in ./data on the host.
# The app is published on localhost only; nginx (nginx/computeit.conf) faces the internet.
set -euo pipefail
cd "$(dirname "$0")"

NAME=computeit
PORT="${PORT:-8000}"

mkdir -p data
docker build -t "$NAME" .
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d \
  --name "$NAME" \
  --restart unless-stopped \
  -p "127.0.0.1:$PORT:8000" \
  -v "$PWD/data:/data:Z" \
  $( [ -f .env ] && echo --env-file .env ) \
  "$NAME"

echo "ComputeIT running on http://127.0.0.1:$PORT (logs: docker logs -f $NAME)"
