#requires -Version 5.1
<#
.SYNOPSIS
  Sync the Slack webhook URL from local DPAPI vault to the production host.

.DESCRIPTION
  Writes SLACK_INFRA_ALERTS_WEBHOOK into /root/lobster-phase1/.env (read by scripts/notify.sh, the one host
  sender: endpoint-alert, verify-backup), WEBHOOK_URL + TIMEOUT_SEC into /etc/default/awarewave-endpoint-alert
  (WEBHOOK_URL there only for slack-webhook-selftest.sh until /etc/default is retired), and
  /etc/netdata/health_alarm_notify.conf, then restarts
  Netdata + the endpoint-alert oneshot. Netdata keeps the primary Slack route
  for #infra-alerts and also feeds Ops Inbox so #ops-incidents receives the
  same curated incident stream.

  Single-source design (2026-05-08 refactor):
    - CHECK_URLS is NOT written here. The endpoint-alert.sh built-in default
      list is the only source of truth. If an operator wants a custom list,
      they put a CHECK_URLS line in /etc/default/awarewave-endpoint-alert.local
      (drop-in survives this sync).
    - HEARTBEAT_URL belongs in .local too — managed by
      scripts/sync-endpoint-alert-heartbeat.ps1.
    - This sync is now narrowly scoped to "Slack webhook + Netdata Slack
      transport + Netdata -> Ops Inbox secondary route" — no overlap with any
      other sync.

.PARAMETER VaultSecretName
  Vault key. Default: AGENCY_OS_SLACK_WEBHOOK_URL.
.PARAMETER SshTarget
  Optional ssh target override (alias or user@host). Default: the production host from scripts/lib/prod-host.ps1.
.PARAMETER StorePath
  Optional override for the vault file path.

.NOTES
  Risk tier: Medium (rewrites three prod env files incl. one line of the compose .env, restarts netdata + alerter).
  Idempotent: writes deterministic content, atomic where possible.
#>

[CmdletBinding()]
param(
    [string]$VaultSecretName = "AGENCY_OS_SLACK_WEBHOOK_URL",
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

# #infra-alerts webhook: one line in the host .env (scripts/notify.sh reads it; endpoint-alert and verify-backup ask
# for it by name). Replaced in place via a temp file in the same directory, other lines untouched.
# Fail closed: a grep error (disk full, I/O) or a line count that is off installs nothing; the temp copy never outlives us.
ENVF=/root/lobster-phase1/.env
umask 077
TMPF="$(mktemp "${ENVF}.sync.XXXXXX")"
trap 'rm -f "$TMPF"' EXIT
rc=0; grep -v '^SLACK_INFRA_ALERTS_WEBHOOK=' "$ENVF" > "$TMPF" || rc=$?
[ "$rc" -le 1 ] || { echo "env rewrite: grep failed ($rc) -- .env untouched" >&2; exit 1; }
printf '%s\n' "SLACK_INFRA_ALERTS_WEBHOOK=\"${HOOK}\"" >> "$TMPF"
want=$(( $(grep -vc '^SLACK_INFRA_ALERTS_WEBHOOK=' "$ENVF") + 1 ))
[ "$(wc -l < "$TMPF")" -eq "$want" ] || { echo "env rewrite: line count off -- .env untouched" >&2; exit 1; }
chown --reference="$ENVF" "$TMPF"; chmod --reference="$ENVF" "$TMPF"
mv -f "$TMPF" "$ENVF"
trap - EXIT

# /etc/default/awarewave-endpoint-alert: WEBHOOK_URL (read only by slack-webhook-selftest.sh until /etc/default is
# retired) + TIMEOUT_SEC (the systemd unit requires the file).
# CHECK_URLS comes from endpoint-alert.sh's hard-coded default (single source).
# Operator extension keys (HEARTBEAT_URL, RENOTIFY_AFTER_SEC, custom CHECK_URLS
# overrides) live in /etc/default/awarewave-endpoint-alert.local — managed by
# scripts/sync-endpoint-alert-heartbeat.ps1 and survives this sync.
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
  printf '%s\n' 'DEFAULT_RECIPIENT_SLACK="#infra-alerts"'
  printf '%s\n' ''
  printf '%s\n' '# AwareWave Ops Inbox custom notification (secondary route to #ops-incidents).'
  printf '%s\n' '# Keep Slack configured above for #infra-alerts; this custom sender feeds Ops Inbox.'
  printf '%s\n' 'SEND_CUSTOM="YES"'
  printf '%s\n' 'DEFAULT_RECIPIENT_CUSTOM="ops-inbox"'
  cat <<'NETDATA_CUSTOM_SENDER'
custom_sender() {
  env \
    status="${status:-}" \
    old_status="${old_status:-}" \
    host="${host:-}" \
    args_host="${args_host:-}" \
    alarm="${alarm:-}" \
    name="${name:-}" \
    chart="${chart:-}" \
    value="${value:-}" \
    value_string="${value_string:-}" \
    old_value="${old_value:-}" \
    old_value_string="${old_value_string:-}" \
    info="${info:-}" \
    severity="${severity:-}" \
    status_message="${status_message:-}" \
    raised_for="${raised_for:-}" \
    unique_id="${unique_id:-}" \
    alarm_id="${alarm_id:-}" \
    event_id="${event_id:-}" \
    when="${when:-}" \
    goto_url="${goto_url:-}" \
    /usr/local/bin/netdata-ops-inbox-notify.sh || true
}
NETDATA_CUSTOM_SENDER
} > /etc/netdata/health_alarm_notify.conf
chown root:netdata /etc/netdata/health_alarm_notify.conf
chmod 640 /etc/netdata/health_alarm_notify.conf

cat > /usr/local/bin/netdata-ops-inbox-notify.sh <<'NETDATA_OPS_INBOX_NOTIFY'
#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="/etc/netdata/ops-inbox-webhook.env"
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
fi

: "${OPS_INBOX_INGEST_TOKEN:=}"
: "${OPS_INBOX_WEBHOOK_URL:=https://app.aware-wave.com/api/webhooks/netdata}"

if [[ -z "${OPS_INBOX_INGEST_TOKEN}" ]]; then
  echo "netdata-ops-inbox-notify: OPS_INBOX_INGEST_TOKEN missing" >&2
  exit 0
fi

payload="$(python3 - <<'PY'
import json, os, time

def env(name, default=""):
    return os.environ.get(name, default)

alarm = env("alarm") or env("name")
value_string = env("value_string") or env("value")
payload = {
    "status": env("status", "UNKNOWN"),
    "old_status": env("old_status"),
    "host": env("host") or env("args_host") or "unknown-host",
    "alarm": alarm or "unknown-alarm",
    "name": env("name"),
    "chart": env("chart"),
    "value": env("value"),
    "value_string": value_string,
    "old_value": env("old_value"),
    "old_value_string": env("old_value_string"),
    "info": env("info") or env("status_message") or "Netdata notification",
    "severity": env("severity"),
    "status_message": env("status_message"),
    "raised_for": env("raised_for"),
    "unique_id": env("unique_id") or f"netdata-{int(time.time())}",
    "alarm_id": env("alarm_id"),
    "event_id": env("event_id"),
    "when": env("when"),
    "goto_url": env("goto_url"),
    "source": "netdata-custom-sender",
}
print(json.dumps(payload, ensure_ascii=False))
PY
)"

curl -sS -o /dev/null -w '%{http_code}' \
  -X POST \
  -H "Authorization: Bearer ${OPS_INBOX_INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data "${payload}" \
  "${OPS_INBOX_WEBHOOK_URL}" | grep -Eq '^2' || true
NETDATA_OPS_INBOX_NOTIFY
chown root:root /usr/local/bin/netdata-ops-inbox-notify.sh
chmod 755 /usr/local/bin/netdata-ops-inbox-notify.sh

OPS_TOKEN="$(grep -E '^OPS_INBOX_INGEST_TOKEN=' /root/lobster-phase1/.env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d ' ')"
install -o root -g netdata -m 0640 /dev/null /etc/netdata/ops-inbox-webhook.env
{
  printf '%s\n' "OPS_INBOX_INGEST_TOKEN=${OPS_TOKEN}"
  printf '%s\n' 'OPS_INBOX_WEBHOOK_URL=https://app.aware-wave.com/api/webhooks/netdata'
} > /etc/netdata/ops-inbox-webhook.env
chown root:netdata /etc/netdata/ops-inbox-webhook.env
chmod 640 /etc/netdata/ops-inbox-webhook.env

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
$sshArgs = Get-ProdSshArgs $SshTarget
Invoke-WithUtf8Console { & ssh @sshArgs $wrapper }
if ($LASTEXITCODE -ne 0) {
    throw "Remote sync failed (ssh exit $LASTEXITCODE)"
}

Write-Host "sync-slack-alert-webhooks: OK" -ForegroundColor Green
exit 0
