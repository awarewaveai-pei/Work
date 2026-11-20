#!/usr/bin/env bash
# oracle-deploy.sh [--ref <git ref>] [--dry-run] -- deploy oracle-web (oracle.aware-wave.com) on ks-aw-01.
# Run on the host as root; the script is read from the ref it deploys, so there is no host copy to drift:
#   git -C /root/Work fetch origin main
#   git -C /root/Work show origin/main:Projects/internal/ziwei-doushu/deploy/oracle-deploy.sh | setsid nohup bash -s
#
# Source = `git archive` of the ref: /root/Work's worktree is never moved, so sg-deploy.sh is not disturbed.
# Order: gate (npm ci, tsc, vitest in node:22-alpine -- the image's own Node) -> compose drift check -> source tar +
# image :rollback -> rsync (machine-local .env* and compose files stay) -> build -> up -> healthy -> smoke every page.
# Invariant: once the backup exists, the script ends in exactly one of two states -- new version verified, or the
# previous source and image back and verified healthy. Any other exit (failed step, signal, lost SSH) goes through
# rollback() by the EXIT trap, and the operator is told which of the two it ended in.
# docker-compose.yml is machine-local (AGENTS.md section 0): a repo/host difference stops the deploy; change it with
# /root/lobster-phase1/scripts/safe-infra-patch.sh, not here.
set -euo pipefail
umask 077 # backups hold .env.production

REPO_DIR=/root/Work
APP_PATH=Projects/internal/ziwei-doushu
DEST=/opt/oracle/$APP_PATH
BACKUP_DIR=/opt/oracle/backups
LOG_DIR=/opt/oracle/logs
NOTIFY=/root/lobster-phase1/scripts/notify.sh
PORT=3010
KEEP_BACKUPS=5

REF=origin/main
DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) REF="$2"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "usage: oracle-deploy.sh [--ref <git ref>] [--dry-run]" >&2; exit 64 ;;
  esac
done

mkdir -p "$BACKUP_DIR" "$LOG_DIR"
chmod 700 "$BACKUP_DIR"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
LOG_FILE="$LOG_DIR/oracle-deploy-$STAMP.log"
log() { echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "$LOG_FILE"; }

exec 9>/tmp/oracle-deploy.lock
flock -n 9 || { echo "another oracle deploy is running" >&2; exit 75; }

COMMIT="$(git -C "$REPO_DIR" rev-parse --short "$REF")"
SRC="$(mktemp -d /tmp/oracle-src.XXXXXX)"
trap 'rm -rf "$SRC"' EXIT
git -C "$REPO_DIR" archive "$REF" "$APP_PATH" | tar -x -C "$SRC"
SRC_APP="$SRC/$APP_PATH"
log "ref=$REF commit=$COMMIT dry_run=$DRY_RUN"

log "--- gate: npm ci, tsc, vitest (node:22-alpine) ---"
docker run --rm -v "$SRC_APP":/app -w /app node:22-alpine \
  sh -c 'npm ci --no-audit --no-fund >/dev/null && npx tsc --noEmit && npx vitest run' </dev/null 2>&1 | tee -a "$LOG_FILE"
log "gate passed"

log "--- compose drift check ---"
diff -u "$DEST/docker-compose.yml" "$SRC_APP/docker-compose.yml" | tee -a "$LOG_FILE" \
  || { log "ERROR: docker-compose.yml differs between host and $REF -- apply it with safe-infra-patch.sh first"; exit 1; }

RSYNC_ARGS=(-a --delete --exclude '.env*' --exclude 'docker-compose*' --exclude node_modules --exclude .next
  --exclude tsconfig.tsbuildinfo)
if [[ $DRY_RUN -eq 1 ]]; then
  rsync -n -i "${RSYNC_ARGS[@]}" "$SRC_APP/" "$DEST/" | tee -a "$LOG_FILE"
  log "dry run: nothing changed"
  exit 0
fi

wait_healthy() {
  local status=starting
  for _ in $(seq 1 40); do
    status="$(docker inspect -f '{{.State.Health.Status}}' oracle-web 2>/dev/null || echo missing)"
    [[ "$status" == healthy ]] && return 0
    sleep 3
  done
  log "container status after 120s: $status"
  return 1
}

SRC_BACKUP="$BACKUP_DIR/src-$STAMP.tgz"
tar -czf "$SRC_BACKUP" -C "$DEST" --exclude node_modules --exclude .next .
tar -tzf "$SRC_BACKUP" >/dev/null # a backup that cannot be read back is not a backup
docker tag "$(docker inspect -f '{{.Image}}' oracle-web)" oracle-web:rollback # the image that is running, not :latest
log "backup: $SRC_BACKUP + image oracle-web:rollback"

DONE=0
IN_ROLLBACK=0
rollback() {
  set +e
  IN_ROLLBACK=1
  local why="$1" failed=0
  log "ROLLBACK: $why"
  docker tag oracle-web:rollback oracle-web:latest || failed=1
  find "$DEST" -mindepth 1 -maxdepth 1 ! -name '.env*' ! -name 'docker-compose*' -exec rm -rf {} + || failed=1
  tar -xzf "$SRC_BACKUP" -C "$DEST" || failed=1
  (cd "$DEST" && docker compose up -d --no-build --force-recreate) </dev/null >>"$LOG_FILE" 2>&1 || failed=1
  wait_healthy || failed=1
  local verdict='已還原上一版，網站正常'
  [[ $failed -eq 0 ]] || verdict='還原也失敗，網站可能中斷，需要人工處理'
  log "rollback result: failed=$failed"
  printf '🔴 oracle 部署失敗：%s -- %s\n（技術資訊：commit=%s log=%s backup=%s）' "$verdict" "$why" "$COMMIT" "$LOG_FILE" "$SRC_BACKUP" \
    | "$NOTIFY" >/dev/null 2>&1 || log "notify incomplete"
  rm -rf "$SRC"
  exit 1
}
trap 'rc=$?; if [[ $rc -ne 0 && $DONE -eq 0 && $IN_ROLLBACK -eq 0 ]]; then rollback "unexpected exit rc=$rc"; fi; rm -rf "$SRC"' EXIT
trap 'exit 130' INT TERM HUP

rsync "${RSYNC_ARGS[@]}" "$SRC_APP/" "$DEST/"
cd "$DEST"
docker compose build </dev/null 2>&1 | tee -a "$LOG_FILE" || rollback "image build failed"
docker compose up -d </dev/null 2>&1 | tee -a "$LOG_FILE" || rollback "compose up failed"
wait_healthy || rollback "container not healthy after 120s"

log "--- smoke: health + every page in both locales ---"
BASE="http://127.0.0.1:$PORT"
BODY="$SRC/smoke-body"
curl -fsS -m 10 -o "$BODY" "$BASE/api/health" && grep -q '"ok":true' "$BODY" || rollback "/api/health did not answer ok"
for lang in zh-TW en; do
  curl -fsS -m 15 -o "$BODY" "$BASE/$lang" && grep -q '<title>' "$BODY" || rollback "/$lang has no <title>"
  for page in "$SRC_APP"/app/\[lang\]/*/page.tsx; do
    slug="$(basename "$(dirname "$page")")"
    [[ $slug == \[* || $slug == \(* || $slug == \* ]] && continue
    code="$(curl -sS -g -m 15 -o /dev/null -w '%{http_code}' "$BASE/$lang/$slug")" || code=000
    [[ $code == 200 ]] || rollback "/$lang/$slug returned $code"
  done
done

DONE=1
ls -1t "$BACKUP_DIR"/src-*.tgz | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f
docker image prune -f >/dev/null
log "deployed commit=$COMMIT"
