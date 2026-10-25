# Netdata alerting — shared config for SG + EU

> **ks-aw-01 (2026-10-25)**: none of these files is deployed there -- no `health_alarm_notify.conf`, no
> `netdata-ops-inbox-notify.sh`. Netdata alerts reach the operator through Netdata Cloud (claimed; email). Everything
> below describes the retired SG/EU hosts; deploy it to ks-aw-01 only as a deliberate change.

Both VPS run netdata via systemd (not a container). These files are the SSOT; the
machines are deployed copies. Verify with `sha256sum` after any change.

## Why this directory exists (2026-08-15)

The EU host degraded for five days and notified nobody. Two independent gaps:

1. **EU had no notification path at all.** `health_alarm_notify.conf` had
   `SEND_CUSTOM="YES"` but `DEFAULT_RECIPIENT_CUSTOM=""` and the stock
   `custom_sender()` stub, which only logs *"custom_sender() is not configured"*.
   SG had the real sender; EU was never wired. Every EU alarm since install went
   nowhere.
2. **Container alarms ship silent.** netdata's stock `health.d/cgroups.conf` sets
   `to: silent` on `cgroup_10min_cpu_usage` and `cgroup_ram_in_use`, because on a
   generic multi-container host they would be noisy. They detected the incident
   perfectly — `cgroup_ram_in_use` on `trigger-clickhouse` fired **483 times**
   between 08-10 and 08-15, peaking at 93.5% — and every one was discarded.

Net effect: the operator only ever saw downstream symptoms (endpoint timeouts from
Uptime Kuma), never the cause.

## Files

| File | Deploys to | Purpose |
|---|---|---|
| `netdata-ops-inbox-notify.sh` | `/usr/local/bin/` on **both** hosts | `custom_sender()` target; POSTs the alert to the ops inbox |
| `health.d/cgroups.conf` | `/etc/netdata/health.d/` on **both** hosts | Un-silences the two docker-cgroup alarms (`to: sysadmin`) and adds `delay: up 10m` so only sustained problems page |

`health.d/aware-wave.conf` (SG-specific custom alarms) lives in
`../hetzner-phase1-core/netdata/health.d/`.

## Per-host configuration (NOT in git — contains a token)

`/etc/netdata/ops-inbox-webhook.env`, mode `640 root:netdata`:

```
OPS_INBOX_INGEST_TOKEN=<from vault: OPS_INBOX_INGEST_TOKEN>
OPS_INBOX_WEBHOOK_URL=https://app.aware-wave.com/api/webhooks/netdata
OPS_INBOX_RESOLVE=app.aware-wave.com:443:5.223.93.113   # EU only - see below
```

### The `OPS_INBOX_RESOLVE` pin

`app.aware-wave.com` is Cloudflare-proxied and Bot Fight Mode challenges datacenter
IPs. SG is the origin and gets `200`; EU is an external datacenter IP and got
`403 "Just a moment..."` — the same class of failure that made the Uptime Kuma
monitors permanently false-DOWN (fixed 2026-08-12).

`OPS_INBOX_RESOLVE=host:port:ip` is passed to `curl --resolve`, so the request goes
straight to the origin while SNI, the `Host` header and certificate validation stay
intact. **Leave it empty on SG** (it is the origin). One script, no per-host forks.

## Deploy

```bash
scp netdata-ops-inbox-notify.sh <host>:/usr/local/bin/
ssh <host> chmod 755 /usr/local/bin/netdata-ops-inbox-notify.sh
scp health.d/cgroups.conf <host>:/etc/netdata/health.d/
ssh <host> 'killall -USR2 netdata'      # reload health config
```

## Verify (do not trust config presence — prove delivery)

```bash
# 1. recipients are no longer 'silent'
curl -s 'http://127.0.0.1:19999/api/v1/alarms?all' | grep -c '"recipient": *"sysadmin"'

# 2. the full notifier chain, all three transitions
/usr/libexec/netdata/plugins.d/alarm-notify.sh test sysadmin

# 3. the ops-inbox POST specifically (expect 200; 403 + "Just a moment" = CF challenge,
#    meaning OPS_INBOX_RESOLVE is missing or wrong)
set -a; source /etc/netdata/ops-inbox-webhook.env; set +a
curl -sS -o /dev/null -w '%{http_code}\n' \
  ${OPS_INBOX_RESOLVE:+--resolve "$OPS_INBOX_RESOLVE"} \
  -X POST -H "Authorization: Bearer ${OPS_INBOX_INGEST_TOKEN}" \
  -H 'Content-Type: application/json' \
  --data '{"host":"probe","alarm":"probe","status":"CLEAR","source":"netdata-custom-sender"}' \
  "${OPS_INBOX_WEBHOOK_URL}"
```

## Gotcha

Write the env file with **LF** endings. A CRLF file makes bash fail on
`source` with `$'\r': command not found`, and — worse — appends `\r` to the token so
the `Authorization: Bearer` header silently fails auth. This happened during the
2026-08-15 rollout when the file was piped from PowerShell.

## Pinned copy warning

`health.d/cgroups.conf` is a pinned copy of the stock template for the installed
netdata version (v2.11.0 at time of writing), which is how
`netdata edit-config health.d/cgroups.conf` works. On a major netdata upgrade,
re-diff it against the new stock file at
`/usr/lib/netdata/conf.d/health.d/cgroups.conf`.
