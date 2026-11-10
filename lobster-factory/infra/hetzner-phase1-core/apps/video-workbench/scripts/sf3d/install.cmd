@echo off
rem Card S4b: local Stable Fast 3D for the workbench (Windows, NVIDIA GPU). The steps run on 2026-11-10 on the RTX 5060
rem laptop, in order. Needs: Python 3.12 (py launcher), git, Visual Studio 2022 Build Tools with the VCTools workload,
rem HF_TOKEN in the environment of an account that accepted the stabilityai/stable-fast-3d licence.
rem STATUS 2026-11-10: Windows Smart App Control (VerifiedAndReputablePolicyState=1, policy {0283ac0f-...}) blocks
rem loading freshly built unsigned .pyd files (CodeIntegrity events 3077/3033; LoadLibrary error 4551, shown by Python as
rem "DLL load failed ... procedure could not be found"). The first build loaded, the rebuild at 12:18 did not. A system
rem setting decides this; the script cannot. Not passing end to end on a machine with Smart App Control on.
rem Result: runtime\sf3d (gitignored) with .venv and .hf; then set VW_SF3D_PYTHON=<app>\runtime\sf3d\.venv\Scripts\python.exe
rem and VW_SF3D_DIR=<app>\runtime\sf3d. docs/s4-image-to-3d-providers-20261103.md §7.
setlocal
set APP=%~dp0..\..
set SF3D=%APP%\runtime\sf3d
if not exist "%SF3D%\.git" git clone https://github.com/Stability-AI/stable-fast-3d.git "%SF3D%" || exit /b 1
git -C "%SF3D%" checkout -q ff21fc4 || exit /b 1
rem No nvcc here: texture_baker builds its CPU kernels; this patch moves CUDA tensors through them.
git -C "%SF3D%" apply --check "%~dp0texture-baker-cpu.patch" 2>nul && git -C "%SF3D%" apply "%~dp0texture-baker-cpu.patch"
if not exist "%SF3D%\.venv" py -3.12 -m venv "%SF3D%\.venv" || exit /b 2
set PY=%SF3D%\.venv\Scripts\python.exe
rem An install whose packages already import is left alone: a rebuild of a working uv_unwrapper broke it once.
"%PY%" -c "import torch, texture_baker, uv_unwrapper, gpytoolbox, rembg" 2>nul && goto weights
"%PY%" -m pip install -q --upgrade pip setuptools wheel || exit /b 2
rem RTX 50 series (sm_120) needs the CUDA 12.8 build of torch.
"%PY%" -m pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu128 || exit /b 3
rem requirements.txt without the two local packages; gpytoolbox 0.2.0 has no Python 3.12 wheel and a broken sdist -> 0.3.8.
findstr /v /b /l "./" "%SF3D%\requirements.txt" | findstr /v /b /l "gpytoolbox" > "%TEMP%\sf3d-req.txt"
echo gpytoolbox==0.3.8>> "%TEMP%\sf3d-req.txt"
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 4
set DISTUTILS_USE_SDK=1
set USE_CUDA=0
"%PY%" -m pip install -q -r "%TEMP%\sf3d-req.txt" || exit /b 5
"%PY%" -m pip install -q --no-build-isolation "%SF3D%\texture_baker" "%SF3D%\uv_unwrapper" || exit /b 6
:weights
rem Weights into runtime\sf3d\.hf (sf3d-local.cjs uses it as HF_HOME); one online run fills the DINOv2 config and rembg's
rem ~/.u2net model, after which jobs run with HF_HUB_OFFLINE=1.
set HF_HOME=%SF3D%\.hf
"%PY%" -c "import os; from huggingface_hub import snapshot_download as d; d('stabilityai/stable-fast-3d', token=os.environ['HF_TOKEN'])" || exit /b 7
pushd "%SF3D%"
"%PY%" run.py "%APP%\assets\test-image-1.png" --output-dir "%TEMP%\sf3d-install-check" --texture-resolution 1024 || (popd & exit /b 8)
popd
echo SF3D_INSTALLED
