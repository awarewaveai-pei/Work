# codex-oracle review -- 2026-09-24 14:13:22 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/supabase-stub.py, scripts/check-staging-orphans.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. Round 2 finding (confirmed, pre-existing since 2026-08-26): printf JSON | python3 - <<heredoc -> heredoc wins stdin, json.load gets EOF, set -e aborts; the org site_url step never worked. Fix: JSON via env ORG_JSON. Test: a python Supabase stub (GET canned rows per MODE, POST/PATCH/DELETE 204 + logged) now drives the full slug path (vault rpc -> credential row -> wp_sites -> org PATCH) and asserts each call, its order, and that only site_url is removed (51/51). Verify and report anything else real. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 46851ms | answer: 30B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/scripts/deprovision-staging.sh, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/hosting-gate.test.sh, scripts/check-staging-orphans.ps1, lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/supabase-stub.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
