#!/usr/bin/env bash
# Idempotent: install observability .env on VPS if missing (run with sudo bash).
set -euo pipefail
OBS_DIR="${1:-/root/lobster-phase1/observability}"
ENV_FILE="${OBS_DIR}/.env.observability"
if [[ -f "${ENV_FILE}" ]]; then
  echo "deploy-observability-vps: ${ENV_FILE} already exists"
  exit 0
fi
umask 077
P="$(openssl rand -base64 24)"
{
  printf '%s\n' "OBSERVABILITY_HOST_LABEL=${OBSERVABILITY_HOST_LABEL:-wordpress-ubuntu-4gb-sin-1}"
  printf '%s\n' "GRAFANA_ADMIN_USER=admin"
  printf '%s\n' "GRAFANA_ADMIN_PASSWORD=${P}"
  printf '%s\n' "GRAFANA_ROOT_URL=http://127.0.0.1:3009"
} > "${ENV_FILE}"
chmod 600 "${ENV_FILE}"
echo "deploy-observability-vps: wrote ${ENV_FILE}"
