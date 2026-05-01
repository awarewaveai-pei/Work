#!/usr/bin/env bash
# Run on the Supabase VPS (not locally). Generates POOLER_TENANT_ID, updates
# /root/supabase/.env, and recreates Supavisor so the new env is loaded.
# docker restart supabase-pooler does NOT reload .env from disk.
set -euo pipefail
tid=$(cat /proc/sys/kernel/random/uuid)
ENV=/root/supabase/.env
cp -a "$ENV" "${ENV}.bak.poolertenant-$(date +%s)"
sed -i "s#^POOLER_TENANT_ID=.*#POOLER_TENANT_ID=${tid}#" "$ENV"
cd /root/supabase && docker compose up -d --force-recreate --no-deps supavisor
echo "POOLER_TENANT_ID=${tid}"
echo "Update client DSN user to: postgres.${tid}"
