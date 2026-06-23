#!/bin/sh
set -eu

CONFIG_FILE="${GIS_FRONTEND_ENV_FILE:-/etc/gis-tools/frontend.env}"
OUTPUT_FILE="${GIS_RUNTIME_CONFIG_FILE:-/usr/share/nginx/html/runtime-config.js}"

read_file_value() {
  key="$1"

  if [ ! -f "$CONFIG_FILE" ]; then
    printf ''
    return
  fi

  line="$(grep -E "^[[:space:]]*${key}=" "$CONFIG_FILE" | tail -n 1 || true)"
  if [ -z "$line" ]; then
    printf ''
    return
  fi

  value="${line#*=}"
  value="$(printf '%s' "$value" | sed 's/\r$//; s/^[[:space:]]*//; s/[[:space:]]*$//')"

  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  printf '%s' "$value"
}

read_config_value() {
  key="$1"
  env_value="$(printenv "$key" 2>/dev/null || true)"

  if [ -n "$env_value" ]; then
    printf '%s' "$env_value"
    return
  fi

  read_file_value "$key"
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g; s/\r//g'
}

api_base_url="$(read_config_value VITE_API_BASE_URL)"
mapbox_access_token="$(read_config_value VITE_MAPBOX_ACCESS_TOKEN)"

mkdir -p "$(dirname "$OUTPUT_FILE")"

cat > "$OUTPUT_FILE" <<EOF
window.__GIS_TOOLS_CONFIG__ = {
  VITE_API_BASE_URL: "$(json_escape "$api_base_url")",
  VITE_MAPBOX_ACCESS_TOKEN: "$(json_escape "$mapbox_access_token")"
};
EOF
