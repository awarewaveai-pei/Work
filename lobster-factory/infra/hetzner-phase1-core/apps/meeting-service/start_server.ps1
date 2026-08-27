# 啟動 meeting-service，跟任何終端機/Bash session 脫鉤，關掉那個視窗也不會跟著死。
# 用法：雙擊這個檔案，或桌面捷徑「啟動會議處理服務」。
#
# 2026-08-27 改走 WSL2：Windows 的 Smart App Control（SAC）封鎖 av 套件未簽章的
# .pyd（ImportError: DLL load failed ... 應用程式控制原則已封鎖此檔案），而該機
# SAC 為「完全鎖定」狀態（VerifiedAndReputablePolicyState=1），Microsoft 官方
# 說明該狀態無法從 UI 關閉。重灌 av 無效——實測全新安裝的檔案照樣被擋，因為
# 擋的是簽章不是損毀。改在 WSL2（Ubuntu）執行，Linux 不受 SAC 管轄。
#
# 使用方式對操作者完全不變：WSL2 的 localhostForwarding 預設開啟，服務綁在
# WSL2 內的 127.0.0.1:8420，Windows 瀏覽器直接連 http://127.0.0.1:8420 就通
# （2026-08-27 實測 HTTP 200 / 27ms）。
#
# 2026-08-20 修正保留：判斷「是否已經在跑」只認 State=Listen。剛關掉的連線會
# 留下 TCP TimeWait 殘留（正常行為，不代表有人在監聽），不過濾會誤判成已在跑，
# 導致只開瀏覽器連到沒人在聽的網址。

$DISTRO = "Ubuntu"
$VENV = "~/mtg-venv/bin/python"
# 從腳本自身位置推導 WSL 路徑，不寫死磁碟代號與 repo 路徑（repo 搬家或別人
# clone 到不同位置時仍可用）。D:\Work\... -> /mnt/d/Work/...
$_drive = $PSScriptRoot.Substring(0, 1).ToLower()
$_rest = $PSScriptRoot.Substring(2) -replace '\\', '/'
$APPDIR = "/mnt/$_drive$_rest"

function Test-ServerListening {
    (Get-NetTCPConnection -LocalPort 8420 -State Listen -ErrorAction SilentlyContinue) -ne $null
}

if (Test-ServerListening) {
    Write-Host "已經在跑了：http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
    exit
}

# WSL2 是否可用——沒裝或沒開的話要講清楚，不要讓使用者對著失敗的瀏覽器分頁猜。
# 注意：wsl --list 輸出是 UTF-16LE 且為多行（PowerShell 收成字串陣列）。
# 對陣列用 -notmatch 是「過濾」語意不是布林判斷——回傳的是不符合的元素集合，
# 只要有任何一個其他發行版存在就非空即為 true，會誤判成「找不到 Ubuntu」。
# 必須先攤平成單一字串再比對（2026-08-27 實測踩到）。
$distros = ((wsl.exe --list --quiet) -replace "`0", "") -join "`n"
if ($LASTEXITCODE -ne 0 -or ($distros -notlike "*$DISTRO*")) {
    Write-Host "找不到 WSL2 發行版 '$DISTRO'。這支工具現在需要 WSL2 才能跑" -ForegroundColor Red
    Write-Host "（原因：Windows Smart App Control 封鎖 av 套件，見本檔開頭說明）" -ForegroundColor Red
    Write-Host "安裝：wsl --install -d Ubuntu，再依 README「WSL2 執行」章節建立 venv" -ForegroundColor Yellow
    exit 1
}

# 環境變數從 Windows User scope 讀出來，透過 WSLENV 傳進 WSL2。
# 未設定時保持空白，Google Drive 同步功能就會安全停用（見 lib/archive.py 開頭
# 說明）。別人拿這份程式去自己電腦跑，這裡天生就是空的，不會意外連到操作者的
# 雲端路徑。
$hfToken = [Environment]::GetEnvironmentVariable("HF_TOKEN", "User")
$driveBase = [Environment]::GetEnvironmentVariable("MEETING_DRIVE_BASE", "User")

# MEETING_DRIVE_BASE 是 Windows 路徑（H:\...），WSL2 內要換成 /mnt/h/... 才存取得到。
$driveBaseWsl = ""
if ($driveBase) {
    $drv = $driveBase.Substring(0, 1).ToLower()
    $rest = $driveBase.Substring(2) -replace '\\', '/'
    $driveBaseWsl = "/mnt/$drv$rest"
}

# 環境變數透過 WSLENV 傳進 WSL2（Windows 端設好同名變數 + WSLENV 宣告要轉送）。
# 不用「在 bash 命令列前面塞 VAR=值」的寫法：那需要把整串命令當單一參數傳給
# Start-Process，而它對含空白的參數不會自動加引號，命令會被拆碎（見 .sh 開頭）。
$env:MEETING_HF_TOKEN = $hfToken
$env:MEETING_DRIVE_BASE = $driveBaseWsl
# 模型快取指向 Windows 既有的（large-v3 2.9GB / medium 1.5GB 已下載完成），
# 避免在 WSL2 內重下一份——實測 WSL2 下載大檔會斷流卡死，這是繞過那個問題的關鍵。
# （.sh 內也有同樣的預設值，這裡設定是為了讓 Windows 端的使用者名稱正確帶入。）
$env:HF_HOME = "/mnt/c/Users/$env:USERNAME/.cache/huggingface"
# WSLENV 控制哪些變數跨界；不加 /p 因為值已經是 WSL 路徑格式，不需要再轉換
$env:WSLENV = "MEETING_HF_TOKEN:MEETING_DRIVE_BASE:HF_HOME"

# 啟動邏輯收斂在 start_server.sh，這裡只傳一個無空白的路徑，避開參數拆碎問題
$sh = "$APPDIR/start_server.sh"
# 先確認 WSL 那側看得到這個檔案。否則 -WindowStyle Hidden 會吞掉 bash 的錯誤，
# 而 /tmp/mtg-server.log 根本不會被建立，下面的失敗訊息就會叫使用者去看一個
# 不存在的 log（2026-08-27 critic 指出）。
& wsl.exe -d $DISTRO -- test -f $sh
if ($LASTEXITCODE -ne 0) {
    Write-Host "WSL2 內找不到啟動腳本：$sh" -ForegroundColor Red
    Write-Host "（若 repo 不在本機磁碟或路徑含空白，請確認 WSL 掛載狀況）" -ForegroundColor Yellow
    exit 1
}
Start-Process -FilePath "wsl.exe" -ArgumentList "-d", $DISTRO, "--", "bash", $sh `
    -WindowStyle Hidden

# 輪詢式等待，不用固定 sleep——啟動快就早點開瀏覽器，啟動慢也不會太早判定失敗。
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerListening) { $ok = $true; break }
}

if ($ok) {
    Write-Host "啟動成功（WSL2/$DISTRO）-> http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
} else {
    Write-Host "15 秒內沒有偵測到 8420 在監聽。查看 log：" -ForegroundColor Red
    Write-Host "  wsl -d $DISTRO -- tail -30 /tmp/mtg-server.log" -ForegroundColor Yellow
}
