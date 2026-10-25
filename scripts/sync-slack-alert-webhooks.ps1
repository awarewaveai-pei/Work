#requires -Version 5.1
<#
.SYNOPSIS
  Sync the #infra-alerts Slack webhook from the local DPAPI vault to the production host .env.

.DESCRIPTION
  Writes one line, SLACK_INFRA_ALERTS_WEBHOOK, into /root/lobster-phase1/.env (read by scripts/notify.sh, the one host
  sender: endpoint-alert, verify-backup, slack-alert-drill). notify.sh reads .env on every send: nothing to restart.

  Fail closed (2026-10-25, C4.6 step 5): the default vault key used to be AGENCY_OS_SLACK_WEBHOOK_URL, which is the
  host's SLACK_WEBHOOK_URL -- a different channel -- so a run would have moved #infra-alerts traffic elsewhere. Now:
    - host has no value        -> written.
    - host value == vault      -> nothing to do.
    - host value != vault      -> stop, nothing written, unless -ReplaceUrl (a deliberate webhook rotation).
  Values are compared on the host; only sha256 prefixes are printed, never a URL.
  No longer written here: /etc/default/awarewave-endpoint-alert (WEBHOOK_URL had no reader once endpoint-alert moved to
  notify.sh), Netdata's health_alarm_notify.conf (ks-aw-01 alerts via Netdata Cloud email), slack-webhook-selftest.

.PARAMETER VaultSecretName
  Vault key holding the #infra-alerts webhook. Default: SLACK_INFRA_ALERTS_WEBHOOK.
.PARAMETER ReplaceUrl
  Overwrite a different URL already on the host (webhook rotation). Without it a mismatch stops the run.
.PARAMETER SshTarget
  Optional ssh target override (alias or user@host). Default: the production host from scripts/lib/prod-host.ps1.
.PARAMETER StorePath
  Optional override for the vault file path.

.NOTES
  Risk tier: Medium (rewrites one line of the prod compose .env). Idempotent.
#>

[CmdletBinding()]
param(
    [string]$VaultSecretName = "SLACK_INFRA_ALERTS_WEBHOOK",
    [switch]$ReplaceUrl,
    [string]$SshTarget = "",
    [string]$StorePath = ""
)

# CP950 protection for native stdout capture (see scripts/_console-encoding-helpers.ps1).
. (Join-Path $PSScriptRoot "_console-encoding-helpers.ps1")
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

. (Join-Path $PSScriptRoot "_vault-helpers.ps1")
. (Join-Path $PSScriptRoot "lib\prod-host.ps1")

$store = Read-VaultStore (Resolve-VaultPath -Custom $StorePath)
if (-not (Test-VaultSecret -Store $store -Name $VaultSecretName)) {
    throw "Vault missing secret: $VaultSecretName (the #infra-alerts webhook; run secrets-vault.ps1 -Action set-prompt -Name $VaultSecretName)"
}
$hook = Get-VaultSecret -Store $store -Name $VaultSecretName
# Whitelist, not a prefix: a quote, space, CR or $ would be written as-is and break the line notify.sh reads.
if ($hook -notmatch '^https://hooks\.slack\.com/services/[A-Za-z0-9/_-]+$') {
    throw "Unexpected Slack webhook URL format for ${VaultSecretName} (value not shown)"
}

$hookB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($hook))
$replace = if ($ReplaceUrl) { "1" } else { "0" }

$remote = @'
set -euo pipefail
HOOK="$(printf '%s' "__HOOK_B64__" | base64 -d)"
REPLACE="__REPLACE__"
ENVF=/root/lobster-phase1/.env
KEY=SLACK_INFRA_ALERTS_WEBHOOK
sha() { printf '%s' "$1" | sha256sum | cut -c1-10; }

# Read the current value the way notify.sh does (get(): last line, quotes and CR stripped).
cur="$(sed -n "s/^${KEY}=//p" "$ENVF" | tail -1 | tr -d '\r"'"'")"
if [ -n "$cur" ] && [ "$cur" = "$HOOK" ]; then echo "in sync: ${KEY} sha=$(sha "$HOOK") -- nothing written"; exit 0; fi
if [ -n "$cur" ] && [ "$REPLACE" != "1" ]; then
  echo "STOP: host ${KEY} sha=$(sha "$cur") != vault sha=$(sha "$HOOK") -- nothing written. Rotating the webhook? re-run with -ReplaceUrl" >&2
  exit 3
fi

# Replace the one line via a temp file in the same directory, other lines untouched. Fail closed: a grep error
# (disk full, I/O) or a line count that is off installs nothing; the temp copy never outlives us.
umask 077
BAK="${ENVF}.bak-$(date -u +%Y%m%dT%H%M%SZ)-slack-sync"
cp -p "$ENVF" "$BAK"
TMPF="$(mktemp "${ENVF}.sync.XXXXXX")"
trap 'rm -f "$TMPF"' EXIT
rc=0; grep -v "^${KEY}=" "$ENVF" > "$TMPF" || rc=$?
[ "$rc" -le 1 ] || { echo "env rewrite: grep failed ($rc) -- .env untouched" >&2; exit 1; }
printf '%s\n' "${KEY}=\"${HOOK}\"" >> "$TMPF"
n=$(grep -vc "^${KEY}=" "$ENVF") || [ $? -eq 1 ]   # grep -c exits 1 when it counts 0
want=$(( n + 1 ))
[ "$(wc -l < "$TMPF")" -eq "$want" ] || { echo "env rewrite: line count off -- .env untouched" >&2; exit 1; }
chown --reference="$ENVF" "$TMPF"; chmod --reference="$ENVF" "$TMPF"
mv -f "$TMPF" "$ENVF"
trap - EXIT
back="$(sed -n "s/^${KEY}=//p" "$ENVF" | tail -1 | tr -d '\r"'"'")"
[ "$back" = "$HOOK" ] || { cp -p "$BAK" "$ENVF"; echo "readback mismatch after write -- .env restored from backup" >&2; exit 1; }
# Each backup is a full copy of .env (every secret): keep the newest 3.
ls -1t "${ENVF}".bak-*-slack-sync 2>/dev/null | tail -n +4 | xargs -r rm -f
echo "written: ${KEY} sha=$(sha "$HOOK") (was $([ -n "$cur" ] && sha "$cur" || echo none))"
'@

$remote = $remote.Replace("__HOOK_B64__", $hookB64).Replace("__REPLACE__", $replace).Replace([string][char]13, "")

# PowerShell pipe-to-native converts to CRLF, which busybox/bash chokes on.
# Wrap in base64 + decode-and-run on the far side.
$remoteB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remote))
$wrapper = "echo $remoteB64 | base64 -d | sudo bash"

Write-Host "== sync: #infra-alerts webhook -> host .env ($VaultSecretName) ==" -ForegroundColor Cyan
$sshArgs = Get-ProdSshArgs $SshTarget
Invoke-WithUtf8Console { & ssh @sshArgs $wrapper }
if ($LASTEXITCODE -eq 3) { throw "Stopped: host webhook differs from vault (see above); nothing written" }
if ($LASTEXITCODE -ne 0) { throw "Remote sync failed (ssh exit $LASTEXITCODE)" }

Write-Host "sync-slack-alert-webhooks: OK" -ForegroundColor Green
exit 0
