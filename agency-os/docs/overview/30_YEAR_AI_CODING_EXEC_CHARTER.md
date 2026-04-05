# 30 年級 AI / Coding / 專案管理短憲章（跨國企業版）

> **Owner（Single Owner）**：本文件為「可對外宣告的決策口徑」單一真相；落地執行以 repo 閘道與 SOP（`verify-build-gates` / `system-health-check` / `AO-CLOSE` / `TASKS` / `WORKLOG`）為權威。
> 
> **目的**：讓 AI 協作、coding 自動化與專案管理，在換人、換工具、跨國擴張後仍可持續維運 30 年。

## 0. 先給結論（這份文件的「不可破」）
- AI 只能加速草稿與整理，不能繞過核准平面與生產寫入閘道。
- 單一真相：`TASKS.md` / `WORKLOG.md` / `memory/**` 是進度與決策證據；看板僅視圖。
- 單一 Owner：同一份政策/流程/交付路由只有一個文件主人，避免長期漂移。
- 跨國企業用「可擴充模組」解決部門變動，用「固定交付歸桶矩陣」解決計價/範圍口徑穩定。

## 1. 管理層決定（Decisions）
1. **AI 邊界**：AI 不做權限/資料隔離/路由/合約口徑的最後決策；高風險變更必走 staging 證據與釋出閘道。
2. **Single Owner**：政策與流程正文只保留一份 owner 檔；他處只能放「一句摘要 + 連結」。
3. **平面分界**：控制（誰能批）/執行（workflow/agent）/資料（SoR/RLS）/觀測（logs/health）分開管理；跨平面改動必有證據。
4. **Evidence 驅動**：以 `verify-build-gates`、health 報告、`AO-CLOSE` 證據作為對外宣告依據，而非以聊天/截圖作結論。
5. **相容與退役**：破壞性變更必有 release note、遷移步驟、回滾方案；大型分岔用 ADR 留痕。
6. **合規不可談判**：憑證、密鑰、敏感個資不可進文件/記憶/工作日誌；跨境與個資索引走既有 governance 檔。
7. **客戶模組化**：客戶選用哪些能力模組（catalog/selection）可日後擴充；但交付/計價歸桶以固定矩陣為準，避免頻繁重排導致合約口徑漂移。

## 2. 工程層執行（Execution）
1. **每日續接**：預設從 `AO-RESUME` 進入，確保本機與時程接線一致；必要時先在 monorepo 根 `git pull --ff-only origin main` 再繼續。
2. **治理/文件連動**：任何改版涉及政策、文件連動與矩陣語意時，先跑 `doc-sync-automation.ps1 -AutoDetect`，並以 `docs/CHANGE_IMPACT_MATRIX.md` 為硬約束。
3. **收工閘道**：預設入口為 `AO-CLOSE`；閘道通過後才允許 commit/push。
4. **觀測與健康**：`system-health-check` Critical Gate 必須達標；未達不得宣告整庫正常。
5. **AI 協作方式**：
   - 允許：產生命令草稿、差異整理、風險清單、可審查的變更提案。
   - 禁止：跳過 staging/閘道、繞過審核平面、把祕密寫入 `WORKLOG/memory`。
6. **跨國部門落地**：以
   - 客戶選型：`agency-os/tenants/templates/core/DEPARTMENT_CLUSTER_CATALOG.md` + 每租戶 `core/DEPARTMENT_SELECTION.json`
   - 交付路由：`agency-os/tenants/templates/core/DEPARTMENT_COVERAGE_MATRIX.md`
   - 未採購/不適用：在對應列 `Notes` 寫 `N/A — <原因>`（計價與範圍以合約為準）
   作為唯一落地路徑。

## 3. 30 年演進規則（How to evolve）
- 需要新增一條決策時：先寫進此文件（owner），再用 `CHANGE_IMPACT_MATRIX` 補上必同步文件，最後跑 doc-sync 與 health。
- 需要新增一項落地規格時：把落地放到對應 SOP/閘道文件（非此文件正文），並在此文件保持「決策口徑」一致。
- 每次大幅改版後：更新 `README` 導覽入口，並在 `TASKS.md` / `WORKLOG.md` 留痕，確保換人也能追溯。

