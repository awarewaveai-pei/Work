# codex-oracle review -- 2026-10-04 13:25:28 +08:00

- mode: `review`
- scope: whole repo
- target: `890cf1cb6`
- context: Round-2 fixes by a Claude worker on the collect service (next-admin, TypeScript) and the cognitive engine wire (Python FastAPI). Goals: (1) either side may deploy first: engine lists accepted wire versions in the grant-exchange answer, next-admin sends v2 only when listed; (2) Perplexity can never be called or billed: only serper/brave channels/providers accepted on both sides; only two seed shapes; (3) budget/time stop lists every unread page as aside and never-run searches as unreachable channels; (4) UK ac.uk/gov.uk not asked of Nominet, pre-1985 dates are not registration dates; (5) every lookup why is true (from fetcher error kind), factcheck under a 38 s deadline; (6) migration 0095 ClaimReview mirror: finish is pointer-only, prune in 5000-row batches, search_path fixed, down script removes ledger row, common trigram pieces dropped from the query; (7) optional dbs/license fields in specs/wire/lookup.v1.json. Find correctness bugs, security holes (Perplexity reachable, SSRF, injection), races, migration data-loss or lock risks, and tests that would pass with the guard removed. Every finding with file:line.
- exit: 0 | elapsed: 708697ms | answer: 2562B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json, Projects/internal/cognitive-engineering-os/specs/wire/lookup.v1.json, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collector_wire_v2.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/execute/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/research-run-request.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/collect/runs/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cognitive-os/research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-lookups-live.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-lookups.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-run-rate-limit-wiring.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-wire-v2.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/collectors/entity-dossier.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/answer.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/claimreview-common-pieces.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/claimreview.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/contract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/describe.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/factcheck.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/lists.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/search/query-plan.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/__tests__/cognitive.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/types.ts, lobster-factory/packages/db/migrations/0095_collect_claimreview_mirror.sql, lobster-factory/packages/db/scripts/0095_collect_claimreview_mirror-local-verify.sh, lobster-factory/packages/db/scripts/0095_collect_claimreview_mirror-local-verify.sql, lobster-factory/packages/db/scripts/0095_collect_claimreview_mirror_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Every v2 source from next-admin is rejected because the engine does not allow `pasted`.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/cognitive.ts:170 -> Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:3364
  confidence  -> CONFIRMED
  scenario    -> A v2 source always includes `pasted: false`; `relevance_error()` treats `pasted` as an unknown key, so the ingest batch is refused and no pages are stored.
  why missed  -> Tests validate next-admin relevance separately and only exercise Python v1 storage; no cross-side v2 ingest test includes `pasted`.

FINDING 2: Migration 0095 cannot upgrade databases that already applied the previous 0095.
  lobster-factory/packages/db/migrations/0095_collect_claimreview_mirror.sql:72 -> lobster-factory/packages/db/migrations/0095_collect_claimreview_mirror.sql:103
  confidence  -> CONFIRMED
  scenario    -> An existing database has the old candidate function and table. `CREATE OR REPLACE FUNCTION` changes the function return columns by adding `license`, which PostgreSQL rejects; `CREATE TABLE IF NOT EXISTS` also does not add the missing column. The migration rolls back, leaving the new refresh functions unavailable.
  why missed  -> The local verification reapplies only the already-new migration to a fresh database, not over the prior schema.

FINDING 3: Invalid falsey completion values bypass wire validation.
  Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:3093
  confidence  -> CONFIRMED
  scenario    -> A completion posts `{"aside": "", "channels": 0}`. `self.aside or []` and `self.channels or []` convert both to empty lists, so `wire_error()` accepts the malformed payload and the run completes without valid v2 lists.
  why missed  -> Tests cover truthy invalid values such as `"serper"` and `{"url": ...}`, but not falsey non-list values.

FINDING 4: The down migration leaves the 0095 helper function behind, so its own verification fails.
  lobster-factory/packages/db/scripts/0095_collect_claimreview_mirror_down.sql:23 -> lobster-factory/packages/db/migrations/0095_collect_claimreview_mirror.sql:40
  confidence  -> CONFIRMED
  scenario    -> Running the down script drops the tables and candidate functions but never drops `collect_claimreview_pieces(text)`. The local verifier then counts one `collect_claimreview%` function instead of zero and exits unsuccessfully.
  why missed  -> The down script’s new ledger-row cleanup was checked, but the helper function list was not updated.

TOTAL: 4 findings
