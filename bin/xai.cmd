@echo off
set "GROK_CLI=%~dp0..\scripts\grok-cli.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%GROK_CLI%" %*
