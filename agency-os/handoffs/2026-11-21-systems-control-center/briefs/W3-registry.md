# W3 registry＋Outbound 遷移＋new-product 接線（Sonnet 5.5）

先讀 `COMMON.md`、PLAN §5、§8。

做：
1. `agency-os/systems/registry.json`：先只放 Outbound OS 一個系統（垂直切片）。source_paths 從 `agency-os/handoffs/2026-10-31-outbound-os/data.mjs` 的檔案指向＋`git log --name-only` 近 90 天實際路徑整理；next-admin 共用檔（`package.json`、`app/globals.css`、`lib/supabase-server.ts`、`lib/portal/products.ts` 等，以實際 grep 為準）列 shared_paths。phases＝一個（legacy_source_path 指該監工頁資料夾）；features 取該 data.mjs 的卡，3–5 個代表性的先上，其餘留在 RISKS 列數量。uuid 用 `node -e "console.log(crypto.randomUUID())"`。
2. `scripts/systems-migrate-supervisor.mjs <監工頁資料夾>`：讀 data.mjs → 依 registry 對應 → 產契約 2 的 `migration` 事件 JSON 到 stdout（不 POST；POST 由監工切換時做）。無證據→`implemented`，有 commit→evidence_level=commit，不降 todo。node 測試照 repo 既有 node 測試慣例（先 grep 找慣例）。
3. 切換準備（不啟用）：outbound 監工頁 `check.mjs` 加一個開關常數 `FROZEN = false`；true 時擋 data.mjs 狀態被改並印「已移到 /ops/systems」。監工切換時才改 true。
4. `scripts/new-product.mjs`：寫 `products.ts` 時同時在 registry 加一條 planning 系統（uuid、slug＝product key、product_key、source_paths 留空陣列）。照該腳本既有的 staging／原子寫法（`:120-130`）。補它既有測試裡的一個斷言。

檔案：上述路徑。不碰 next-admin app 程式、匯入器。
