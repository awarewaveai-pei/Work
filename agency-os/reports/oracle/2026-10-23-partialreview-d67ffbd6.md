# codex-oracle review -- 2026-10-23 13:11:05 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, scripts/check-cloudflare-security.ps1, scripts/audit-detector-contract.ps1, scripts/archive-completed-tasks.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Re-review of 4 fixes: safe-infra-patch compose refuses unless the patched file is the first default name in compose lookup order (compose.yaml, compose.yml, docker-compose.yaml, docker-compose.yml) and unsets COMPOSE_FILE; cloudflare lockdown nonzero ssh exit = unreachable; audit-detector-contract requires parseable generated_utc; archive-completed-tasks writes atomically. Report only real defects in these fixes.
- exit: 0 | elapsed: 653343ms | answer: 1315B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh, scripts/check-cloudflare-security.ps1, scripts/archive-completed-tasks.ps1, scripts/audit-detector-contract.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The lockdown probe misreports a failed first curl as `inactive` when the second curl succeeds.
  scripts/check-cloudflare-security.ps1:325 -> scripts/check-cloudflare-security.ps1:331
  confidence  -> CONFIRMED
  scenario    -> The AW curl times out (`AW=000`), SF returns 403, and the remote shell exits 0 because the second command succeeded; the regex matches and status becomes `inactive` instead of `unreachable`.
  why missed  -> The check tests only the combined SSH exit code, not each curl result.

FINDING 2: The compose filename guard can be bypassed by `COMPOSE_FILE` supplied through `.env`.
  lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:55 -> lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:55
  confidence  -> PLAUSIBLE
  scenario    -> The target directory contains `docker-compose.yml`, but `.env` contains `COMPOSE_FILE=../other/compose.yaml`; the name check passes, while Compose may validate/start the other file. Docker documents `COMPOSE_FILE` as configurable through an environment file. [Docker documentation](https://docs.docker.com/compose/reference/cli/docker/compose/)
  why missed  -> The fix unsets only the shell variable and does not exclude the same predefined variable from the explicitly loaded `.env`.

TOTAL: 2 findings
