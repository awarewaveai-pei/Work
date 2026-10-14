# ks-aw-01 backup pipeline

Daily backup for **ks-aw-01** (`145.239.195.47`, OVH KS-6) — the consolidated host for
Soulful Expression, the former EU/SG stack, and future Chatwoot deployment.

Ported from [`../eu-backup/`](../eu-backup/) — same shape, same log-verdict contract,
read by the same `scripts/check-backup-health.ps1` at every AO-RESUME.

## The one rule that matters: `EXPECT_SERVICES`

`EXPECT_SERVICES` in `/etc/default/ks-aw-01-backup` is the **single declaration of what
must be backed up**. Both `backup-ks-aw-01.sh` and `verify-backup-ks-aw-01.sh` read it.

- A service listed there whose container/volume is missing at runtime → **ERROR**, backup
  aborts without uploading, verify FAILs, `check-backup-health.ps1` goes WARN.
- A service not listed → not deployed yet, silently ignored.

**Do not gate backup steps on live docker state instead.** If the backup script asks
`docker ps` whether a service exists, and the verify script asks the same question, then a
renamed container, a crashed container, or a dead dockerd all make both of them agree that
nothing was expected — an empty backup verifies green, forever. That is the failure this
design exists to prevent, and it was caught in review before any real data landed.

**When deploying P5 (Chatwoot) or P7 (Soulful): add the service to `EXPECT_SERVICES` in the
same change**, and confirm the container/volume names match what Compose actually created.
The active stack uses `soulful-db`; other Compose configurations may name containers
`<project>-<service>-<N>`. Override the defaults only when that differs from the active
container name:

```sh
SOULFUL_DB_CONTAINER=soulful-db
SOULFUL_WP_VOLUME=soulful_wordpress_data
CHATWOOT_DB_CONTAINER=chatwoot-postgres
CHATWOOT_STORAGE_VOLUME=chatwoot_chatwoot_storage
```

Verify the wiring with a mutation test — declare a service that is not deployed and confirm
**both** layers fail. If they pass, the detector is a no-op:

```sh
sudo sed -i 's/^EXPECT_SERVICES=.*/EXPECT_SERVICES=soulful/' /etc/default/ks-aw-01-backup
sudo /root/scripts/backup-ks-aw-01.sh          # must exit non-zero
sudo /root/scripts/verify-backup-ks-aw-01.sh   # must exit non-zero
# then restore the real value
```

## Deployment

Both scripts are committed mode `644` — **`chmod +x` is required on the host**:

```sh
scp -P 58122 backup-ks-aw-01.sh verify-backup-ks-aw-01.sh ubuntu@145.239.195.47:/tmp/
ssh -p 58122 ubuntu@145.239.195.47
sudo mv /tmp/{backup,verify-backup}-ks-aw-01.sh /root/scripts/
sudo chmod +x /root/scripts/backup-ks-aw-01.sh /root/scripts/verify-backup-ks-aw-01.sh
```

`upload-to-r2.sh` is a hard dependency at `/root/scripts/upload-to-r2.sh` —
canonical copy at [`../eu-backup/upload-to-r2.sh`](../eu-backup/upload-to-r2.sh).
It accumulates failures across every object and exits non-zero if **any** PUT failed, so
the `.verify` marker (written only on its success) genuinely means "all objects uploaded",
not "the last one uploaded".

## `/etc/default/ks-aw-01-backup` (mode 600, not in git)

| Key | Purpose |
|---|---|
| `EXPECT_SERVICES` | Space-separated deployed services. Valid: `soulful` `chatwoot`. Empty = pre-P5/P7. |
| `BACKUP_DIR` | Local snapshot root (default `/root/backups`) |
| `BACKUP_RETAIN_DAYS` | Local retention (default 7) |
| `BACKUP_ENC_KEY` | AES-256 key for the `.env` bundle. **Also stored in `AWARE_WAVE_CREDENTIALS.md` — without it the encrypted secrets backup is unrecoverable.** |
| `R2_API_TOKEN` | Cloudflare R2 Bearer token |
| `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_PREFIX` | `aea1a836…` / `lobster-backup` / `ks-aw-01` |

## Schedule

`/etc/cron.d/ks-aw-01-backup` — 02:15 UTC backup, 02:45 UTC verify (offset from SG 02:00 /
EU 02:30). Sets `SHELL` and `PATH` explicitly; cron.d's default `PATH` omits
`/usr/local/bin` and `/usr/sbin`, which is the classic "works by hand, fails under cron".

## Restore

R2 keys are `ks-aw-01/<STAMP>/<file>` where `STAMP` is `YYYYmmdd-HHMMSS` — **timestamped,
not date-only**, because the `ks-aw-01/` prefix carries a 14-day WORM lock (see below) and
a date-only key makes retry-after-partial-upload permanently impossible.

Because the key is not derivable from a date, **list before restoring**:

```sh
curl -s "https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/lobster-backup/objects?prefix=ks-aw-01/" \
  -H "Authorization: Bearer ${R2_API_TOKEN}" | python3 -m json.tool

# then fetch one object
curl -s "https://api.cloudflare.com/client/v4/accounts/${R2_ACCOUNT_ID}/r2/buckets/lobster-backup/objects/ks-aw-01/<STAMP>/<file>" \
  -H "Authorization: Bearer ${R2_API_TOKEN}" -o <file>

# decrypt the secrets bundle (BACKUP_ENC_KEY from the credentials file)
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -in env.tar.gz.enc | tar xzf -
```

## R2 bucket lock (WORM)

The `lobster-backup` bucket has a lock rule `ks-aw-01-retention-14d`: prefix `ks-aw-01/`,
`Age` condition, 14 days. Objects under that prefix **cannot be deleted or overwritten**
for 14 days — ransomware and accidental-wipe protection.

The prefix scope is deliberate. A bucket-wide rule would also cover the existing `eu/` and
`sg/` prefixes, whose scripts still use date-only keys; under a lock, their retry after a
partial upload would 409 permanently rather than merely fail. Giving `eu/`/`sg/` the same
protection requires switching them to timestamped keys first — a separate, deliberate
change, not a side effect of this one.

Consequence to remember: locks take precedence over lifecycle rules, so nothing prunes
`ks-aw-01/` for 14 days. Once Soulful uploads and Chatwoot make the daily payload
multi-GB, confirm a lifecycle expiry ≥ 14 days exists before storage growth becomes a bill.
