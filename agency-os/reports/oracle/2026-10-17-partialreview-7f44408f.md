# codex-oracle review -- 2026-10-17 19:08:21 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/packages/db/migrations/0108_cs_conversation_staff_replies.sql, lobster-factory/packages/db/migrations/0108_cs_conversation_staff_replies.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Customer service three states (operator rules 2026-10-17): the AI used to stay silent in any Chatwoot conversation with status open (handed to a human) until resolved; Soulful has no auto-resolve, so after one handoff every later question went unanswered. New rule: silent only while a staff member replied in public in that conversation within 30 minutes; otherwise answer as usual (FAQ -> AI -> human), also in an open conversation. Chatwoot posts outgoing messages to the AgentBot webhook (sender.type user = staff, private flag); the webhook records public staff replies (migration 0108 cs_record_staff_reply, DB clock, GREATEST) and on each customer message in an open conversation asks cs_staff_replied_within(org, conv, 1800). A failed read counts as staff active (previous behaviour). A nameless contact answering the name question in a no-longer-silent open conversation is captured as a name first (no AI, recorded as suppressed). Engine silence flag moved from conversationStatus open to staffActive decided by the webhook. 0108 also adds explicit table grants (service_role only) to the 0104 table. Also verify: does this change depend on something NOT visible in this diff? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 55221ms | answer: 779B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/orchestrator.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/packages/db/migrations/0108_cs_conversation_staff_replies.down.sql, lobster-factory/packages/db/migrations/0108_cs_conversation_staff_replies.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Staff activity is recorded asynchronously, allowing an immediate customer message to receive an AI reply over the staff member.

  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts:98-104` -> `route.ts:113-116`

  confidence  -> CONFIRMED

  scenario    -> A public staff webhook returns, but its `after()` callback has not committed `recordStaffReply` yet; a customer webhook for the same conversation runs `staffRepliedWithin`, gets `false`, and proceeds through claim/AI handling even though the staff reply occurred within 30 minutes.

  why missed   -> The implementation treats `after()` as sufficient persistence, but separate webhook requests have no ordering guarantee.

Final line: TOTAL: 1 findings
