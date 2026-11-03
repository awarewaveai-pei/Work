@echo off
cd /d "%~dp0"
set "VW_NODE=%~dp0runtime\node.exe"
if not exist "%VW_NODE%" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo Please install Node.js 18 or newer, then run this file again.
    pause
    exit /b 1
  )
  set "VW_NODE=node"
)
"%VW_NODE%" scripts\launch.cjs --check
if errorlevel 1 (
  pause
  exit /b 1
)
set "VW_INSTALL="
if not exist node_modules\ffmpeg-static\index.js set "VW_INSTALL=1"
if not exist assets\vision\wasm\vision_wasm_internal.wasm set "VW_INSTALL=1"
if not exist vendor\ffprobe\ffprobe.exe set "VW_INSTALL=1"
if defined VW_INSTALL (
  call npm.cmd ci --omit=dev
  if errorlevel 1 (
    echo Dependency installation failed. Check the network and try again.
    pause
    exit /b 1
  )
)
"%VW_NODE%" scripts\launch.cjs
pause
