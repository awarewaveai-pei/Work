# codex-oracle review -- 2026-10-15 12:02:39 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Chatwoot CS webhook: when the AI hands a conversation to a human, send the customer a canned acknowledgement (csVoice.escalationTone, else a default) and, when Chatwoot only has the placeholder name John Doe, append a name question and store cs_name_ask on the contact. The customer's first reply after that (conversation open, normally ignored) is parsed by code (no AI) and written as the contact name only if nobody spoke in between and the name is still a placeholder. The system-mode blocked path sends no acknowledgement (T27 decision: no automatic reply while blocked). The ack is best-effort after the handoff reached Chatwoot. Also changed (not inlined): cis/route.ts sanitizer + form keys add askName; ClientHubTabs form relabels escalationTone and adds askName.
- exit: 0 | elapsed: 282578ms | answer: 2281B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/handoff-ack.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The name marker is written after the customer-visible question, so a fast first reply can be lost permanently.
  route.ts:205 -> route.ts:207
  confidence  -> CONFIRMED
  scenario    -> `sendReply` succeeds, the customer replies before `updateContact` stores `cs_name_ask`, and the reply webhook has no marker; the name is never captured.
  why missed  -> Tests execute the acknowledgement and marker update sequentially, so they do not exercise this interleaving.

FINDING 2: Name capture trusts the stale webhook name and can overwrite a real name.
  route.ts:97 -> route.ts:232
  confidence  -> CONFIRMED
  scenario    -> The webhook contains `John Doe`; an agent renames the contact before `captureName` runs; capture still sees the old placeholder and writes the parsed reply over the agent’s real name.
  why missed  -> Tests only change the name inside the webhook payload, not between webhook receipt and deferred processing.

FINDING 3: Public template messages are ignored when deciding whether an agent spoke.
  chatwoot-client.ts:109 -> route.ts:230
  confidence  -> CONFIRMED
  scenario    -> A public `message_type: 3` template is sent after the question, then the customer replies with a name; the predicate sees no intervening speech and stores the name.
  why missed  -> Tests cover incoming/outgoing messages but not Chatwoot’s template type.

FINDING 4: Short acknowledgements such as “好的” are accepted as contact names.
  handoff-ack.ts:43 -> route.ts:234
  confidence  -> CONFIRMED
  scenario    -> The customer replies “好的”; it matches none of `NOT_A_NAME`, passes the length checks, and the contact name becomes “好的”.
  why missed  -> Parser tests cover questions, phone numbers, and long sentences but not short acknowledgements.

FINDING 5: A successful acknowledgement can be duplicated when claim completion fails and the sweep retries.
  route.ts:187 -> route.ts:192
  confidence  -> CONFIRMED
  scenario    -> Handoff and acknowledgement succeed, `completeClaim` fails, and the sweep reruns the unfinished claim; the customer receives the acknowledgement twice.
  why missed  -> The best-effort catch handles acknowledgement failure, but not the successful-ack/failed-claim-completion sequence.

TOTAL: 5 findings
