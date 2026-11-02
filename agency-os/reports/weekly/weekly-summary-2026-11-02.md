# Weekly Summary 2026-11-02

> Period: 2026-10-27 → 2026-11-02 | Generated: 2026-11-02 01:10 UTC by remote-weekly-agent

---

## Completed this week

### ADR 017 賣家 / 客戶模型（2026-10-27～10-30）
- **4c-2** 付款驗簽由網站自己的鑰匙決定（`b22ce2277`），提前部署 `77fd74a72`；0140/0141 套 prod
- **4c-3** 外掛 aware-wave-store 1.1.0→1.2.0 發版，升級 aware-wave.com（另一 session）
- **月結依買家付款月份**：migration 0142（`billing_try_timestamptz`＋7 天窗），`/ops/billing` 顯示上/下月並標「8 日起定案」（`24c1d9973`）
- **4b-10** 員工客戶頁給/收產品與代理權，migration 0143（`66b612ead`）；真 DB 測試 harness `--suite staff-grants` 6/6
- **content.aware-wave.com 產品門上線**（`e62dc2fcd`、`3f9bb4273`）

### 影片 / 字幕 / 自動內容（2026-10-28～10-30，其他 session）
- 影片工具重構 V1–V7；Whisper 自架上線；字幕雙引擎（影片聲音來源決定字幕引擎）
- 自動內容 P9.1–P9.6 完成；AI 審核退回重做流程
- aware-wave.com wp-login 加 Cloudflare challenge，管理員帳號不再外洩

### Social C27/C28 compose 漂移結案（2026-10-27）
- 正式機補 8 個 META_* 宣告（safe-infra-patch.sh），三個功能開關維持 false；`check-deploy-drift.ps1` PASS / composeVarDrift 清空；Playwright smoke 26 pass

### Soulful 常見問答暫時撤回（2026-10-27）
- 價格／時間／地點／報名 8 條改為「尚未定案、轉真人」，等操作者確認正式資料

### 外聯系統 v2 C17 社群研究（2026-11-01）
- **C17.1–C17.5**：Meta Business Discovery API + Apify（instagram-profile-scraper / facebook-pages-scraper），研究功能讀 IG/FB 社群頁；自介算宣告（自動核准），貼文一律待審；`providers.ts` 排除 Linktree/LINE/表單/短網址
- **C17.6**：Apify 兩個 actor 真跑驗證；FB 粉專自動填 email（commit `77d0291d6`）
- **C17.7**：社群頁官網回填到名單，並同次爬官網提取 email（commit `e824205b0`）；C17 全部 7 項完成
- **關鍵發現**：台中 8 家瑜珈 IG 連的全是 Linktree/LINE/Google 表單，無一連自家官網

### 外聯系統 v2 C11 寄件池（2026-11-01～11-02）
- **C11.2–C11.4**：migration 0152 `co_sender_accounts`＋`co_send_claims`＋三個 PL/pgSQL 函式（`3eea12c73`，commit）；OAuth 連為寄件池信箱；每日信箱健康排程 `sender-health.ts`
- **0152 套正式庫**（2026-11-02 續2）：APPLY_OK；回填、CHECK、免費信箱鍵驗證通過
- **正式機 OUTREACH_SYNC_TOKEN + 排程**（2026-11-02 續3）：safe-infra-patch compose 套用 15s healthy；install-host-schedules.sh 裝 7 個排程含 `outreach_sender_health`（00:30 UTC）

### 模特兒印製 AI 引擎換新（2026-11-01）
- 研究 5 種做法（nano-banana-2 / 程式置換 / FASHN / FLUX VTO / gpt-image-2.5-sunburst），選定 **gpt-image-2.5-sunburst**（印花隨皺褶、人/姿勢/背景不動）約 NT$2/張（`openai-25-edit`）
- 印花框改四角透視（homography）；路由加模型白名單，成功呼叫帶 `model` 回 `ai_call_logs`

### sg-deploy（2026-11-01）
- **ff3b374c1** 上線（模特兒印製 AI + outreach C1–C17.7 共 14 個 app commit）
- 中途被 npm test 擋：`deleteDesignObject` 違反 `deleteUnreferencedAsset` 不變量、`nearestAspect` route 多餘匯出；修正後重部署，smoke 26 pass / 0 fail

### Mockup Studio 全面升級（2026-11-01～11-02）
- **模特流程拆兩頁**（續1）：ModelLibraryStudio（生模特兒圖含背景）+ ModelMockupPanel（選模特兒圖＋設計圖合成商品 mockup）
- **模型選單改善**（續6）：合成需 maxRefs≥2，FLUX/Ideogram 不列；平拍只列 maxRefs>0；ImageLightbox 點圖全螢幕放大
- **sg-deploy 591cc1699**（續4）：部署空窗 502 HTML 改為友善中文說明，不再顯示 JSON parse 錯誤

### wp-bridge 0.20.0（2026-11-02）
- **新端點 POST /asset-references**（續9）：刪圖前改走 bridge，不再需要應用程式密碼；搜 post_content/post_excerpt/all post meta（候選>500 → 拒刪）
- Soulful 清掉 6 組舊應用程式密碼（留 Admin 的 wpmcp、WPVibe 兩組）
- **裝上 Soulful + aware-wave.com**（續10）：兩站皆 0.19.0→0.20.0，health 200；升級腳本 billing 判斷修正（`aware_wave_payments_enabled='1'` 才擋，與 Settings.php:96 同判準）
- aware-wave.com wp-bridge 重新啟用（10-30 曾停用，0.19.0 後不含收費，重啟安全）

### 影音工作台品牌重整（2026-11-02）
- 原始碼搬進 repo：`apps/seedstar`（121 檔）→ 操作者改名 `apps/video-workbench`
- 畫面字樣全換：SeedStar→AWAREWAVE，模型初始值 sora-2，下載檔名 `awarewave-video-*`
- `.gitignore`：第三方擷取素材（194 張 seedstar.ai 圖）不進 git；MediaPipe bundle 以 SHA-256 驗證

---

## Open tasks

### A ⏰ 有外部時鐘
- [ ] **員工逐工具權限：看 7 天「本來會擋」紀錄，決定是否開始擋**（≈2026-11-01，**已逾期**）— 操作者需先到 `/ops/staff` 勾工具，AI 再跑 docker logs 說明
- [ ] **aware-wave.com DMARC 升級第三階段（p=quarantine → p=reject）**（≈2026-11-06）— 需查 10-23 後的 rua 報表（dmarc@aware-wave.com）

### B 🔒 卡在操作者
- [ ] Soulful 網域轉 Cloudflare Registrar（無死線，2028 到期）
- [ ] 社群管理平台 V1：樣稿 v16 定案後，C19–C31（G5 升級 Postiz）
- [ ] 會議服務網路版安裝（三題決策待答：錄音授權/GPU 方案/客戶數）
- [ ] Soulful 課程 AI 自動回覆：剩部署→匯入 json→客服分頁「開始考試」→操作者批准
- [ ] **危機訊息 0104 上線後實測**（需操作者登入，驗 John Doe 情境）
- [ ] Soulful 常見問答正式資料：操作者確認後更新 8 條
- [ ] Chatwoot 排程：操作者到 `/ops/schedules` 勾 Soulful 這一格

### C 🔒 卡在外部
- [ ] Cognitive OS P4：報告核准角色與來源搜尋規模（待操作者決定）
- [ ] 研究線三條（Cognitive OS Project 工作流）：操作者定門檻
- [ ] Postiz OAuth app 審核：Meta App Review / Reddit / LinkedIn
- [ ] 外聯 C11.4：對真實次網域真跑，等 C11.1 買好次網域
- [ ] Meta App Review HUMAN_AGENT（客人 >24h 後無法回覆）
- [ ] IG comments auto-reply / IG DM live test（需 Meta Advanced Access）

### D–G ▶️ 可直接做
- [ ] 外聯系統 v2 後續卡片（C11 後、C18、C19 等）
- [ ] POD A1 e2e（操作者驅動瀏覽器驗收）
- [ ] ADR 017 第一個方案（plans 0 筆）；4b-6（WCS + 綠界）
- [ ] Canvas 編輯器整輪瀏覽器實測（Redo / 生成填色 / 群組 / .design.json 存載）
- [ ] Mockup Studio 診斷：操作者提供「什麼操作、F12 Network 截圖」
- [ ] collection 事件改走 `upsertIncidentAtomic`（`lib/collect/report-store.ts:166`）
- [ ] 生圖額度改三軸五對象（刪 `lib/tarot/quota.ts`，共用 `lib/ai/gateway.ts` 煞車）
- [ ] `/api/video/regenerate-image` 502（REPLICATE env 已排除，卡操作者登入點一次「重新生成」）
- [ ] provenance/author 到 sink 就斷（KB 側 K2e 三軸 locked 才做）
- [ ] `queryAsTenant()` SET ROLE 缺 transaction 包裹（低風險，觸碰 RLS，需獨立確認）

### H 🧊 只記錄
- [ ] POD A2 confirm phase（金流紅線，測試結束 + 明示批准才做）
- [ ] Composable AI Commerce OS（先預留，未授權動工）

---

## System health

> 最後 integrated-status 生成：2026-10-30 02:00 UTC（本週已逾 3 天，建議重新生成）

| 指標 | 狀態 |
|------|------|
| **最新 sg-deploy** | `591cc1699`（2026-11-02 16:37），npm test 3815 passed，smoke 5/5 ✅ |
| **migration** | 套到 0152 sender_pool（2026-11-02 APPLY_OK）✅ |
| **wp-bridge** | 0.20.0 裝上 Soulful + aware-wave.com ✅ |
| **Playwright smoke** | 26 pass / 0 fail / 6 skip（2026-11-01 部署後）✅ |
| **DMARC** | p=quarantine（第三階段 11-06 觸發）⚠ |
| **Codex 額度** | 剩 ≤1%（多次 ORACLE_WAIVED）⚠ |
| **integrated-status** | 需重新生成（3 天前）⚠ |

---

## Risks & blockers

1. **員工工具擋截逾期**（高）：11-01 到期，操作者尚未到 `/ops/staff` 勾工具；shadow log 在主機 docker logs；擋截模式在 `enforce` 前不影響用戶。
2. **DMARC 11-06 升段**（中）：需查 10-23 後的 rua 報表，零未解釋失敗才升；提醒已建日曆。
3. **Codex 額度幾乎耗盡**（中）：本週多張卡 ORACLE_WAIVED；若下週繼續，oracle 品質降為書面自審。
4. **外聯 C11.4 次網域**（中）：等 C11.1 買好網域；寄件池排程 11-02 首跑，`checked=0` 正常（目前 0 個信箱）。
5. **Meta Advanced Access 待審**（中）：C27/C28 IG comments auto-reply / IG DM live test 功能已寫好但 OFF，等 Meta 審核通過才能開啟。
6. **POD A1 e2e 未驗**（低）：操作者尚未瀏覽器點測一鍵上 Printful 流程。
7. **Canvas / Mockup 畫面待實測**（低）：多個功能無登入 session，Claude 無法代測。

---

## Memory highlights

- **外聯研究核心發現**：真實台中瑜珈店 IG 全用 Linktree/LINE/表單，沒有自家官網；`PLATFORM_HOSTS` 新增 forms.gle/linktr.ee/lin.ee/page.line.me；已用 Soulful 粉專真查驗收。
- **gpt-image-2.5-sunburst 選定**：5 種做法真打對比後，此模型是唯一做到「印花隨皺褶、人/背景不動、設計不變」的方案，約 NT$2/張（OpenAI edits API）。
- **Soulful Wordfence 停用應用程式密碼**：造成刪圖失敗；wp-bridge 0.20.0 /asset-references 端點從根本解決此問題，不再依賴 WP REST auth。
- **aware-wave.com wp-bridge 重新啟用**：10-30 停用原因記錄：操作者要 AW 與 app 完全切開；0.19.0 後 bridge 不含收費，重啟安全。
- **影音工作台品牌切割**：SeedStar 是第三方品牌（seedstar.ai）；畫面全換成 AwareWave；第三方圖片/wasm 不進 git，MediaPipe 以 SHA-256 驗證。
- **操作者指示**（本週新）：Codex 額度不夠就「自我審查」；Mockup 模特合成只列 maxRefs≥2 的模型（平拍邏輯相反）。
