#requires -Version 5.1
<#
.SYNOPSIS
  Sync the Slack webhook URL from local DPAPI vault to the SG VPS.

.DESCRIPTION
  Writes /etc/default/awarewave-endpoint-alert (just WEBHOOK_URL +
  TIMEOUT_SEC) and /etc/netdata/health_alarm_notify.conf, then restarts
  Netdata + the endpoint-alert oneshot.

  Single-source design (2026-05-08 refactor):
    - CHECK_URLS is NOT written here. The endpoint-alert.sh built-in default
      list is the only source of truth. If an operator wants a custom list,
      they put a CHECK_URLS line in /etc/default/awarewave-endpoint-alert.local
      (drop-in survives this sync).
    - HEARTBEAT_URL belongs in .local too — managed by
      scripts/sync-hetzner-endpoint-alert-heartbeat.ps1.
    - This sync is now narrowly scoped to "Slack webhook + Netdata Slack
      transport" — no overlap with any other sync.

.PARAMETER VaultSecretName
  Vault key. Default: AGENCY_OS_SLACK_WEBHOOK_URL.
.PARAMETER SshTarget
  SSH alias for the SG VPS. Default: hetzner.
.PARAMETER StorePath
  Optional override for the vault file path.

.NOTES
  Risk tier: Medium (rewrites two prod env files, restarts netdata + alerter).
  Idempotent: writes deterministic content, atomic where possible.
#>

[CmdletBinding()]
param(
    [string]$VaultSecretName = "AGENCY_OS_SLACK_WEBHOOK_URL",
    [string]$SshTarget = "hetzner",
    [string]$StorePath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_vault-helpers.ps1")

$store = Read-VaultStore (Resolve-VaultPath -Custom $StorePath)
if (-not (Test-VaultSecret -Store $store -Name $VaultSecretName)) {
    throw "Vault missing secret: $VaultSecretName (run secrets-vault.ps1 -Action set-prompt -Name $VaultSecretName)"
}
$hook = Get-VaultSecret -Store $store -Name $VaultSecretName
if ($hook -notmatch '^https://hooks\.slack\.com/services/') {
    throw "Unexpected Slack webhook URL format for ${VaultSecretName}: $($hook.Substring(0,[Math]::Min(40,$hook.Length)))..."
}

$hookB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($hook))

$remote = @'
set -euo pipefail
HOOK="$(printf '%s' "__HOOK_B64__" | base64 -d)"

# /etc/default/awarewave-endpoint-alert: just WEBHOOK_URL + TIMEOUT_SEC.
# CHECK_URLS comes from endpoint-alert.sh's hard-coded default (single source).
# Operator extension keys (HEARTBEAT_URL, RENOTIFY_AFTER_SEC, custom CHECK_URLS
# overrides) live in /etc/default/awarewave-endpoint-alert.local — managed by
# scripts/sync-hetzner-endpoint-alert-heartbeat.ps1 and survives this sync.
umask 077
{
  printf '%s\n' "WEBHOOK_URL=\"${HOOK}\""
  printf '%s\n' 'TIMEOUT_SEC=12'
} > /etc/default/awarewave-endpoint-alert
chmod 600 /etc/default/awarewave-endpoint-alert

# Netdata Slack transport
umask 077
{
  printf '%s\n' 'SEND_SLACK="YES"'
  printf '%s\n' "SLACK_WEBHOOK_URL=\"${HOOK}\""
  printf '%s\n' 'DEFAULT_RECIPIENT_SLACK="#"'
} > /etc/netdata/health_alarm_notify.conf
chown root:netdata /etc/netdata/health_alarm_notify.conf
chmod 640 /etc/netdata/health_alarm_notify.conf

systemctl restart netdata

if command -v /usr/local/bin/slack-webhook-selftest.sh >/dev/null 2>&1; then
  /usr/local/bin/slack-webhook-selftest.sh
else
  echo "note: /usr/local/bin/slack-webhook-selftest.sh missing; skipping self-test" >&2
fi

systemctl restart awarewave-endpoint-alert.service || true
'@

$remote = $remote.Replace("__HOOK_B64__", $hookB64).Replace([string][char]13, "")

# PowerShell pipe-to-native converts to CRLF, which busybox/bash chokes on.
# Wrap in base64 + decode-and-run on the far side.
$remoteB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
$wrapper = "echo $remoteB64 | base64 -d | sudo bash"

Write-Host "== sync: writing VPS env + netdata slack config + restart ==" -ForegroundColor Cyan
& ssh $SshTarget $wrapper
if ($LASTEXITCODE -ne 0) {
    throw "Remote sync failed (ssh exit $LASTEXITCODE)"
}

Write-Host "sync-hetzner-slack-alert-webhooks: OK" -ForegroundColor Green
exit 0
