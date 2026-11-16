# Weekly Summary 2026-11-16

> Period: 2026-11-10 → 2026-11-16 | Generated: 2026-11-16 01:09 UTC by remote-weekly-agent

---

## Completed this week

### 我的設計直傳 R2（主線，2026-11-15）
- **C1**：`lobster-designs` 專用 S3 金鑰建立，注入 vault＋正式機 compose；容器 `printenv` 驗收 PASS（续29）
- **C2**：`lobster-designs` CORS（3 origin）＋ `uploads/pending/` 1 天 lifecycle 套用；preflight 實測 PASS（续26）
- **C5**（塔羅）：所有存檔改直傳 R2；牌卡 state 改用 `artKey`／`artJob`，刪 `toGalleryArt`（续31）
- **C6**（其餘呼叫端）：StudioWorkbench／BannerStudio／CanvasEditor／MockupStudio 改直傳；designs POST 刪 base64 輸入（续31）
- 真實 R2 實測（C1 金鑰，9 MB presign PUT 200，claimPendingUpload sha256 一致，錯 Content-Type 403，他組織 key 403）
- Cloudflare 讀正式 key 由 REST 改 S3 GET（64 MiB 在正式機 0.39 s）

### 編輯器載入體驗改善（2026-11-15）
- **卡 E**：dock 等待從固定 60/30 秒改為 `startupTimeoutMs`（預設 600 s），等待中顯示「請不要重新整理」訊息；改邊緣同一張圖只下載一次（`createOriginalImageCache`）（续27）
- **兩次 sg-deploy**：`f322a8ebf`（卡 E + 改邊緣快取）、`fe6b50ee5`（卡 C Codex 生圖號碼牌）驗收 PASS（续30）
- Cloudflare 快取修復：part-aa / .wasm / 字型第二次 HIT，14 MB 下載由 61 s 降至 23.7 s

### Video Workbench 修復（2026-11-16）
- **CI 連紅 25 次修復**（续2）：根因 — CI checkout 有 `../next-admin`，`opencc-js` 找不到；解法 — gate 步驟設 `AWAREWAVE_APP_DIR=.awarewave`，另加第二步對完整 checkout 跑 `p6-main-system.cjs`；`awarewave-files.cjs` 新增觸發清單完整性檢查（整類關掉）
- **字型下載 Range 續傳**（续3）：`vendor-fonts.cjs` 改為不限整檔時間、只在 60 s 無資料時中止，送 `Range: bytes=<已有>-` 續傳，最多 8 次；實測乾淨 checkout 13 檔 18.6 s 全部驗證通過
- **剪輯 Agent 付費卡片接回對話**（续5）：`edPaidRun` 保證唯一結束事件；Agent 把「同種類＋語言符」的結果寫成 assistant 一句並帶進 history；Ctrl+Z 一次還原；3 段新測試 12 PASS
- **內建曲庫試聽**（续4）：106 首全部保留，拿掉 a006/a007/a008「待人工試聽」標記
- **改邊緣積木邊太厚**（续1）：程式筆刷 `insetFrom` 15% → 3.4%；PNG 筆刷改用 `maskBounds` 鋪滿實際筆觸範圍；實測各邊保留 83–87%
- **預覽背板改灰色**（续6）：棋盤格改 `var(--backdrop-transparent)`（#8c8c8c）；主題系統 token 登記；下載仍透明 PNG

---

## Open tasks

### A. ⏰ 有外部時鐘（⚠️ 以下兩項已逾期）
- [ ] **【≈2026-11-01 逾期】** 員工逐工具權限：操作者需先到 `/ops/staff` 勾工具；再看 `docker logs` 決定是否開 enforce
- [ ] **【≈2026-11-06 逾期】** aware-wave.com DMARC 升級第三階段（p=quarantine → p=reject）：需查 10-23 起 rua 報表無未解釋失敗後才改

### B. 🔒 卡在你
- [ ] **【Codex 生圖｜新 2026-11-15】** Chrome 點「啟動筆電」無回應，需操作者截圖確認框
- [ ] **【外聯 v2】** 買冷信次網域＋開池信箱（C11.1）→ 解鎖 C11.4、C8.5、C15.4
- [ ] Soulful 搬站後收尾：網域轉 Cloudflare Registrar
- [ ] 社群管理平台 V1：樣稿 v16 定案後開 C19–C31
- [ ] POD A1 e2e：操作者驅動瀏覽器 → Printful 建品驗收

### C. 🔒 卡在外部
- [ ] Scenery Travel Mongolia：等客戶刷卡
- [ ] 研究線：操作者定 P2 門檻（DOD-2 已過）
- [ ] Cognitive OS P4：操作者決定報告核准角色與來源搜尋規模
- [ ] Postiz OAuth app 審核（Meta App Review、商家驗證）

### D–G. ▶️ 無阻塞（依優先序）

**D 安全**
- [ ] collection 事件不走 `upsertIncidentAtomic`（`lib/collect/report-store.ts:166`）
- [ ] `queryAsTenant()` 缺明確 transaction 包裹
- [ ] `POST /api/hci/v1/cases` active-authorization TOCTOU 窗口

**E 治理**
- [ ] Codex 佇列驗收 check 在沙箱外跑
- [ ] 欠的 review：commit `f2eb6cefa`

**F 產品**
- [ ] **PhotoCraft 專業版**（計畫定稿待開工）：C1.1 開始，計畫 `handoffs/2026-11-05-photocraft-pro/R0-PLAN.md` §6
- [ ] **VectorCraft 專業版**（未開始）：計畫 `handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md` §6
- [ ] ADR 017 第一個方案列（plans 0 筆）
- [ ] ADR 017 4b 對帳報表（`/ops/billing`）
- [ ] 生圖額度三軸五對象共用層（刪 `checkAndConsumeQuota`）
- [ ] Soulful 課程類 AI 自動回覆（考試閘已寫，剩部署+匯入 JSON）
- [ ] Canvas 編輯器整輪瀏覽器實測（Redo、生成填色、群組、.design.json）
- [ ] POD A2 confirm phase（🔴 金流紅線，待操作者批准）
- [ ] density 單獨否決權設計決策
- [ ] /api/video/regenerate-image 502（需操作者登入後點一次）
- [ ] Mockup Studio 診斷（需操作者提供 F12 console + network）

**G 基建**
- [ ] `provenance`/`author` 到 KB sink 斷鏈
- [ ] 影片歸屬持久化 `outName → organization_id` mapping
- [ ] env 設定的 WP 站與 bridge 站綁 org
- [ ] HCI30 快照未存 HTTP header charset
- [ ] KB migration 0076 critic 五個延後項
- [ ] `.runtime` run lock 只增不刪
- [ ] WP 站手動新增拿不到租戶歸屬

### H. 🧊 只記錄
- [ ] 會議服務網路版（無 GPU，待下指令）
- [ ] Composable AI Commerce OS（先預留）
- [ ] POD A2 confirm step（金流紅線，測試結束後再議）

---

## System health

> 注意：integrated-status-LATEST.md 為 2026-10-30 生成（2.5 週前），未反映本週狀態。

**基於 WORKLOG 2026-11-15 sg-deploy 實測**：
- next-admin 正式站：`f322a8ebf`（2026-11-15 15:16Z 部署），healthy
- Playwright smoke：11-15 deploy 後 26 pass / 6 skip / 0 fail（WORKLOG 续30）
- Video-workbench CI：**剛修復（续2）**，2026-11-16 推送後首次應為綠
- Cloudflare 快取：part-aa / .wasm / 字型已確認 HIT（2026-11-15）

**待確認**：
- smoke-LATEST.json 未在此次讀取範圍內
- 員工工具 `STAFF_TOOLS_MODE` 仍為 shadow（非 enforce），7 天窗口已過（11-01）

---

## Risks & blockers

| 等級 | 項目 | 說明 |
|------|------|------|
| 🔴 高 | 員工逐工具權限逾期 | 2026-11-01 窗口已過；需操作者確認 `docker logs` 後決定是否 enforce |
| 🔴 高 | DMARC 升級逾期 | 2026-11-06 觸發日已過；需查 rua 報表零失敗後才可升 p=reject |
| 🟠 中 | Codex Chrome protocol handler 卡 | 操作者需提供確認框截圖；影響 Codex 免費生圖啟動流程 |
| 🟠 中 | PhotoCraft/VectorCraft 待開工 | 計畫已定稿，待操作者說開始 |
| 🟡 低 | integrated-status-LATEST.md 過期 | 需在筆電環境重新跑 `generate-integrated-status-report.ps1` |
| 🟡 低 | 我的設計直傳 C5 塔羅完整瀏覽器實測 | 大圖存無框圖、斷網提示等需部署後頁面操作驗收 |

---

## Memory highlights

- **商業架構（2026-10-30 AO-CLOSE）**：ADR 017 客戶模型落地，`b22ce2277` 每個收銀台用自己鑰匙驗付款；月結依 `paid_at` 付款月份計；content.aware-wave.com 門上線；待決：4b-6 買 WCS/TapPay、第一個方案列（plans 0 筆）。
- **影片工具**：影片工作台已是正式產品（ED.1–ED.3、EC.2–EC.3、PJ.1 本月上線）；字幕雙引擎、Runway Gen-4 Turbo 實測通過。
- **設計工具**：PhotoCraft（photo-pro）＋ VectorCraft（vector-pro）兩個 WASM 編輯器已換版上線（11-15 05:23Z/05:33Z），直傳 R2 本週完成 C1-C6。
- **Soulful 客服**：AI 客服 U0–U5 live，考試閘已寫，0104 危機訊息已部署；正式問答 8 條待操作者確認後才可發佈。
- **主機現況**：唯一主機 `ks-aw-01`（145.239.195.47，SSH -p 58122），next-admin 每日 03:00 TPE 自動部署 main。
