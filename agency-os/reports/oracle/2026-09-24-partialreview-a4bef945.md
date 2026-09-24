# codex-oracle review -- 2026-09-24 14:22:49 +08:00

- mode: `review`
- scope: -Path scripts/check-staging-orphans.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Read-only staging three-layer reconciliation detector (runs at every AO-RESUME). Its default SSH aliases hetzner-sg / hetzner-eu (machine-local ~/.ssh/config) resolve to released IPs 5.223.93.113 / 204.168.175.41, so it was blind and pointing a root key at possibly third-party hosts. Change: both probes now go to ks-aw-01 with explicit params (145.239.195.47, port 58122, ubuntu + sudo bash, key ~/.ssh/id_ed25519, IdentitiesOnly) — same convention as scripts/check-backup-health.ps1; remote DB query uses the DB container MYSQL_PWD instead of the root password on argv; main DB name from the running WP container env; cleanup hint text lists deprovision --db. Verified live: complete 3 / unregistered 4 / db_only 6 / blind 0. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 68918ms | answer: 1097B
- files-reviewed: scripts/check-staging-orphans.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Database probe failures are silently reported as no orphan databases  
  scripts/check-staging-orphans.ps1:90 -> scripts/check-staging-orphans.ps1:90  
  confidence  -> CONFIRMED  
  scenario    -> `docker exec lobster-wordpress-db` fails or `MYSQL_ROOT_PASSWORD` is unavailable; stderr is discarded and the pipeline emits no `DB` rows, so the detector can report `blind_spots=0` while missing every `db_only` database.  
  why missed  -> The live verification covered a healthy container path, not the command-failure path.

FINDING 2: Cleanup instructions ignore the script’s override parameters  
  scripts/check-staging-orphans.ps1:227 -> scripts/check-staging-orphans.ps1:229  
  confidence  -> CONFIRMED  
  scenario    -> The script runs with `-KsAw01Host` or `-KsAw01SshPort` pointing at a recovery/test host; the report still instructs the operator to run cleanup against `145.239.195.47:58122`, potentially deprovisioning the wrong machine.  
  why missed  -> Probe configuration was parameterized, but the generated operator commands remained hard-coded.

TOTAL: 2 findings
