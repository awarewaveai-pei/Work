# codex-oracle review -- 2026-10-17 15:41:51 +08:00

- mode: `review`
- scope: -Path :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/intent-config.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts, :(literal)lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Per-intent handoff reply: cs_intents.metadata.handoffReply (operator-edited in CsIntentsCard, PATCH cs-intents handoffReply, null clears) replaces the ordinary acknowledgement sentence when a message of that intent goes to a human; crisis help lines always win; the name question is still appended, and isNameQuestionAck now recognises any acknowledgement that ends with the name question. planReply attaches intent.handoffReply to every decision after classification; the webhook passes it to acknowledgeHandoff. Operator decision: refund = ask the reason then hand over; medical judgment = advise seeing a doctor. Also verify: does this change depend on something NOT visible in this diff? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 382055ms | answer: 718B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/clients/[slug]/CsIntentsCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cs-config/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/intent-config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/orchestrator.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Concurrent metadata writes can silently erase `handoffReply` or graduation state.
  file:line   -> `lobster-factory/.../lib/cs/db.ts:187-196` -> `lobster-factory/.../lib/cs/db.ts:228-235`
  confidence  -> CONFIRMED
  scenario    -> An operator saves a handoff reply while an exam completes; the two paths read the same metadata snapshot, then the later full-JSON update overwrites the other change. The intent can lose its reply or revert from `passed` to `running`, disabling automation (`db.ts:95`, `graduation.ts:35-36`).
  why missed  -> The existing comment still claims `cs_intents.metadata` has no other writer (`db.ts:217-218`), but this change adds another read-modify-write path.

TOTAL: 1 finding
