#Requires -Version 5.1
<#
.SYNOPSIS
  staging 站三層對帳：SG 檔案系統 / MariaDB / Supabase wp_sites。

.DESCRIPTION
  存在理由（2026-08-26）
  ---------------------
  佈建一個 staging 站會在三個地方留下東西，而在 deprovision-staging.sh 之前沒有任何拆除
  路徑。實測後果：目錄 7 個（2.0 GB）、資料庫 13 個、wp_sites 只有 3 列 —— 三層數字全對
  不上，而且沒有任何人會知道，因為沒有東西在看。

  拆除路徑修的是「以後不再漏」，這支修的是另一半：**漏了要看得見。** 只做前者的話，下一
  次漂移一樣會安靜長到兩位數才被偶然發現 —— 那正是這批殘留的來歷。

  分類（對帳鍵：目錄用 slug，無主資料庫用 db 名）
    complete      三層都在 —— 正常
    unregistered  有目錄有 DB，但 wp_sites 沒有列 → 內容工具看不到它，佈建 wiring 靜默失敗
    dir_only      只有目錄，沒有 DB → DB 被手工刪過，或建立失敗
    db_only       只有 DB，沒有目錄 → 佈建 step 2 建了 DB 之後才失敗
    row_only      只有 wp_sites 列，SG 上什麼都沒有 → 站被手工刪掉但沒清資料列

  verdict：OK 全部 complete；CRITICAL 任一孤兒類 >= 5 筆（規模代表機制在漏，不是單一意外）；
  其餘 WARN。**blind_spots 非空一律 WARN** —— 偵測器這輪什麼都沒量到時，絕不可以長得像健康。

.NOTES
  唯讀。不刪任何東西 —— 清理一律走 deprovision-staging.sh（有備份、有守衛、要 --confirm）。

  這個檔踩過並修好的五個坑（改動時別踩回去）：
    1. PS 5.1 讀無 BOM 的 .ps1 會當 ANSI/CP950 → CJK 全毀、parse 直接失敗。必須 UTF-8 BOM。
    2. 檔案是 CRLF，here-string 原樣保留 CRLF；送到遠端 bash 會變成 set: -CR: invalid option。
       傳輸前一律把 CRLF 換成 LF：行尾是傳輸格式，不是內容。
    3. bash -s 從 stdin 餵腳本會被迴圈裡的指令吃掉剩餘腳本（bash 回 unexpected end of file）。
       改用 base64 傳輸（provision-staging 與 CJK/cron runbook 的同一個模式）。
    4. 把含引號的指令當 ssh 參數傳，PS 5.1 會拆散巢狀引號（psql 回 option requires an
       argument -- F）。base64 讓引號完全不經過 PS 的原生參數處理。
    5. EAP=Stop 下原生指令只要往 stderr 寫一個字就拋 NativeCommandError → 探測掉進 catch，
       報告變成「全是盲點」。捕獲處必須有 EAP=Continue 守衛（scripts/lint-git-eap-safety.ps1）。
#>
[CmdletBinding()]
param(
    [string]$WorkRoot = "D:\Work",
    # Both probes run on ks-aw-01 (SG + EU folded in 2026-08-31). Explicit target, same convention as
    # check-backup-health.ps1: the old ssh aliases hetzner-sg / hetzner-eu point at released addresses.
    [string]$KsAw01Host       = "145.239.195.47",
    [int]$KsAw01SshPort       = 58122,
    [string]$KsAw01SshUser    = "ubuntu",
    [string]$KsAw01PrivateKey = (Join-Path $env:USERPROFILE ".ssh\id_ed25519")
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# CP950 陷阱防護：EU 探測會回 wp_sites.name，真實客戶站名可能含 CJK。Invoke-SshWithDeadline 自己以 UTF-8
# 解碼 ssh 輸出（不走主控台 ANSI 編碼），並有 keepalive + 總時限（scripts/lib/ssh-deadline.ps1）。
. (Join-Path $PSScriptRoot 'lib\ssh-deadline.ps1')

$reportDir = Join-Path $WorkRoot "agency-os\reports\status"
if (-not (Test-Path -LiteralPath $reportDir)) { New-Item -ItemType Directory -Path $reportDir -Force | Out-Null }
$stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")

# 遠端腳本一律走這個函式：CRLF→LF、base64、EAP 守衛，三個坑一次處理掉，兩個探測共用同一份。
function Invoke-RemoteProbe {
    param([string]$Script)
    $lf = $Script.Replace([string][char]13 + [string][char]10, [string][char]10)
    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($lf))
    $r = Invoke-SshWithDeadline -SshArgs @("-o", "IdentitiesOnly=yes", "-i", $KsAw01PrivateKey, "-p", $KsAw01SshPort, "$KsAw01SshUser@$KsAw01Host", "echo $b64 | base64 -d | sudo bash") -DeadlineSec 120 -ConnectTimeoutSec 25
    # Timeout / transport failure is a blind spot (PROBE_ERROR is what the caller matches), never partial output.
    if ($r.TimedOut) { return "PROBE_ERROR ssh_timeout" }
    if ($r.ExitCode -ne 0) { return ("PROBE_ERROR ssh_exit" + $r.ExitCode + " " + $r.Output) }
    return $r.Output
}

# ── SG 探測：檔案系統 + 資料庫 ─────────────────────────────────────────────
# 輸出刻意保持純 ASCII 與 TAB 分隔 —— 這條路徑上任何 CJK 都要經過 ssh → PowerShell 的編碼
# 轉換，是 CP950 亂碼的經典來源。
# Invariant (both probes): every remote read either succeeds or the probe prints PROBE_ERROR and stops;
# PROBE_OK is printed only after every read succeeded. So zero rows after PROBE_OK is a true zero
# (normal after a full cleanup), and anything short of PROBE_OK is a blind spot.
# A site dir with NO wp-config.php is data (DB "NONE" -> classified "unknown"); a wp-config.php that exists
# but cannot be read is a probe failure. pipefail + no pipes inside `bash -c`, so no read can mask a failure.
$sgProbe = @'
set -u -o pipefail
fail() { echo "PROBE_ERROR $1"; exit 0; }
BASE=/var/www/html/staging
PROD=$(docker exec lobster-wordpress printenv WORDPRESS_DB_NAME 2>/dev/null) || fail main_db_name_unreadable
PROD=${PROD//$'\r'/}
[ -n "$PROD" ] || fail main_db_name_unreadable
list=$(docker exec lobster-wordpress bash -c "test -d $BASE && ls -1 $BASE" 2>/dev/null) || fail staging_dir_list_failed
for d in ${list//$'\r'/}; do
  kb=$(docker exec lobster-wordpress du -sk "$BASE/$d" 2>/dev/null) || fail "du_failed:$d"
  kb=${kb%%[[:space:]]*}
  # Absence must be observed, not inferred from a non-zero exit (a failed docker exec also exits non-zero).
  cfg=$(docker exec lobster-wordpress bash -c 'if [ -f "$1" ]; then echo present; else echo absent; fi' _ "$BASE/$d/wp-config.php" 2>/dev/null) \
    || fail "wp_config_stat_failed:$d"
  case "${cfg//$'\r'/}" in
    present)
      db=$(docker exec -u www-data lobster-wordpress php /usr/local/bin/wp config get DB_NAME --path="$BASE/$d/" 2>/dev/null) \
        || fail "wp_config_read_failed:$d"
      db=${db//$'\r'/} ;;
    absent) db=NONE ;;
    *) fail "wp_config_stat_unexpected:$d" ;;
  esac
  printf 'DIR\t%s\t%s\t%s\n' "$d" "$kb" "${db:-NONE}"
done
dbout=$(docker exec lobster-wordpress-db sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mariadb -uroot -N -e "$1"' _ "select table_schema, round(coalesce(sum(data_length+index_length),0)/1024/1024,1) from information_schema.tables where table_schema rlike '^wp_' and table_schema <> '$PROD' group by table_schema;" 2>/dev/null) \
  || fail db_query_failed
printf '%s\n' "$dbout" | tr -d '\r' | while IFS=$'\t' read -r n s; do [ -n "$n" ] && printf 'DB\t%s\t%s\n' "$n" "$s"; done
echo "PROBE_OK"
'@

$euProbe = @'
out=$(docker exec supabase-db psql -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -t -A -F'|' -c "select url, name, active, coalesce(organization_id::text,'') from public.wp_sites order by created_at;" 2>/dev/null) \
  || { echo "PROBE_ERROR wp_sites_query_failed"; exit 0; }
printf '%s\n' "$out"
echo "PROBE_OK"
'@

$sgRaw = Invoke-RemoteProbe -Script $sgProbe
$euRaw = Invoke-RemoteProbe -Script $euProbe

# ── 解析 ───────────────────────────────────────────────────────────────────
$blindSpots = New-Object System.Collections.ArrayList
if ($sgRaw -match 'PROBE_ERROR|Permission denied|Could not resolve') { [void]$blindSpots.Add("sg_probe") }
if ($euRaw -match 'PROBE_ERROR|Permission denied|Could not resolve|FATAL') { [void]$blindSpots.Add("eu_probe") }

$TAB = [string][char]9
$dirs = @{}   # slug   -> @{ sizeKb; db }
$dbs  = @{}   # dbname -> sizeMb
foreach ($line in ($sgRaw -split "`r?`n")) {
    $p = $line -split $TAB
    if ($p.Count -ge 4 -and $p[0] -eq 'DIR') { $dirs[$p[1]] = @{ sizeKb = [int]$p[2]; db = $p[3] } }
    elseif ($p.Count -ge 3 -and $p[0] -eq 'DB') { $dbs[$p[1]] = $p[2] }
}
# 沒有完成標記 = 探測中途斷掉或輸出格式變了 → 盲點。有標記時 0 個目錄是真的 0（全部拆乾淨後的正常狀態），
# 不能再用「目錄數 = 0」當盲點判準（2026-09-24 全數清除後會永久誤報）。
if ($sgRaw -notmatch '(?m)^PROBE_OK\s*$' -and $blindSpots -notcontains 'sg_probe') { [void]$blindSpots.Add("sg_parse_empty") }

$rows = @{}   # slug -> @{ url; name; active; org }
foreach ($line in ($euRaw -split "`r?`n")) {
    $p = $line.Trim() -split '\|'
    if ($p.Count -ge 4 -and $p[0] -match '^https?://') {
        $slug = ($p[0].TrimEnd('/') -split '/')[-1]
        $rows[$slug] = @{ url = $p[0]; name = $p[1]; active = $p[2]; org = $p[3] }
    }
}
if ($euRaw -notmatch '(?m)^PROBE_OK\s*$' -and $blindSpots -notcontains 'eu_probe') { [void]$blindSpots.Add("eu_parse_empty") }

# wp_sites 也有非 staging 的站（Soulful / AwareWave 本站）。它們不是 staging 佈建的產物，
# 拿 staging 的對帳規則去判會產生永久假警報 —— 而永久警報等於被忽略的偵測器。
$stagingRows = @{}
foreach ($k in $rows.Keys) { if ($rows[$k].url -like '*/staging/*') { $stagingRows[$k] = $rows[$k] } }

$findings = New-Object System.Collections.ArrayList
$allSlugs = @(@($dirs.Keys) + @($stagingRows.Keys) | Sort-Object -Unique)
foreach ($slug in $allSlugs) {
    $hasDir = $dirs.ContainsKey($slug)
    $hasRow = $stagingRows.ContainsKey($slug)
    $dbName = if ($hasDir) { $dirs[$slug].db } else { "" }
    $hasDb  = ($dbName -and $dbName -ne 'NONE' -and $dbs.ContainsKey($dbName))
    $class =
        if     ($hasDir -and $hasDb -and $hasRow)      { "complete" }
        elseif ($hasDir -and $hasDb -and -not $hasRow) { "unregistered" }
        elseif ($hasDir -and -not $hasDb)              { "dir_only" }
        elseif (-not $hasDir -and $hasRow)             { "row_only" }
        else                                           { "unknown" }
    [void]$findings.Add([pscustomobject]@{
        slug = $slug; class = $class
        dir = $hasDir; sizeKb = $(if ($hasDir) { $dirs[$slug].sizeKb } else { 0 })
        db = $dbName; dbPresent = $hasDb
        row = $hasRow
        active = $(if ($hasRow) { $stagingRows[$slug].active } else { "" })
        org = $(if ($hasRow) { $stagingRows[$slug].org } else { "" })
    })
}

# 沒有任何目錄指向的資料庫：對帳鍵是 db 名而不是 slug，所以獨立走一遍。
$claimedDbs = @($findings | Where-Object { $_.db } | ForEach-Object { $_.db })
foreach ($dbName in ($dbs.Keys | Sort-Object)) {
    if ($claimedDbs -notcontains $dbName) {
        [void]$findings.Add([pscustomobject]@{
            slug = "(none)"; class = "db_only"; dir = $false; sizeKb = 0
            db = $dbName; dbPresent = $true; row = $false; active = ""; org = ""
        })
    }
}

$counts = @{}
foreach ($c in @("complete","unregistered","dir_only","db_only","row_only","unknown")) {
    $counts[$c] = @($findings | Where-Object { $_.class -eq $c }).Count
}
$orphanTotal = $counts["unregistered"] + $counts["dir_only"] + $counts["db_only"] + $counts["row_only"] + $counts["unknown"]

# Set-StrictMode 下 Measure-Object 對空集合不回傳含 Sum 的物件，直接取 .Sum 會拋
# PropertyNotFoundStrict。偵測器自己炸掉是最糟的失敗方式（看起來像沒問題），先算長度。
$dirSizes = @($findings | Where-Object { $_.dir } | ForEach-Object { $_.sizeKb })
$diskMb = if ($dirSizes.Count -gt 0) { [math]::Round((($dirSizes | Measure-Object -Sum).Sum) / 1024, 1) } else { 0 }

$maxOrphanClass = 0
foreach ($c in @("unregistered","dir_only","db_only","row_only","unknown")) {
    if ($counts[$c] -gt $maxOrphanClass) { $maxOrphanClass = $counts[$c] }
}
$verdict =
    if ($blindSpots.Count -gt 0)   { "WARN" }
    elseif ($orphanTotal -eq 0)    { "OK" }
    elseif ($maxOrphanClass -ge 5) { "CRITICAL" }
    else                           { "WARN" }

# ── 輸出 ───────────────────────────────────────────────────────────────────
$json = [pscustomobject]@{
    generated_utc   = $stamp
    overall         = $verdict
    blind_spots     = @($blindSpots)
    counts          = $counts
    orphan_total    = $orphanTotal
    staging_disk_mb = $diskMb
    findings        = @($findings)
} | ConvertTo-Json -Depth 6
Set-Content -Path (Join-Path $reportDir "staging-orphans-LATEST.json") -Value $json -Encoding UTF8

$md = New-Object System.Collections.ArrayList
[void]$md.Add("# staging 站三層對帳（SG 檔案 / MariaDB / Supabase wp_sites）")
[void]$md.Add("")
[void]$md.Add("- generated: $stamp")
[void]$md.Add("- verdict: **$verdict**")
[void]$md.Add("- staging 磁碟用量: $diskMb MB")
[void]$md.Add("- 孤兒總數: $orphanTotal（complete: " + $counts["complete"] + "）")
if ($blindSpots.Count -gt 0) {
    [void]$md.Add("")
    [void]$md.Add("> **BLIND SPOT**: " + ($blindSpots -join ", "))
    [void]$md.Add("> 這一輪有偵測器什麼都沒量到。未量到不等於健康，所以 verdict 一律 WARN 而非 OK。")
}
[void]$md.Add("")
[void]$md.Add("| slug | 分類 | 目錄 | 大小 | 資料庫 | wp_sites |")
[void]$md.Add("|---|---|---|---|---|---|")
foreach ($f in ($findings | Sort-Object class, slug)) {
    $size = if ($f.sizeKb -gt 0) { [string][math]::Round($f.sizeKb / 1024, 0) + " MB" } else { "-" }
    $dbTxt = if ($f.db -and $f.db -ne 'NONE') { $f.db + $(if (-not $f.dbPresent) { " (缺)" } else { "" }) } else { "-" }
    $rowTxt = if ($f.row) { "active=" + $f.active } else { "-" }
    $dirTxt = if ($f.dir) { "V" } else { "-" }
    [void]$md.Add("| " + $f.slug + " | " + $f.class + " | $dirTxt | $size | $dbTxt | $rowTxt |")
}
[void]$md.Add("")
[void]$md.Add("## 清理方式")
[void]$md.Add("")
[void]$md.Add('唯讀報告。清理走被探測那台主機上的 `deprovision-staging.sh`（先備份、有守衛、要 --confirm）：')
[void]$md.Add("")
[void]$md.Add('```bash')
# Same target the probes just used (parameters, not a second hard-coded copy).
$sshCmd = "ssh -i `"$KsAw01PrivateKey`" -p $KsAw01SshPort $KsAw01SshUser@$KsAw01Host `"sudo /root/lobster-phase1/scripts/deprovision-staging.sh"
[void]$md.Add("$sshCmd --slug <slug>`"   # DRY RUN")
[void]$md.Add("$sshCmd --slug <slug> --apply --confirm <slug>`"")
[void]$md.Add("$sshCmd --db <db> --apply --confirm <db>`"   # db_only")
[void]$md.Add('```')
[void]$md.Add("")
[void]$md.Add('`db_only` 用 `--db`：只接受 staging 命名、不是主站 DB、且沒有任何 staging wp-config 指向它；先 dump 備份再 DROP（含同名帳號）。')
Set-Content -Path (Join-Path $reportDir "staging-orphans-LATEST.md") -Value ($md -join "`r`n") -Encoding UTF8

Write-Host "staging-orphans: verdict=$verdict orphans=$orphanTotal disk=${diskMb}MB blind_spots=$($blindSpots.Count)"
if ($verdict -eq "OK") { exit 0 } else { exit 1 }
