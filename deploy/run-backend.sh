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
BACKEND_IMAGE="${BACKEND_IMAGE:-gis-tools-backend}"
BACKEND_BIND="${BACKEND_BIND:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-3000}"
BACKEND_REF="${BACKEND_IMAGE}:${GIS_TOOLS_IMAGE_TAG}"

mkdir -p "$ROOT_DIR/docker-data"
docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
docker rm -f gis-tools-backend >/dev/null 2>&1 || true

docker run -d \
  --name gis-tools-backend \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  --network-alias backend \
  --env-file "$ROOT_DIR/config/backend.env" \
  --add-host host.docker.internal:host-gateway \
  -p "${BACKEND_BIND}:${BACKEND_PORT}:3000" \
  -v "$ROOT_DIR/docker-data:/data" \
  "$BACKEND_REF"
