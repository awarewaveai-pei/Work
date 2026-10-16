# codex-oracle review -- 2026-10-16 19:04:06 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of partialreview-98a30a32 (only lib/cs/config.ts passed here because of a PS -File array quirk; the full change is config.ts + autonomy.ts (fold/hitsAny/hitsCrisis/safetyGate) + guardrails.ts (checkCrisis first) + types.ts ('crisis' HandoffReason) + __tests__/cs-core.test.ts -- read them from the working tree with git diff HEAD). Purpose: self-harm/suicide and medication questions always hand off to a human by rule. Round-1 fixes: euphemisms added, matching folds curly apostrophes, drops zero-width chars, collapses whitespace and removes it next to CJK (Latin word boundaries kept so 'do sessions' is not 'dose'), bare 藥/药 replaces the compound list, 精神科/身心科 removed. Check the fold() regex (lookbehind, CJK ranges), that tool-name matching in tools.ts (hitsRedLine/hitsSensitive on spec.name) is not broken by the new words, and any new false positive on ordinary art-therapy course questions.
- exit: 0 | elapsed: 282347ms | answer: 1534B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The crisis rule misses the common spelling `self harm`.
  file:line   -> `config.ts:75-77` -> `autonomy.ts:30-32` -> `faq.ts:23-39` -> `app/api/webhooks/chatwoot/route.ts:163-169`
  confidence  -> CONFIRMED
  scenario    -> A tenant has a non-handoff `workshop` FAQ; “Can your workshop help with self harm?” -> no crisis match, FAQ answer is sent without human handoff.
  why missed  -> Tests cover hyphenated and concatenated forms, but literal substring matching does not normalize the space.

FINDING 2: The medication rule misses singular `pill`, including in tool names.
  file:line   -> `config.ts:58` -> `autonomy.ts:30-32` -> `tools.ts:48-64`
  confidence  -> CONFIRMED
  scenario    -> “Can I stop taking my pill after your workshop?” -> `pills` does not match `pill`, so a matching FAQ can auto-send; an enabled A1 tool named `stop_pill` is also allowed.
  why missed  -> The list contains `pills` and `sleeping pill`, but not standalone `pill`; both customer and tool checks share the same literal matcher.

FINDING 3: The broad `can't go on` euphemism misclassifies ordinary course navigation as crisis.
  file:line   -> `config.ts:79` -> `autonomy.ts:20-32` -> `autonomy.ts:101-105`
  confidence  -> CONFIRMED
  scenario    -> “I can’t go on to the next lesson in the art-therapy course” -> curly apostrophe folding makes it match, causing an unnecessary crisis handoff.
  why missed  -> The keyword is matched anywhere, and tests do not cover its ordinary educational meaning.

TOTAL: 3 findings
