# Card 02 — the `cognitive-db` service as files (nothing is applied)

## Decision
Operator decision 2026-10-04: each region gets its own PostgreSQL, the first one separate from the self-hosted Supabase (D8 in `COS/docs/platform/STORAGE_SWITCH.md`). This card writes the deployable FILES and their tests. Applying them to the host is High-STOP (`scripts/safe-infra-patch.sh`, the operator's go-ahead): you never run it, never SSH, never `docker compose up` anything here.

## Constraints
- Existing pattern: `COS/docker-compose.yml` (own compose project, joins the external network `lobster-net`, host ports bound to 127.0.0.1 only, `mem_limit`, healthcheck, named volume, `restart: unless-stopped`). Follow it; read it first.
- New files only, under `COS/ops/cognitive-db/`:
  1. `docker-compose.cognitive-db.yml`: one service `cognitive-db`, the image pinned by the same digest as `COS/tests/pg.py` `IMAGE`, a named volume for `/var/lib/postgresql/data`, joins `lobster-net` and publishes NO port to the host (only the engine container reaches it by service name), `restart: unless-stopped`, `mem_limit` and `shm_size` set, a `healthcheck` with `pg_isready`, `POSTGRES_PASSWORD_FILE` pointing at a Docker secret file (the password is never in the compose file or an environment literal), `POSTGRES_INITDB_ARGS` with data checksums, sensible `command` flags (`-c max_connections=...`, `-c shared_buffers=...`, `-c log_min_duration_statement=...`) with a one-line comment each saying why. The engine's own compose file is NOT edited here (its change comes with the data move).
  2. `backup-cognitive-db.sh`: nightly logical backup. `set -euo pipefail`; `pg_dump -Fc` of every database in the cluster that is not a template; writes to a dated file under a backup directory given by an env var (default `/root/backups/cognitive-db`), then PROVES the dump: `pg_restore --list` exits 0 and the object count is above a floor; keeps the last N daily dumps (N from an env var, default 14) and deletes older ones by an explicit name pattern only; exits non-zero and prints a single line starting `BACKUP FAILED:` on any failure; never prints the password. Also `restore-cognitive-db.md`: the exact restore steps into a throwaway container, to be rehearsed before go-live.
  3. `README.md`: what this is, the apply steps through `safe-infra-patch.sh compose <file> cognitive-db` (write the commands, do not run them), the cron line for the backup script (next to the existing ones in `/etc/cron.d/ks-stack-backup`, see `agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`), the go-live check list (`pg_isready`, one real migration to head on an EMPTY database first, backup run once and restored once), and an explicit line that nothing in this folder has been applied.
- No credentials, no real hostnames beyond container/service names.
- Disk: say in the README the expected size (the engine's data is small today; the ClaimReview mirror is NOT in this database).

## Files
- new: `Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml`, `backup-cognitive-db.sh`, `restore-cognitive-db.md`, `README.md`
- new: `Projects/internal/cognitive-engineering-os/tests/unit/test_cognitive_db_ops.py`
- `agency-os/reports/review-debt.md` (one row)

## Acceptance
`tests/unit/test_cognitive_db_ops.py` reads the files and proves: the image digest equals `tests/pg.py` `IMAGE`; no `ports:` key on the service; a named volume with a healthcheck and `pg_isready`; the password comes from a `_FILE` secret (no `POSTGRES_PASSWORD=` literal anywhere in the folder); `set -euo pipefail` and `pg_restore --list` and the `BACKUP FAILED:` line are in the backup script; deletion in the script uses a dated-name pattern and never a bare `rm -rf`; the README states nothing was applied and lists the go-live checks. Run `bash -n` on the script. If Docker is available, `docker compose -f <file> config -q` must exit 0 with a dummy secret file (skip loudly when it is not).
Also run the backup script against a throwaway local container (name it `cos-db-test-backup-<random>`, remove it afterwards): a dump is made, listed, rotated; a second run with a corrupted dump (truncate a copy) prints `BACKUP FAILED:` and exits non-zero. Put that run in the test as an optional Docker test (skip loudly without Docker).
Mutations to run and report: add a `ports:` line -> red; put a literal password -> red; remove `pg_restore --list` -> red; remove `set -euo pipefail` -> red; change the digest -> red.
