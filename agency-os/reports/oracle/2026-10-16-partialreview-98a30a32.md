# codex-oracle review -- 2026-10-16 18:56:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Customer-service AI: self-harm/suicide messages and medication stop/adjust questions must always hand off to a human by deterministic rule (not by accident of retrieval). New CS_CRISIS_KEYWORDS list (own handoffReason 'crisis', checked first in safetyGate and inputGuards; part of CS_SENSITIVE_KEYWORDS so the FAQ matcher in lib/cs/faq.ts also skips it); medication words added to the red-line medical group. Check for missed entry points where a crisis message could still get an automatic reply (FAQ, eval, route), for consumers of HandoffReason that break with a new value, and for false positives that would block ordinary art-therapy course questions.
- exit: 0 | elapsed: 255503ms | answer: 2809B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/cis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/guardrails.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: CS config GET crashes once an intent has a graduation record.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts:67 -> :72
  confidence  -> CONFIRMED
  scenario    -> An intent has `metadata.graduation.status = "passed"` -> GET evaluates `knowledgeFloorOf(config)` before `const config` is initialized -> ReferenceError/500.
  why missed  -> This dependency is outside the changed files and only fails after graduation data exists.

FINDING 2: Common suicide euphemisms bypass the crisis gate.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts:76 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts:14
  confidence  -> CONFIRMED
  scenario    -> `"I'm planning to end things tonight"` contains none of the listed phrases -> an otherwise eligible graduated L2 intent can return `auto_sent` at autonomy.ts:108-134.
  why missed  -> The rule is substring-based and tests only the explicit keyword corpus.

FINDING 3: Separators can evade crisis keywords.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts:15-16 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts:72
  confidence  -> CONFIRMED
  scenario    -> `"我想自 殺"` is normalized only with NFKC, so `"自殺"` is not found -> the message can proceed to an automatic reply.
  why missed  -> NFKC handles width variants but does not remove inserted spaces or zero-width separators.

FINDING 4: The medication rule misses ordinary Chinese adjustment wording.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts:55-62 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts:85-90
  confidence  -> CONFIRMED
  scenario    -> `"我可以調整我的藥嗎？"` matches none of the compound keywords -> with good retrieval and an eligible L2 intent, it can be auto-sent.
  why missed  -> The list contains compounds such as `藥物` and `藥量`, but not the standalone medication term `藥` or adjustment verbs.

FINDING 5: The medication expansion blocks ordinary course questions mentioning psychiatric work.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts:56 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/guardrails.ts:42-54
  confidence  -> CONFIRMED
  scenario    -> `"我在精神科工作，想報名藝術治療課程，請問下期何時開始？"` hits `精神科` -> input guards hand it to a human instead of answering the course question.
  why missed  -> `精神科` and `身心科` are specialties, not medication-adjustment terms, and ordinary tests do not include them.

TOTAL: 5 findings
