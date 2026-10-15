# codex-oracle review -- 2026-10-15 12:17:50 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 3. R1 (2026-10-15-partialreview-0deaa36b) and R2 (-480253c0) both hit the contact-attribute marker; per AGENTS rule an invariant was written first and the marker was REMOVED. New invariant: a contact name is written only when the public (non-private, non-activity) message immediately before the customer reply in THIS conversation is exactly our name question text (handoffAckText(cis,true), recomputed from csVoice), the reply parses as a name, and a fresh GET still shows the placeholder name. Acknowledgement is skipped if a public outgoing message already exists after the triggering customer message (dedupe across concurrent pipelines). Accepted residual: agent rename between the fresh GET and the PUT (Chatwoot has no conditional update).
- exit: 0 | elapsed: 309319ms | answer: 2502B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/chatwoot-client.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Concurrent pipelines can send duplicate handoff acknowledgements.
  route.ts:213   -> route.ts:216
  confidence  -> CONFIRMED
  scenario    -> Two pipelines both read no later outgoing message before either sends; both call `sendReply`, producing duplicate acknowledgements.
  why missed  -> The read-before-send check is not atomic or idempotent.

FINDING 2: The acknowledgement dedupe misses outgoing messages beyond Chatwoot’s 100-message `after` limit.
  chatwoot-client.ts:112   -> route.ts:213
  confidence  -> CONFIRMED
  scenario    -> 100 incoming/internal messages follow the trigger, then a public outgoing reply; only the first 100 are returned, so another acknowledgement is sent. [Chatwoot MessageFinder](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/app/finders/message_finder.rb)
  why missed  -> The wrapper documents the bounded window but the caller treats one page as complete.

FINDING 3: A public Chatwoot template message does not suppress the acknowledgement.
  chatwoot-client.ts:106   -> route.ts:214
  confidence  -> CONFIRMED
  scenario    -> A non-private `message_type: 3` template is sent after the customer message; the check only accepts type 1, so another public acknowledgement is sent. [Chatwoot Message model](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/app/models/message.rb)
  why missed  -> The local type map includes templates, but the dedupe predicate checks only `messageType === 1`.

FINDING 4: The name capture silently fails when more than 20 internal/activity messages follow the question.
  chatwoot-client.ts:112   -> route.ts:239
  confidence  -> CONFIRMED
  scenario    -> The name question is followed by 20 private/activity records and then the customer’s name; Chatwoot’s `before` response excludes the question, so no name is written. [Chatwoot MessageFinder](https://raw.githubusercontent.com/chatwoot/chatwoot/v4.18.0/app/finders/message_finder.rb)
  why missed  -> Filtering happens after Chatwoot’s 20-message limit, with no pagination.

FINDING 5: The name-question decision uses the stale webhook contact name.
  route.ts:128   -> route.ts:215
  confidence  -> CONFIRMED
  scenario    -> The webhook reports `John Doe`, an agent renames the contact to 林小美 before `after()` runs, and the code still sends a name question because it uses the captured `contact.name`.
  why missed  -> The fresh contact GET protects only the later PUT, not the acknowledgement decision.

TOTAL: 5 findings
