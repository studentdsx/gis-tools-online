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
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis:16-3.4}"
POSTGRES_BIND="${POSTGRES_BIND:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

docker network create "$NETWORK_NAME" >/dev/null 2>&1 || true
docker volume create postgis-data >/dev/null
docker rm -f gis-tools-postgis >/dev/null 2>&1 || true

TIMEZONE_MOUNTS=""
if [ -f /etc/localtime ]; then
  TIMEZONE_MOUNTS="$TIMEZONE_MOUNTS -v /etc/localtime:/etc/localtime:ro"
fi
if [ -f /etc/timezone ]; then
  TIMEZONE_MOUNTS="$TIMEZONE_MOUNTS -v /etc/timezone:/etc/timezone:ro"
fi

docker run -d \
  --name gis-tools-postgis \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  --network-alias postgis \
  --env-file "$ROOT_DIR/config/postgis.env" \
  -p "${POSTGRES_BIND}:${POSTGRES_PORT}:5432" \
  -v postgis-data:/var/lib/postgresql/data \
  $TIMEZONE_MOUNTS \
  "$POSTGIS_IMAGE"
