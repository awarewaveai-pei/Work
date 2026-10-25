# codex-oracle review -- 2026-10-20 15:25:31 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/.env.example  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. Invariant now enforced by deploy.sh step 0b: every Dockerfile COPY source (logical lines, backslash continuations joined, --from excluded) equals HEAD -- tracked, not skip-worktree (sparse gaps are git sparse-checkout added from the Dockerfile list), and git status --porcelain --untracked-files=all empty under it (deleted/modified/untracked refuse the deploy). Gitignored files are deliberately left to .dockerignore. Round 2 findings (tracked-but-deleted file, untracked file beside tracked, multiline COPY) each tested on the host in a throwaway sparse clone: refused/refused/parsed. Compose/.env.example: next-admin ENTITLEMENT_ISSUER_TOKEN_COGNITIVE, already applied on prod.
- exit: 0 | elapsed: 153627ms | answer: 1802B
- files-reviewed: Projects/internal/cognitive-engineering-os/deploy/deploy.sh, lobster-factory/infra/hetzner-phase1-core/.env.example, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Sparse-checkout auto-materialization fails for file COPY sources in cone mode  
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:118 -> Projects/internal/cognitive-engineering-os/Dockerfile:18  
  confidence  -> CONFIRMED  
  scenario    -> `core.sparseCheckout=true` and cone mode omit `requirements.lock`; `git sparse-checkout add requirements.lock` errors because cone mode accepts directories, so deployment aborts despite a clean tracked source. [Git docs](https://git-scm.com/docs/git-sparse-checkout)  
  why missed  -> The implementation treats every COPY source as a directory.

FINDING 2: `assume-unchanged` files bypass the HEAD invariant  
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:111,123 -> Projects/internal/cognitive-engineering-os/Dockerfile:18  
  confidence  -> CONFIRMED  
  scenario    -> A tracked COPY source is edited after `git update-index --assume-unchanged`; `ls-files -t` reports `H`, and `git status` stays clean, so Docker builds the modified file instead of HEAD. [Git docs](https://git-scm.com/docs/git-update-index)  
  why missed  -> The check handles only `skip-worktree` (`S`) and ordinary status output.

FINDING 3: The invariant runs after untrusted COPY sources are already consumed  
  Projects/internal/cognitive-engineering-os/deploy/deploy.sh:95-96 -> Projects/internal/cognitive-engineering-os/Dockerfile:18,20  
  confidence  -> CONFIRMED  
  scenario    -> A modified `requirements.lock` or `pyproject.toml` causes `pip install` or its editable build backend to execute before step 0b later rejects the drift; the deploy fails, but the venv and host have already been changed.  
  why missed  -> The new gate was inserted after venv bootstrap and package installation rather than before them.

TOTAL: 3 findings
