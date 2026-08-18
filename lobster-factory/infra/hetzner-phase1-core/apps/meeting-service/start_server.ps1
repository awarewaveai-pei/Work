# 啟動 meeting-service，跟任何終端機/Bash session 脫鉤，關掉那個視窗也不會跟著死。
# 用法：雙擊這個檔案，或在 PowerShell 執行 .\start_server.ps1

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (Get-NetTCPConnection -LocalPort 8420 -ErrorAction SilentlyContinue) {
    Write-Host "已經在跑了：http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
    exit
}

$env:HF_TOKEN = [Environment]::GetEnvironmentVariable("HF_TOKEN", "User")
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"

# -WindowStyle Hidden：背景執行，不佔一個視窗；log 寫檔可查
Start-Process -FilePath "python" -ArgumentList "app.py" `
    -WorkingDirectory $here `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$here\server.log" `
    -RedirectStandardError "$here\server.err.log"

Start-Sleep -Seconds 3
$conn = Get-NetTCPConnection -LocalPort 8420 -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "啟動成功，PID $($conn.OwningProcess) -> http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
} else {
    Write-Host "沒有偵測到 8420 在聽，看 server.err.log 找原因" -ForegroundColor Red
}
