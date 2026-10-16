# codex-oracle review -- 2026-10-16 19:56:41 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Customer-service AI. Already on main (4f381881f): a message hitting CS_CRISIS_KEYWORDS hands off with reason "crisis", the operator is paged on Telegram before any Chatwoot call, and the acknowledgement carries help lines. This change: a tenant intent with key CS_CRISIS_INTENT_KEY ("crisis", is_sensitive, L0 -- added for Soulful in prod today) lets the classifier catch euphemisms the keyword list cannot hold. safetyGate returns "crisis" for that intent; the webhook route treats decision.handoffReason === "crisis" like a keyword hit: it pages right after handleInbound (still before handoffToHuman/sendReply) unless the keyword path already paged, and passes crisis=true to the acknowledgement (handoffAckText gains an explicit crisis flag; language still follows the customer's text). Check: double pages, missed pages (draft / credit-exhausted / suppressed paths), the explicit flag vs the default, and whether hard-coding the intent key is a problem for other tenants.
- exit: 0 | elapsed: 284144ms | answer: 1191B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/autonomy.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/cs-core.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Classifier-only crises are missed on pre-classification exits.
  file:line   -> lobster-factory/.../chatwoot/route.ts:184,189 -> lobster-factory/.../chatwoot/route.ts:196,200
  confidence  -> CONFIRMED
  scenario    -> A metered tenant with exhausted credit receives a euphemistic crisis message. The route hands off with `hitsCrisis(...) === false`, sends an ordinary acknowledgement, and never pages because `handleInbound` is skipped.
  why missed  -> The new page logic runs only after `handleInbound`; credit exhaustion and open-thread suppression return earlier.

FINDING 2: Any tenant can accidentally turn an ordinary intent named `crisis` into a suicide-crisis route.
  file:line   -> lobster-factory/.../cs-intents/route.ts:37,42,51 -> lobster-factory/.../cs/autonomy.ts:103
  confidence  -> CONFIRMED
  scenario    -> A tenant creates `key: "crisis"`, `label: "financial crisis"`, `isSensitive: false`. An ordinary matching message triggers a Telegram crisis page and suicide help-line acknowledgement.
  why missed  -> The API and schema allow arbitrary keys; the runtime treats the key alone as globally reserved without enforcing that reservation.

TOTAL: 2 findings
