# codex-oracle review -- 2026-09-26 18:31:29 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Research-line P1 cards WC-P1-04 and WC-P1-08 (RESEARCH_LINES_MASTER_PLAN.md section 12.7, interface table I-a..I-h).
main.py: POST /projects/{id}/collections (without confirm:true returns only a plan and writes nothing; with confirm
creates a run, issues a one-shot grant, hands only the grant REFERENCE to next-admin via collection_service.py);
GET /projects/{id}/collections/{run}; POST /collect-grants/{ref}/exchange (bearer COLLECT_RESEARCH_RUNS_TOKEN,
hmac compare, mints the token once, marks the run running); require_grant dependency (Authorization: Grant <token>,
bound to project); POST /projects/{id}/collections/{run}/complete (ends the run, voids the grant; a malformed report
still ends it as failed). WC-P1-08: egress allowlist adds app.aware-wave.com (egress is https-only, host-only) and a
parity test keeps docker-compose.yml's allowlist inside policy EGRESS-EC99-2.
Probe: any path that leaves a run 'requested'/'running' forever; any path where a grant outlives its run; timing or
auth weaknesses in the bearer/Grant checks; writes before confirm; entitlement bypass; anything a second tenant can reach.
Store/repository methods called here were reviewed in the previous batch (agency-os/reports/oracle/2026-09-26-partialreview-62e9dfdd.md).
- exit: 0 | elapsed: 99766ms | answer: 913B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/deploy/.env.example, Projects/internal/cognitive-engineering-os/docker-compose.yml, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/tests/unit/test_api_collections.py, Projects/internal/cognitive-engineering-os/tests/unit/test_egress_allowlist_parity.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: An expired grant leaves the collection run permanently `requested`
  main.py:1686-1689 -> main.py:1724-1727
  confidence  -> CONFIRMED
  scenario    -> A confirmed run remains `requested` until its grant expires; `exchange_collect_grant()` returns `410 GRANT_EXPIRED` without finishing the run, so it remains `requested` forever.
  why missed  -> Grant cleanup handles only the already-ended-run path, not grant expiry.

FINDING 2: Grant-issuance failure leaves an orphaned `requested` run
  main.py:1686-1687 -> main.py:1689-1693
  confidence  -> CONFIRMED
  scenario    -> `create_collection_run()` commits successfully, then `issue_collect_grant()` raises; the request returns an error, but no failure transition or cleanup runs, leaving the run permanently `requested`.
  why missed  -> The exception cleanup begins only around `service.start_run()`, after grant issuance.

Final: TOTAL: 2 findings
