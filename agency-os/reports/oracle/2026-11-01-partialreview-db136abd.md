# codex-oracle review -- 2026-11-01 18:39:37 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/leads, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/packages/db/migrations/0150_co_evidence.sql, lobster-factory/packages/db/migrations/0150_co_evidence.down.sql  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 of Outbound OS card C3. Round 1 Codex fixes (warm statuses incl. replied, extraction deadline + concurrency 4, non-object items, self_published consent on own-site email, bestEmail across pages) plus a Claude critic round: only the lead's own site is read (platform hosts refused, path-prefix scope, off-site pages skipped), auto-approve needs excerpt >= 10 chars and claimSupport >= 0.5, email auto-filled only when own-domain or mailto, others become timeline candidates, compare-and-set email write, 23505 tries the next address, polling filtered by org, research and gmail-draft refuse warm leads, 0150 length checks. Verify these and report only real defects, none if none.
- exit: 0 | elapsed: 176284ms | answer: 3527B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/leads/LeadsClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/MODULE_MANIFEST.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/cold-gate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/cold-gate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/contact-guard.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/leads/LeadResearch.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/evidence/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/research/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/research/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/research.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/billing.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research-extract.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/research.ts, lobster-factory/packages/db/migrations/0150_co_evidence.down.sql, lobster-factory/packages/db/migrations/0150_co_evidence.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 既有頁面品質門檻會丟棄短的聯絡頁，連頁上的 email 也不會擷取
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/orchestrator.ts:483`
  confidence  -> CONFIRMED
  scenario    -> 官網首頁連到一頁少於 600 UTF-8 bytes 的中文聯絡頁，頁上有 `mailto:info@company.example`；`quality.ts:150` 判為 `too_short`，研究設定 `keepAside: false`（`run.ts:238`），該頁不到 sink，結果漏掉可用 email。
  why missed  -> 新 sink 的測試直接餵 `RawDoc`，沒有經過既有品質門檻。

FINDING 2: 重新研究不會撤銷已失效的核准證據
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts:84`
  confidence  -> CONFIRMED
  scenario    -> 官網原本寫「免運」並產生 approved 證據，之後刪除免運政策；再次研究只新增或忽略重複列，舊列仍為 approved，而產信仍會讀它（`app/api/outreach/messages/route.ts:62`），可能寫出已不成立的承諾。
  why missed  -> 測試只驗新增與重跑去重，沒有驗來源內容變更後的證據生命週期。

FINDING 3: 跨頁去重會讓後頁的 `mailto:` 失去自動填入資格
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/sinks/outreach-research.ts:60`
  confidence  -> CONFIRMED
  scenario    -> 首頁文字出現 `owner@gmail.com`，聯絡頁再以 `mailto:owner@gmail.com` 正式公布同一地址；sink 保留首頁的非 `mailto` 紀錄、略過後頁紀錄，`bestEmail` 因而找不到合格地址，名單 email 維持空白。
  why missed  -> 跨頁測試使用兩個不同地址，沒有覆蓋同地址取得更強來源證據的情況。

FINDING 4: 路徑式網站若網址沒有結尾斜線，研究範圍會擴成整個主機
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/run.ts:227`
  confidence  -> CONFIRMED
  scenario    -> 名單網站填 `https://example.com/shop`；`dir` 被算成 `/`，不設 `pathPrefix`，爬蟲可跟隨連結讀取 `https://example.com/other-tenant`，其內容也可能成為該 lead 的證據。
  why missed  -> 路徑範圍邏輯把最後一段一律視為檔名，沒有處理常見的無尾斜線目錄網址。

FINDING 5: 網站跳轉可在範圍檢查之後讀取站外頁面
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts:298`
  confidence  -> CONFIRMED
  scenario    -> 官網某頁回 302 指向另一公司的網站；爬蟲在跳轉前只檢查原網址的 scope，fetcher 仍向站外網址發請求並讀取回應，直到 sink 的 `outreach-research.ts:57` 才丟棄文件，違反「只讀 lead 自有網站」的邊界。
  why missed  -> 修正放在 sink，未檢查 fetcher 對每次跳轉的範圍處理。

FINDING 6: 批次研究在服務重啟後會失去未處理名單，且沒有持久進度可恢復
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/leads/research/route.ts:63`
  confidence  -> CONFIRMED
  scenario    -> 20 筆名單循序研究到第 5 筆時 next-admin 重啟；工作只存在程序內的 Promise 與 `run-jobs.ts:43` Map，後 15 筆不會研究，輪詢變成 404，也沒有每筆失敗事件。
  why missed  -> 重用了 collect 的記憶體工作追蹤器，但 collect 原本另有持久執行紀錄；此新批次路徑沒有等價恢復機制。

TOTAL: 6 findings
