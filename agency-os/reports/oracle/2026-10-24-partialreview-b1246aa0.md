# codex-oracle review -- 2026-10-24 15:58:10 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to partialreview-2d2a7fec: added the case of a container created without --env-file (empty environment_file label) to the safe-infra-patch compose label-mode test; it passes 13/13 against real docker compose.
- exit: 0 | elapsed: 173627ms | answer: 1784B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Compose-up failures bypass rollback.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:19,140` -> `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh:199-205`
  confidence  -> CONFIRMED
  scenario    -> Valid YAML references an unavailable image or has a port conflict -> `compose up` exits nonzero, `set -euo pipefail` terminates the script before rollback, leaving the patched file in place.
  why missed  -> The test only exercises a successful `up` followed by an unhealthy container at `safe-infra-patch-compose-labels.test.sh:50-54`.

FINDING 2: The new no-env-file test can pass while an env file is still incorrectly used.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh:35-37,61-62`
  confidence  -> CONFIRMED
  scenario    -> A broken implementation passes `.env.custom` when the label is empty -> Compose succeeds and `V=v5` still passes because `V` is literal, while `FROM_ENV` silently comes from `.env.custom`; the test reports “no --env-file passed.”
  why missed  -> The assertion checks only exit status and `V`; it never checks `FROM_ENV` or records the actual Compose arguments.

FINDING 3: Test cleanup forcibly deletes unrelated containers sharing the test label.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/safe-infra-patch-compose-labels.test.sh:16-18`
  confidence  -> CONFIRMED
  scenario    -> An unrelated or concurrent container has `aw-patch-test=1` -> the initial cleanup or exit trap runs `docker rm -f` on it, stopping and deleting that container.
  why missed  -> Cleanup scopes only by a generic label, despite the test otherwise using `aw-sip-*` names.

TOTAL: 3 findings
