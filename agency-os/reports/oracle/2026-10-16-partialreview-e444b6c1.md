# codex-oracle review -- 2026-10-16 19:42:55 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of partialreview-58beec4d. Fixes: the page is sent first in runPipeline (before system mode and every Chatwoot call) with text that claims nothing about the handoff; crisis dedupe only counts a later crisis acknowledgement; name capture back to exact match against the three name-asking acknowledgements (isNameQuestionAck); parseNameReply rejects crisis text, Latin sentences with pronouns/need verbs, and ?閬?撟???etc. Original context: Customer-service AI, crisis messages (self-harm/suicide; hitsCrisis in lib/cs/autonomy.ts, already on main). Operator decisions 2026-10-16: (1) the handoff acknowledgement for a crisis message carries help lines, wording by the customer's language, both Taiwan (119, 1925, 1995) and Australia (000, Lifeline 13 11 14) listed because Chinese-speaking customers can be in either; (2) the name question is still asked; (3) the operator is paged on Telegram via the existing ops-inbox operator channel (buildOperatorTelegramNotifier().sendText), without the customer's words. Name capture now matches a previous message whose LAST LINE is the name question (endsWithNameQuestion) so it works after either acknowledgement. A crisis message in a thread a human already owns gets no automatic reply but still pages. Check: paths where a crisis message gets no page or a wrong 'acknowledged' claim; whether endsWithNameQuestion weakens name capture in a way that writes a wrong contact name; failure handling (page must never fail the claim); and ALSO review the Chinese customer-facing text in crisisAckZh and the operator page text in crisis-alert.ts for clarity: short sentences, plain words, nothing redundant, correct numbers -- propose exact replacement wording if it reads badly.
- exit: 0 | elapsed: 228604ms | answer: 1114B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/crisis-alert.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A CIS-load failure prevents crisis paging entirely
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts:150,153`
  confidence  -> CONFIRMED
  scenario    -> A crisis message enters `runPipeline`, but `loadCis()` rejects during a database/config outage -> execution stops before `pageCrisis()` and no Telegram page is sent.
  why missed  -> Tests exercise only successful CIS loading; the comment assumes paging precedes all failure points.

FINDING 2: The operator page falsely says AI will not reply
  file:line   -> `lib/cs/crisis-alert.ts:16`; `app/api/webhooks/chatwoot/route.ts:253`
  confidence  -> CONFIRMED
  scenario    -> A crisis handoff sends the automatic help-line acknowledgement via `sendReply()`, while Telegram says “AI 不會回答這則訊息” -> the operator receives contradictory state and may duplicate or misunderstand the response.
  why missed  -> The page text was reviewed independently from the acknowledgement path. Exact replacement: `請馬上打開對話，親自確認並回覆客人。`

TOTAL: 2 findings
