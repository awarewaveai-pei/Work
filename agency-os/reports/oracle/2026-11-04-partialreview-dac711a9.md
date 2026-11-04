# codex-oracle review -- 2026-11-04 14:09:10 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/ConnectorsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/claim-check.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.get.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound C15.4 REALTEST findings: (1) subject length counted code points so Latin brand names blocked 13/20; now display width (Latin half). (2) claim check: model now labels each sentence, code decides; recipient sentences must cite an existing approved evidence id. (3) Connectors page/API: also list agency-level (org null) connectors the runtime falls back to, builtin env services as set/unset, org name per row, buttons instead of a dropdown. Check security of agency listing (no secrets leak, client users), and whether the claim check can be bypassed.
- exit: 0 | elapsed: 197508ms | answer: 1351B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/ConnectorsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/brand-context.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.get.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/claim-check.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 客戶可讀取代理商 connector 與主機服務的設定狀態
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/connectors/route.ts:48
  confidence  -> CONFIRMED
  scenario    -> 持有 Outreach 產品權限的客戶呼叫 GET；`effectiveOrgId` 將主清單限於自己的公司，但新增查詢仍回傳 `organization_id IS NULL` 的代理商 connector 名稱、啟用與金鑰狀態，並回傳主機服務設定狀態。`tenant-guard.ts:100-106` 明定客戶不可存取這類無公司歸屬的資料。回應沒有金鑰實值，但洩露了內部設定資訊。
  why missed  -> 測試只用 `staff` 身分，沒有驗證客戶身分的回應。

FINDING 2: 事實核對可漏列收件人陳述並仍判為通過
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts:52
  confidence  -> CONFIRMED
  scenario    -> 信件含「你們上月擴店」，模型只回傳一筆 `about: "courtesy"`，或將該陳述標成 `sender`。解析器不核對回傳句子是否覆蓋原信，跳過非 `recipient` 項後回傳 `supported`；`review-policy.ts:119-121` 因此允許自動核准。
  why missed  -> 測試驗證了每個已回傳項目的分類與證據 ID，沒有驗證原信的句子是否全部出現在回覆中。

TOTAL: 2 findings
