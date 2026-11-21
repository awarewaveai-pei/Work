# W5 系統盤點：registry 寫全部系統（Opus 5.5）

先讀 `COMMON.md`（registry 規則）、PLAN §2／§5。

目標（不變量）：近 90 天每個非 shared／ignore 的程式路徑都歸屬某系統；每個 `agency-os/handoffs/*/data.mjs` 被某 phase 認領；`products.ts` 每個 key 都有系統。

做：只改 `agency-os/systems/registry.json`（必要時加 `shared_paths`／`ignore_paths`）。
1. 量缺口：`PYTHONIOENCODING=utf-8 python lobster-factory/infra/hetzner-phase1-core/scripts/systems-import.py --dry-run --mirror <repo>/.git --ref <你的 HEAD sha> --state <tmp 檔>`，讀最後一筆 import_run 的 gaps（`unowned_paths` 只列前 500，全部數量要自己再跑一次統計）。
2. 系統邊界：一個系統＝有獨立目的、可整體判斷狀態的工作單位（PLAN §2 type 五類）。同一產品的多個監工頁＝同系統的多個 phase（例：影片 4 頁）。客戶系統只登 Soulful 和 Aware Wave 自己（記憶：只有這兩個 active client）。一次性任務、單一 bug 不是系統。
3. 每個系統：purpose 一句繁中白話；`product_key` 對 `lib/portal/products.ts`；phases 對監工頁資料夾；features 先只放各監工頁的卡（slug `c<卡號>-…` 規則照 COMMON；沒有卡號的監工頁用其步驟代碼小寫）——量太大時每 phase 至少列代表性 5 個，其餘在 RISKS 寫數量。
4. 驗收：dry-run 後 `unowned_paths`（非 shared/ignore）＝0、`unclaimed_supervisors`＝0、`unregistered_products`＝0、`dead_source_paths`＝0；`python lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/systems-import.test.py` 綠（含「真實 registry 通過驗證」）。
5. shared_paths 要節制：只放真正跨系統共用的檔（照 PLAN §2 範例），不得用寬前綴把整個 app 吞掉讓缺口歸零——那是讓偵測器閉嘴（AGENTS §1 最惡樣態）。

交回時另附一張清單（放回覆裡，不寫檔）：系統名稱｜type｜一句用途｜phase 數｜對應監工頁。監工會拿這張給操作者看。

檔案：只有 `agency-os/systems/registry.json`。
