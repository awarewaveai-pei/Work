#!/usr/bin/env bash
set -euo pipefail

# Basic smoke test for a staged WordPress site.
# Usage:
#   ./smoke-test.sh <site-url> [wp-root-path]

SITE_URL="${1:-}"
WP_PATH="${2:-}"

if [[ -z "${SITE_URL}" ]]; then
  echo "Usage: $0 <site-url> [wp-root-path]"
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required but not found in PATH"
  exit 1
fi

echo "1) Checking homepage: ${SITE_URL}"
HTTP_CODE="$(curl -L -s -o /dev/null -w "%{http_code}" "${SITE_URL}")"
if [[ "${HTTP_CODE}" -lt 200 || "${HTTP_CODE}" -ge 400 ]]; then
  echo "Homepage check failed. HTTP code: ${HTTP_CODE}"
  exit 1
fi
echo "Homepage OK (${HTTP_CODE})"

if [[ -n "${WP_PATH}" ]]; then
  if ! command -v wp >/dev/null 2>&1; then
    echo "wp-cli not found, skip plugin-level checks"
    exit 0
  fi

  echo "2) Checking critical plugins via wp-cli"
  wp plugin is-active woocommerce --path="${WP_PATH}"
  wp plugin is-active fluent-crm --path="${WP_PATH}"
  echo "Plugin checks OK"
fi

echo "Smoke test passed"
