#!/usr/bin/env sh
set -eu

OUTPUT_DIR="${1:-docker-dist}"

if [ ! -f ".env" ]; then
  cp .env.docker.example .env
fi

set -a
. ./.env
set +a

GIS_TOOLS_IMAGE_TAG="${GIS_TOOLS_IMAGE_TAG:-latest}"
FRONTEND_IMAGE="${FRONTEND_IMAGE:-gis-tools-frontend}"
BACKEND_IMAGE="${BACKEND_IMAGE:-gis-tools-backend}"
POSTGIS_IMAGE="${POSTGIS_IMAGE:-postgis/postgis:16-3.4}"

FRONTEND_REF="${FRONTEND_IMAGE}:${GIS_TOOLS_IMAGE_TAG}"
BACKEND_REF="${BACKEND_IMAGE}:${GIS_TOOLS_IMAGE_TAG}"

docker compose -f docker-compose.build.yml build
docker pull "$POSTGIS_IMAGE"

mkdir -p "$OUTPUT_DIR/runtime/config" "$OUTPUT_DIR/runtime/deploy" "$OUTPUT_DIR/runtime/docs"

docker save -o "$OUTPUT_DIR/gis-tools-images.tar" "$FRONTEND_REF" "$BACKEND_REF" "$POSTGIS_IMAGE"

cp docker-compose.yml "$OUTPUT_DIR/runtime/docker-compose.yml"
cp .env.docker.example "$OUTPUT_DIR/runtime/.env.docker.example"
cp config/*.env.example "$OUTPUT_DIR/runtime/config/"
cp config/nginx.conf "$OUTPUT_DIR/runtime/config/nginx.conf"
cp deploy/*.sh "$OUTPUT_DIR/runtime/deploy/"
cp docs/docker-deployment.md "$OUTPUT_DIR/runtime/docs/docker-deployment.md"
cp README.md "$OUTPUT_DIR/runtime/README.md"

tar -czf "$OUTPUT_DIR/gis-tools-runtime-files.tar.gz" -C "$OUTPUT_DIR/runtime" .

printf 'Offline images: %s\n' "$OUTPUT_DIR/gis-tools-images.tar"
printf 'Runtime files:  %s\n' "$OUTPUT_DIR/gis-tools-runtime-files.tar.gz"
