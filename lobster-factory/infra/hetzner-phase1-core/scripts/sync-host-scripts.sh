#!/usr/bin/env bash
# sync-host-scripts.sh -- install origin/main's copy of this directory into /root/lobster-phase1/scripts.
# The only implementation of "refresh host scripts". auto-deploy-next-admin.sh and
# check-drift-and-alert.sh run it BEFORE deciding anything; sg-deploy.sh step 1.8 runs it after its pull.
# Until 2026-09-23 only step 1.8 refreshed this dir -- after the caller had already decided -- so a
# changed caller ran its old logic one more tick (07:00Z: "auto-deploy FAILED" for a deliberate
# DEPLOY_HOLD), and nothing refreshed the dir at all while there was no app drift or a hold was active.
#
# Contract (the caller has already run `git fetch origin main` in /root/Work):
#   - source is origin/main:<this dir> (the ref DEPLOY_HOLD is read from); the worktree is not touched.
#   - every *.sh must pass `bash -n`, else NOTHING is installed: the scripts call each other, so a
#     half-new set is worse than an old one. Emergency app deploy meanwhile: git pull by hand, then
#     sg-deploy.sh --skip-pull (which skips this sync).
#   - a changed file is replaced by rename, so a script that is running keeps reading its old inode;
#     unchanged files are not touched; files that exist only on the host are kept.
#   - *.sh are made executable before install: git stores them 100644 and cron execs them directly.
#   - serialized by flock on /tmp/sync-host-scripts.lock, which sg-deploy.sh also holds while it takes its
#     own lock: a sync either finishes before that deploy exists or sees its lock and skips (exit 0), so a
#     running deploy never has scripts swapped under it. Its own step 1.8 passes SG_DEPLOY_LOCK_PID.
#   - exit 0 = in sync or skipped; exit 1 = nothing installed.
set -euo pipefail

REPO_DIR="/root/Work"
TARGET="/root/lobster-phase1/scripts"
SCRIPTS_PATH="lobster-factory/infra/hetzner-phase1-core/scripts"
DEPLOY_LOCK="/tmp/sg-deploy.lock"   # = sg-deploy.sh LOCK_FILE

say() { echo "[sync-host-scripts] $*"; }

exec 9>/tmp/sync-host-scripts.lock   # = the flock sg-deploy.sh takes around its lock
flock -w 120 9 || { say "ERROR: another sync still running after 120s -- nothing installed"; exit 1; }

holder="$(cat "$DEPLOY_LOCK" 2>/dev/null || true)"
if [[ -n "$holder" && "$holder" != "${SG_DEPLOY_LOCK_PID:-}" ]] && kill -0 "$holder" 2>/dev/null; then
  say "skipped: sg-deploy PID $holder is running with the scripts it started with"
  exit 0
fi

src="$(mktemp -d)"
partials=()
trap 'rm -rf "$src"; ((${#partials[@]})) && rm -f "${partials[@]}"' EXIT

git -C "$REPO_DIR" archive --format=tar "origin/main:$SCRIPTS_PATH" | tar -x -C "$src" \
  || { say "ERROR: cannot extract origin/main:$SCRIPTS_PATH from $REPO_DIR -- nothing installed"; exit 1; }
rev="$(git -C "$REPO_DIR" rev-parse --short origin/main)"

bad=0
while IFS= read -r -d '' f; do
  if ! err="$(bash -n "$f" 2>&1)"; then
    say "ERROR: bash -n rejects ${f#"$src"/} at origin/main $rev: $err"
    bad=1
  fi
done < <(find "$src" -type f -name '*.sh' -print0)
if [[ "$bad" -ne 0 ]]; then
  say "nothing installed; the host keeps its current scripts until origin/main is fixed"
  exit 1
fi
find "$src" -type f -name '*.sh' -exec chmod +x {} +

# Two-phase install (codex r2 F3): every changed file is first copied next to its target; the renames
# happen only once every copy succeeded, so a failed copy (disk full, permissions) installs nothing
# and the EXIT trap removes the partials. Residual (codex r3 F2, accepted): a rename that fails AFTER
# earlier renames succeeded leaves a mixed set -- but a rename inside a directory the copy just wrote
# to can only fail on a pre-existing host fault (immutable attribute, a directory sitting at the target
# path); the next tick re-runs the sync, and sg-deploy.sh refuses to deploy on any non-zero here.
rels=()
while IFS= read -r -d '' f; do
  rel="${f#"$src"/}"
  dst="$TARGET/$rel"
  if [[ -f "$dst" ]] && cmp -s "$f" "$dst"; then
    if [[ "$rel" == *.sh && ! -x "$dst" ]]; then chmod +x "$dst"; fi
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  if ! cp -p "$f" "$dst.sync-$$"; then
    say "ERROR: cannot stage $rel next to its target -- nothing installed"
    exit 1
  fi
  partials+=("$dst.sync-$$"); rels+=("$rel")
done < <(find "$src" -type f -print0 | sort -z)

n=0
for i in "${!partials[@]}"; do
  mv -f "${partials[$i]}" "$TARGET/${rels[$i]}"
  say "installed ${rels[$i]}"
  n=$((n + 1))
done
partials=()
say "scripts == origin/main $rev ($n installed)"
