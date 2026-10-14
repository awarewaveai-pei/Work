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
1. **每日續接**：預設在 Claude Code / Codex 的 monorepo root 送 **`AO-RESUME`**；**hook/bridge** 先跑 **`scripts/ao-resume.ps1 -FullMainlineParity`**（behind 時才 ff-only pull＋閘道＋Strict 稽核）再讀檔；髒樹／衝突時腳本會非 0，請先整理（見 **`REMOTE_WORKSTATION_STARTUP` 2.5.1**）。除錯時可改手動跑腳本。
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

## 4. 文件、聊天與 Markdown：可稽核信任邊界（補 §0）

### 4.1 真相順序（結案／對外宣告只認這條鏈）
1. **已 merge 的 git**（含可在 `origin/main` 對照的 commit）。
2. **`TASKS.md` → `### 未完成`**（全域隊列：仍開放的責任）。
3. **該主題 Owner 檔**（例：`REMOTE_WORKSTATION_STARTUP.md`、`DUAL_MACHINE_ENVIRONMENT_CHECKLIST.md`、`tenants/<company>/core/ENVIRONMENT_REGISTRY.md`（環境 URL／lifecycle）、`tenants/.../10_DISCOVERY.md`；清單見 `docs/operations/cursor-enterprise-rules-index.md` SSOT 表）。
4. **`WORKLOG.md` 當日證據**（含收工時 `- AUTO_TASK_DONE:` 命中規則時）。

**不得單獨作為結案依據**：聊天室內容、截圖、未 push 的本機檔、口頭約定。

### 4.2 為何 Markdown 常「像沒寫」
`.md` **不會**因 AI 對話自動更新。若沒有 **有意識的 edit + commit（或代理代寫並 checkpoint／push）**，repo 內就沒有記錄——問題在**入庫動作缺席**，不是 Markdown 無效。

### 4.3 禁止重工、矛盾與雙寫
- **預設不新增檔**：見 `docs/operations/new-doc-linkage-checklist.md` 開頭「**預設：不要新增檔案**」——先 append Owner，禁止為偏好開平行長文檔。
- **隊列**：`TASKS` 只保留 **一行**責任敘述 + **進度／下一步** + **連結到 Owner**；長細項不得堆在 `TASKS` 重複貼全文。
- **細項與案例**：只在對應 **Owner 檔** 維護正文；他處 **一句摘要 + 連結**（見 `CLAUDE.md` / `agency-os/AGENTS.md` 的 Single Owner 原則）。
- **租戶／試點**：事實以 `tenants/<company>/...` 該案檔為準（**環境 URL**：`core/ENVIRONMENT_REGISTRY.md`；**站點索引**：`SITES_INDEX.md`；若在 `sites/*/SITE_PROFILE.md` 的 **Staging URL** 列出 HTTPS，須與 registry 對齊——機械檢查見 `scripts/verify-tenant-staging-sites-index-ssot.ps1`）；與全局政策衝突時，先對照 ADR／Routing Spec／營運 SSOT，**禁止**在 tenant 內複製第二套長篇政策正文。

### 4.4 「三十年」的誠實範圍（安全、可演進）
- **在此承諾**：本檔所述 **治理原則**、**證據鏈**（閘道、health、`AO-CLOSE`）可長期作為組織紀律；**缺失即不可宣稱完成**。
- **不在此承諾**：特定套件版本、雲端 API、CI 介面 **永久不變**。技術堆疊必然演化——演化時必須有 **ADR**、**遷移步驟**、**release note**、可執行 **回滾／健康檢查**，而不是假裝某一份 MD 永不需要修。

## Related Documents (Auto-Synced)
- `docs/DOCS_INDEX.md`
- `docs/operations/cursor-enterprise-rules-index.md`
- `docs/operations/neuroinclusive-document-layout.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`
- `README.md`
- `TASKS.md`
- `WORKLOG.md`

_Last synced: 2026-10-14 00:16:07 UTC_

