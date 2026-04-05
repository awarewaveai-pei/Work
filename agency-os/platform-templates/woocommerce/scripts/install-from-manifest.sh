#!/usr/bin/env bash
set -euo pipefail

# install-from-manifest.sh
# Install theme + plugins defined in a manifest JSON using WP-CLI.
# Supports conditional install of LiteSpeed Cache by checking HTTP Server header.
#
# Usage:
#   ./install-from-manifest.sh <wp_root> <manifest_json>

WP_ROOT="${1:-}"
MANIFEST="${2:-}"

if [[ -z "${WP_ROOT}" || -z "${MANIFEST}" ]]; then
  echo "Usage: $0 <wp_root> <manifest_json>"
  exit 1
fi

if [[ ! -d "${WP_ROOT}" ]]; then
  echo "WP root not found: ${WP_ROOT}"
  exit 1
fi

if [[ ! -f "${MANIFEST}" ]]; then
  echo "Manifest not found: ${MANIFEST}"
  exit 1
fi

command -v wp >/dev/null 2>&1 || { echo "Error: wp-cli not found on this machine."; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "Error: jq not found. Install: sudo apt install -y jq"; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "Error: curl not found. Install: sudo apt install -y curl"; exit 1; }

cd "${WP_ROOT}"

wp core is-installed >/dev/null 2>&1 || {
  echo "Error: WordPress is not installed at: ${WP_ROOT}"
  exit 1
}

THEME_SLUG="$(jq -r '.theme.slug // empty' "${MANIFEST}")"
if [[ -n "${THEME_SLUG}" && "${THEME_SLUG}" != "null" ]]; then
  echo "==> Installing & activating theme: ${THEME_SLUG}"
  wp theme install "${THEME_SLUG}" --activate
fi

echo "==> Installing required plugins"
mapfile -t REQUIRED < <(jq -r '.plugins.required[]? // empty' "${MANIFEST}")
for slug in "${REQUIRED[@]}"; do
  [[ -z "${slug}" ]] && continue
  echo "  - ${slug}"
  wp plugin install "${slug}" --activate
done

# Conditional: LiteSpeed Cache (detect via HTTP Server header)
if jq -e '.plugins.conditional["litespeed-cache"]' "${MANIFEST}" >/dev/null 2>&1; then
  REGEX="$(jq -r '.plugins.conditional["litespeed-cache"].when_server_header_matches' "${MANIFEST}")"
  SITEURL="$(wp option get siteurl)"
  SERVER_HDR="$(curl -Is "${SITEURL}" | awk -F': ' 'tolower($1)=="server"{print $2}' | tr -d '\r' | head -n 1 || true)"

  echo "==> Detecting LiteSpeed via Server header..."
  echo "    siteurl: ${SITEURL}"
  echo "    server:  ${SERVER_HDR:-"(not found)"}"

  if [[ -n "${SERVER_HDR:-}" ]] && echo "${SERVER_HDR}" | grep -Pq "${REGEX}"; then
    echo "==> LiteSpeed detected. Installing & activating: litespeed-cache"
    wp plugin install litespeed-cache --activate
  else
    echo "==> LiteSpeed not detected. Skipping: litespeed-cache"
  fi
fi

echo ""
echo "Done ✅ Installed from manifest: ${MANIFEST}"
