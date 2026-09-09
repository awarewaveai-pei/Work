# 啟動 meeting-service，跟任何終端機/Bash session 脫鉤，關掉那個視窗也不會跟著死。
# 用法：雙擊這個檔案，或桌面捷徑「啟動會議處理服務」。
#
# ═══ 為什麼要自動選執行環境（2026-08-27） ═══
#
# Windows Smart App Control（SAC）會封鎖新安裝套件裡未簽章的 .pyd，症狀是
# `ImportError: DLL load failed ... 應用程式控制原則已封鎖此檔案`。本工具的
# `av`（音訊解碼）踩過這個坑。
#
# **關鍵：這個封鎖通常是暫時的。** SAC 對新檔案先擋、待雲端信譽評估完成後放行
# （README「安裝細節」第 4 條早就記載了這個現象）。2026-08-27 當天上午 `av`
# 被擋、當晚同一支套件同一個檔案就正常了 —— 中間沒有重裝、沒有改設定。
#
# 因此這裡**不預設任何一邊**，每次啟動實測 Windows 能不能 import av：
#   能  -> 走 Windows 原生（GPU：轉錄 7.0x realtime、講者分離 24.4x realtime）
#   不能 -> 自動退到 WSL2（Linux 不受 SAC 管；CPU 2.1x realtime，較慢但能動）
#
# 這樣 SAC 擋或不擋都不需要人介入，也不會像先前那樣「因為當下被擋，就永久改走
# 慢很多的路」——那次判斷失誤讓工具在 GPU 可用的情況下跑 CPU，並且失去講者分離。
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

function Start-OnWindows {
    $env:HF_TOKEN = [Environment]::GetEnvironmentVariable("HF_TOKEN", "User")
    $env:MEETING_DRIVE_BASE = [Environment]::GetEnvironmentVariable("MEETING_DRIVE_BASE", "User")
    $env:VIDEO_WORKER_TOKEN = [Environment]::GetEnvironmentVariable("VIDEO_WORKER_TOKEN", "User")
    $env:PYTHONIOENCODING = "utf-8"
    $env:PYTHONUNBUFFERED = "1"
    Start-Process -FilePath "python" -ArgumentList "app.py" `
        -WorkingDirectory $PSScriptRoot `
        -WindowStyle Hidden `
        -RedirectStandardOutput "$PSScriptRoot\server.log" `
        -RedirectStandardError "$PSScriptRoot\server.err.log"
}

function Start-OnWsl2 {
    # 環境變數透過 WSLENV 傳進 WSL2。不用「在 bash 命令列前面塞 VAR=值」的寫法：
    # 那需要把整串命令當單一參數傳給 Start-Process，而它對含空白的參數不會自動
    # 加引號，命令會被拆碎（見 start_server.sh 開頭的實測紀錄）。
    $driveBase = [Environment]::GetEnvironmentVariable("MEETING_DRIVE_BASE", "User")
    $driveBaseWsl = ""
    if ($driveBase) {
        # MEETING_DRIVE_BASE 是 Windows 路徑（H:\...），WSL2 內要換成 /mnt/h/...
        $drv = $driveBase.Substring(0, 1).ToLower()
        $rest = $driveBase.Substring(2) -replace '\\', '/'
        $driveBaseWsl = "/mnt/$drv$rest"
    }
    $env:MEETING_HF_TOKEN = [Environment]::GetEnvironmentVariable("HF_TOKEN", "User")
    $env:MEETING_DRIVE_BASE = $driveBaseWsl
    $env:VIDEO_WORKER_TOKEN = [Environment]::GetEnvironmentVariable("VIDEO_WORKER_TOKEN", "User")
    # 模型快取指向 Windows 既有的（large-v3 2.9GB / medium 1.5GB 已下載完成），
    # 避免在 WSL2 內重下一份。模型檔是資料不是可執行碼，SAC 不擋。
    $env:HF_HOME = "/mnt/c/Users/$env:USERNAME/.cache/huggingface"
    # WSLENV 控制哪些變數跨界；不加 /p 因為值已經是 WSL 路徑格式，不需再轉換
    $env:WSLENV = "MEETING_HF_TOKEN:MEETING_DRIVE_BASE:VIDEO_WORKER_TOKEN:HF_HOME"

    $sh = "$APPDIR/start_server.sh"
    # 先確認 WSL 那側看得到這個檔案。否則 -WindowStyle Hidden 會吞掉 bash 的
    # 錯誤，而 /tmp/mtg-server.log 根本不會被建立，失敗訊息就會叫使用者去看一個
    # 不存在的 log。
    & wsl.exe -d $DISTRO -- test -f $sh 2>$null
    if ($LASTEXITCODE -ne 0) { return $false }
    Start-Process -FilePath "wsl.exe" -ArgumentList "-d", $DISTRO, "--", "bash", $sh `
        -WindowStyle Hidden
    return $true
}

if (Test-ServerListening) {
    Write-Host "已經在跑了：http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
    exit
}

# ── 探測：Windows 原生能不能用？──
# 直接 import av 是唯一可靠的判斷方式：SAC 的封鎖不會反映在任何設定或版本號上，
# 只會在實際載入 .pyd 的當下才發作。探測失敗不代表壞掉，只代表這次要走 WSL2。
Push-Location -LiteralPath $PSScriptRoot
$probe = & python -c "import av, faster_whisper" 2>&1
$winOk = ($LASTEXITCODE -eq 0)
Pop-Location

$mode = ""
if ($winOk) {
    Write-Host "偵測：Windows 原生可用（GPU 加速，含講者分離）" -ForegroundColor Green
    Start-OnWindows
    $mode = "Windows 原生"
} else {
    Write-Host "偵測：Windows 無法載入 av —— 多半是 SAC 暫時封鎖，改走 WSL2" -ForegroundColor Yellow
    Write-Host "  （$($probe -join ' ' -replace '\s+', ' ' | ForEach-Object { if ($_.Length -gt 110) { $_.Substring(0,110) + '...' } else { $_ } }))" -ForegroundColor DarkGray
    Write-Host "  WSL2 為 CPU 模式，較慢且無講者分離；SAC 放行後下次啟動會自動切回" -ForegroundColor DarkGray

    $distros = ((wsl.exe --list --quiet) -replace "`0", "") -join "`n"
    # 對陣列用 -notmatch 是「過濾」語意不是布林判斷（回傳不符合的元素集合，
    # 只要存在其他發行版就非空即 true），必須先攤平成單一字串再比對。
    if ($LASTEXITCODE -ne 0 -or ($distros -notlike "*$DISTRO*")) {
        Write-Host "後備路徑也不可用：找不到 WSL2 發行版 '$DISTRO'" -ForegroundColor Red
        Write-Host "安裝：wsl --install -d Ubuntu，再依 README「WSL2 執行」章節建立 venv" -ForegroundColor Yellow
        exit 1
    }
    if (-not (Start-OnWsl2)) {
        Write-Host "WSL2 內找不到啟動腳本：$APPDIR/start_server.sh" -ForegroundColor Red
        exit 1
    }
    $mode = "WSL2/$DISTRO"
}

# 輪詢式等待，不用固定 sleep——啟動快就早點開瀏覽器，啟動慢也不會太早判定失敗。
$ok = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Milliseconds 500
    if (Test-ServerListening) { $ok = $true; break }
}

if ($ok) {
    Write-Host "啟動成功（$mode）-> http://127.0.0.1:8420" -ForegroundColor Green
    Start-Process "http://127.0.0.1:8420"
} else {
    Write-Host "15 秒內沒有偵測到 8420 在監聽。查看 log：" -ForegroundColor Red
    if ($winOk) {
        Write-Host "  $PSScriptRoot\server.err.log" -ForegroundColor Yellow
    } else {
        Write-Host "  wsl -d $DISTRO -- tail -30 /tmp/mtg-server.log" -ForegroundColor Yellow
    }
}
