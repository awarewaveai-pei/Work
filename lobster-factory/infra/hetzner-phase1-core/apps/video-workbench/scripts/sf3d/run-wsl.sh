#!/usr/bin/env bash
# Card S4b: the one entry the Windows backend (backend/sf3d-local.cjs) starts inside WSL:
#   wsl.exe -d <distro> -- bash <this file> <image> <out dir>     (Linux paths; out dir is the shared exchange folder)
# Runs in its own process group and writes that group id to <out dir>/pgid, so cancel can kill the whole group from
# Windows without relying on wsl.exe teardown (measured 2026-11-10: ending wsl.exe also ended the group, but that is
# WSL behaviour, not a contract). Offline: weights come from the install's cache.
set -euo pipefail
if [ -z "${SF3D_SETSID:-}" ]; then SF3D_SETSID=1 exec setsid -w bash "$0" "$@"; fi
ROOT=${SF3D_HOME:-$HOME/awarewave-sf3d}
mkdir -p "$2"
echo $$ > "$2/pgid"
cd "$ROOT/current/src"
export HF_HOME=$ROOT/hf HF_HUB_OFFLINE=1 PYTHONDONTWRITEBYTECODE=1
exec "$ROOT/current/.venv/bin/python" run.py "$1" --output-dir "$2" --texture-resolution 1024
