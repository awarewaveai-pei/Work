#requires -Version 5.1
<#
.SYNOPSIS
  Safe one-command WordPress plugin updater for managed client sites.

.DESCRIPTION
  Flow (per run):
    1. Load client config from tenants/<folder>/core/wp-update-config.json
    2. Pre-flight: SSH reachable + site returning 200
    3. Backup: mysqldump via SSH, verify the dump trailer. ks-aw-01-docker keeps it ON THE HOST
       (/root/backups/wordpress/, DB + plugins folder); shared-ssh downloads it to local backups/
    4. Resolve plugin list (wave1/wave2/wave3/all/csv/list)
    5. Update — wave1/wave2: one-by-one with health check between each
                  wave3/all:  batch then single health check
    6. On health-check fail: restore DB (ks-aw-01-docker: and the plugins folder), halt
    7. Write JSON report to agency-os/reports/wp-updates/

  "Staging" is replaced by: backup-first + per-plugin health check + auto-rollback.
  MainWP (Tier 2) can be layered on top when managing 3+ clients; this script
  remains valid as the CLI/API path regardless.

.PARAMETER ClientSlug
  Short name matching the "clientSlug" field in wp-update-config.json.
  Example: "soulful"  =>  tenants/company-soulful-expression/core/wp-update-config.json

.PARAMETER Plugins
  "list"   — show available updates, no changes
  "wave1"  — high-risk plugins (defined in config); updated one-by-one
  "wave2"  — medium-risk plugins; updated one-by-one
  "wave3"  — low-risk plugins; updated in batch
  "all"    — every available update in batch mode (use with care)
  "theme"  — theme updates only
  CSV      — explicit slugs e.g. "akismet,woocommerce"

.PARAMETER BackupFirst
  Default $true. Set $false only for testing/dry-run scenarios.

.PARAMETER BackupOnly
  Take the pre-update backup (downloaded for shared-ssh, kept on the host for ks-aw-01-docker), then stop.

.PARAMETER DryRun
  Show what would be updated. No SSH writes.

.PARAMETER ReportPath
  Override report output path (default: agency-os/reports/wp-updates/).

.EXAMPLE
  # See what's pending
  .\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins list

  # Update high-risk plugins one-by-one with auto-rollback
  .\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave1

  # Update all remaining low-risk in batch
  .\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins wave3

  # Dry run
  .\scripts\update-client-wp-plugins.ps1 -ClientSlug soulful -Plugins all -DryRun

.NOTES
  30-year design:
  - Config file per client (no hard-coded credentials in this script)
  - shared-ssh: DB password read from server wp-config.php via WP-CLI (never stored in vault);
    ks-aw-01-docker: dump/restore as root inside the DB container, the site's DB password is never read
  - Rollback uploads backup file back via SCP then restores — safe even on shared hosting
  - MainWP Tier 2 upgrade: when you have 3+ WP clients, install MainWP Dashboard
    on aware-wave.com WordPress and use this script's config as the connection template.
    See: agency-os/docs/operations/WP_MANAGED_UPDATES.md
#>

[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)] [string] $ClientSlug,
  [Parameter(Mandatory = $true)] [string] $Plugins,
  [bool]   $BackupFirst = $true,
  [switch] $DryRun,
  [switch] $BackupOnly,
  [string] $ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($BackupOnly -and -not $BackupFirst) { throw "-BackupOnly needs the backup: do not combine it with -BackupFirst:`$false" }
# Every value below reaches a remote shell (paths, WP-CLI args): allow-list them, never escape them.
if ($ClientSlug -notmatch '^[a-z0-9][a-z0-9-]{0,62}$') { throw "Invalid -ClientSlug '$ClientSlug'" }
$SlugRe = '^[a-z0-9][a-z0-9._-]{0,99}$'

# CP950 protection for ssh stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")

$WorkRoot   = Split-Path $PSScriptRoot -Parent
$TenantsDir = Join-Path $WorkRoot 'agency-os\tenants'
$DefaultReportsDir = Join-Path $WorkRoot 'agency-os\reports\wp-updates'

# ── Locate client config ────────────────────────────────────────────────────
$configFile = Get-ChildItem -Path $TenantsDir -Recurse -Filter 'wp-update-config.json' `
  | Where-Object { ($_ | Get-Content -Raw -Encoding UTF8 | ConvertFrom-Json).clientSlug -eq $ClientSlug } `
  | Select-Object -First 1

if (-not $configFile) {
  throw "No wp-update-config.json found for client '$ClientSlug'. " +
        "Create one at: agency-os/tenants/company-<name>/core/wp-update-config.json"
}
$config = $configFile | Get-Content -Raw -Encoding UTF8 | ConvertFrom-Json
Write-Host "Config  : $($configFile.FullName)"
Write-Host "Client  : $($config.clientSlug)  Site: $($config.siteUrl)"

# ── Hosting profile (config "host.profile") ──────────────────────────────────
# Where the site lives decides HOW every remote step runs; the update flow below is identical for both.
#   ks-aw-01-docker : our host (scripts/lib/prod-host.ps1); WP-CLI via `docker exec -u www-data <wpContainer>`,
#                     DB dump/restore as root inside <dbContainer> (its own MARIADB_ROOT_PASSWORD) -- the site's
#                     DB password is never read.
#   shared-ssh      : a client host reached by ssh with WP-CLI on PATH (e.g. shared hosting).
# A config without "host" is the legacy flat shape = shared-ssh. Until 2026-09-24 Soulful's config still named
# its pre-migration Hostinger copy, so this tool would have updated the frozen rollback copy, not the live site.
. (Join-Path $PSScriptRoot "lib\prod-host.ps1")
$hostCfg = if ($config.PSObject.Properties['host']) { $config.host } else { $config }
$hostProfile = if ($hostCfg.PSObject.Properties['profile']) { [string]$hostCfg.profile } else { 'shared-ssh' }
switch ($hostProfile) {
  'ks-aw-01-docker' {
    foreach ($k in 'wpContainer', 'dbContainer') {
      $v = if ($hostCfg.PSObject.Properties[$k]) { [string]$hostCfg.$k } else { '' }
      if ($v -notmatch '^[a-z0-9][a-z0-9_.-]{0,62}$') { throw "host.$k missing or invalid in $($configFile.FullName)" }
    }
    $wpC = [string]$hostCfg.wpContainer; $dbC = [string]$hostCfg.dbContainer
    $sshArgs = Get-ProdSshArgs
    $scp     = Get-ProdScpArgs
    $wpBase  = "sudo docker exec -u www-data $wpC wp --path=/var/www/html"
  }
  'shared-ssh' {
    $rules = @{ sshHost = '^[A-Za-z0-9.-]{1,253}$'; sshPort = '^[0-9]{1,5}$'; sshUser = '^[a-z_][a-z0-9_-]{0,31}$'
                sshKeyName = '^[A-Za-z0-9._-]{1,64}$'; wpPath = '^/[A-Za-z0-9._/-]{1,250}$' }
    foreach ($k in $rules.Keys) {
      $v = if ($hostCfg.PSObject.Properties[$k]) { [string]$hostCfg.$k } else { '' }
      if ($v -notmatch $rules[$k]) { throw "host.$k missing or invalid in $($configFile.FullName)" }
    }
    $sshKey  = Join-Path $env:USERPROFILE ".ssh\$($hostCfg.sshKeyName)"
    $sshArgs = @('-p', [string]$hostCfg.sshPort, '-i', $sshKey, '-o', 'IdentitiesOnly=yes', "$($hostCfg.sshUser)@$($hostCfg.sshHost)")
    $scp     = [pscustomobject]@{ Options = @('-P', [string]$hostCfg.sshPort, '-i', $sshKey, '-o', 'IdentitiesOnly=yes'); Dest = "$($hostCfg.sshUser)@$($hostCfg.sshHost)" }
    $wpBase  = "wp --path='$(([string]$hostCfg.wpPath).TrimEnd('/'))' --allow-root"
  }
  default { throw "Unknown host.profile '$hostProfile' in $($configFile.FullName) (ks-aw-01-docker | shared-ssh)" }
}
Write-Host "Host    : $hostProfile -> $($sshArgs[-1])"

function Invoke-SSH {
  param([string]$Cmd, [switch]$PassThru)
  # The command travels base64-encoded: PowerShell 5.1 strips/mangles embedded double quotes in native
  # arguments, and the docker profile's sh -c '...MYSQL_PWD="$VAR"...' needs them intact.
  # LogLevel=QUIET: benign ssh advisories (post-quantum KEX) would otherwise surface as NativeCommandError.
  # UTF-8 console: CJK site names/titles in WP-CLI output mojibake on Big5-locale Windows otherwise.
  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(($Cmd -replace "`r", '')))
  $out = Invoke-WithUtf8Console {
    & ssh @sshArgs -o BatchMode=yes -o StrictHostKeyChecking=accept-new -o LogLevel=QUIET "echo $b64 | base64 -d | bash" 2>&1
  }
  if ($PassThru) { return $out }
  $out | Write-Verbose
  return $out
}

function Invoke-Wp {  # WP-CLI arguments only; the profile supplies path, user and transport
  param([string]$WpArgs)
  return Invoke-SSH "$wpBase $WpArgs" -PassThru
}

function Copy-FromServer {
  param([string]$Remote, [string]$Local)
  # CP950 protection — scp stderr (e.g. PQ-KEX advisories) may contain non-ASCII
  Invoke-WithUtf8Console {
    & scp @($scp.Options) -o StrictHostKeyChecking=accept-new -o LogLevel=QUIET "$($scp.Dest):$Remote" $Local 2>&1
  } | Write-Verbose
  if ($LASTEXITCODE -ne 0) { throw "scp from server failed (exit $LASTEXITCODE): $Remote" }
}

function Copy-ToServer {
  param([string]$Local, [string]$Remote)
  Invoke-WithUtf8Console {
    & scp @($scp.Options) -o StrictHostKeyChecking=accept-new -o LogLevel=QUIET $Local "$($scp.Dest):$Remote" 2>&1
  } | Write-Verbose
  if ($LASTEXITCODE -ne 0) { throw "scp to server failed (exit $LASTEXITCODE): $Remote" }
}

# ── Health check ─────────────────────────────────────────────────────────────
function Test-SiteHealth {
  param([string]$Url, [int]$TimeoutSec = 20)
  try {
    $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSec `
                              -ErrorAction SilentlyContinue
    if ($resp.StatusCode -ne 200) {
      return [pscustomobject]@{ ok = $false; detail = "HTTP $($resp.StatusCode)" }
    }
    $body = $resp.Content
    if ($body -match 'PHP Fatal error|WordPress database error|There has been a critical error|parse error') {
      return [pscustomobject]@{ ok = $false; detail = 'PHP/WP error in page body' }
    }
    return [pscustomobject]@{ ok = $true; detail = "HTTP 200 OK" }
  } catch {
    return [pscustomobject]@{ ok = $false; detail = $_.Exception.Message }
  }
}

# ── Resolve plugin list ───────────────────────────────────────────────────────
$pluginGroup = $Plugins.ToLower()
# For file names: a CSV list would put commas and 300+ characters into a path.
$fileGroup = if ($pluginGroup -match '^[a-z0-9]+$') { $pluginGroup } else { 'custom' }
$targetSlugs = switch -Wildcard ($pluginGroup) {
  'wave1'  { $config.waves.wave1 }
  'wave2'  { $config.waves.wave2 }
  'wave3'  { $config.waves.wave3 }
  'theme'  { @() }
  'all'    { @() }
  'list'   { @() }
  default  { $Plugins -split ',' | ForEach-Object { $_.Trim() } }
}
foreach ($t in @($targetSlugs)) { if ($t -and $t -notmatch $SlugRe) { throw "Invalid plugin slug '$t'" } }
$batchMode = ($pluginGroup -in @('wave3','all'))

# ── [1/5] Pre-flight ──────────────────────────────────────────────────────────
Write-Host "`n[1/5] Pre-flight checks..."
$pingResult = Invoke-SSH "echo pong" -PassThru
if ($pingResult -notmatch 'pong') { throw "SSH connection failed to $($sshArgs[-1])" }
$wpVer = Invoke-Wp "core version 2>/dev/null"
if (-not (($wpVer | Out-String) -match '^\s*\d+\.\d+')) { throw "WP-CLI unreachable through profile $hostProfile. Output: $wpVer" }
Write-Host "  SSH OK, WordPress $((($wpVer | Out-String).Trim()))"

$preHealth = Test-SiteHealth -Url $config.siteUrl
Write-Host "  Site health: $($preHealth.detail)"
if (-not $preHealth.ok) {
  Write-Warning "Site is already unhealthy BEFORE update: $($preHealth.detail)"
  Write-Warning "Proceeding, but rollback baseline may not be clean."
}

# ── [2/5] Resolve available updates ───────────────────────────────────────────
Write-Host "`n[2/5] Fetching available updates..."

function Parse-WpCliJson {
  param([object]$RawOutput)
  # RawOutput may be a string or a string[] (one element per SSH output line).
  # Join into one string, then extract the JSON array portion (handles WP-CLI
  # notices/warnings that may appear before the JSON on stdout).
  $joined = ($RawOutput | Out-String).Trim()
  # Find the JSON array: everything from first '[' to last ']'
  $start = $joined.IndexOf('[')
  $end   = $joined.LastIndexOf(']')
  if ($start -lt 0 -or $end -lt $start) {
    Write-Verbose "WP-CLI raw output: $joined"
    return @()
  }
  $jsonStr = $joined.Substring($start, $end - $start + 1)
  try {
    return @($jsonStr | ConvertFrom-Json)
  } catch {
    Write-Warning "JSON parse failed. Raw: $joined"
    return @()
  }
}

if ($pluginGroup -ne 'theme') {
  $availRaw  = Invoke-Wp "plugin list --update=available --format=json 2>/dev/null"
  $available = Parse-WpCliJson $availRaw
  if ($null -eq $available) { $available = @() }
  if ([array]$targetSlugs | Measure-Object | Select-Object -ExpandProperty Count) {
    $available = @($available | Where-Object { $targetSlugs -contains $_.name })
  }
} else {
  $availRaw  = Invoke-Wp "theme list --update=available --format=json 2>/dev/null"
  $available = Parse-WpCliJson $availRaw
  if ($null -eq $available) { $available = @() }
}

if ($pluginGroup -eq 'list') {
  Write-Host "`nAvailable updates for '$ClientSlug':"
  if ($available.Count -eq 0) { Write-Host "  (none)" }
  $available | ForEach-Object {
    Write-Host ("  {0,-40} {1} -> {2}" -f $_.name, $_.version, $_.update_version)
  }
  exit 0
}

$badNames = @($available | Where-Object { [string]$_.name -notmatch $SlugRe })
if ($badNames.Count -gt 0) { throw "WP-CLI reported an unexpected plugin name: $($badNames[0].name)" }
if ($available.Count -eq 0 -and -not $BackupOnly) {
  Write-Host "No updates available for the specified group. Nothing to do."
  exit 0
}

Write-Host "Plugins to update ($($available.Count)):"
$available | ForEach-Object {
  Write-Host ("  {0,-40} {1} -> {2}" -f $_.name, $_.version, $_.update_version)
}

if ($DryRun) {
  Write-Host "`n[DRY RUN] Would update $($available.Count) plugin(s). No changes made."
  exit 0
}

# ── [3/5] Backup ─────────────────────────────────────────────────────────────
$timestamp   = (Get-Date -Format 'yyyyMMdd-HHmmss')
$backupLocal = $null
# ks-aw-01-docker: the backup never leaves the host. A download to the operator's laptop made the
# safety gate depend on home-network speed (2026-10-25: 4 MB in 15 min, run killed mid-backup).
$hostBackupDir = '/root/backups/wordpress'
$backupHostDb = $backupHostPlugins = $null
$dbHost = $dbName = $dbUser = $dbPass = $null

# DB name comes from the site's own wp-config in both profiles. Only shared-ssh needs the site's DB
# credentials; ks-aw-01-docker dumps/restores as root inside the DB container with that container's env.
$dbName = ((Invoke-Wp "config get DB_NAME 2>/dev/null") | Out-String).Trim()
if ($dbName -notmatch '^[A-Za-z0-9_]{1,64}$') { throw "Could not read a valid DB_NAME through $hostProfile (got '$dbName')" }
if ($hostProfile -eq 'shared-ssh') {
  $dbHost = ((Invoke-Wp "config get DB_HOST 2>/dev/null") | Out-String).Trim()
  $dbUser = ((Invoke-Wp "config get DB_USER 2>/dev/null") | Out-String).Trim()
  $dbPass = ((Invoke-Wp "config get DB_PASSWORD 2>/dev/null") | Out-String).Trim()
}
# Inside the DB container: root password from its own env, whichever image flavour it is.
$inDb = 'P="${MARIADB_ROOT_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"; [ -n "$P" ] || { echo NO_ROOT_PW >&2; exit 1; }; export MYSQL_PWD="$P"'

if ($BackupFirst) {
  Write-Host "`n[3/5] Taking pre-update backup..."
  $backupRemote = "/tmp/pre-update-${ClientSlug}-${fileGroup}-${timestamp}.sql.gz"
  if ($hostProfile -eq 'ks-aw-01-docker') {
    $backupHostDb      = "$hostBackupDir/$wpC-pre-update-$fileGroup-$timestamp.sql.gz"
    $backupHostPlugins = "$hostBackupDir/$wpC-plugins-pre-update-$fileGroup-$timestamp.tgz"
    $backupRemote      = $backupHostDb
  }
  # pipefail + the dump trailer: a failed dump must not pass as a valid (empty) gzip.
  $dumpBody = if ($hostProfile -eq 'ks-aw-01-docker') {
    "sudo mkdir -p $hostBackupDir`n" +
    "sudo docker exec $dbC sh -c '$inDb; exec `$(command -v mariadb-dump || command -v mysqldump) -uroot --single-transaction --routines --triggers $dbName' | gzip | sudo tee $backupRemote >/dev/null`n" +
    "sudo docker exec $wpC sh -c 'tar --warning=no-file-changed -C /var/www/html/wp-content -czf - plugins; [ `$? -le 1 ]' | sudo tee $backupHostPlugins >/dev/null`n" +
    "sudo tar -tzf $backupHostPlugins >/dev/null`n" +
    "sudo find $hostBackupDir -maxdepth 1 -name '$wpC-*pre-update-*' -mtime +30 -delete"
  } else {
    "printf '[mysqldump]\npassword=%s\n' '$dbPass' > /tmp/.wpmycreds_$timestamp`nmysqldump --defaults-extra-file=/tmp/.wpmycreds_$timestamp --single-transaction -h $dbHost -u $dbUser $dbName | gzip > $backupRemote; rc=`$?`nrm -f /tmp/.wpmycreds_$timestamp`n[ `$rc -eq 0 ]"
  }
  $sudo = if ($hostProfile -eq 'ks-aw-01-docker') { 'sudo ' } else { '' }
  $dumpCmd = if ($hostProfile -eq 'ks-aw-01-docker') {
    "set -eo pipefail`numask 077`n$dumpBody`nsudo gzip -t $backupRemote`nsudo gunzip -c $backupRemote | tail -1 | grep -q 'Dump completed'`necho BACKUP_OK"
  } else {
    # No -e here: the body must always reach the rm of its password file.
    "set -o pipefail`numask 077`n$dumpBody && gzip -t $backupRemote && gunzip -c $backupRemote | tail -1 | grep -q 'Dump completed' && echo BACKUP_OK"
  }
  $dumpResult = Invoke-SSH $dumpCmd -PassThru
  if ($dumpResult -notmatch 'BACKUP_OK') {
    Invoke-SSH "${sudo}rm -f $backupRemote $(if ($backupHostPlugins) { $backupHostPlugins })" | Out-Null
    throw "Backup failed or incomplete (no 'Dump completed' trailer, or plugins archive unreadable). Output: $dumpResult"
  }

  if ($hostProfile -eq 'ks-aw-01-docker') {
    Write-Host "  Backup : host $backupHostDb"
    Write-Host "           host $backupHostPlugins"
    if ($BackupOnly) { Write-Host "BackupOnly: done, nothing updated."; exit 0 }
  } else {
  # SCP to local
  $tenantBackupDir = Join-Path $TenantsDir "$($config.tenantFolder)\backups"
  if (-not (Test-Path $tenantBackupDir)) {
    New-Item -ItemType Directory -Path $tenantBackupDir -Force | Out-Null
  }
  $backupLocal = Join-Path $tenantBackupDir (Split-Path $backupRemote -Leaf)
  if (Test-Path -LiteralPath $backupLocal) { Remove-Item -LiteralPath $backupLocal -Force }
  Copy-FromServer -Remote $backupRemote -Local $backupLocal
  Invoke-SSH "rm -f $backupRemote" | Out-Null
  if (-not (Test-Path $backupLocal) -or (Get-Item $backupLocal).Length -lt 1024) { throw "Backup download failed: $backupLocal" }

  Write-Host "  Backup : $backupLocal ($([math]::Round((Get-Item $backupLocal).Length / 1MB, 1)) MB)"
  if ($BackupOnly) { Write-Host "BackupOnly: done, nothing updated."; exit 0 }
  }
} else {
  Write-Host "`n[3/5] Backup skipped (BackupFirst=false)"
}

# ── Rollback helper ─────────────────────────────────────────────────────────
function Invoke-Rollback {
  param([string]$BackupPath)
  if ($backupHostDb) {
    # Plugins folder first (the failed code goes aside, kept for inspection), then the DB.
    Write-Host "  ROLLBACK: restoring plugins folder and DB from the host backup..."
    $aside = "/var/www/plugins.failed-$timestamp"   # outside the docroot: not reachable as PHP over HTTP
    $stage = "/var/www/html/wp-content/plugins.restore-$timestamp"
    $cmd = "set -o pipefail`n" +
      "sudo docker exec $wpC mkdir $stage && sudo cat $backupHostPlugins | sudo docker exec -i $wpC tar -C $stage -xzf - && " +
      "sudo docker exec $wpC sh -c 'cd /var/www/html/wp-content && mv plugins $aside && mv $stage/plugins plugins && rmdir $stage' && echo PLUGINS_OK`n" +
      "sudo gunzip -c $backupHostDb | sudo docker exec -i $dbC sh -c '$inDb; exec `$(command -v mariadb || command -v mysql) -uroot $dbName' && echo DB_OK"
    $result = Invoke-SSH $cmd -PassThru
    $pOk = $result -match 'PLUGINS_OK'; $dOk = $result -match 'DB_OK'
    if ($pOk -and $dOk) {
      Write-Host "  ROLLBACK: plugins folder + DB restored (failed code in container at $aside)."
    } else {
      Write-Warning ("  ROLLBACK incomplete: plugins={0} db={1}. Backups: {2} + {3}; failed code (if moved) at {4}; staging dir {5}. Output: {6}" -f `
        $(if ($pOk) { 'restored' } else { 'NOT restored' }), $(if ($dOk) { 'restored' } else { 'NOT restored' }),
        $backupHostDb, $backupHostPlugins, $aside, $stage, $result)
    }
    return
  }
  if (-not $BackupPath -or -not (Test-Path $BackupPath)) {
    Write-Warning "No backup available for rollback."
    return
  }
  Write-Host "  ROLLBACK: Uploading backup to server..."
  $rollbackRemote = "/tmp/rollback-${ClientSlug}-${timestamp}.sql.gz"
  Copy-ToServer -Local $BackupPath -Remote $rollbackRemote
  $restoreBody = if ($hostProfile -eq 'ks-aw-01-docker') {
    # -i is fed by the gunzip pipe, never by this script's own stdin.
    "gunzip -c $rollbackRemote | sudo docker exec -i $dbC sh -c '$inDb; exec `$(command -v mariadb || command -v mysql) -uroot $dbName'"
  } else {
    "printf '[client]\npassword=%s\n' '$dbPass' > /tmp/.wpmycreds_rb_$timestamp`ngunzip -c $rollbackRemote | mysql --defaults-extra-file=/tmp/.wpmycreds_rb_$timestamp -h $dbHost -u $dbUser $dbName; rc=`$?`nrm -f /tmp/.wpmycreds_rb_$timestamp`n[ `$rc -eq 0 ]"
  }
  $restoreCmd = "set -o pipefail`n$restoreBody && echo RESTORE_OK`nrm -f $rollbackRemote"
  $result = Invoke-SSH $restoreCmd -PassThru
  if ($result -match 'RESTORE_OK') {
    Write-Host "  ROLLBACK: DB restored successfully."
  } else {
    Write-Warning "  ROLLBACK: DB restore may have failed. Check manually. Output: $result"
  }
}

# ── [4/5] Update ─────────────────────────────────────────────────────────────
Write-Host "`n[4/5] Updating plugins..."
$results  = [System.Collections.Generic.List[pscustomobject]]::new()
$rollback = $false

if ($batchMode) {
  # Batch update (wave3 / all)
  $slugArgs = if (@($targetSlugs).Count -gt 0) { $targetSlugs -join ' ' } else { '--all' }
  $out = Invoke-Wp "plugin update $slugArgs 2>&1"
  Write-Host $out
  $health = Test-SiteHealth -Url $config.siteUrl
  Write-Host "  Health: $($health.detail)"
  foreach ($p in $available) {
    $results.Add([pscustomobject]@{
      plugin = $p.name; from = $p.version; to = $p.update_version
      status = if ($health.ok) { 'success' } else { 'needs-check' }
    })
  }
  if (-not $health.ok) {
    Write-Host "HEALTH CHECK FAILED. Initiating rollback..."
    Invoke-Rollback -BackupPath $backupLocal
    $rollback = $true
    throw "Batch update caused health-check failure. DB rolled back$(if ($backupHostDb) { ' (plugins folder too)' } else { '; check plugin files manually' })."
  }
} else {
  # One-by-one update (wave1 / wave2 / explicit slugs)
  foreach ($plugin in $available) {
    Write-Host "  Updating $($plugin.name): $($plugin.version) -> $($plugin.update_version)"
    $out = Invoke-Wp "plugin update $($plugin.name) 2>&1"
    $outStr = $out -join '; '
    Write-Host "    $outStr"

    # Detect WP-CLI outcome: distinguish actual update from license-blocked skip
    $wpcliUpdated = $outStr -match 'Plugin updated successfully\.|Updated \d+ of \d+ plugins'
    $wpcliLicBlocked = $outStr -match 'Failed to update plugin.*license|Payment Required|Download failed'
    $updateStatus = if ($wpcliUpdated)    { 'updated' }
                    elseif ($wpcliLicBlocked) { 'skipped_license' }
                    else                  { 'updated' }   # fallback: health check is the real gate

    $health = Test-SiteHealth -Url $config.siteUrl
    if ($health.ok) {
      $icon = if ($wpcliLicBlocked) { '[SKIP]' } else { '[OK]' }
      Write-Host "    $icon Health: $($health.detail)$(if ($wpcliLicBlocked) { ' — license-gated; update via WP admin' })"
      $results.Add([pscustomobject]@{
        plugin = $plugin.name; from = $plugin.version; to = $plugin.update_version; status = $updateStatus
      })
    } else {
      Write-Host "    [FAIL] Health: $($health.detail)"
      $results.Add([pscustomobject]@{
        plugin = $plugin.name; from = $plugin.version; to = $plugin.update_version; status = 'failed'
      })
      Write-Host "  HEALTH CHECK FAILED on $($plugin.name). Initiating rollback..."
      Invoke-Rollback -BackupPath $backupLocal
      $rollback = $true
      throw "Plugin '$($plugin.name)' caused health-check failure. DB rolled back. " +
            "Backup: $(if ($backupHostDb) { "$backupHostDb + $backupHostPlugins (plugins folder restored too)" } else { "$backupLocal -- revert the plugin files manually" })"
    }
  }
}

# ── [5/5] Report ─────────────────────────────────────────────────────────────
Write-Host "`n[5/5] Writing report..."
$reportsDir = if ($ReportPath) { Split-Path $ReportPath -Parent } else { $DefaultReportsDir }
if (-not (Test-Path $reportsDir)) { New-Item -ItemType Directory -Path $reportsDir -Force | Out-Null }

$finalHealth    = Test-SiteHealth -Url $config.siteUrl
# @() wrapper prevents $null.Count PropertyNotFoundException in StrictMode when Where-Object returns no matches
$failedItems    = @($results | Where-Object { $_.status -eq 'failed' })
$updatedItems   = @($results | Where-Object { $_.status -eq 'updated' })
$skippedItems   = @($results | Where-Object { $_.status -eq 'skipped_license' })
$report = [pscustomobject]@{
  ok                    = ($failedItems.Count -eq 0) -and (-not $rollback)
  client                = $ClientSlug
  ran_at                = (Get-Date).ToString('o')
  plugins_group         = $Plugins
  backup_path           = $(if ($backupHostDb) { "host:$backupHostDb" } else { $backupLocal })
  backup_plugins_path   = $(if ($backupHostPlugins) { "host:$backupHostPlugins" } else { $null })
  updated_count         = $updatedItems.Count
  skipped_license_count = $skippedItems.Count
  failed_count          = $failedItems.Count
  rollback              = $rollback
  health_final          = $finalHealth.detail
  results               = $results
}

$suffix    = "${ClientSlug}-${fileGroup}-${timestamp}"
$rptFile   = if ($ReportPath) { $ReportPath } else { Join-Path $reportsDir "wp-update-${suffix}.json" }
$latestFile = Join-Path $reportsDir "wp-update-${ClientSlug}-LATEST.json"
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $rptFile   -Encoding UTF8
$report | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $latestFile -Encoding UTF8

Write-Host "Report  : $rptFile"

# ── Sync report to ops dashboard (non-fatal) ─────────────────────────────────
# OPS_PROXY_SHARED_SECRET: env (process / User) first, then the local vault -- until 2026-10-25 it was
# env-only, nobody's shell had it, and the skip was Write-Verbose: the dashboard sat 169 days stale.
# The dashboard org slug can differ from clientSlug ("soulful" vs "soulful-expression"): config orgSlug.
# Server strips backup_path before storing. Failure here does NOT abort the run.
$syncKey = $env:OPS_PROXY_SHARED_SECRET
if (-not $syncKey) { $syncKey = [Environment]::GetEnvironmentVariable('OPS_PROXY_SHARED_SECRET', 'User') }
if (-not $syncKey) {
  try {
    . (Join-Path $PSScriptRoot "_vault-helpers.ps1")
    $syncKey = Get-VaultSecret -Store (Read-VaultStore (Resolve-VaultPath)) -Name 'OPS_PROXY_SHARED_SECRET'
  } catch { $syncKey = $null }
}
$orgSlug = if ($config.PSObject.Properties['orgSlug']) { [string]$config.orgSlug } else { $ClientSlug }
if ($syncKey) {
  $dashboardUrl = "https://app.aware-wave.com/api/ops/clients/$orgSlug/wp-report"
  try {
    $syncBody = $report | ConvertTo-Json -Depth 5
    $syncResp = Invoke-RestMethod -Uri $dashboardUrl -Method POST `
      -ContentType 'application/json' -Body $syncBody `
      -Headers @{ 'X-Ops-Sync-Key' = $syncKey } `
      -ErrorAction Stop
    if ($syncResp.ok) {
      Write-Host "Synced  : Dashboard updated ($dashboardUrl  synced_at: $($syncResp.synced_at))"
    } else {
      Write-Warning "Dashboard sync returned ok=false: $($syncResp | ConvertTo-Json -Compress)"
    }
  } catch {
    Write-Warning "Dashboard sync failed (non-fatal): $($_.Exception.Message)"
  }
} else {
  Write-Warning "OPS_PROXY_SHARED_SECRET not in env or vault: dashboard NOT updated (/client-status will show the previous run)"
}
Write-Host "`n=== SUMMARY ==="
Write-Host ("Updated : {0}   Skipped(license): {1}   Failed: {2}   Rollback: {3}" -f `
  $report.updated_count, $report.skipped_license_count, $report.failed_count, $rollback)
$results | ForEach-Object {
  $icon = switch ($_.status) { 'updated' { '[OK]' } 'skipped_license' { '[SKIP]' } default { '[FAIL]' } }
  Write-Host ("  {0} {1,-40} {2} -> {3}" -f $icon, $_.plugin, $_.from, $_.to)
}
Write-Host "Health  : $($finalHealth.detail)"
if ($skippedItems.Count -gt 0) {
  Write-Host "`nNOTE: $($skippedItems.Count) plugin(s) skipped (license required) — update via WP admin dashboard:" -ForegroundColor Yellow
  $skippedItems | ForEach-Object { Write-Host "  - $($_.plugin)" -ForegroundColor Yellow }
}
if ($report.ok) {
  Write-Host "`nALL UPDATES SUCCESSFUL" -ForegroundColor Green
} else {
  Write-Host "`nUPDATE HAD FAILURES — check report and site manually" -ForegroundColor Red
  exit 1
}
