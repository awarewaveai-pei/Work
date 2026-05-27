<#
.SYNOPSIS
  Sync Claude Code user-level files (hooks/, settings.json, mcp.json) from repo SSOT.

.DESCRIPTION
  Single source of truth for what every machine's ~/.claude/ should look like, so
  Claude Code behaves identically across desktop and laptop.

  SSOT lives in:
    mcp/claude-userlevel/hooks/                 - 19 hook files (cross-machine identical)
    mcp/claude-userlevel/settings.template.json - shared settings (hooks, deny, additionalDirectories, theme, autoUpdatesChannel)
    mcp/claude-userlevel/mcp.template.json      - empty {} (project .mcp.json is the real SSOT for MCP servers)
    mcp/claude-userlevel/manifest.json          - declarative governed-files list

  This script reads manifest.json and applies the right rules per file type.
  Variables ${USERPROFILE}, ${MONOREPO_ROOT} etc. expand at sync time.

.PARAMETER Mode
  install : New machine bootstrap. Overwrites everything.
  merge   : Daily sync (default). Updates governed keys, preserves user-accumulated keys (e.g. permissions.allow).
  verify  : Read-only check. Reports drift, exits non-zero on mismatch. No writes.
  dry-run : Compute actions like merge but only print, don't write.

.PARAMETER NoBackup
  Skip backup before write. Default is to backup to agency-os/Backups/claude-userlevel-<UTC>/.

.PARAMETER Strict
  In verify mode, exit non-zero on ANY drift (even allow list size differences). Default is permissive.

.EXAMPLE
  .\scripts\sync-claude-userlevel.ps1 -Mode verify
  .\scripts\sync-claude-userlevel.ps1 -Mode merge
  .\scripts\sync-claude-userlevel.ps1 -Mode install
  .\scripts\sync-claude-userlevel.ps1 -Mode dry-run

.NOTES
  - Always safe to run: backup-first, mode-gated, idempotent.
  - 30-year design: ALL governed paths come from manifest.json. To add a new file under
    cross-machine governance, just edit manifest.json and add the source under
    mcp/claude-userlevel/. Script logic stays unchanged.
#>
[CmdletBinding()]
param(
  [ValidateSet('install','merge','verify','dry-run')]
  [string]$Mode = 'merge',
  [switch]$NoBackup,
  [switch]$Strict
)

$ErrorActionPreference = 'Stop'
$script:exitCode = 0

. (Join-Path $PSScriptRoot '_console-encoding-helpers.ps1')

# ---------- Locate repo root ----------
function Resolve-MonorepoRoot {
  try {
    $r = Invoke-WithUtf8Console { & git rev-parse --show-toplevel 2>$null }
    if ($LASTEXITCODE -eq 0 -and $r) { return ($r -replace '/', '\').TrimEnd('\') }
  } catch { }
  $envRoot = $env:MONOREPO_ROOT
  if ($envRoot -and (Test-Path $envRoot)) { return $envRoot.TrimEnd('\') }
  # Fall back: walk up looking for .git
  $cur = (Get-Location).Path
  while ($cur -and (Test-Path $cur)) {
    if (Test-Path (Join-Path $cur '.git')) { return $cur.TrimEnd('\') }
    $parent = Split-Path -Parent $cur
    if ($parent -eq $cur) { break }
    $cur = $parent
  }
  throw "Cannot locate monorepo root. Run from inside the repo, or set `$env:MONOREPO_ROOT."
}

$MonorepoRoot = Resolve-MonorepoRoot
$UserProfile = $env:USERPROFILE
$ClaudeRoot = Join-Path $UserProfile '.claude'
$SsotRoot = Join-Path $MonorepoRoot 'mcp\claude-userlevel'
$ManifestPath = Join-Path $SsotRoot 'manifest.json'
$BackupRoot = Join-Path $MonorepoRoot ('agency-os\Backups\claude-userlevel-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))

# ---------- Pre-flight ----------
if (-not (Test-Path $ClaudeRoot)) {
  throw "User-level Claude root not found: $ClaudeRoot (Claude Code not installed?)"
}
if (-not (Test-Path $ManifestPath)) {
  throw "Manifest not found: $ManifestPath"
}
$manifest = Get-Content $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " sync-claude-userlevel.ps1  (mode=$Mode)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  monorepo root : $MonorepoRoot"
Write-Host "  user profile  : $UserProfile"
Write-Host "  ssot root     : $SsotRoot"
Write-Host "  claude root   : $ClaudeRoot"
Write-Host "  manifest ver  : $($manifest.version)"
Write-Host ""

# ---------- Variable expansion ----------
function Expand-Vars([string]$Value) {
  if ($null -eq $Value) { return $Value }
  $userForward = ($UserProfile -replace '\\','/')
  $rootForward = ($MonorepoRoot -replace '\\','/')
  $Value = $Value.Replace('${USERPROFILE_FORWARD}', $userForward)
  $Value = $Value.Replace('${USERPROFILE}', $UserProfile)
  $Value = $Value.Replace('${MONOREPO_ROOT_FORWARD}', $rootForward)
  $Value = $Value.Replace('${MONOREPO_ROOT}', $MonorepoRoot)
  return $Value
}

function Expand-VarsRecursive($obj) {
  if ($null -eq $obj) { return $null }
  if ($obj -is [string]) { return Expand-Vars $obj }
  if ($obj -is [System.Collections.IEnumerable] -and -not ($obj -is [string])) {
    return @($obj | ForEach-Object { Expand-VarsRecursive $_ })
  }
  if ($obj -is [PSCustomObject]) {
    $copy = [ordered]@{}
    foreach ($p in $obj.PSObject.Properties) {
      $copy[$p.Name] = Expand-VarsRecursive $p.Value
    }
    return [PSCustomObject]$copy
  }
  return $obj
}

# ---------- Backup helpers ----------
function Initialize-BackupDir {
  if ($NoBackup) { return }
  if (-not (Test-Path $BackupRoot)) {
    New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
  }
}
function Backup-Path([string]$Path, [string]$RelLabel) {
  if ($NoBackup) { return }
  if (-not (Test-Path $Path)) { return }
  Initialize-BackupDir
  $dest = Join-Path $BackupRoot $RelLabel
  $destDir = Split-Path -Parent $dest
  try {
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force -ErrorAction Stop | Out-Null }
    Copy-Item -Path $Path -Destination $dest -Recurse -Force -ErrorAction Stop
  } catch {
    Write-Host "  WARN: backup failed for '$RelLabel' -> '$dest': $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

# ---------- Hash helpers ----------
function Get-FileMd5([string]$Path) {
  if (-not (Test-Path $Path -PathType Leaf)) { return $null }
  return (Get-FileHash -Path $Path -Algorithm MD5).Hash
}

# ---------- DIRECTORY MIRROR (hooks/, commands/, …) ----------
function Sync-Directory-Mirror($spec, [string]$mode, [string]$label = 'dir') {
  $src = Join-Path $MonorepoRoot ($spec.source -replace '/','\')
  $tgt = Expand-Vars $spec.target
  if (-not (Test-Path $src)) { throw "Source dir missing: $src" }

  $srcFiles = Get-ChildItem -Path $src -File -Recurse | ForEach-Object {
    @{ rel = $_.FullName.Substring($src.Length).TrimStart('\'); full = $_.FullName }
  }
  $action = @{ create=@(); update=@(); same=@(); extra=@() }

  if (-not (Test-Path $tgt)) {
    if ($mode -in @('install','merge','dry-run')) {
      $action.create += '<DIR>'
    }
  }

  foreach ($f in $srcFiles) {
    $tgtFile = Join-Path $tgt $f.rel
    if (-not (Test-Path $tgtFile)) {
      $action.create += $f.rel
    } else {
      $h1 = Get-FileMd5 $f.full
      $h2 = Get-FileMd5 $tgtFile
      if ($h1 -eq $h2) { $action.same += $f.rel } else { $action.update += $f.rel }
    }
  }

  if (Test-Path $tgt) {
    $tgtFiles = Get-ChildItem -Path $tgt -File -Recurse | ForEach-Object { $_.FullName.Substring($tgt.Length).TrimStart('\') }
    foreach ($tf in $tgtFiles) {
      if (-not ($srcFiles | Where-Object { $_.rel -eq $tf })) {
        $action.extra += $tf
      }
    }
  }

  $colorUpdate = if ($action.update.Count -gt 0) {'Yellow'} else {'Gray'}
  $colorCreate = if ($action.create.Count -gt 0) {'Yellow'} else {'Gray'}
  $colorExtra  = if ($action.extra.Count  -gt 0) {'Magenta'} else {'Gray'}
  Write-Host "[$label] target=$tgt" -ForegroundColor Yellow
  Write-Host ("  same    : {0}" -f $action.same.Count)
  Write-Host ("  update  : {0}" -f $action.update.Count) -ForegroundColor $colorUpdate
  $action.update | ForEach-Object { Write-Host "    ~ $_" }
  Write-Host ("  create  : {0}" -f $action.create.Count) -ForegroundColor $colorCreate
  $action.create | ForEach-Object { Write-Host "    + $_" }
  Write-Host ("  extra   : {0} (only on target, not in SSOT)" -f $action.extra.Count) -ForegroundColor $colorExtra
  $action.extra | ForEach-Object { Write-Host "    ? $_" }

  if ($mode -in @('verify','dry-run')) {
    if ($action.update.Count -gt 0 -or $action.create.Count -gt 0) {
      if ($mode -eq 'verify') { $script:exitCode = 1 }
    }
    if ($Strict -and $action.extra.Count -gt 0 -and $mode -eq 'verify') {
      $script:exitCode = 1
    }
    return
  }

  # install / merge => write
  Backup-Path $tgt "$label-before"
  if (-not (Test-Path $tgt)) { New-Item -ItemType Directory -Path $tgt -Force | Out-Null }
  foreach ($f in $srcFiles) {
    $tgtFile = Join-Path $tgt $f.rel
    $tgtDir = Split-Path -Parent $tgtFile
    if (-not (Test-Path $tgtDir)) { New-Item -ItemType Directory -Path $tgtDir -Force | Out-Null }
    Copy-Item -Path $f.full -Destination $tgtFile -Force
  }
  if ($mode -eq 'install') {
    foreach ($tf in $action.extra) {
      $rmPath = Join-Path $tgt $tf
      Remove-Item -Path $rmPath -Force -ErrorAction SilentlyContinue
    }
  }
  Write-Host "  -> $label synced" -ForegroundColor Green
}

# ---------- JSON MERGE (settings.json) ----------
function Get-NestedKey($obj, [string]$path) {
  $cur = $obj
  foreach ($p in $path -split '\.') {
    if ($null -eq $cur) { return $null }
    if ($cur -is [PSCustomObject]) {
      $cur = $cur.PSObject.Properties[$p]
      if ($null -ne $cur) { $cur = $cur.Value } else { return $null }
    } else { return $null }
  }
  return $cur
}
function Set-NestedKey($obj, [string]$path, $value) {
  $parts = $path -split '\.'
  $cur = $obj
  for ($i = 0; $i -lt $parts.Count - 1; $i++) {
    $p = $parts[$i]
    $existing = $cur.PSObject.Properties[$p]
    if ($null -eq $existing) {
      $cur | Add-Member -MemberType NoteProperty -Name $p -Value ([PSCustomObject]@{})
    }
    $cur = $cur.$p
  }
  $leaf = $parts[-1]
  if ($cur.PSObject.Properties[$leaf]) {
    $cur.$leaf = $value
  } else {
    $cur | Add-Member -MemberType NoteProperty -Name $leaf -Value $value
  }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Sync-Json-Merge($spec, [string]$mode) {
  $src = Join-Path $MonorepoRoot ($spec.source -replace '/','\')
  $tgt = Expand-Vars $spec.target
  if (-not (Test-Path $src)) { throw "Source JSON missing: $src" }

  $tplRaw = Get-Content $src -Raw -Encoding UTF8 | ConvertFrom-Json
  # Strip comment fields and expand vars
  $tplRaw.PSObject.Properties.Remove('_comment') 2>$null
  $tpl = Expand-VarsRecursive $tplRaw

  $existing = $null
  if (Test-Path $tgt) {
    try {
      $existing = Get-Content $tgt -Raw -Encoding UTF8 | ConvertFrom-Json
    } catch {
      Write-Host "  WARN: existing $tgt is not valid JSON; treating as install" -ForegroundColor Yellow
      $existing = $null
    }
  }

  # Snapshot existing JSON before any in-place mutation (used for drift detection)
  $existingJsonBefore = if ($null -ne $existing) { $existing | ConvertTo-Json -Depth 30 -Compress } else { $null }

  $merged = $null
  if ($mode -eq 'install' -or $null -eq $existing) {
    # install: target = template; preserve nothing from existing
    $merged = $tpl
  } else {
    # merge: deep-clone existing via JSON round-trip, then overwrite governed keys with template values
    $merged = $existing | ConvertTo-Json -Depth 30 | ConvertFrom-Json
    foreach ($k in @($spec.overwriteKeys)) {
      $val = Get-NestedKey $tpl $k
      Set-NestedKey $merged $k $val
    }
    # preserveKeys: keep existing values; only fill from template if missing entirely
    foreach ($k in @($spec.preserveKeys)) {
      $existingVal = Get-NestedKey $existing $k
      if ($null -eq $existingVal) {
        $tplVal = Get-NestedKey $tpl $k
        if ($null -ne $tplVal) {
          Set-NestedKey $merged $k $tplVal
        }
      }
    }
  }

  # Drift detection:
  # verify  — compare each overwriteKey individually; avoids false positives from PS5.1
  #           ConvertTo-Json key-ordering non-determinism after deep-clone round-trip.
  # merge / install / dry-run — compare full compressed JSON (informational only; sync always writes).
  $mergedJsonAfter = $merged | ConvertTo-Json -Depth 30 -Compress
  $hasDrift = $false
  if ($mode -eq 'verify') {
    # Use Node-based semantic comparison to avoid two PS5.1 false-positive classes:
    #   (a) key-ordering non-determinism after deep-clone round-trip
    #   (b) 1-element-array vs object serialization mismatch (normalizer fixes live file
    #       but PS5.1 still serializes template arrays as objects)
    $verifyScript = Join-Path $MonorepoRoot 'scripts\verify-settings-governed-keys.mjs'
    if (Test-Path $verifyScript) {
      $keysArg = ($spec.overwriteKeys -join ',')
      $nodeOut = & node $verifyScript $src $tgt `
        "USERPROFILE=$UserProfile" "MONOREPO_ROOT=$MonorepoRoot" `
        "overwriteKeys=$keysArg" 2>&1
      $hasDrift = ($LASTEXITCODE -ne 0)
      if ($hasDrift) { foreach ($l in $nodeOut) { Write-Host "  $l" -ForegroundColor DarkYellow } }
    } else {
      # Fallback: per-key PS5.1 comparison (may produce false positives on 1-element arrays)
      foreach ($k in @($spec.overwriteKeys)) {
        $eVal = Get-NestedKey $existing $k
        $tVal = Get-NestedKey $tpl $k
        $eStr = if ($null -ne $eVal) { $eVal | ConvertTo-Json -Depth 30 -Compress } else { 'null' }
        $tStr = if ($null -ne $tVal) { $tVal | ConvertTo-Json -Depth 30 -Compress } else { 'null' }
        if ($eStr -ne $tStr) { $hasDrift = $true; Write-Host "  drifted key: $k" -ForegroundColor DarkYellow }
      }
    }
  } else {
    $hasDrift = ($existingJsonBefore -ne $mergedJsonAfter)
  }

  Write-Host "[settings] target=$tgt" -ForegroundColor Yellow
  $driftLabel = if ($hasDrift) {'YES'} else {'no'}
  Write-Host ("  drift: {0}" -f $driftLabel)

  if ($mode -eq 'verify') {
    if ($hasDrift) { $script:exitCode = 1 }
    return
  }
  if ($mode -eq 'dry-run') { return }

  Backup-Path $tgt 'settings.json.before'
  Write-Utf8NoBom $tgt ($merged | ConvertTo-Json -Depth 30)
  # Workaround PS5.1 ConvertTo-Json bug: 1-element arrays serialize as bare objects.
  # The Node helper rewrites every always-array path (hooks.* + nested matcher.hooks
  # + permissions.{allow,deny,additionalDirectories}) back to array form. Idempotent.
  $normalizer = Join-Path $MonorepoRoot 'scripts\normalize-claude-settings.mjs'
  if (Test-Path $normalizer) {
    & node $normalizer $tgt
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  WARN: normalize-claude-settings exited $LASTEXITCODE; settings.json may have structural drift" -ForegroundColor Yellow
    }
  } else {
    Write-Host "  WARN: normalizer missing at $normalizer (PS5.1 ConvertTo-Json may have flattened 1-element arrays)" -ForegroundColor Yellow
  }
  Write-Host "  -> settings.json synced" -ForegroundColor Green
}

# ---------- JSON REPLACE (mcp.json) ----------
function Sync-Json-Replace($spec, [string]$mode) {
  $src = Join-Path $MonorepoRoot ($spec.source -replace '/','\')
  $tgt = Expand-Vars $spec.target
  if (-not (Test-Path $src)) { throw "Source JSON missing: $src" }

  $tplRaw = Get-Content $src -Raw -Encoding UTF8 | ConvertFrom-Json
  $tplRaw.PSObject.Properties.Remove('_comment') 2>$null
  $tpl = Expand-VarsRecursive $tplRaw
  $tplJson = $tpl | ConvertTo-Json -Depth 20 -Compress

  $existingJson = $null
  if (Test-Path $tgt) {
    try {
      $existingJson = (Get-Content $tgt -Raw -Encoding UTF8 | ConvertFrom-Json) | ConvertTo-Json -Depth 20 -Compress
    } catch { $existingJson = $null }
  }

  $hasDrift = ($tplJson -ne $existingJson)
  $driftLabel2 = if ($hasDrift) {'YES'} else {'no'}
  Write-Host "[mcp] target=$tgt" -ForegroundColor Yellow
  Write-Host ("  drift: {0}" -f $driftLabel2)

  if ($mode -eq 'verify') {
    if ($hasDrift) { $script:exitCode = 1 }
    return
  }
  if ($mode -eq 'dry-run') { return }

  Backup-Path $tgt 'mcp.json.before'
  Write-Utf8NoBom $tgt ($tpl | ConvertTo-Json -Depth 20)
  Write-Host "  -> mcp.json normalized to {} (project .mcp.json is real SSOT)" -ForegroundColor Green
}

# ---------- Dispatch by manifest ----------
foreach ($name in $manifest.files.PSObject.Properties.Name) {
  $spec = $manifest.files.$name
  Write-Host ""
  Write-Host "----- governing: $name ($($spec.type)) -----" -ForegroundColor Cyan
  switch ($spec.type) {
    'directory'    { Sync-Directory-Mirror $spec $Mode $name }
    'merge-json'   { Sync-Json-Merge $spec $Mode }
    'replace-json' { Sync-Json-Replace $spec $Mode }
    default        { Write-Host "  SKIP unknown type: $($spec.type)" -ForegroundColor Magenta }
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
if ($script:exitCode -eq 0) {
  Write-Host " RESULT: PASS  (mode=$Mode)" -ForegroundColor Green
} else {
  Write-Host " RESULT: DRIFT DETECTED  (mode=$Mode, exit=$script:exitCode)" -ForegroundColor Yellow
  if ($Mode -eq 'verify') {
    Write-Host " Run: .\scripts\sync-claude-userlevel.ps1 -Mode merge" -ForegroundColor Yellow
  }
}
if (-not $NoBackup -and (Test-Path $BackupRoot)) {
  Write-Host " backup        : $BackupRoot" -ForegroundColor DarkCyan
}
Write-Host "============================================================" -ForegroundColor Cyan

exit $script:exitCode
