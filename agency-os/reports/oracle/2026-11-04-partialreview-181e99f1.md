# codex-oracle review -- 2026-11-04 10:57:37 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up of Codex F1: captureWarmLead now skips the FluentCRM call for an already-synced lead only when this is the same capture (same Meta leadgen source_url, or same consent_source); a capture from another channel/form re-upserts so its tags attach (plugin attachTags is additive). Verify only this fix; if no real finding, return none.
- exit: 0 | elapsed: 90886ms | answer: 677B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 已同步的暖名單再次由 CSV 表單匯入時，每次都會重複呼叫 FluentCRM。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:119
  confidence  -> CONFIRMED
  scenario    -> `status=warm`、`consent_source=replied` 的已同步名單首次由 Spring 表單匯入後，程式不更新 `consent_source`；再次匯入 Spring 時仍判為不同 capture，重複 upsert，可能在暫時失敗時把原本的 `synced` 改成 `failed`。
  why missed  -> 測試在第二次匯入前手動把 `consent_source` 改成 Spring（warm-leads.test.ts:44）；實際流程沒有這項寫入。

TOTAL: 1 findings
