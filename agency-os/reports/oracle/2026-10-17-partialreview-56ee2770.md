# codex-oracle review -- 2026-10-17 16:13:25 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/packages/db/migrations/0104_cs_crisis_holding_replies.sql, lobster-factory/packages/db/migrations/0104_cs_crisis_holding_replies.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Crisis message while a human owns the Chatwoot conversation: page operator, then send operator-approved help-line text at most once per conversation per 30 min; window claimed atomically via new table + SQL function (migration 0104, not yet applied to prod); T27 system-mode gate; fail-open on claim error; release window on send failure. Also verify: does this change depend on something NOT visible in this diff (config, schema assumption, upstream default)? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 380084ms | answer: 1656B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/config.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/handoff-ack.ts, lobster-factory/packages/db/migrations/0104_cs_crisis_holding_replies.down.sql, lobster-factory/packages/db/migrations/0104_cs_crisis_holding_replies.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: A failed holding send can leave the 30-minute claim stuck, suppressing future help lines.
  `route.ts:285` -> `db.ts:584`
  confidence  -> CONFIRMED
  scenario    -> The claim row is inserted, then `sendReply` fails and the cleanup DELETE returns an error (or the `after()` worker is killed); the row remains fresh, so the next crisis gets `recent` at `route.ts:286` and no reply for 30 minutes. The existing sweep only scans `cs_ai_replies` at `db.ts:430-437`.
  why missed  -> The test only checks that the mocked release helper was called at `route.test.ts:532-536`, not that the claim was actually released.

FINDING 2: A concurrent losing webhook is not retried when the winning send fails.
  `route.ts:286` -> `0104_cs_crisis_holding_replies.sql:45-48`
  confidence  -> CONFIRMED
  scenario    -> Webhook A claims; webhook B concurrently receives `recent` and returns. A’s Chatwoot send then fails and releases the claim. With no later message, neither webhook sends the help lines.
  why missed  -> Tests exercise one webhook at a time; the failure case is a single `post()` at `route.test.ts:532-536`.

FINDING 3: A Chatwoot timeout can create duplicate help-line messages.
  `chatwoot-client.ts:110,120` -> `route.ts:291`
  confidence  -> PLAUSIBLE
  scenario    -> Chatwoot accepts the POST, but the response is delayed beyond the 10-second abort. The client throws, the claim is deleted, and the next crisis within 30 minutes claims and sends a second reply because no idempotency key is supplied.
  why missed  -> Every transport exception is treated as definitive send failure, with unconditional claim release.

TOTAL: 3 findings
