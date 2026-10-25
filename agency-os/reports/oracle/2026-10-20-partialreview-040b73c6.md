# codex-oracle review -- 2026-10-20 15:21:01 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2. deploy.sh step 0b: prod /opt/cognitive-os is a sparse clone; e87de9225 added a Dockerfile COPY of lobster-factory/packages/contracts/fixtures/permit-v1 outside the sparse set, so docker build --target test failed. The preflight derives every non --from COPY source from the Dockerfile; a source is missing when git tracks nothing under it or any tracked file there is skip-worktree; missing ones are git sparse-checkout added, then rechecked, failing if still missing. Round 1 finding (stale untracked dir passed -e) fixed by asking git instead of the disk. Compose/.env.example: next-admin ENTITLEMENT_ISSUER_TOKEN_COGNITIVE, already applied on prod via safe-infra-patch.
- exit: 0 | elapsed: 254786ms | answer: 1781B
- files-reviewed: Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The preflight passes tracked sources that are absent from the working tree.
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:108 -> Projects/internal/cognitive-engineering-os/Dockerfile:69
  confidence  -> CONFIRMED
  scenario    -> `permit-v1/generate.py` remains present in the index, but tracked `vectors.json` is physically missing and no file has `S`; the check passes, Docker copies an incomplete directory, and `test_permit_vectors.py:17-21` fails later.
  why missed  -> The check inspects index tracking and sparse bits, never the materialized files.

FINDING 2: A stale untracked file can still silently replace a deleted tracked fixture.
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:108 -> .dockerignore:16
  confidence  -> CONFIRMED
  scenario    -> A commit deletes tracked `permit-v1/vectors.json` but leaves `generate.py`; an old untracked `vectors.json` remains. Git sees a valid tracked source, `.dockerignore` includes the directory, and Docker copies the old vectors; `test_permit_vectors.py:17-20` loads stale data.
  why missed  -> The fix rejects only an entirely untracked source directory, not untracked files inside a partially tracked source.

FINDING 3: The AWK parser misses valid multiline `COPY` instructions.
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:103 -> Projects/internal/cognitive-engineering-os/Dockerfile:69
  confidence  -> CONFIRMED
  scenario    -> The fixture copy is formatted with `COPY --chown=... \` followed by source and destination lines; AWK records no source, so a sparse checkout missing `permit-v1` passes step 0b and Docker fails later.
  why missed  -> The parser processes each Dockerfile line independently and does not join continuation lines.

TOTAL: 3 findings
