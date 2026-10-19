# codex-oracle review -- 2026-10-16 20:28:37 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/eval.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/exam.test.ts, :(literal)agency-os/tenants/company-soulful-expression/core/cs-eval-courses_services.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Two production-faithfulness fixes for the CS exam and retrieval. (1) runEvalCase runs matchFaq before planReply, as the Chatwoot webhook does (route.ts:163): a FAQ hit hands off iff entry.handoff; an answer case the FAQ takes never passes (proves nothing about the intent AI). (2) retrieveAcrossLanguages: a non-Latin question is now ALWAYS searched as written and in English (translation in parallel with the first search), higher top score wins; before it retried only below the floor, but measured on prod 9/9 Chinese questions found the right page only in English, several clearing the 0.40 floor on the wrong page. Golden set: 3 generic questions (FAQ territory) and 4 FAQ-answered handoff questions replaced. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 568451ms | answer: 1623B
- files-reviewed: agency-os/tenants/company-soulful-expression/core/cs-eval-courses_services.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/exam.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/eval.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Eval treats FAQ entries as active even when production Chatwoot handling is unavailable  
  file:line   -> `lib/cs/eval.ts:66` -> `app/api/webhooks/chatwoot/route.ts:174-175`  
  confidence  -> CONFIRMED  
  scenario    -> `csFaq` exists but `cis.chatwoot` is absent: eval marks a FAQ handoff case passed without calling `planReply`, while production skips the FAQ and runs the AI pipeline.  
  why missed  -> The new test fixture omits `chatwoot` but asserts the FAQ path as production-faithful at `exam.test.ts:57-65`.

FINDING 2: The “non-Latin” fallback only detects CJK, Japanese, and Korean  
  file:line   -> `lib/cs/orchestrator.ts:240,254`  
  confidence  -> CONFIRMED  
  scenario    -> An Arabic question against an English knowledge base scores below the floor; the regex misses it, so no English translation search runs and the customer is handed off despite an answerable English page.  
  why missed  -> The changed tests cover only Chinese questions at `orchestrator.test.ts:91-100`.

FINDING 3: A failed English retry discards a successful original retrieval  
  file:line   -> `lib/cs/orchestrator.ts:255-258` -> `lib/cs/orchestrator.ts:94-96`  
  confidence  -> CONFIRMED  
  scenario    -> The original non-Latin retrieval scores 0.8, translation succeeds, but the second embedding/database request errors; the exception propagates and `handleInbound` returns `engine_error` handoff instead of using the valid first result.  
  why missed  -> The test covers translation failure fallback at `orchestrator.test.ts:130-136`, but not failure of the second `retrieve` call.

TOTAL: 3 findings
