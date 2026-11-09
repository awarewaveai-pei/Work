# Weekly Summary 2026-11-09

> Period: 2026-11-03 → 2026-11-09 | Generated: 2026-11-09 01:14 UTC by remote-weekly-agent

---

## Completed this week

### 影音工作台（Video Workbench）— 大批次上線（2026-11-06）
- **ED.1.4** 預覽畫質 720P／1080P：剪輯器新增「正在產生 720P 預覽檔…」提示，播放中切換解析度即時生效（`836de9121`、`2edb0c645`、`87f6021ec`）
- **ED.3.0** 舊專案黃金測試（9 個 fixture，逐 frame md5 鎖定）＋ **ED.3.4** 輸出端光漏/震動/顆粒/旋轉效果（`4a3620f79`、`5d10097a0`、`c9574d507`）
- **ED.3.1** 整片設定（比例/影格率/濾鏡/音量四組右側面板）＋ **ED.3.6** 可收合分組與數字欄位（`afc1d90ba`、`6ded608d6`）
- **ED.3.2** 片段濾鏡/光漏/震動/顆粒＋預覽、 **ED.3.3** 變形關鍵影格/分離音訊/旁白閃避、 **ED.3.5** 速度/音量/文字/取色；ED.3 七張子卡全部完成（`61ac8cd09`、`8331ce93e`、`af1517238`）
- **EC.2＋EC.3**「專業特效」EffectCraft 頁上線，與專業剪輯共用外框，真實 EffectCraft 0.21.1 端到端實測（`VW/tests/ec-real.cjs` PASS；`71aea42f2` 後合進）
- **PJ.1** 一支影片＝一集，舊剪輯專案收進專案頁，剪輯器清單改讀各集（`71aea42f2`）
- **FC.2/FC.3、EC.2/EC.3、PJ.1、ED.1–ED.3** 整批 sg-deploy 至正式機（`96ddd7f70`），Playwright smoke 34 pass；引擎靜態檔 SHA256 鎖定驗證
- **RV.4** 正式站實測：Runway Gen-4 Turbo 5 秒試跑成功，mp4 播放 5.04 s、1280×720，cost US$0.25

### 畫布專業版（PhotoCraft C8）
- **C8「傳回原工具」** 三工人完成（W5/W6/W7）：Tarot 預覽/單張、Studio 結果/參考圖、Banner 商品圖/背景，不落錯格不遺失；合進 main（`64f616b1c`）
- **C8 sg-deploy 正式站實測**（`8239d222b`）：Banner/Studio 參考圖/Tarot 預覽三條路徑傳回驗收全 PASS（`8239d222b`）
- **第三批上線**（`809a1ac9c`）：條碼修復（PhotoCraft SVG rect→群組）、AI 去除框內保留原像素、擴圖 `placeImage {at}` 對齊、AI 修圖面板（Nano Banana 2）；正式站真打驗收

### 外聯系統（Outreach）
- **客戶自有 Gemini 金鑰** 適用所有外聯 AI 步驟（研究/查證/寫信/回信分類），不再只限寫信；`outreachGeminiKey` + `outreachJson`，Codex 補審 4 項全修（`0fcdc1b34`，已部署）
- **外聯手冊＋客戶頁冷開發分頁** 改接外聯 v2 狀態（寄件信箱/名單/花費/功能開通），刪舊無用設定分頁（`08076e969`）
- **Soulful 開始用外聯**：寄件信箱 soulfulexpression01@gmail.com 草稿模式、服務檔「喜悅卡長輩藝術療癒團體課」manual review（`9f73e483`）
- 監工台稽核：Soulful 隱私頁填上（`9f73e483`），AW 正式服務檔待決

### MCP 優化
- **MCP 不再經 npx**：7 套件鎖版本裝進 `mcp-local-wrappers`，6 server 合計 29→14 程序、1452→883 MB（每 session 省 ~570 MB）；`sync-mcp-config.ps1` 加 guard 擋 npx 寫法（`同日 commit`）

### 其他維運
- **重複 Soulful 停用**：wp-member-7 設 `status='inactive'`；7 處客戶選單加 `.neq("status","inactive")` guard（`ca8d619e5`，已部署）
- **MONGOLIA-03 停用**（`mongolia-03-6fc1c8`，可改回）
- **C8.3 Soulful 隱私頁**：`co_service_profiles.privacy_url` 填真實 URL（curl 200 驗證）

---

## Open tasks

### A. ⏰ 有外部時鐘（逾期 / 近期觸發）
- **【≈2026-11-01 逾期】員工逐工具權限**：看 7 天 `[staff-tools]` 紀錄再決定要不要開始擋。需操作者到 `/ops/staff` 完成勾選
- **【≈2026-11-06 觸發】DMARC 升級第三階段**（`p=quarantine → p=reject`）：10-23 起 rua 報表零未解釋失敗才改

### B. 🔒 卡在你（需人工操作）
- 買冷信次網域＋開池信箱（C11.1）：解鎖 C11.4/C8.5/C15.4
- Soulful 網域轉 Cloudflare Registrar（付到 2028，無急迫性）
- Postiz OAuth App Review（Meta IG+FB；Reddit/LinkedIn 卡資格）
- POD A1 真實 e2e 瀏覽器驗收（操作者驅動）
- Mockup Studio 功能異常：需操作者給截圖＋F12 console/network
- Canvas 編輯器整輪瀏覽器實測（Redo、生成填色、群組/設計檔）
- Soulful 常見問答正式資料（8 條待定案）
- Chatwoot：操作者勾 Soulful 排程格 + 標籤/預設回覆/營業時間

### D–G. 可直接做（無阻塞）
- **【F 產品】PhotoCraft（画布专业版）C1.1**：計畫 `handoffs/2026-11-05-photocraft-pro/R0-PLAN.md` 已定稿，等操作者說開始
- **【F 產品】VectorCraft（向量專業版）C1.1**：計畫 `handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md` 定稿，等 go-ahead
- **【F 產品】社群管理平台 V1 C19–C31**：樣稿 v16 定案後照 `SOCIAL_MANAGER_PLAN.md §1b` 開始
- **【E 治理】`upsertIncidentAtomic`** collection 事件不走原子更新（`lib/collect/report-store.ts:166`）
- **【G 基建】影片歸屬持久化** `outName → organization_id`（2026-08-25 開出）
- **【G 基建】`/api/video/regenerate-image` 502**（2026-09-11 開出，需付費測試）
- **【F 產品】ADR 017 第一個方案列**（plans 0 筆，訂閱付款前必須）
- Soulful 課程類 AI 自動回覆：考試閘已寫好，剩部署→匯入→考試
- 危機訊息「真人接手中也回一句」0104 上線後實測
- Cognitive OS P4 決策：報告核准角色與來源搜尋規模
- Research lines 操作者定門檻（P2 DOD 已 8/8）

### H. 🧊 只記錄、不排工
- POD A2 confirm（金流紅線，測試結束+操作者明示才做）
- 會議服務網路版（待操作者下指令）
- Composable AI Commerce OS（先預留）
- `/api/hci/v1/cases` TOCTOU 窗口（非阻塞 minor）
- mutability matrix SSOT 漂移（非阻塞）

---

## System health

> 最新整合狀態報告：2026-10-30（`reports/status/integrated-status-LATEST.md`）；本週未重新執行 `/health`，以下基於 2026-11-06 部署驗收結果推斷。

- **next-admin**：最新部署 `96ddd7f70`（2026-11-06），sg-deploy healthy、Playwright smoke 34 pass；`check-deploy-drift.ps1` 無 `composeVarDrift`（2026-10-27 結案）
- **video-workbench**：最新部署 `96ddd7f70`，smoke 8 項 OK，引擎靜態檔 SHA256 全過
- **MCP servers**：6 個 server 改不走 npx，記憶體使用 ~883 MB（較前省 570 MB/session）
- **外聯**：Soulful 開始草稿模式寄件；AW 測試資料（289 名單/505 信件）2026-11-06 C16.2 量完後待清

---

## Risks & blockers

| 風險 | 嚴重度 | 備註 |
|---|---|---|
| 員工工具權限逾期未評估 | 🟠 中 | 2026-11-01 應看 7 天紀錄，仍未動；操作者需主動看 `/ops/staff` |
| DMARC 升級觸發（≈11-06）| 🟠 中 | 需操作者確認 rua 報表無未解釋失敗後才改 |
| PhotoCraft / VectorCraft 計畫停在等開始 | 🟡 低 | 操作者說「開始」即可動工，計畫已完整 |
| AW 正式服務檔待決（監工台 OPEN 兩項）| 🟡 低 | C16.2 測試資料量完後需清理 |
| Soulful 常見問答 8 條暫撤 | 🟡 低 | 客服 AI 遇問題全轉真人，不影響安全但降低自動化率 |
| Canvas 整輪瀏覽器實測待操作者 | 🟡 低 | 程式已部署，驗收債 |

---

## Memory highlights

- **2026-11-06 高密度工作日**：38 個 WORKLOG 連續條目，幾乎全為影音工作台（ED.3、EC、PJ）+ 畫布專業版（C8）的大批次完工＋部署；是本專案近幾週最高密度的一日
- **MCP 記憶體優化**：每 session 節省 ~570 MB，改善多 session 並行時筆電 80% 記憶體壓力
- **外聯系統正式啟動 Soulful 客戶**：第一個非 AwareWave 本身的客戶開始使用外聯草稿模式，里程碑
- **客戶 BYO Gemini 金鑰**：研究/查證/回信分類全覆蓋，不再只限寫信；平台免費 API 500 次/天的壓力大幅降低
- **ADR 017 客戶模型**：4b/4c 系列完成，但「第一個方案列」仍為 0 筆，訂閱付款路徑尚未開通
- **PhotoCraft / VectorCraft**：R0 計畫已定稿，等操作者一聲令下即可開工
