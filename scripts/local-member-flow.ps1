<#
.SYNOPSIS
  本機 WordPress + 本 repo 外掛 aware-wave-store：把「我的帳號」的會員產品摘要（持有／未開通／退場）各畫一次並截圖。

.DESCRIPTION
  關閉 ADR 021 G9（「全部換成 local 設定跑整套會員流程」）。可重跑、冪等；只連 127.0.0.1，不碰正式站或正式資料庫。

  零件（最少）：
    - WordPress：scripts/bootstrap-local-wordpress-windows.ps1 起 MariaDB + 裝 WP，目錄與資料庫都在 $env:TEMP / 本機獨立名稱。
    - WooCommerce（外掛標頭 Requires Plugins: woocommerce）：wp plugin install（要連 wordpress.org 下載，只第一次）。
    - 外掛 aware-wave-store：從 repo 複製進 wp-content/plugins（robocopy /MIR，每次覆蓋成 repo 現況）。
    - app 那一端：本機沒有 app 資料庫，所以用一支 node stub（寫在 $env:TEMP，不進 repo）只回固定 wp-summary JSON；
      它仍以本機產生的測試密鑰驗 X-AwareWave-Handoff-Signature（HMAC-SHA256 base64）與 ts，簽章或時間不對就回 401，
      所以「外掛簽得對、body 形狀對」也一起被驗到。app 端的真實邏輯由 next-admin vitest 管，不在此重測。
    - 登入：mu-plugin 一次性探針（?awbridge_probe=<本機產生的 token>）替測試會員設 cookie 後導向「我的帳號」。
    - 截圖：Edge headless（--disable-gpu，不用 GPU）；PASS／FAIL 以同一頁的 DOM 文字判斷。

  三種情境（stub 讀 $env:TEMP\local-member-flow\scenario.txt）：
    held   = 持有：內容行銷 方案內 9（可進入）、影片製作 未開通（不可進入），點數 1,240
    none   = 未開通：兩個產品都未開通，沒有任何「進入」產品按鈕（只剩工作台）
    down   = 退場：app 回 503 → 「暫時讀不到你的產品清單」＋工作台＋重新整理

  結束碼：0 = 三種都 PASS；1 = 有 FAIL；2 = 環境起不來（附原因）。密鑰與 token 只存在本機 $env:TEMP，不寫進 repo。

.PARAMETER Port
  本機 WordPress 的 php -S 埠（預設 18770）。

.PARAMETER StubPort
  app stub 埠（預設 18771）。

.PARAMETER KeepRunning
  結束時不關 php -S 與 stub（除錯用）。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\local-member-flow.ps1
#>
param(
    [int]$Port = 18770,
    [int]$StubPort = 18771,
    [switch]$KeepRunning
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$work = Join-Path $env:TEMP "local-member-flow"
$wpRoot = Join-Path $work "wp"
$dbName = "awbridge_member_flow"
$base = "http://127.0.0.1:$Port"
$stubUrl = "http://127.0.0.1:$StubPort"
$pluginSrc = Join-Path $repo "lobster-factory\packages\aware-wave-store-plugin"
$edge = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe") | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
$utf8 = New-Object System.Text.UTF8Encoding $false

function Stop-Env([string]$why) {
    Write-Host "ENV FAIL: $why" -ForegroundColor Red
    exit 2
}

function Invoke-Wp {
    # WP-CLI/PHP print notices on stderr; judge by exit code only.
    Write-Host ("  wp " + (($args | Select-Object -First 2) -join " ")) -ForegroundColor DarkGray   # first two words only: later ones can be secrets
    $prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    try {
        $out = & wp @args "--path=$wpRoot" 2>&1 | ForEach-Object { "$_" }
        return [pscustomobject]@{ Code = $LASTEXITCODE; Out = ($out -join "`n") }
    } finally { $ErrorActionPreference = $prev }
}

function Invoke-WpOk([string]$what) {
    $r = Invoke-Wp @args
    if ($r.Code -ne 0) { Stop-Env "$what (wp exit $($r.Code)): $($r.Out)" }
    return $r.Out
}

if (-not $edge) { Stop-Env "Edge not found (needed for headless screenshots)" }
if (-not (Get-Command wp -ErrorAction SilentlyContinue)) { Stop-Env "wp not on PATH (scripts\setup-wp-cli-windows.ps1)" }
if (-not (Get-Command php -ErrorAction SilentlyContinue)) { Stop-Env "php not on PATH" }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Stop-Env "node not on PATH" }
New-Item -ItemType Directory -Force -Path $work | Out-Null
# WP-CLI unpacks WordPress under the temp dir; the default one is so deep the archive's longest path passes MAX_PATH
# ("could not open for writing", 2026-11-24). Only this process (and its children) use the short one.
$shortTmp = Join-Path ([IO.Path]::GetPathRoot($env:TEMP)) "lmf-tmp"
New-Item -ItemType Directory -Force -Path $shortTmp | Out-Null
$realTemp = $env:TEMP
$env:TEMP = $shortTmp; $env:TMP = $shortTmp

# 0) WordPress core by zip: wp-cli's own tarball extractor fails on current WordPress here ("Permission denied" on
#    wp-includes/php-ai-client/..., 2026-11-24); bootstrap skips its download when wp-load.php already exists.
if (-not (Test-Path -LiteralPath (Join-Path $wpRoot "wp-load.php"))) {
    $zip = Join-Path $work "wordpress-latest.zip"
    if (-not (Test-Path -LiteralPath $zip)) {
        try { Invoke-WebRequest -UseBasicParsing -Uri "https://wordpress.org/latest.zip" -OutFile $zip } catch { Stop-Env "download wordpress zip failed: $($_.Exception.Message)" }
    }
    $unz = Join-Path $work "unzip"
    if (Test-Path -LiteralPath $unz) { Remove-Item -LiteralPath $unz -Recurse -Force }
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [IO.Compression.ZipFile]::ExtractToDirectory($zip, $unz)
    if (Test-Path -LiteralPath $wpRoot) { Remove-Item -LiteralPath $wpRoot -Recurse -Force }
    Move-Item -LiteralPath (Join-Path $unz "wordpress") -Destination $wpRoot
    Remove-Item -LiteralPath $unz -Force
}

# 1) WordPress + MariaDB (idempotent: reuses an installed WP; the stack is scratch, never the pilot in .scratch)
$prev = $ErrorActionPreference; $ErrorActionPreference = "Continue"
try {
    $bootOut = & (Join-Path $PSScriptRoot "bootstrap-local-wordpress-windows.ps1") -WpRoot $wpRoot -DbName $dbName -EnsurePhpIni 2>&1 | ForEach-Object { "$_" }
    $bootCode = $LASTEXITCODE
} finally { $ErrorActionPreference = $prev }
if (-not (Test-Path -LiteralPath (Join-Path $wpRoot "wp-load.php")) -or $bootCode -ne 0) { Stop-Env "bootstrap-local-wordpress-windows.ps1 failed: $($bootOut -join ' | ')" }
$null = Invoke-WpOk "set home" option update home $base
$null = Invoke-WpOk "set siteurl" option update siteurl $base
# permalink_structure stays empty (plain ?page_id= URLs): the fresh install default, and php -S needs no rewrite router
$null = Invoke-Wp config set DISABLE_WP_CRON true --raw --type=constant   # no loopback request: php -S is single-threaded

# 2) WooCommerce, then this repo's plugin (copied, so the run always tests the working tree)
if ((Invoke-Wp plugin is-installed woocommerce).Code -ne 0) { $null = Invoke-WpOk "install woocommerce" plugin install woocommerce }
$null = Invoke-WpOk "activate woocommerce" plugin activate woocommerce
$pluginDst = Join-Path $wpRoot "wp-content\plugins\aware-wave-store"
& robocopy $pluginSrc $pluginDst /MIR /XD tests vendor .git /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Stop-Env "robocopy plugin failed ($LASTEXITCODE)" }
$null = Invoke-WpOk "activate aware-wave-store" plugin activate aware-wave-store

# 3) local-only secrets (new each run; never written under the repo)
function New-Secret([int]$n) { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count $n | ForEach-Object { [char]$_ }) }
$handoffSecret = New-Secret 40
$probeToken = New-Secret 32
[IO.File]::WriteAllText((Join-Path $work "probe-token.txt"), $probeToken, $utf8)
$null = Invoke-WpOk "payments on" option update aware_wave_payments_enabled 1
$null = Invoke-WpOk "target" option update aware_wave_payments_target $stubUrl
$null = Invoke-WpOk "handoff secret" option update aware_wave_handoff_secret $handoffSecret

# 4) test member (customer, email already verified: the verify click is covered by EmailVerification tests)
$email = "member-flow@local.test"
if ((Invoke-Wp user get member-flow --field=ID).Code -ne 0) {
    $pw = New-Secret 24
    $null = Invoke-WpOk "create member" user create member-flow $email --role=customer "--user_pass=$pw"
}
$uid = (Invoke-WpOk "member id" user get member-flow --field=ID).Trim()
$null = Invoke-WpOk "mark verified" user meta update $uid aware_wave_email_verified $email

# 5) mu-plugin probe (login + land on My Account) and the stub app
$mu = Join-Path $wpRoot "wp-content\mu-plugins"
New-Item -ItemType Directory -Force -Path $mu | Out-Null
$probe = @'
<?php
// local-member-flow probe: one-time login for the scratch member, then My Account. Scratch WordPress only.
add_action('init', function () {
	if (empty($_GET['awbridge_probe'])) { return; }
	$tok = trim((string) @file_get_contents(getenv('AWBRIDGE_PROBE_TOKEN_FILE')));
	if ($tok === '' || !hash_equals($tok, (string) $_GET['awbridge_probe'])) { status_header(403); exit('bad token'); }
	$u = get_user_by('login', 'member-flow');
	if (!$u) { status_header(404); exit('no member'); }
	wp_set_current_user($u->ID);
	wp_set_auth_cookie($u->ID);
	wp_safe_redirect(function_exists('wc_get_page_permalink') ? wc_get_page_permalink('myaccount') : home_url('/'));
	exit;
});
'@
[IO.File]::WriteAllText((Join-Path $mu "awbridge-probe.php"), $probe, $utf8)

$stubJs = @'
const http = require("http"), crypto = require("crypto"), fs = require("fs");
const [port, secret, scenarioFile, logFile] = process.argv.slice(2);
const log = (o) => fs.appendFileSync(logFile, JSON.stringify(o) + "\n");
const held = { ok: true, unit: { name: "Local Test Co" }, wallet: { balance: 1240, frozen: false }, products: [
  { key: "content", name: "內容行銷", right: { kind: "contract", label: "方案內 9", counts: {} }, can_enter: true, url: "https://content.aware-wave.com/" },
  { key: "video", name: "影片製作", right: { kind: "none", label: "未開通", counts: {} }, can_enter: false } ] };
const none = { ok: true, unit: { name: "Local Test Co" }, wallet: { balance: 0, frozen: false }, products: [
  { key: "content", name: "內容行銷", right: { kind: "none", label: "未開通", counts: {} }, can_enter: false },
  { key: "video", name: "影片製作", right: { kind: "none", label: "未開通", counts: {} }, can_enter: false } ] };
http.createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    const send = (status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    const want = crypto.createHmac("sha256", secret).update(raw).digest("base64");
    const got = String(req.headers["x-awarewave-handoff-signature"] || "");
    let body = {}; try { body = JSON.parse(raw); } catch (e) {}
    const sigOk = got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
    const fresh = Math.abs(Date.now() / 1000 - Number(body.ts)) <= 60;
    const shape = req.url === "/api/auth/wp-summary" && req.method === "POST" && Number.isInteger(body.wp_user_id) && body.wp_user_id > 0 && /^[A-Za-z0-9_-]{16,100}$/.test(String(body.nonce)) && !("product_key" in body);
    log({ path: req.url, sigOk, fresh, shape, keys: Object.keys(body).sort() });
    if (!sigOk || !fresh) return send(401, { ok: false, error: !sigOk ? "invalid_signature" : "stale_request" });
    if (!shape) return send(400, { ok: false, error: "invalid_json" });
    const sc = fs.readFileSync(scenarioFile, "utf8").trim();
    if (sc === "down") return send(503, { ok: false, error: "unavailable" });
    return send(200, sc === "none" ? none : held);
  });
}).listen(Number(port), "127.0.0.1");
'@
$stubPath = Join-Path $work "stub.js"
[IO.File]::WriteAllText($stubPath, $stubJs, $utf8)
$scenarioFile = Join-Path $work "scenario.txt"
$stubLog = Join-Path $work "stub-requests.log"
if (Test-Path -LiteralPath $stubLog) { Remove-Item -LiteralPath $stubLog -Force }

$env:AWBRIDGE_PROBE_TOKEN_FILE = Join-Path $work "probe-token.txt"
$procs = @()
function Read-Shared([string]$path) {
    try {
        $fs = New-Object IO.FileStream($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        try { $sr = New-Object IO.StreamReader($fs, [Text.Encoding]::UTF8); return $sr.ReadToEnd() } finally { $fs.Dispose() }
    } catch { return "" }
}
function Invoke-Edge([string]$profile, [string[]]$edgeArgs, [string]$out, [switch]$IsDom) {
    # Edge's launcher exits before its children finish writing, and a stuck one must fail this scenario, not hang the run:
    # wait for the output itself (screenshot file / closing </html>) for up to 90 s, then kill that profile's processes.
    $sp = @{ FilePath = $edge; ArgumentList = ($edgeArgs + @("--user-data-dir=`"$profile`"")); PassThru = $true; WindowStyle = "Hidden" }
    if ($IsDom) { $sp.RedirectStandardOutput = $out }
    $p = Start-Process @sp
    $deadline = (Get-Date).AddSeconds(90)
    $done = $false
    while ((Get-Date) -lt $deadline -and -not $done) {
        Start-Sleep -Milliseconds 500
        if ($IsDom) { $done = (Read-Shared $out) -like "*</html>*" } else { $done = (Test-Path -LiteralPath $out) -and (Get-Item -LiteralPath $out).Length -gt 0 }
    }
    Start-Sleep -Milliseconds 500
    Get-CimInstance Win32_Process -Filter "Name = 'msedge.exe'" | Where-Object { $_.CommandLine -like "*$profile*" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    return $done
}
function Free-Port([int]$p) {
    $c = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue
    foreach ($x in @($c)) { if ($x) { Stop-Process -Id $x.OwningProcess -Force -ErrorAction SilentlyContinue } }
}
Free-Port $Port; Free-Port $StubPort

$fails = 0
$results = @()
try {
    Set-Content -LiteralPath $scenarioFile -Value "held" -Encoding ASCII
    $procs += Start-Process -FilePath node -ArgumentList @("`"$stubPath`"", $StubPort, $handoffSecret, "`"$scenarioFile`"", "`"$stubLog`"") -WindowStyle Hidden -PassThru
    $procs += Start-Process -FilePath php -ArgumentList @("-S", "127.0.0.1:$Port", "-t", "`"$wpRoot`"") -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $work "php-out.log") -RedirectStandardError (Join-Path $work "php-err.log")
    $deadline = (Get-Date).AddSeconds(30)
    $up = $false
    while ((Get-Date) -lt $deadline -and -not $up) {
        try { $null = Invoke-WebRequest -UseBasicParsing -Uri "$base/wp-login.php" -TimeoutSec 3; $up = $true } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $up) { Stop-Env "php -S did not answer on $base (see $work\php-err.log)" }

    # expected text per scenario; $must all present, $mustNot all absent
    $cases = @(
        @{ name = "held"; must = @("我的 AwareWave 產品", "內容行銷", "方案內 9", "影片製作", "未開通", "Local Test Co", "1,240", "進入我的工作台");
           mustNot = @("暫時讀不到你的產品清單"); entries = 2 },     # 內容行銷's 進入 + the workspace button
        @{ name = "none"; must = @("我的 AwareWave 產品", "內容行銷", "影片製作", "未開通", "進入我的工作台");
           mustNot = @("方案內", "暫時讀不到你的產品清單"); entries = 1 },   # workspace only
        @{ name = "down"; must = @("暫時讀不到你的產品清單", "進入我的工作台", "重新整理");
           mustNot = @("內容行銷", "影片製作", "方案內"); entries = 1 }
    )
    foreach ($c in $cases) {
        Set-Content -LiteralPath $scenarioFile -Value $c.name -Encoding ASCII
        $null = Invoke-Wp transient delete --all          # the plugin keeps a success 60 s per user
        $png = Join-Path $work ("my-account-{0}.png" -f $c.name)
        $dom = Join-Path $work ("my-account-{0}.html" -f $c.name)
        foreach ($f in @($png, $dom)) { if (Test-Path -LiteralPath $f) { Remove-Item -LiteralPath $f -Force } }
        $url = "$base/?awbridge_probe=$probeToken"
        $common = @("--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", "--disable-sync", "--log-level=3", "--window-size=1024,1400", "--virtual-time-budget=15000")
        $run = Get-Date -Format "HHmmssfff"
        $ok1 = Invoke-Edge "$work\edge-$run-shot" ($common + @("--screenshot=`"$png`"", "`"$url`"")) $png
        $ok2 = Invoke-Edge "$work\edge-$run-dom" ($common + @("--dump-dom", "`"$url`"")) $dom -IsDom
        $text = Read-Shared $dom
        # the doors block only (the rest of the page is WooCommerce's)
        $problems = @()
        if (-not ($ok1 -and $ok2)) { $problems += "Edge timed out" }
        if (-not (Test-Path -LiteralPath $png)) { $problems += "no screenshot" }
        foreach ($m in $c.must) { if ($text -notlike "*$m*") { $problems += "missing '$m'" } }
        foreach ($m in $c.mustNot) { if ($text -like "*$m*") { $problems += "unexpected '$m'" } }
        $enter = ([regex]::Matches($text, 'name="product_key" value="[^"]+"')).Count
        if ($enter -ne $c.entries) { $problems += "expected $($c.entries) enter forms, found $enter" }
        if ($problems.Count -eq 0) { $verdict = "PASS" } else { $verdict = "FAIL"; $fails++ }
        $results += [pscustomobject]@{ Scenario = $c.name; Verdict = $verdict; Screenshot = $png; Problems = ($problems -join "; ") }
    }

    # the stub saw only well-formed, correctly signed, fresh requests (signature + body shape + no wp-handoff body)
    $reqs = if (Test-Path -LiteralPath $stubLog) { @(Get-Content -LiteralPath $stubLog -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json }) } else { @() }
    $bad = @($reqs | Where-Object { -not ($_.sigOk -and $_.fresh -and $_.shape) })
    if ($reqs.Count -lt 3) { $fails++; $results += [pscustomobject]@{ Scenario = "wire"; Verdict = "FAIL"; Screenshot = "-"; Problems = "stub saw $($reqs.Count) requests, expected >= 3" } }
    elseif ($bad.Count -gt 0) { $fails++; $results += [pscustomobject]@{ Scenario = "wire"; Verdict = "FAIL"; Screenshot = "-"; Problems = "$($bad.Count) request(s) with bad signature/ts/shape: $stubLog" } }
    else { $results += [pscustomobject]@{ Scenario = "wire"; Verdict = "PASS"; Screenshot = "-"; Problems = "" } }
} finally {
    if (-not $KeepRunning) {
        foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
    }
}

foreach ($r in $results) {
    $color = if ($r.Verdict -eq "PASS") { "Green" } else { "Red" }
    Write-Host ("{0,-5} {1,-5} {2}  {3}" -f $r.Verdict, $r.Scenario, $r.Screenshot, $r.Problems) -ForegroundColor $color
}
Write-Host "work dir: $work (MariaDB stays up, as after bootstrap-local-wordpress-windows.ps1)"
if ($fails -gt 0) { exit 1 }
exit 0
