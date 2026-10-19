# codex-oracle review -- 2026-10-16 12:18:16 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-eval-cases, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Soulful CS: intent save no longer resets unsent fields (intentColumns); PATCH cs-intents; L2 only after a passed per-intent exam (API 409 + decideAnswerAction runtime); planReply extracted from handleInbound and reused by the eval so exams grade the production path; async exam via after() writing cs_intents.metadata.graduation, dropped if the golden set was replaced mid-run; cs-eval-cases GET/PUT replace; CsIntentsCard UI. Also verify: does this change depend on something NOT visible in this diff (config, timeout, schema, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 332368ms | answer: 3930B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/hub-ui.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-intents/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/eval.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Graduation stays valid after knowledge-base changes.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/graduation.ts:20 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts:143
  confidence  -> CONFIRMED
  scenario    -> An intent passes, then its KB content is replaced; the fingerprint is unchanged, so L2 still auto-sends using unexamined content.
  why missed  -> The fingerprint explicitly omits KB/model/prompt changes.

FINDING 2: Changing the tenant retrieval floor does not revoke graduation.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts:106 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:62
  confidence  -> CONFIRMED
  scenario    -> An intent passes at floor 0.5; an admin lowers the floor to 0.2; graduation remains current, so a 0.3 retrieval can reach L2 auto-send.
  why missed  -> Graduation fingerprints intent fields and cases, but not `client_config.kbMinRetrievalScore`.

FINDING 3: A handoff-only golden set can graduate an intent without testing answers.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/intent-config.ts:76 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/graduation.ts:24
  confidence  -> CONFIRMED
  scenario    -> An L0 intent has 30 `expectHandoff` cases; all hand off and pass, then PATCH changes it to L2. Since `answerLevel` is not fingerprinted, the API accepts L2 and future answerable messages may auto-send.
  why missed  -> Validation permits zero answer cases, and grading has no positive-answer requirement.

FINDING 4: The UI converts an explicit 0% canary into 100% when saved.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx:65 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx:92
  confidence  -> CONFIRMED
  scenario    -> An L2 intent configured at `canary_pct=0` displays 100; clicking “save” sends `canaryPct: 100`, enabling auto-send instead of draft-only behavior.
  why missed  -> The UI treats zero as “unset,” although the schema explicitly allows zero.

FINDING 5: Concurrent golden-set replacements can merge two sets.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:243 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:245
  confidence  -> CONFIRMED
  scenario    -> Two PUTs read the same old IDs, insert sets A and B, then both delete only the old rows; the final set is A+B while both requests report success.
  why missed  -> Replacement is a multi-request insert/delete sequence without a transaction or lock.

FINDING 6: Concurrent exam starts bypass the `exam_running` guard.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/cs/eval/route.ts:44 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:197
  confidence  -> CONFIRMED
  scenario    -> Two simultaneous requests both observe no running exam, both write `running`, both return 202, and both spend on the LLM; one run ID overwrites the other.
  why missed  -> The in-flight check and running-state write are not atomic.

FINDING 7: Intent deletion can report failure after deleting its golden set.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:271 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:273
  confidence  -> CONFIRMED
  scenario    -> Case deletion succeeds, the subsequent intent delete encounters a transient DB error, and the API returns `delete_failed` while the intent’s exam cases are already gone.
  why missed  -> The two destructive deletes are performed independently without a transaction.

TOTAL: 7 findings
