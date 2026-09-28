# codex-oracle review -- 2026-09-29 01:34:49 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Two invariants fixed in sg-deploy.sh after it deleted a machine-local secret file (.env.video) during a video-service deploy: (1) rsync --delete must never remove any .env* on the host; only the tracked .env.example is synced (--include before --exclude). (2) Every requested app must be a service of the staging compose before anything is rsynced, otherwise fail with nothing changed. Check rsync filter ordering/semantics, whether docker compose config --services can fail spuriously (env substitution warnings, cwd), set -euo pipefail interactions with the here-string grep, comments inside the bash array, and whether next-admin prebuild gate or git pull ran destructive work before the guard. If you cannot support a real finding, say so.
- exit: 0 | elapsed: 65586ms | answer: 11B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS
