#!/usr/bin/env bash
# Card S4b: local Stable Fast 3D inside WSL (Linux binaries are outside Windows Smart App Control; the GPU comes through
# the Windows NVIDIA driver). Run from Windows:
#   set WSLENV=HF_TOKEN/u  &&  wsl.exe -d Ubuntu -- bash /mnt/d/.../scripts/sf3d/install-wsl.sh [--force]
# HF_TOKEN = an account that accepted the stabilityai/stable-fast-3d licence; read from the environment only.
# Re-runnable: each build goes to releases/<stamp>, must import and turn one image into a GLB, and only then becomes
# `current` (one atomic symlink swap); a failed build is deleted and the working one stays. A working `current` is kept
# unless --force. Weights live in a shared cache, downloaded once. Layout under $SF3D_HOME (default ~/awarewave-sf3d):
#   releases/<stamp>/{src,.venv}   current -> releases/<stamp>   hf/ (HF_HOME)
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
ROOT=${SF3D_HOME:-$HOME/awarewave-sf3d}
REV=ff21fc4
CHECK_IMAGE=$HERE/../../assets/test-image-1.png
export HF_HOME=$ROOT/hf PYTHONDONTWRITEBYTECODE=1
imports='import torch, texture_baker, uv_unwrapper, gpytoolbox, rembg; assert torch.cuda.is_available()'

if [ "${1:-}" != "--force" ] && [ -x "$ROOT/current/.venv/bin/python" ] && "$ROOT/current/.venv/bin/python" -c "$imports" 2>/dev/null; then
  echo "SF3D_INSTALLED kept $(readlink "$ROOT/current")"
  exit 0
fi

STAGE=$ROOT/releases/$(date +%Y%m%d-%H%M%S)
mkdir -p "$ROOT/releases"
trap 'rm -rf "$STAGE"; echo "SF3D_INSTALL_FAILED: kept $(readlink "$ROOT/current" 2>/dev/null || echo none)" >&2' ERR
git clone -q https://github.com/Stability-AI/stable-fast-3d.git "$STAGE/src"
git -C "$STAGE/src" checkout -q "$REV"
# No nvcc in WSL: texture_baker builds its CPU kernels; the patch moves CUDA tensors through them.
git -C "$STAGE/src" apply "$HERE/texture-baker-cpu.patch"
python3 -m venv "$STAGE/.venv"
PY=$STAGE/.venv/bin/python
"$PY" -m pip install -q --upgrade pip setuptools wheel
# RTX 50 series (sm_120) needs the CUDA 12.8 build of torch.
"$PY" -m pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu128
# requirements.txt without the two local packages; gpytoolbox 0.2.0 has no Python 3.12 wheel -> 0.3.8.
grep -v -e '^\./' -e '^gpytoolbox' "$STAGE/src/requirements.txt" > "$STAGE/requirements.txt"
echo "gpytoolbox==0.3.8" >> "$STAGE/requirements.txt"
"$PY" -m pip install -q -r "$STAGE/requirements.txt"
USE_CUDA=0 "$PY" -m pip install -q --no-build-isolation "$STAGE/src/texture_baker" "$STAGE/src/uv_unwrapper"
"$PY" -c "$imports"
# Weights (once, shared by every release); the first run also fills rembg's ~/.u2net. Later runs are offline.
"$PY" -c "import os; from huggingface_hub import snapshot_download as d; d('stabilityai/stable-fast-3d', token=os.environ.get('HF_TOKEN'))"
rm -rf "$STAGE/check"
(cd "$STAGE/src" && "$PY" run.py "$CHECK_IMAGE" --output-dir "$STAGE/check" --texture-resolution 1024)
test -s "$STAGE/check/0/mesh.glb"
rm -rf "$STAGE/check"
trap - ERR
ln -sfn "$STAGE" "$ROOT/current.tmp" && mv -Tf "$ROOT/current.tmp" "$ROOT/current"
# Keep the new release and the one before it (rollback = point current back).
ls -1d "$ROOT"/releases/* | sort | head -n -2 | xargs -r rm -rf
echo "SF3D_INSTALLED $(readlink "$ROOT/current")"
