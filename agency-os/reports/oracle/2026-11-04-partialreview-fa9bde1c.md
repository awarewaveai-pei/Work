# codex-oracle review -- 2026-11-04 11:03:46 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/channels.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 4 (final) of FluentCRM channel tags. Invariant now: every capture's tags reach the FluentCRM contact; a repeat is harmless (plugin attachTags additive) and never degrades a synced lead. Skip = capture key recorded on a fluentcrm_synced event (source_url shortcut removed). Meta form-name read: 5xx/429/network -> leadgen counted retry (Meta resends), 4xx -> capture without form tag. A lost timeline insert only costs one extra idempotent call (accepted). Report only real defects against this invariant.
- exit: 0 | elapsed: 133691ms | answer: 1338B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/meta-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/warm-leads.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/meta-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/channels.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 暫時找不到 bridge 時，webhook 會確認接收，但這次 capture 的標籤未送達 FluentCRM。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/warm-leads.ts:139
  confidence  -> CONFIRMED
  scenario    -> 已同步的 lead 再提交一份 Meta 表單；當下該組織的 `wp_sites` 暫時沒有可配對的 active bridge。此處回傳 `retryable: false`；`meta-leads.ts:107-110` 將提交計為完成，webhook 回 200。bridge 恢復後，Meta 不會因這次回應重送，新表單標籤沒有補送機會。
  why missed  -> 新的重試設計處理了 Graph 和 FluentCRM 呼叫失敗，但沿用了 `no_bridge` 為不可重試的既有判定。

FINDING 2: 表單名稱含單獨的 Unicode surrogate 時，標籤生成會拋錯，capture 無法同步。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/channels.ts:31
  confidence  -> CONFIRMED
  scenario    -> CSV 匯入的表單名稱含 JSON 合法的 `\ud800`。`encodeURIComponent()` 拋出 `URIError`；`captureWarmLead` 回傳 `db_error`，不呼叫 FluentCRM。CSV 入口仍以 HTTP 201 回應，該筆 capture 的標籤未送達。
  why missed  -> 測試涵蓋長字串和完整 emoji，沒有涵蓋 JSON 可解析但無法做 URI 編碼的字元。

TOTAL: 2 findings
