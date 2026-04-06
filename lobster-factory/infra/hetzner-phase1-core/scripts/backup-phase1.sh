#!/usr/bin/env bash
# Optional Phase-1 backups (run on the VPS from hetzner-phase1-core directory).
# Does NOT replace your Supabase backup strategy.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env in $ROOT — copy from .env.example first." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a && source ./.env && set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${BACKUP_DIR:-./backups}/${STAMP}"
mkdir -p "$OUT"

echo "Dumping MariaDB (${WORDPRESS_DB_NAME})…"
docker exec lobster-wordpress-db mariadb-dump \
  -u root -p"${WORDPRESS_DB_ROOT_PASSWORD}" \
  --single-transaction \
  --quick \
  "${WORDPRESS_DB_NAME}" | gzip > "${OUT}/wordpress-db.sql.gz"

echo "Archiving /var/www/html from wordpress container…"
docker exec lobster-wordpress tar czf - -C /var/www/html . > "${OUT}/wp-html.tgz"

echo "Done: $OUT"
echo "DB restore drill (verify in staging first):"
echo "  gunzip -c wordpress-db.sql.gz | docker exec -i lobster-wordpress-db mariadb -u root -p\"***\" ${WORDPRESS_DB_NAME}"
