# codex-oracle review -- 2026-10-17 18:46:26 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/threat.test.ts, lobster-factory/packages/db/migrations/0107_cs_holding_reply_kinds.sql, lobster-factory/packages/db/migrations/0107_cs_holding_reply_kinds.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Customer service: a message threatening to hurt others now gets the operator-approved reply instead of the ordinary acknowledgement (bot state, no name question) and, while a human owns the conversation, the same reply at most once per 30 minutes. The once-per-window state table from migration 0104 (keyed by conversation) gets a kind column in migration 0107 (self_harm | threat, PK org+conversation+kind) so a threat reply never holds back the self-harm help lines; 0104 functions keep their signatures and delegate to the new kind-aware ones for self_harm, so code deployed before the migration keeps working. Self-harm wins when a message is both. Rollout: apply 0107, then deploy. Also verify: does this change depend on something NOT visible in this diff? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 54260ms | answer: 904B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/threat.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/packages/db/migrations/0107_cs_holding_reply_kinds.down.sql, lobster-factory/packages/db/migrations/0107_cs_holding_reply_kinds.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Migration does not reload PostgREST’s schema cache after creating the new RPC functions

  file:line   -> `lobster-factory/packages/db/migrations/0107_cs_holding_reply_kinds.sql:28`, `:48`, `:100`; `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts:564`
  confidence  -> PLAUSIBLE
  scenario    -> Migration commits successfully, but PostgREST still has its old schema cache. `cs_claim_holding_reply` and `cs_confirm_holding_reply` RPC calls fail as “function not found”; the application treats the claim as an error, still sends the threat reply, and cannot record the window, so every subsequent threat message receives another reply.
  why missed  -> The rollout assumes applying the migration makes newly created RPCs immediately visible, but the migration has no `NOTIFY pgrst, 'reload schema'` (or equivalent cache-refresh step).

Final line: TOTAL: 1 findings
