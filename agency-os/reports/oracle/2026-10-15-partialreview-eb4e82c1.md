# codex-oracle review -- 2026-10-15 15:27:03 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/faq.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/cis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[[]slug]/cis/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/faq.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Operator wants automatic customer replies with zero per-message cost (no LLM). New: client_config.csFaq entries {id, keywords[], answer}; lib/cs/faq.ts matchFaq picks the entry with the most distinct keywords contained in the message (NFKC + lowercase substring), null on tie / no hit / hitsSensitive. In the Chatwoot webhook runPipeline it runs AFTER the system-mode gate (T27: no automatic reply while blocked) and BEFORE credit reservation and the AI pipeline; a hit sends the written answer, records auto_sent with intent faq:<id>, completes the claim; a send failure throws and leaves the claim for the sweep. The AI kill-switch (csEnabled=false) does not stop FAQ answers (FAQ is not AI). cis PATCH accepts csFaq (whole list replaces; [] clears) via sanitizeFaq; loadCis sanitizes stored data too. ClientHubTabs gets an editor card (not inlined).
- exit: 0 | elapsed: 553099ms | answer: 645B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/clients/[slug]/cis/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/chatwoot/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/cis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/types.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/__tests__/faq.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/faq.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Full-width sensitive terms bypass the FAQ human-only guard.

  file:line   -> `lobster-factory/.../lib/cs/faq.ts:22-23`; `lobster-factory/.../lib/cs/autonomy.ts:13-15`; `lobster-factory/.../app/api/webhooks/chatwoot/route.ts:163-165`

  confidence  -> CONFIRMED

  scenario    -> An FAQ matches `課程`; customer sends `課程可以ｒｅｆｕｎｄ嗎`. `hitsSensitive` checks raw lowercase text and misses `refund`, then FAQ NFKC normalization matches the entry and sends its answer automatically.

  why missed   -> NFKC normalization is applied to FAQ matching only, not to the shared sensitive-term detector.

TOTAL: 1 findings
