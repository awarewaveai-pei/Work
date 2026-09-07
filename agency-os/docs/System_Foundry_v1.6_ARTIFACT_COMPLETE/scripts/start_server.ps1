# 啟動 System Foundry Configurator，跟終端機/Bash session 脫鉤，關掉那個視窗也不會跟著死。
# 用法：雙擊這個檔案，或桌面捷徑「啟動 System Foundry」。
#
# 純 Python stdlib http.server（configurator_engine.py + foundry_generate.py），
# 不依賴外部套件、不需要 venv、不需要 WSL2 —— 系統 python 就能跑，比
# meeting-service 的啟動腳本單純很多。

$PORT = 8765
$SCRIPT_DIR = $PSScriptRoot
# 產出目錄放在 System_Foundry_v1.6_ARTIFACT_COMPLETE\generated（跟 launch.json 的
# --output-root 一致），不寫死磁碟代號，腳本搬家或換人 clone 到別的路徑仍可用。
$OUTPUT_ROOT = Join-Path $SCRIPT_DIR "..\generated"

function Test-ServerListening {
    (Get-NetTCPConnection -LocalPort $PORT -State Listen -ErrorAction SilentlyContinue) -ne $null
}

if (Test-ServerListening) {
    Write-Host "已經在跑了：http://127.0.0.1:$PORT" -ForegroundColor Green
    Start-Process "http://127.0.0.1:$PORT"
    exit
}

Start-Process -FilePath "python" `
    -ArgumentList "serve_configurator.py", "--host", "127.0.0.1", "--port", "$PORT", "--output-root", "`"$OUTPUT_ROOT`"" `
    -WorkingDirectory $SCRIPT_DIR `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$SCRIPT_DIR\server.log" `
    -RedirectStandardError "$SCRIPT_DIR\server.err.log"

# 輪詢式等待，不用固定 sleep——啟動快就早點開瀏覽器，啟動慢也不會太早判定失敗。
$ok = $false
for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerListening) { $ok = $true; break }
}

if ($ok) {
    Write-Host "啟動成功 -> http://127.0.0.1:$PORT" -ForegroundColor Green
    Start-Process "http://127.0.0.1:$PORT"
} else {
    Write-Host "10 秒內沒有偵測到 $PORT 在監聽。查看 log：" -ForegroundColor Red
    Write-Host "  $SCRIPT_DIR\server.err.log" -ForegroundColor Yellow
}
