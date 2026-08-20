# 啟動 meeting-service，跟任何終端機/Bash session 脫鉤，關掉那個視窗也不會跟著死。
# 用法：雙擊這個檔案，或桌面捷徑「啟動會議處理服務」。
#
# 2026-08-20 修正：原本判斷「是否已經在跑」只看 port 8420 有沒有任何連線紀錄，
# 沒有過濾狀態。剛關掉的連線會留下 TCP TimeWait 殘留（正常行為，不代表有人在
# 監聽），被誤判成「已經在跑」，導致腳本跳過啟動、只開瀏覽器，瀏覽器連到一個
# 根本沒人在聽的網址。改成只認 State=Listen 才算數。

function Test-ServerListening {
    (Get-NetTCPConnection -LocalPort 8420 -State Listen -ErrorAction SilentlyContinue) -ne $null
}

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here

if (Test-ServerListening) {
    Write-Host "已經在跑了：http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
    exit
}

$env:HF_TOKEN = [Environment]::GetEnvironmentVariable("HF_TOKEN", "User")
# 未設定時保持空白，Google Drive 同步功能就會安全停用（見 lib/archive.py 開頭說明）。
# 別人拿這份程式去自己電腦跑，這裡天生就是空的，不會意外連到操作者的雲端路徑。
$env:MEETING_DRIVE_BASE = [Environment]::GetEnvironmentVariable("MEETING_DRIVE_BASE", "User")
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUNBUFFERED = "1"

# -WindowStyle Hidden：背景執行，不佔一個視窗；log 寫檔可查
Start-Process -FilePath "python" -ArgumentList "app.py" `
    -WorkingDirectory $here `
    -WindowStyle Hidden `
    -RedirectStandardOutput "$here\server.log" `
    -RedirectStandardError "$here\server.err.log"

# 輪詢式等待，不用固定 sleep——啟動快就早點開瀏覽器，啟動慢也不會太早判定失敗。
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerListening) { $ok = $true; break }
}

if ($ok) {
    $pid_ = (Get-NetTCPConnection -LocalPort 8420 -State Listen -ErrorAction SilentlyContinue).OwningProcess
    Write-Host "啟動成功，PID $pid_ -> http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
} else {
    Write-Host "15 秒內沒有偵測到 8420 在監聽，看 server.err.log 找原因" -ForegroundColor Red
}
