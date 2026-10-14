# codex-oracle review -- 2026-10-04 15:42:31 +08:00

- mode: `review`
- scope: whole repo
- target: `2d73f78f9`
- context: VERIFY round 4 (Claude-written) answering your whole-block review. Check each fix closes its class and nothing regressed: a quote must come from the source of the card it names (ai_gate uncited), every per-claim record matches the claim's CURRENT version (ledger, fact-check, search runs, readings, stances), 查不到 only when every planned search channel answered, one open 去查 per claim version (atomic with creation), CaseDocs.save_many (all or none, one transaction, optional check= under the same lock), a law claim without jurisdiction/limitation/legal source gets a fixed system summary line, the pasted message reaches the model only through AiAction.quoted after the crisis check (split/techniques), collect asked only the databases of the person's place (dbs request field, license capped at 200), fact-check reports found by the 查核 search angle are the person's to read and never enter the AI reading turn. Also look for: a way a fact-check/AI reading becomes support/opposition without the person's act, double counting of one origin, races, a request path that skips the new guards, tests that pass with the guard removed. Every finding with file:line.
- exit: 0 | elapsed: 909248ms | answer: 2130B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/verify.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collect_lookups.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/net/collection_service.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/VerifyPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/VerifyPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_SHARED_RULES.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_verify.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collect_lookups.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Duplicate search-channel rows can falsely produce 查不到

  file:line   -> `main.py:3130,3136` -> `block_hooks/verify.py:241,252`
  confidence  -> CONFIRMED
  scenario    -> A completed zero-page run reports `serper/zh=unreachable` followed by duplicate `serper/zh=ok`, with the other channels `ok`; dictionary collapse overwrites the failure, so the ledger records 查不到.
  why missed  -> Validation checks field values but not unique `(provider, lang)` pairs; tests cover missing channels, not duplicates.

FINDING 2: Fact-check and search results can be created for an obsolete claim version

  file:line   -> `blocks/verify.py:183,186,210,243,247,249`
  confidence  -> CONFIRMED
  scenario    -> Claim v1 is loaded, then edited to v2 while the lookup is running or being reserved. The old text is still searched and its v1 result is saved; the current UI hides it, while stale gathered pages remain available.
  why missed  -> The reservation rechecks only for another open run, and fact-check save performs no current-version recheck.

FINDING 3: Old stances and verdicts remain displayed under the current claim version

  file:line   -> `VerifyPage.tsx:343,344,506,519`
  confidence  -> CONFIRMED
  scenario    -> A stance and verdict saved for claim v1 remain visible after the claim is edited to v2, attached to the v2 ledger line with stale/earlier messaging.
  why missed  -> Version filtering was added for readings and fact-checks, but stance and verdict props still filter by claim ID only.

FINDING 4: The collection service violates the `dbs` response-order contract

  file:line   -> `specs/wire/lookup.v1.json:26` -> `lobster-factory/.../collect/lookups/contract.ts:143`
  confidence  -> CONFIRMED
  scenario    -> A caller requests `["cofacts","claimreview"]`; the service canonicalizes the response using its fixed database order instead of request order, so an index-based contract consumer associates each result with the wrong database.
  why missed  -> The current Python consumer remaps results by database name, masking the service contract regression in local tests.

TOTAL: 4 findings
