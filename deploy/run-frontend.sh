#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [ -f ".env" ]; then
  set -a
  . ./.env
  set +a
fi

NETWORK_NAME="${GIS_TOOLS_NETWORK:-gis-tools-net}"
GIS_TOOLS_IMAGE_TAG="${GIS_TOOLS_IMAGE_TAG:-latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-gis-tools-frontend}"
FRONTEND_BIND="${FRONTEND_BIND:-0.0.0.0}"
FRONTEND_PORT="${FRONTEND_PORT:-8080}"
FRONTEND_REF="${FRONTEND_IMAGE}:${GIS_TOOLS_IMAGE_TAG}"

docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
docker rm -f gis-tools-frontend >/dev/null 2>&1 || true

docker run -d \
  --name gis-tools-frontend \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  --env GIS_FRONTEND_ENV_FILE=/etc/gis-tools/frontend.env \
  --add-host host.docker.internal:host-gateway \
  -p "${FRONTEND_BIND}:${FRONTEND_PORT}:80" \
  -v "$ROOT_DIR/config/nginx.conf:/etc/nginx/conf.d/default.conf:ro" \
  -v "$ROOT_DIR/config/frontend.env:/etc/gis-tools/frontend.env:ro" \
  "$FRONTEND_REF"
