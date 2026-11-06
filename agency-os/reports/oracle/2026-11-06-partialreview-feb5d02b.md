# codex-oracle review -- 2026-11-06 18:20:50 +08:00

- mode: `review`
- scope: whole repo
- target: `23e25fcaa`
- context: Outreach JSON AI steps (research extraction, voted fact check, reply classification) now use the client's own Gemini connector key via outreachJson (org from billedOrgId(grant), 5-min per-org cache), falling back to the platform env key on gemini_429_daily_quota / gemini_key_invalid / gemini_403. Check tenant isolation, key never logged, cache, fallback semantics, billing attribution.
- exit: 0 | elapsed: 220723ms | answer: 1794B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/ConnectorsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/cheap-json-gemini.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cheap-json.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/org-ai-key.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/org-ai-key.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 子組織會選到母組織的 Gemini key，或漏用自己的 key
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/org-ai-key.ts:37
  confidence  -> CONFIRMED
  scenario    -> 線索與 Gemini connector 屬於子組織；授權系統把 `grant.subject.orgId` 解析為母組織（`lib/entitlements/subject.ts:69-71`）。此處用計費 ID 查 connector，結果改用母組織的 key，或落到平台 key。
  why missed  -> 測試的 grant 直接把 connector 組織 ID 放進 subject，沒有涵蓋組織階層。

FINDING 2: 客戶使用獨立 Supabase 時，查證與回信分類會在錯誤的資料庫找 key
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/claim-check.ts:40
  confidence  -> CONFIRMED
  scenario    -> 客戶的 connector 存在其獨立 Supabase；outreach 請求透過 `lib/outreach/db-client.ts:23-25` 使用該資料庫，但查證固定傳入平台的 write client。若平台資料庫沒有該 connector，查證改耗平台額度；`lib/outreach/gmail-sync.ts:405` 的分類也使用平台 client。
  why missed  -> 新測試只傳入單一模擬資料庫，沒有走既有的每客戶資料庫路由。

FINDING 3: Connector 查詢失敗會被當成「沒有 key」快取五分鐘
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/org-ai-key.ts:21
  confidence  -> CONFIRMED
  scenario    -> Supabase 暫時回傳查詢錯誤時，程式只取 `data`、不檢查 `error`；隨後在第 29 行快取 `null`。即使資料庫立即恢復，該組織接下來五分鐘仍直接使用平台 key。
  why missed  -> 測試只涵蓋成功查詢與 vault 拋錯，沒有模擬 Supabase 回傳 `{ data: null, error }`。

TOTAL: 3 findings
