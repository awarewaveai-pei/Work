# codex-oracle review -- 2026-10-08 09:02:02 +08:00

- mode: `review`
- scope: whole repo
- target: `f237d4829`
- context: VERIFY round 5 of the Cognitive Sovereignty Platform engine (Projects/internal/cognitive-engineering-os). Fixes your round-4 findings: F1 duplicate (provider,lang) channel rows read as the worse report and a completion repeating a pair is refused; F2 claim-version re-check inside the save lock for the 去查 reservation and fact-check save, and every block's pre-save checks now run under the save lock (blocks/docs.py _save); F3 VerifyPage shows stances/verdicts only of the current claim version; F4 collect lookups answer dbs in request order. Hunt: a remaining path that writes or shows a record of an obsolete claim version; a lock-ordering or deadlock risk from pre-save hooks under the write lock; any last-wins collapse left; wire backward compatibility with the deployed collect; tests that would stay green if a guard were removed.
- exit: 0 | elapsed: 643419ms | answer: 575B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/docs.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collect_lookups.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/VerifyPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/VerifyPage.tsx, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/specs/wire/collector.v2.json, Projects/internal/cognitive-engineering-os/tests/unit/test_block_verify.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_lookups.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collector_wire_v2.py, Projects/internal/cognitive-engineering-os/tests/unit/test_step2_foundation.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-lookups.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/contract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/lookups/factcheck.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The channel-count test is masked by the new duplicate-pair guard.
  `tests/unit/test_collector_wire_v2.py:213` -> `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py:3141`
  confidence  -> CONFIRMED
  scenario    -> Remove only the `channels` count check. The fixture sends repeated `(provider, lang)` rows, so the uniqueness check still returns 400 and the test stays green; the maximum-channel limit is no longer tested.
  why missed  -> The new uniqueness rule makes the old over-limit fixture invalid for a different reason.

TOTAL: 1 findings
