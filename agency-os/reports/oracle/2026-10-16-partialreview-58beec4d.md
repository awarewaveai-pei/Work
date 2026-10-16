# codex-oracle review -- 2026-10-16 19:36:51 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Customer-service AI, crisis messages (self-harm/suicide; hitsCrisis in lib/cs/autonomy.ts, already on main). Operator decisions 2026-10-16: (1) the handoff acknowledgement for a crisis message carries help lines, wording by the customer's language, both Taiwan (119, 1925, 1995) and Australia (000, Lifeline 13 11 14) listed because Chinese-speaking customers can be in either; (2) the name question is still asked; (3) the operator is paged on Telegram via the existing ops-inbox operator channel (buildOperatorTelegramNotifier().sendText), without the customer's words. Name capture now matches a previous message whose LAST LINE is the name question (endsWithNameQuestion) so it works after either acknowledgement. A crisis message in a thread a human already owns gets no automatic reply but still pages. Check: paths where a crisis message gets no page or a wrong 'acknowledged' claim; whether endsWithNameQuestion weakens name capture in a way that writes a wrong contact name; failure handling (page must never fail the claim); and ALSO review the Chinese customer-facing text in crisisAckZh and the operator page text in crisis-alert.ts for clarity: short sentences, plain words, nothing redundant, correct numbers -- propose exact replacement wording if it reads badly.
- exit: 0 | elapsed: 466059ms | answer: 3427B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Missing Chatwoot configuration silently completes a crisis claim without acknowledgement or operator page  
  file:line   -> route.ts:197-213; crisis-alert.ts:11-14  
  confidence  -> CONFIRMED  
  scenario    -> `cis.chatwoot` is absent -> the Chatwoot block is skipped, `completeClaim` still runs, and neither customer nor operator receives crisis handling.  
  why missed  -> The optional fallback in `alertOperatorOfCrisis` suggests paging was intended to work without Chatwoot configuration.

FINDING 2: A Chatwoot handoff failure prevents crisis paging  
  file:line   -> route.ts:137, 204-206, 234  
  confidence  -> CONFIRMED  
  scenario    -> `handoffToHuman` rejects -> pipeline error handling runs before `acknowledgeHandoff`, so `pageCrisis` is never called.  
  why missed  -> Paging is placed after the handoff operation.

FINDING 3: Human-owned crisis messages rely on a non-durable, non-retried `after()` callback  
  file:line   -> route.ts:96-107; crisis-alert.ts:25-34  
  confidence  -> PLAUSIBLE  
  scenario    -> The route returns successfully, then the process exits before `after()` runs -> the crisis message receives no operator page.  
  why missed  -> This branch bypasses normal claiming and the alert helper explicitly reports failures without retrying.

FINDING 4: Dedupe treats any public outgoing/template message as a crisis acknowledgement  
  file:line   -> route.ts:252-260; chatwoot-client.ts:140-142; handoff-ack.ts:32-35  
  confidence  -> CONFIRMED  
  scenario    -> A generic agent/template message exists after the crisis message -> the safety acknowledgement is skipped, so the customer receives no helplines.  
  why missed  -> The existing broad handoff dedupe was reused without requiring the message to contain the crisis acknowledgement.

FINDING 5: `acknowledged=false` falsely claims the customer did not receive help lines after an indeterminate send failure  
  file:line   -> chatwoot-client.ts:101-120; route.ts:258-264; crisis-alert.ts:17-20  
  confidence  -> PLAUSIBLE  
  scenario    -> Chatwoot accepts the reply but the client times out -> `sendReply` throws, `acknowledged` becomes false, and Telegram says the customer has not received helplines.  
  why missed  -> A send exception is treated as confirmed non-delivery. Replacement: `系統未能確認客人已收到求助專線；請立即查看對話並親自回覆。`

FINDING 6: `endsWithNameQuestion` accepts unrelated agent/template messages and can write a wrong contact name  
  file:line   -> handoff-ack.ts:42-45; route.ts:298-313; chatwoot-client.ts:138-169  
  confidence  -> CONFIRMED  
  scenario    -> An outgoing message ends with `請問怎麼稱呼您呢？`, but asks it in another context; the customer replies `台灣` -> the placeholder contact name is overwritten with `台灣`.  
  why missed  -> The suffix check cannot distinguish the acknowledgement from any other outgoing message.

FINDING 7: A crisis follow-up such as “I need help” is captured as the customer’s name  
  file:line   -> handoff-ack.ts:77, 90-101; route.ts:287-313  
  confidence  -> CONFIRMED  
  scenario    -> The crisis acknowledgement is followed by `I need help` -> `parseNameReply` accepts it and `updateContactName` stores it as the contact name.  
  why missed  -> The parser rejects some question/request forms but does not reject this ordinary English help request.

TOTAL: 7 findings
