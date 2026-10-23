#requires -Version 5.1
<#
.SYNOPSIS
  Sync the Uptime Kuma push monitor URL from local vault to the production host as
  /etc/default/awarewave-endpoint-alert.local HEARTBEAT_URL.

.DESCRIPTION
  Closes a 30-year stability gap: today the heartbeat URL only lived on the
  host. If the host is rebuilt or the .local file is wiped (parallel
  agent edit, snapshot rollback, manual rm), the heartbeat goes silent
  forever — Kuma marks the monitor DOWN but no one notices. By making the
  vault the single source of truth and providing a one-command sync, the
  re-deploy path is repeatable.

  Idempotent: writes only when content changes; preserves the operator
  drop-in template and comments.

.PARAMETER VaultKey
  Vault entry name. Default: KUMA_HEARTBEAT_SG_ENDPOINT_ALERT.
.PARAMETER SshTarget
  Optional ssh target override (alias or user@host). Default: the production host from scripts/lib/prod-host.ps1.
.PARAMETER RemoteFile
  Destination path on the host. Default: /etc/default/awarewave-endpoint-alert.local.
.PARAMETER DryRun
  Preview action without writing.

.EXAMPLE
  .\scripts\sync-endpoint-alert-heartbeat.ps1
.EXAMPLE
  .\scripts\sync-endpoint-alert-heartbeat.ps1 -DryRun
#>

[CmdletBinding()]
param(
    [string] $VaultKey   = 'KUMA_HEARTBEAT_SG_ENDPOINT_ALERT',
    [string] $SshTarget  = '',
    [string] $RemoteFile = '/etc/default/awarewave-endpoint-alert.local',
    [switch] $DryRun
)

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot "_vault-helpers.ps1")
. (Join-Path $PSScriptRoot "lib\prod-host.ps1")

$store = Read-VaultStore (Resolve-VaultPath)
$url = Get-VaultSecret -Store $store -Name $VaultKey

# Validate URL shape — must be a Kuma push URL on aware-wave domain.
if ($url -notmatch '^https://[A-Za-z0-9._-]+/api/push/[A-Za-z0-9_-]+(\?.*)?$') {
    throw "Vault key $VaultKey does not look like an Uptime Kuma push URL: $($url.Substring(0,[Math]::Min(40,$url.Length)))..."
}

# Build deterministic .local content. Preserves human-facing template.
# Keep this in sync with the operator drop-in baseline shipped on 2026-05-08.
$localContent = @"
# Operator drop-in for awarewave-endpoint-alert. Survives sync-slack-alert-webhooks.ps1.
# Loaded by /etc/systemd/system/awarewave-endpoint-alert.service via EnvironmentFile=-.
# Managed by scripts/sync-endpoint-alert-heartbeat.ps1 — vault is the source of truth.
# All keys here are OPTIONAL.

# --- HEARTBEAT_URL ---
# Push monitor URL on Uptime Kuma. Pinged on every successful endpoint-alert run.
# Sourced from local DPAPI vault key: $VaultKey
HEARTBEAT_URL="$url"

# --- RENOTIFY_AFTER_SEC ---
# Periodic re-up for ongoing incidents. 0 (default) = silent forever for the same
# fingerprint. Common values: 21600 (6h), 43200 (12h), 86400 (24h).
#RENOTIFY_AFTER_SEC=21600
"@

if ($DryRun) {
    Write-Host ("DRY RUN -- would write the following to {0}:{1}" -f (Get-ProdLabel $SshTarget), $RemoteFile) -ForegroundColor Yellow
    $localContent | Write-Host
    exit 0
}

# Encode + ship via single SSH heredoc. base64 avoids quoting headaches.
$contentB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($localContent))

$remoteScript = @'
set -euo pipefail
DEST="__DEST__"
ts=$(date -u +'%Y%m%dT%H%M%SZ')

# Decode incoming payload
NEW_CONTENT=$(printf '%s' "__B64__" | base64 -d)

# Backup existing if present and content differs
if [[ -f "$DEST" ]]; then
  CURRENT=$(cat "$DEST")
  if [[ "$CURRENT" == "$NEW_CONTENT" ]]; then
    echo "$DEST already matches vault — no change"
    exit 0
  fi
  cp -p "$DEST" "${DEST}.bak-${ts}"
  echo "backup: ${DEST}.bak-${ts}"
fi

# Atomic write
umask 077
printf '%s' "$NEW_CONTENT" >"${DEST}.tmp"
mv -f "${DEST}.tmp" "$DEST"
chmod 600 "$DEST"
echo "wrote: $DEST"

# Verify systemd unit can read it
if systemd-analyze verify /etc/systemd/system/awarewave-endpoint-alert.service >/dev/null 2>&1; then
  echo "systemd-analyze verify: OK"
fi

# Sanity probe: pull HEARTBEAT_URL from the file and curl it
HB_URL=$(grep -E '^HEARTBEAT_URL=' "$DEST" | cut -d= -f2- | tr -d '"' | head -1)
if [[ -n "$HB_URL" ]]; then
  code=$(curl -sS -o /dev/null --max-time 8 -w '%{http_code}' "$HB_URL" 2>/dev/null || echo 000)
  if [[ "$code" == 2* ]]; then
    echo "heartbeat probe: HTTP $code (Kuma reachable)"
  else
    echo "heartbeat probe: HTTP $code (NOT 2xx — investigate Kuma monitor)" >&2
    exit 2
  fi
fi
'@

$remoteScript = $remoteScript.Replace("__B64__", $contentB64).Replace("__DEST__", $RemoteFile).Replace([string][char]13, "")

# PowerShell pipe-to-native converts to CRLF, which busybox/bash chokes on.
# Wrap the whole script in base64 + decode-and-run on the far side. The outer
# `ssh` invocation only carries one line of base64 (no CRLF problem).
$remoteB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteScript))
$wrapper = "echo $remoteB64 | base64 -d | sudo bash"

Write-Host ("== sync {0} -> {1}:{2} ==" -f $VaultKey, (Get-ProdLabel $SshTarget), $RemoteFile) -ForegroundColor Cyan
$sshArgs = Get-ProdSshArgs $SshTarget
Invoke-WithUtf8Console { & ssh @sshArgs $wrapper }
$exit = $LASTEXITCODE
if ($exit -ne 0) {
    throw "Remote sync exited $exit. Inspect output above."
}

Write-Host "sync-endpoint-alert-heartbeat: OK" -ForegroundColor Green
