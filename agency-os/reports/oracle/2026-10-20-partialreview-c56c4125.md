# codex-oracle review -- 2026-10-20 15:15:29 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: deploy.sh step 0b: prod /opt/cognitive-os is a sparse clone; e87de9225 added a Dockerfile COPY of lobster-factory/packages/contracts/fixtures/permit-v1 outside the sparse set, so docker build --target test failed. The preflight derives every non --from COPY source from the Dockerfile and git sparse-checkout adds the missing ones, failing if still missing. Compose/.env.example: next-admin gets ENTITLEMENT_ISSUER_TOKEN_COGNITIVE (ADR 017 permit issuer bearer for the cognitive service), already applied on prod via safe-infra-patch.
- exit: 0 | elapsed: 268071ms | answer: 641B
- files-reviewed: Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The preflight trusts stale or untracked files as valid COPY sources.

  file:line   -> `Projects/internal/cognitive-engineering-os/deploy/deploy.sh:103` -> `Projects/internal/cognitive-engineering-os/Dockerfile:69`

  confidence  -> CONFIRMED

  scenario    -> Sparse checkout omits the tracked permit fixtures, but an untracked stale directory remains at that path. `-e` returns true, sparse restoration is skipped, and Docker copies the stale contents into the test image.

  why missed  -> The check tests filesystem existence only; it never verifies the path is tracked and matches the current Git checkout.

TOTAL: 1 findings
