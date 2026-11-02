# codex-oracle review -- 2026-11-02 12:37:24 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch/rendererClient.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-provider-tier.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gcis.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C12.1/C12.2 (Claude SDK worker + main session): keyless provider support (gcis, no auth header; a keyed provider without key stays unconfigured), lib/outreach/sources/gcis.ts (GCIS company lists per business-item class API, detail by tax id, website via Serper with directory reject list and title check, county filter, cap 100), Inbox 找公司 under the outreach.discover grant with hold/settle, approval copies contact_name/role and a gcis-only general_source consent from raw_payload. Built from documented response shapes; the server IP is not whitelisted yet (C12.3). SSOT agency-os/handoffs/2026-10-31-outbound-os/R0-PLAN.md section 6 C12.
- exit: 0 | elapsed: 191387ms | answer: 2561B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/inbox/InboxClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/inbox/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-provider-tier.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/providers.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/site-watch/rendererClient.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gcis.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 單筆查詢失敗後，仍在執行的查詢費用不會被結算
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts:120
  confidence  -> CONFIRMED
  scenario    -> 5 筆並行查詢中，1 筆 Serper 回傳 429；`Promise.all` 立即拒絕，route 在其餘查詢完成前按當下的 `serperCredits` 結算（app/api/outreach/inbox/route.ts:183-184）。其餘查詢仍可能消耗 Serper 額度，這次結算不會計入它們。
  why missed  -> 測試只覆蓋成功批次，沒有並行期間的失敗。

FINDING 2: 縣市篩選可能把有公司的縣市回報為「沒有找到公司」
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts:142
  confidence  -> CONFIRMED
  scenario    -> 某營業項目前 5,000 筆結果都不在台中市，後面才有台中市公司；程式在全國結果讀完五頁後停止，再以縣市篩選，向使用者回傳 0 筆。
  why missed  -> 100 筆上限測試只放了 130 筆同縣市資料，沒有測試縣市分布跨越分頁上限。

FINDING 3: 營業項目文字搜尋依賴未列於官方 API 條件的篩選式
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/sources/gcis.ts:81
  confidence  -> PLAUSIBLE
  scenario    -> 使用者輸入「餐館」；程式送出 `Business_Item_Desc like 餐館`。若 API 只接受其[開發指引列出的 `Business_Item eq` 條件](https://data.gcis.nat.gov.tw/od/demo_cond/FCB90AB1-E382-45CE-8D4F-394861851E28)，搜尋會失敗或回空，使用者無法選擇營業項目。白名單尚未開通，未能實測此回應。
  why missed  -> 假回應測試直接提供公司清單，沒有測試搜尋框所送的篩選式。

FINDING 4: 一般匯入資料可冒充 GCIS 來源並寫入未驗證的個資來源
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/route.ts:167
  confidence  -> CONFIRMED
  scenario    -> 有匯入權限的呼叫者透過一般 `leads[]` 匯入，填入 `source_type: "gcis"` 與任意 `general_source:` URL；核准後，該 URL 成為正式 lead 的 `consent_source`，後續告知文字會把它寫成聯絡方式的公開來源（lib/outreach/brand-context.ts:59-63）。匯入入口沒有驗證資料確實來自 GCIS（app/api/outreach/inbox/route.ts:97-101）。
  why missed  -> 核准流程檢查了來源字串的前綴，卻將可由一般匯入者填寫的 `source_type` 當成來源證明。

TOTAL: 4 findings
