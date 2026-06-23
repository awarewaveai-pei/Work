# Global Task Board



<details>
<summary><strong>待辦原則（給營運者）— 細節較長，可稍後再讀</strong></summary>

> **待辦原則（給營運者）**  
> - **單一清單**：所有「之後還要做」的事，應以 **`### 未完成`**（或 **`Backlog — 未完成`**）的一條 `- [ ]` 表示；不要只放在聊天或腦裡。**勿**在「未完成」區混放 `- [x]`（已完成請移到 **`Next — 已完成歷程`**）。  
> - **當天做不完／臨時改做別的**：在當日 **`WORKLOG.md`** 寫一句（做了什麼、停在哪、為何轉向）；若承諾仍有效，**留在下面未完成清單**；若作廢，把該條刪除或改成「已取消／改路由至…」。  
> - **`Next — 已完成歷程`**：僅供查說：曾經排過、已完成者；**新工作請不要加在這裡**。  
> - **收工與打勾（預設全自動）**：**不必手動**改 `TASKS`。**只打 `AO-CLOSE`（或收工同義詞）即觸發代理**依當輪對話與 **`TASKS` 開放項**在當日 **`WORKLOG.md`**（`## yyyy-MM-dd`）寫 **`- AUTO_TASK_DONE: <唯一子字串>`**（須只命中一條仍為 `- [ ]` 的待辦；已 `[x]` 時略過並收斂標記），**不必再口頭重複指令**。收工腳本會跑 **`scripts/apply-closeout-task-checkmarks.ps1`** 打勾並改為 **`AUTO_TASK_DONE_APPLIED (UTC): …`**。選填： **`pending-task-completions.txt`**（見 **`pending-task-completions.example.txt`**）。`AO-CLOSE` 開頭會印 **`print-today-closeout-recap.ps1`** 摘要。

</details>

## 現況快照（怎麼看懂：做過／沒做／做到哪）

| 你想查… | 請看 |
|--------|------|
| **還有什麼沒做完** | **`### 未完成`**（僅 `- [ ]`，一條一個開放責任）。 |
| **某件事結案了沒** | 編輯器 **搜尋標題關鍵字**。出現在 **`## Next — 已完成歷程`** 且為 `- [x]` → **已結案**；只出現在 **`### 未完成`** → **仍開放**。 |
| **進行到一半嗎** | 看該條是否含 **`—— 進度：`**；子項裡的日期／DoD 是細節證據。 |

**狀態 prefix（選用，方便掃描）**：**【未開始】**＝尚未動或尚未達第一個可驗證里程碑；**【進行中】**＝已有部分交付／PR／部署，但未達該條 DoD；**【卡住】**＝依賴外部決策或環境，見子項說明。

**機讀待辦快照**：開工時 **`scripts/ao-resume.ps1`** 會寫 **`agency-os/.agency-state/open-tasks-snapshot.md`**（gitignore），與本檔 **`### 未完成`** 應對齊。

**聊天 ≠ 入庫**：其他 AI（含 Claude）對話裡答應的待辦**不會**自動進 `TASKS`、也不會自動進任何 checklist 檔；若你看不到條目，代表**尚未寫入本 repo 並 commit**（或寫在別台機器未 push）。要生效：**請同一輪請代理／自己改 `TASKS.md`（或對應 Owner 檔）+ checkpoint／push**。

| **長期可稽核紀律（含「MD 為何可信」）** | **`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`** **§4**（真相順序、禁雙寫、演進範圍） |

## 歷史封存 — In Progress（早期項目，均已結案）

> 以下 **`- [x]`** 為存檔；**不要**用這段判斷「現在還要做什麼」——請看 **`### 未完成`**。

- [x] 建立多租戶案場資料夾結構（company -> site -> project）
- [x] 設計標準報價包（建置/維運/行銷/客製）
- [x] 定義變更單（CR）流程與核價規則
- [x] 套入第一個真實客戶到 `tenants/company-a/`
- [x] 完成 `2026-001` Discovery 需求盤點（初版）
- [x] 補齊 `2026-001` 時程與里程碑日期（初版）
- [x] 建立 `lobster-factory` Phase 1 底座骨架（Supabase migrations + wc-core manifest + workflow 安全骨架）

## Next — 未完成（目前正式隊列）

> **版面規約（減少漏勾／誤判）**  
> - **本節只保留 `- [ ]`。**已結案請移到 **`## Next — 已完成歷程（查詢用）`**，不要留在這裡。  
> - **代理**：完成某一條 DoD 時，當日 **`WORKLOG`** 必須有 **`- AUTO_TASK_DONE: <子字串>`**（命中該條待辦）；`AO-CLOSE` 會跑 **`apply-closeout-task-checkmarks`**。  
> - **縮排**：子項一律 **兩個空白**，勿使用單獨一字的 ` - [ ]`（易與清單錯位）。

### 未完成

#### 🆕 Cold Outreach Workbench（AI 冷拜訪 + FluentCRM 暖名單工作台）

- [ ] **【未開始｜Phase 1 MVP】Cold Outreach Workbench — 冷開發完整鏈** — SSOT：[`agency-os/docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](docs/cold_email/COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)（三份草稿已整合並 superseded）；實作排程：[`COLD_OUTREACH_PHASE1_BUILD_PLAN.md`](docs/cold_email/COLD_OUTREACH_PHASE1_BUILD_PLAN.md)（T1–T12 依賴排序）。**已拍板決策**：代操冷信用客戶 Gmail / 名單你幫找 / 訂閱制 / 不用 SES / schema prefix `co_`。**架構對齊**：org-tenant + **service-role RLS + ops-role RBAC**（已驗證現況 §B0.1，runtime 非 Clerk；賣的 per-login 隔離留 Phase 5）；暖層走既有 wp-bridge（+小擴充 FluentCRM contact/tag endpoint，非新建 connector）；暖信走客戶 FluentSMTP 或 Brevo free；self-host Supabase/Trigger.dev/n8n = $0；**Free-Plan Router + 客戶 BYO-key 乘數**為第一級設計（PART H）。**關鍵路徑**：T1 schema → T2 module 殼 → T4 Connector/Router/BYO-key → T5 Inbox → T6 AI scoring → T8 Message gen(Cold Gate) → T9 Review → T10 Gmail draft(⚠High，等 go-ahead)。**DoD**：操作者跑完「Service Profile→Inbox(dedup+suppression)→AI 評分→生冷信→審核→客戶 Gmail 草稿→follow-up」，全程 org-scoped、人工寄、不碰金流。**⚠️ 待補**：免費額度數字（PART H）需上線前以官方頁確認；驗證 workflow 撞 session limit 未跑完，可重置後補跑。 —— **進度（2026-06-23）**：✅ **T1 完成** — migration `0048_co_outreach_core`（12 表 + service-role RLS）已 **apply 到 EU prod Supabase 並驗證**（12 表 RLS 全開 + 12 policy + co_leads FK 正確 + 0 個 enabled-no-policy；`PSQL_EXIT=0`）；db-expert 審 pass（W1 BEGIN/COMMIT + W2 NOTIFY pgrst + N2 已套）。**✅ T2 完成**（`app/outreach/` 9 頁 + nav + canManageOutreach + 資料層；tsc 0）。**✅ T3 完成**（Service Profile CRUD route + 表單；tsc 0 + DB round-trip）。**✅ T4 完成**（Free-Plan Router + Quota Guard 純邏輯 + 15 vitest 全過 + connector metadata CRUD 含密鑰值防呆 + UI；tsc 0 + DB round-trip）。**🔒 gated 待決策**：BYO API key「密鑰位元組」runtime 儲存（建議 Supabase Vault）= High-risk，未做，需明示。**下一步：T5 Lead Inbox（import/dedup/suppression）→ T6 AI scoring**。critic 因 API 529 待補（`/review`）。

#### 待釐清 / 明日提醒
> `/tomo` 自動寫入此分類

- [ ] **【明日 2026-06-17｜資安複盤】Defender 嚴重木馬 `Trojan:Win32/PowhidSubExec.B` 來源查清與善後** — **來龍去脈**：2026-06-16 02:33:49 Windows Defender 跳出嚴重威脅，名稱 `Trojan:Win32/PowhidSubExec.B`；02:34:42 Defender 已執行「移除」，`ActionSuccess=True`，`CurrentThreatExecutionStatusID=0`。後續 Codex 已更新 Defender 病毒碼到 `1.453.108.0`，Quick Scan 於 02:59:26 開始、03:13:41 結束；`Get-MpThreat` 顯示 `Trojan:Win32/PowhidSubExec.B` 與 `Trojan:Win32/PShellDlr.HD!MTB` 皆 `IsActive=False`、`DidThreatExecute=False`，目前沒有 active threat。**來源證據**：Defender 的 `Resources/Path` 不是下載檔或 exe，而是一條命令列：`C:\Program Files\Git\bin\bash.exe` 載入 `C:\Users\user1115\.claude\shell-snapshots\snapshot-bash-1781544836335-9sl8s6.sh`，建立 `D:\tmp\realtest-reg.ps1`，再跑 `powershell -NoProfile -ExecutionPolicy Bypass -File "D:/tmp/realtest-reg.ps1"`。`.claude\bash-commands.log` 第 9296/9299 行與 `.claude\projects\D--Work\b0dfd505-590d-4b54-9b3a-52c275a46f87.jsonl` 對上同一事件：entrypoint=`claude-desktop`，session=`b0dfd505-590d-4b54-9b3a-52c275a46f87`，tool=`Bash`，permission_mode=`bypassPermissions`，description=`Syntax-check + run new registrar + verify both tasks hidden + run Daily`。**暫存腳本內容**：`D:\tmp\realtest-reg.ps1` 先 parse `D:\Work\agency-os\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1`，再用 `ExecutionPolicy Bypass` 執行 registrar，查 `AgencyOS-SystemGuard-*` scheduled tasks，最後 `Start-ScheduledTask -TaskName "AgencyOS-SystemGuard-Daily"`。**目前判斷**：這比較像 Claude Desktop 自動化測試命令觸發 Defender 行為偵測，不像外部下載木馬；觸發特徵是「Git Bash + temp ps1 + PowerShell ExecutionPolicy Bypass + scheduled task + hidden launcher + Start-ScheduledTask」。但因為它確實碰到排程任務且 Claude session 是 `bypassPermissions`，明天仍需當正式資安事件善後。**明天處理步驟**：① 刪除暫存檔 `D:\tmp\realtest-reg.ps1`（刪前可保留 hash：`1D57CD353937BEEBEDFE37E40AAB987F14A8C1294FD9901D144F3E7E2D8C873D`，內容已在本 task 摘要）② 審 `D:\Work\agency-os\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1` 與 `scripts\scheduled-task-launcher.ps1`，確認只註冊預期的 Daily guard、沒有 downloader/encoded payload/外連 ③ 查 live scheduled task：`AgencyOS-SystemGuard-Daily` 的 action 應只指向 repo 內 launcher + system-guard，且符合 `WindowStyle Hidden` / `scheduled-task-launcher` 預期；若有 `OnStartup`/`OnLogoff` 殘留或奇怪 action，移除或重註冊 ④ 決定是否調整 Claude hook/policy：`high-risk-bash-warn` 對 `ExecutionPolicy Bypass` + `Register-ScheduledTask` + `Start-ScheduledTask` 應升級為 block/explicit approval，不要只 warn ⑤ 若 Windows Security UI 仍顯示「開始動作」，按一次；若重開機後仍顯示，跑 Defender Offline Scan。**DoD**：暫存檔清掉；scheduled task action 驗證乾淨；Defender `Get-MpThreat` 仍 `IsActive=False`；WORKLOG 記錄本事件結論；必要時補 hook 阻擋規則，避免 AI 工具再次用 bypass 權限直接跑排程任務測試。
  - **明日快速入口**：先處理本機殘留與驗證，不要直接重跑 `D:\tmp\realtest-reg.ps1`；依序確認暫存檔、`AgencyOS-SystemGuard-Daily` action、Defender active state、Claude `high-risk-bash-warn` 是否要升級為 block/approval。
- [x] **【明日】RankMath SEO 合規工具 + 文章生成符合 Google SEO/GEO** — 目標：① 寫一個 RankMath SEO 條件檢查器（分析文章是否達到 RankMath 綠燈標準）② 把檢查器整合進文章生成 pipeline，讓產出文章直接通過 RankMath。現有 SEO/GEO 引擎 spec：`docs/wp-kadence-ai-seo-geo-content-engine.md`（3920 行）；Google SEO 基礎參考：`agency-os/docs/seo/01_SEO基礎知識.md`；現有 content engine handoff：`agency-os/handoffs/2026-06-06-2044-seo-geo-content.md`；wp-bridge plugin API 入口：`lobster-factory/packages/wp-bridge-plugin/src/RestController.php`。**下一步**：① 研究 RankMath REST API/scoring 規則（WebSearch "RankMath REST API content analysis criteria site:rankmath.com OR site:developers.rankmath.com"）② 整理 RankMath 綠燈必要條件清單（Focus Keyword 密度/位置/meta/slug/alt/word count/readability/internal links/schema）③ 對照 `01_SEO基礎知識.md` + `docs/wp-kadence-ai-seo-geo-content-engine.md §36–§37 prompts`，看 RankMath 條件是否已含在 prompt 中，補缺漏 ④ 在 wp-bridge 或 n8n workflow 加 `rank_math_seo` 欄位設定（`POST /wp/v2/posts` meta: `rank_math_focus_keyword` / `rank_math_seo_score`）⑤ 在文章生成 prompt 加 RankMath checklist 段落，要求每篇輸出時自帶 focus keyword + meta description + heading structure。**注意**：YMYL 護欄不可移除（禁療效保證；art therapy 詞避用；每篇保留 1925/1995 危機專線 disclaimer）。
- [ ] **【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動** — 計畫 SSOT = `lobster-factory/docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`（5 階段）。目標：操作者**只做設計圖**、一鍵自動 合成商品圖(白背/2模特/平拍,分長短袖,<100KB) + 建 3 款 Woo 草稿(Gildan 2400 **長袖** id57 / Stanley-Stella STTU169 id456 / Gildan 5000 id438，各 4 色 × S-2XL) + Printful native 建品綁設計稿。**對接用 hex(color_code) 不用顏色名**（同名 Sport Grey 跨款 hex 不同）。**紅線**：止於 WP draft，開賣/扣款人工（守 A2 金流紅線）。**現況**：研究完成（三款 Printful ID + 12 色 hex 已實機查證）、今日選圖器已修（WORKLOG 2026-06-20）。
  - **Phase 0** ✅ 上線（c3beb87c）：`pod-catalog-config.ts`（3 款 × 4 色 hex SSOT）— REALTEST Printful v2 API 12/12 colours resolve
  - **Phase 1** ✅ 上線（c3beb87c）：Printful **hex bind**（`getCatalogVariants` v2 雙比對 + `pfcreate` 多款 + `pod-product` 多色 + PublishWizard 選款下拉）— REALTEST hex bind 3 models × 4 hex × 5 sizes = 20/20
  - **Phase 2** ✅ 驗證 + 部署（a383ed73）：`batch-mockup.ts`（4 specs：白背+2模特+裝飾平拍，分長短袖）— vitest 5/5
  - **Phase 3** ✅ 驗證 + 部署（a383ed73）：`runAll` 批次合成串接（`genMockup` generate→存 designs + gallery white-bg=主圖 + all-fail fallback 設計圖原稿 + progress n/4）— critic Low 0c/0M、npm test 426 passed
  - **Phase 4**（剩）：真機端到端 — browser 跑 runAll 真生成驗 pipeline + **AI 圖品質操作者 review**（模特手/臉，plan §7 需人判斷）+ P4 試單（Printful 履約解析正確 variant + 設計稿）
- [x] **【✅ 2026-06-22 Task 3-6 + Gate C 全線完成｜社群發佈整合】Content Studio 接 Postiz 真實發佈** — 計畫 SSOT = `docs/operations/POSTIZ_SOCIAL_PUBLISHING_PLAN.md`。Task 3（postiz lib + `/api/content/social-publish`）✅ Task 4（social-admin CRUD + ClientHubTabs 社群頻道 tab）✅ Task 5（ContentStudio 面板：channel selector + Draft/Now toggle + 二次確認 modal）✅ Gate C（multipart upload + Bluesky draft+image 端到端實測，HTTP 201 兩步全過）✅ Task 6（ops runbook）✅ sg-deploy 已上線（commit `78451ebc`，tsc+431 tests+smoke 全過）。**剩（人工/並行）**：① Task 2 各平台 OAuth app 審核（見下方獨立項）② Postiz UI 刪測試 draft ③ 至 client hub → 社群頻道 tab 連結 Bluesky 帳號。
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交** — Meta IG+FB（一個 Meta app，App Review，最高價值）/ Reddit / LinkedIn。callback = `https://postiz.aware-wave.com/integrations/social/<slug>`；client_id/secret 加進 EU `/root/postiz/.env`（`<PLATFORM>_CLIENT_ID/SECRET`）+ restart。**X 跳過**（API $100/月）。非 Claude 可做，等各平台審核通過再接線。
- [ ] **【人工｜Postiz 測試草稿清理】** 登入 `https://postiz.aware-wave.com` → Posts → Drafts → 刪 draft ID `cmqo1wijz0005p58ncl1mtssr`（Gate C 測試用，content 含「Delete this draft」）。
- [ ] **【操作者｜Postiz 帳號 → 客戶 Hub 連結】** `app.aware-wave.com/ops/clients/[slug]` → 社群頻道 tab → 點「連結」→ 選 Bluesky integration（soulfulexpression.bsky.social）→ 儲存。完成後 ContentStudio 才能看到 channel selector 顯示帳號。
- [x] **【完成 2026-06-16｜Content Studio 電子報→FluentCRM 草稿】** 全 4 子項閉環（**紅線：只草稿、永不寄** 全程守住）。① **收件人**=程式天然不設任何收件人（NewsletterCreator 只傳 content 欄位，靠 FluentCRM `creating` hook 設 `status=draft`；收件人/寄送一律操作者送前人工確認）→ 無需強制清空。② **REALTEST ✅**（soulful 真機 prod，本 session）：經 SG `lobster-next-admin` 容器真 key 簽章打 bridge `/newsletter` → HTTP 201 `committed campaign_id=4 status=draft` → soulful WP-CLI 獨立交叉驗 `id=4 status=draft subject=[REALTEST]…` → 帶 subject guard 乾淨刪除 → `total_campaigns` 回 baseline 1；全程未寄、無痕。③ **發版 ✅ 早已完成**（VBC：WORKLOG line 366/10387 記「未發版/0.10.0」已過時）— 正本 `awarewaveai-pei/aware-wave-wp-bridge` **v0.11.0 已發布**（2026-06-16 03:51，含 NewsletterCreator + `/newsletter` 路由，與 Work 全樹 byte-identical DIFF=0），soulful 真機 health 回 `version 0.11.0 crypto_ready=true`。④ **next-admin route + button ✅ 早已建好**：`app/api/content/newsletter/route.ts`（markdown→email HTML + teaser 模式 + role gate）+ `ContentStudio.tsx`「📧 建立 FluentCRM 導讀草稿」按鈕（`handlePushNewsletter`）+ `lib/studio/wp-bridge-client.ts` `createNewsletter`。**結論**：功能端到端可用；操作者在 `/tools/content` 生成文章後可一鍵推 FluentCRM 草稿，到 FluentCRM 後台人工確認收件人再寄。
- [x] **【完成 2026-06-16｜Content Studio 生成草稿持久化】** **方案 A（Supabase 表）早已選定、建好、部署、真機運作**（VBC：本項描述「不存任何地方」已過時）。`packages/db/migrations/0041_content_drafts.sql`（service-role-only 表）+ `app/api/content/drafts/route.ts`（GET list/single、POST upsert、DELETE，ops-role gate、600KB guard）+ ContentStudio `saveDraft`/`loadDrafts`/`loadDraft`/`deleteDraft` + 生成後 auto-save（line 797/937）+「我的草稿」頁籤。**真機驗證**（2026-06-16，SG `lobster-next-admin` 容器查 prod DB `supabase.aware-wave.com`）：`content_drafts` 表存在、http=200、**已有 1 筆真實持久草稿**（auto-save 確實運作、跨機跨瀏覽器可重開）。
- [x] **【完成 2026-06-16｜Content Studio trending 來源擴充】** **「都要」零憑證部分早已建好部署**（VBC）。① 5 內建源自註冊（google-news / reddit / ptt / **perplexity** / **env-custom-rss**，`lib/content/trending-sources.ts` 積木 registry）② **「自己貼 feed」雙路徑**：env `CONTENT_TRENDING_FEEDS`（免 deploy）+ DB 表 `0042_content_sources.sql` + `app/api/content/sources/route.ts`（operator UI 加/刪 RSS，免 deploy，`isSafePublicHttps` SSRF guard）。**真機驗證**（2026-06-16）：`content_sources` 表存在、http=200（0 rows = 尚無 operator 自訂源，功能就緒待用）。**剩餘（需新憑證，未做）**：③ Inoreader 官方 API（App ID/Key+OAuth 全空）④ NewsAPI/GNews（要 key）—— 待使用者提供憑證再加；目前 perplexity + 自訂 RSS 已涵蓋「都要」的零憑證範圍。
- [x] **【完成 2026-06-16｜清理 live 假連結文章】** 真相（WP-CLI 全站掃）：slug `expressive-arts-emotional-wellness` 的文章**根本不存在**（所以 404）；假連結是 **draft 7207「Art Therapy Modules: Transform Your Practice in 7 Steps」**（2026-06-15 建，未發佈）內含一個指向該不存在 slug 的相對連結 `<a href="/expressive-arts-emotional-wellness">expressive arts for emotional wellness</a>`。**已發佈文章零假連結（站是乾淨的）**。**修法**：wp eval-file preg_replace de-link（保留文字、移除假 href），scoped 7207；draft 維持 draft。**驗證**：`REPLACED count=1 remaining_refs=0`；複驗 `anchor_to_fake=0 plaintext_kept=1`；備份 `D:\tmp\soulful-7207-backup-20260616-223918.html`（66KB）。根因護欄（commit `1e1d55cf`）已防未來再犯。
  - ✅ **Task 0/1 完成（2026-06-14）**：Postiz v2.11.3 上線 `postiz.aware-wave.com`（EU，reuse supabase-db，mem 1400m，admin=awarewaveai@gmail.com，憑證在 `AWARE_WAVE_CREDENTIALS.md`+vault）。
  - ✅ **Task 2 部分（2026-06-15）**：Bluesky 連上 + **端到端發文驗證通過**（API→Postiz→真實 Bluesky）。worker 卡 QUEUE → restart workers 解（一次性，正常不復現）。
  - ⏳ **剩餘未做**：
    1. **接更多平台 dev app**：Reddit（後台一直出錯，待修穩或換時機）／**Meta IG+FB**（一個 Meta app，要 App Review，最高價值）／LinkedIn／Threads／Pinterest／TikTok。**X 跳過**（發文 API 要 $100/月，使用者選不付）。每平台 callback = `https://postiz.aware-wave.com/integrations/social/<slug>`，client id/secret 加進 EU `/root/postiz/.env`（`<PLATFORM>_CLIENT_ID/SECRET`）+ restart。
    2. **Task 3｜Postiz API client**：`apps/next-admin/lib/content/postiz.ts` + `app/api/content/social-publish/route.ts`（POST /posts type=draft/schedule/now，auth header；mirror `publish/route.ts` ops-role gate）。內部端點 `POST /api/posts`（payload: type/date/tags/shortLink/posts[{integration.id,value[].content,group,settings.__type}]）。
    3. **Task 4｜帳號連接 UI**：studio 加「連結帳號」+ 列出 `GET /api/integrations/list`（auth header）。
    4. **Task 5｜接死面板**：`ContentStudio.tsx:1563-1636` 社群勾選框換成真發佈（帶 `imgResult.imageUrl`，模式 toggle，預設 draft）。
    5. **Task 6｜客戶 onboarding doc + ops runbook**（token 過期重連；多客戶用 Postiz「customers」軟分類，已驗證可用）。
    6. **R2 圖片儲存升級**：目前 local volume；正式發佈圖片前建 R2 S3 key pair（`CF_R2_ACCESS_KEY_ID`/`CF_R2_SECRET_ACCESS_KEY`）→ Postiz `STORAGE_PROVIDER=cloudflare`。
  - **運維觀察點**：Postiz mem ~67%（1400m 上限）盯 24h；貼文卡 QUEUE → `docker exec postiz pm2 restart workers`。多客戶規模大到記憶體吃緊 → 搬專用主機。
- [ ] **【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批** — ✅ **已完成並部署（2026-06-16，commit `e336d5da`）**：後端積木註冊骨架 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts`（`register/byKind/listAll/geoMatch` + `ContentBlock` 契約，前端 `AB.registerBlock` 後端鏡像）+ 搜尋家族 5 source 自註冊 `lib/content/trending-sources.ts`（google-news/reddit/ptt/perplexity/env-custom-rss）+ 契約 SSOT `lib/content/blocks/README.md`（修好 `public/vector-editor.html:902` 斷裂參照）。`app/api/content/trending/route.ts` 改走 `runTrending()`=`byKind("search")`。驗證：tsc 0 + critic Deep 0C/0M + node registry 語意斷言 + SG compiled bundle 含 `search/perplexity`/`CONTENT_TRENDING_FEEDS` + 容器 `PERPLEXITY_API_KEY` SET(53)=Perplexity 積木啟用。**剩餘未做**：
  1. **RSS / Inoreader 實際來源未加**：引擎已支援任意 RSS/Atom（`rssSearchBlock` + `CONTENT_TRENDING_FEEDS` env），但**目前 env 空、零 feed 配置**；Inoreader 全 repo+vault=0（`grep -i inoreader` no match；`user-env.ps1` 無 key）。**最快路徑（零碼零部署）**：取使用者 Inoreader 資料夾/標籤**公開 RSS URL** + 其他 RSS URL → 寫進 SG `CONTENT_TRENDING_FEEDS` → 重啟 next-admin。**OAuth 路徑**（folder/tag 同步、已讀狀態）需註冊 app + `INOREADER_APP_ID/KEY` + OAuth flow（目前全空，較大工）。**待使用者給 feed URL 或選 OAuth**。
  2. **來源管理 UI（可增刪 visible）+ 修寫死提示字**：前端提示 `ContentStudio.tsx:1112` 仍寫死「（Google News / Reddit / PTT）」未含 Perplexity/registry → 使用者「看起來跟之前一樣」的根因。做法：加 `type=sources`（後端 `listAll()`）→ 前端**動態列出實際註冊來源** + UI 加/刪 feed（durable=DB `content_sources` table，需 migration 先給 schema）。
  3. **第二批 block 註冊進 registry**（編排器零改、逐批可驗）：✅ `publish/wordpress`（P1）、✅ `article/generate`（P2，原稱 `article/claude`；core=`lib/content/article/generate-core.ts`，route 薄殼共用）、✅ `quality/check`（P3；core=`lib/content/quality/seo-check-core.ts`，route 薄殼共用；16 點 RankMath）；**剩** `video/pipeline`、其他 `quality/*`（抄襲/內鏈/FAQ/Alt/A-B）、`publish/youtube|postiz`。✅ **P4 headless 編排器接線完成**（`lib/content/pipeline.ts` `runContentPipeline()` 串 article→quality→publish→WP draft，逐階段 ok 短路 + article GENERATION marker 後驗；search 為上游 producer 不入迴圈）；44/44 REALTEST、tsc 0、critic PASS。**LIVE 端到端跑（真 token + 真寫客戶 WP draft）另需 go-ahead**。
  4. **video_generator python 原型整合決策**：`agency-os/docs/video_generator/*`（全自動文章→影片→10 平台）已修成可跑（密鑰改 env、Pixabay 接上、JSON retry、IG/Pinterest 走 WP 媒體、冪等、moviepy 鎖 1.x），但**未部署、未整合**；與 content-engine SSOT + 自架 Postiz 社群層關係待決（**禁兩套社群發佈並存**）。建議：影片生成抽成 block、發佈走 Postiz；確認路徑前不擴張。
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測** — 整個 PS 功能目錄已全部 build+deploy（HEAD 含 `09b81ee4`/`5b73b77d`，tsc 0+build 0+critic 過），但**使用者尚未瀏覽器實測**（Claude 無登入 session 無法測）。主檔 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/canvas/CanvasEditor.tsx`。待驗清單：① **Undo/Redo**（Fabric v7 loadFromJSON Promise + re-applyFilters，最易壞）② **排版 / 橡皮擦→文字**（前幾批修，可能只是瀏覽器快取，先 **Ctrl+Shift+R**）③ **生成填色 / 擴圖**（flux-fill-pro，需 `POD_DESIGNS_ENABLED=true` + operator role + 花費；route `/api/tools/studio/genfill` 已掛載驗 401）④ **群組/解散、Posterize、設計檔 .design.json 存載**（純前端互動）。**下一步**：① 使用者硬重整後逐項點測 ② 壞的給截圖 + 開 console（F12）貼 error ③ Claude 依 `file:line` 定位修。**注意**：lib+route 層已是 inpaint faithful mirror（production-clean），剩風險全在 client handler 的 Fabric 互動。
- [ ] **【明日】soulfulexpression.org 遷移到 Cloudflare（DNS 先、registrar 後）** — 參考文件已入庫 `agency-os/tenants/company-soulful-expression/docs/cloudflare-wpml-migration-plan.md`。本 session 已完整分析：架構選 2 台 EU（現有 CX32 留 Supabase/n8n，新 CX32 跑 WordPress×3），SG 保留給 AwareWave，Soulful 不開 SG WordPress。**$80/year 未確認 line items**（關鍵：登入 Hostinger 帳單截圖每個 line item，若非純 domain 則逐項替代）。**下一步**：① 登入 Hostinger → Billing → 截圖帳單 line items → 貼給 Claude 確認 $80 構成 ② `cloudflare-wpml-migration-plan.md §2.1` 列完替代方案後，在 CF 加 zone `soulfulexpression.org`（免費，今天可做）③ 備份現有 Hostinger DNS records（截圖 MX/SPF/DKIM/DMARC）④ 在 Hostinger 改 nameservers → CF nameservers（等 Active 24h）⑤ 11月前：Hostinger unlock domain → 取 EPP code → CF Registrar transfer（at-cost ~$9.77/年，加 1 年，現有 2 年 → 共 3 年）⑥ 之後可在 CF 補到 10 年。**不要做**：不要取消/刪除 Hostinger domain；不要在 DNS 備份前改 nameserver；不要等過期當天才轉。

- [x] **【✅ 2026-06-14】套 `lobster-factory/packages/db/migrations/0036_fingerprint_v2.sql` 到 production Supabase** — 修 webhook `/api/webhooks/deploy` 持續 500「db write failed」。根因：部署 code 呼叫 RPC `upsert_incident_atomic` 13-arg 新簽章（含 `p_fingerprint_v2`），live DB 只有舊 12-arg → PGRST202『function ... p_fingerprint_v2 ... not found in schema cache』。06-09 首次失敗藏一週。0036 = ADD COLUMN fingerprint_v2(nullable) + DROP/CREATE 13-arg function（rollback 在檔內 :112-117）。**套用後驗證**：重觸發 SG Deploy → 結尾 ops-inbox POST 應回 HTTP 2xx 而非 500；Telegram `/deploy_status` 應見新 deploy 事件。背景 WORKLOG 2026-06-12 commit `012929d5`。雲端排程提醒已建：routine `trig_012NGUD1vUpsZ1Xyxk2qswYT`（reminder-only）。
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**（5 階段路線圖 SSOT）。✅ Stage 0 建站引擎閉環已驗（run 655197bf completed + curl 200，2026-06-06）。✅ **Stage 1 接通入口完成 2026-06-14**：trigger-build 403 修復（dual-path auth, 8b1d6d86）+ dispatcher kick fallback（TRIGGER_ACCESS_TOKEN, 000f068c）+ dispatch-action-run-schedule 部署（每分鐘 cron）。**下一步 = Stage 2 Fluent Form→intake 橋接+FluentCRM** → Stage 3 報價 → Stage 4 機層租機(provisionClient 已寫好未接) → Stage 5 串接監控。
- [x] **Stage 1 接通入口** ✅ 2026-06-14 — trigger-build 403（role:viewer）修 → dual-path sync-key auth；dispatcher TRIGGER_ACCESS_TOKEN fallback；dispatch-action-run-schedule deployed；UI 走完一筆 ok:true run_id=b344f86e，intake_form=building。
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**：現只有 /option 有（RestController:167）；2026-06-11 一鍵上架測試因此真建了 draft #7164。plugin 端改 → bump AWBRIDGE_VERSION → release flow（WP-BRIDGE-RELEASE-RUNBOOK）。
- [x] **【✅ 2026-06-15 被 A1 作廢】POD 一鍵上架手動匯入步驟** — 原需操作者開 Printful Dashboard 手動匯入（Woo-platform store 18314943 無 API 匯入）。**A1 native store 全自動建品（commit 8bce1980/a7509451，prod 5b8c97ac）已消除此手動步驟**：建在 native store 18324409，`POST /store/products` 一次建品+綁變體+上印刷檔。剩 P4 試單併入下方 A2 真實開賣驗證。
- [ ] **【POD A1 已完工｜剩 e2e + A2】** A1（一鍵 native 建品）後端+UI+hardening 全 live。剩：① **真實 e2e 開賣驗證**（操作者驅動瀏覽器：app.aware-wave.com → 建品 → 🚀一鍵上 Printful → 驗 native store 商品+變體+印刷檔全綁 → 清理測試商品）② **A2 自動轉單 webhook ✅ 已建+已部署 draft-only dormant（2026-06-16，deployed `e336d5da`）**：`app/api/webhooks/woo-order/route.ts` = Woo 付款 → Printful DRAFT（kill-switch `POD_AUTO_FULFILL_ENABLED` 預設 OFF + HMAC 驗簽；333/333 test；critic PASS）。**✅ 2026-06-16 啟用 draft-only LIVE**（SG flag+secret+compose passthrough、soulful 2 webhook、端到端 401/400 實測過；見下方獨立任務行）。**confirm/送印紅線未建**（測試結束+批准才議）。
- [ ] **【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】** A2 draft-only 管線已上 prod dormant。真正「自動扣款 + 送印」需未來明確建 confirm step（目前 code 完全沒有）。**動工前置（同一批做）**：① 改用 Woo webhook topic header（`order.created` vs `order.updated`）判別狀態，並顯式處理 `refunded`/partial-refund-still-processing edge（critic 2026-06-16 Minor）② confirm 必須有獨立 flag（與 draft flag 分離）+ 操作者每筆/批次審核閘，**禁止**裸自動 confirm ③ High-risk：需操作者 go-ahead + 先 draft 模式試單對帳通過。SSOT：`app/api/webhooks/woo-order/route.ts` + `lib/studio/print-provider.ts createDraftOrderOnNative`（⚠ DO NOT add confirm 註解）。
- [x] **【✅ 2026-06-17】POD PublishWizard 真・全部一鍵** — 新增 `runAll` orchestrator + 「🚀 全部一鍵完成」按鈕：一次跑 印刷檔→WebP 商品圖→合成平拍圖→AI 文案→建 Woo 草稿(含全部圖)→Printful native(建品+綁變體+印刷檔)，共用同一組 SKU。結果走本地變數串接(避 React stale closure)。critic Deep PASS 0C/0H + 3 修(mockupUrls ref 快照/執行中鎖選圖/re-entrancy latch)。tsc 0 + vitest 379/379。單檔 `app/tools/publish/PublishWizard.tsx`。**✅ 已部署 prod**(sg-deploy `c2bf5674`,prev `8a4727a5`;6s healthy + HTTP smoke 4/4 + 部署 bundle grep 證實含按鈕 + Playwright smoke 26/0/6)。**剩：操作者 live e2e**(真按一次建 Woo+Printful 商品驗證)。WORKLOG 2026-06-17 feat(pod)。
- [x] **【✅ 2026-06-16 A2 啟用 draft-only LIVE → 但 soulful 不接 A2】POD A2 啟用 + 真實 SKU 實測 + 履約決策** — SG `.env` flag+secret+compose passthrough + `docker compose up -d next-admin` ✅（A2 引擎 prod LIVE，保留啟用給未來 native 客戶）。soulful 建過 2 webhook 但**真實 SKU 測出 502 `Sync variant not found`**（soulful t-shirt 7149 SKU `6A2A474EBBAF7_*` 在平台店 18314943，A2 打 native 18324409 → 全 miss；native 確認 404 無草稿，零金流）→ **決策：soulful 維持官方 Printful 外掛履約，刪除 webhook 4+5（已 ✅，回今早原狀）**。go-forward：新客戶走 native；soulful 不遷移。WORKLOG 2026-06-16 ops(pod-a2) [決策] 段。
- [x] **【✅ 2026-06-16 定案】POD 多客戶履約架構決策 — 新客戶走 Native，不走外掛** — 三訊號（會有更多客戶／未來可能多平台／app 是操作台不賣東西）全指向 native。**SOP**：`docs/operations/POD_FULFILLMENT_PLAYBOOK_native-over-plugin.md`；**ADR**：`docs/architecture/decisions/008-pod-fulfillment-native-store-over-plugin.md`（ADR_INDEX + OPS_DOCS_INDEX 已連結）。go-forward：新客戶 native、soulful 不遷移、多平台走 adapter。下一步觸發點 = A2 confirm phase（金流紅線，見上方項；需先想清楚對帳/客戶結算）。
- [x] **【✅ 2026-06-16】A1 hardening — 關 critic 2 benign 🟡**（結構化 transient classifier 取代 free-text includes；SKU-faithful 冪等防改名 reseed 腐化 P4 join + dup-sku guard）。tsc 0 / vitest 318/318（+2 新 test）/ critic PASS 0c0M。**✅ 已部署 prod**（`1b081764`，prev 5b8c97ac；deploy gate 全綠 + smoke 4/4；deployed source grep 確認 isTransientPfError×3+skuMismatch×2）。WORKLOG 2026-06-16。
- [ ] **smoke 04-onboard spec 補 app session 登入**：`95e80904` login hard-nav 後未登入導登入頁，spec 只帶 nginx basic-auth → 永久 fail。修法＝spec 加 app 登入步驟（Email/密碼從 env），或改用 `x-ops-sync-key` header。佐證 WORKLOG 2026-06-11 部署段。
- [ ] **wp-bridge 續做 operation：featured image** / update-existing-post / product update+delete（v0.7.0 只做 product CREATE，其餘端點仍待補）。
- [x] **[1-d] to-print-file.ts + ghostscript-pdfx.ts 印刷軌核心** ✅ 2026-06-13（pdf-lib@1.17.1 裝；PRINT_DESTINATIONS 積木；CMYK 不設 density；TGC=sRGB PNG；alpha flatten 白底；gs OutputIntent deploy-gate throw。vitest 10/10 + tsc 0 + critic。剩 deploy: [0-a-gs] gs+ICC+POD_OUTPUT_INTENT_DEPLOYED）
- [x] **【✅ 2026-06-11 操作者確認完成】Tarot 增 9 個圖像模型** → handoffs/2026-06-11-0236-add-tarot-models.md（加 ideogram-character/v4-turbo/v3-balanced/v2a-turbo/v4-quality、seedream-4.5、nano-banana-2、imagen-4、flux-2-max 到 Tarot Studio 模型選單）。**核心坑**：9 個各有不同 Replicate input schema，勿套 flux 的 `go_fast/megapixels/guidance/num_inference_steps`（→ 422）；逐一查 schema。改 `image-gen.ts`(TAROT_MODELS:26) + `TarotStudio.tsx`(MODEL_OPTIONS:43) → tsc → /verify-recent → /sg-deploy。
- [ ] **【POD Studio 自建動工】** plan=`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`；藍本=`lobster-factory/docs/POD_STUDIO_ROADMAP.md`。✅ ① 擬真合成驗證 PASS（nano-banana-2 白 ~95%/黑鎖色 ~90%，prompt 三鐵則進 plan §0）✅ 先決小修（REPLICATE token 回填 + vault doc drift）✅ ② **P2a 儲存層完成 2026-06-11**（`lib/storage/r2.ts`+route+My Designs 頁，REALTEST 全過，flag OFF **未部署**；deploy 時 SG 設 `POD_DESIGNS_ENABLED=true`+`POD_DESIGNS_DEFAULT_ORG_ID=2bf60452-…`）。✅ ③ P2b 生成器（facade+Studio 頁，fbc1b7b1）✅ ④ P2c 去背（851-labs，RGBA 驗證）✅ Printful 憑證落定（vault ×4；store 18314943 已綁 Woo — P2d 先決解除）。✅ ⑤ Mockup Studio（B9-S 雙模式+鎖色，REALTEST 目視 PASS）✅ ⑥ P2d PrintProvider（Woo 平台改道 sync API；讀路徑實測過）✅ ⑦ 一鍵上架鏈+Publish 頁（upscaler 誠實合約+Ed25519 client；兩輪部署 a4fd0e95 全上線）。**下一步 = link 寫路徑首驗（見【明日優先】packet）→ P3 上架定案（主站 Woo 已可用）→ P4 試單對帳**
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】** 服飾 POD 全功能（忠實印刷檔 / Printful 多風格+真人模特 mockup+存圖庫 / 平拍真實 overlay 雙軌 / 台灣本地印刷檔 seam / AI 商品文案 SEO-GEO-AEO-RankMath）已 **live on app.aware-wave.com**（smoke 24 pass）。剩餘未做：
  1. **台灣印刷廠實際規格未確認** — 現用 DTG 業界預設（透明底 PNG/300DPI/4800px）。拿到廠商實際規格（檔案類型/解析度/尺寸/CMYK 與否）後更新 SSOT `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/apparel-print-destinations.ts`。
  2. **wp-bridge PHP 端 defense-in-depth**（另一 repo `aware-wave-wp-bridge` release）：`includes/Product/ProductCreator.php` short_description 加 `wp_kses_post`；`includes/Content/BlockLibrary.php::iconList` 加 `esc_html`。現非漏洞（WP kses 預設 + next-admin TS sanitizeProductHtml 雙重保護），屬縱深防禦強化。bump AWBRIDGE_VERSION → release flow（WP-BRIDGE-RELEASE-RUNBOOK）。
  3. **真實端對端開賣驗證**（與 line【明日優先】link 首驗同一件）：Publish 建草稿 → 操作者 Woo publish → Printful Dashboard 觸發匯入 → Claude 驗 link 綁定全綠 → P4 試單。
  4. **flatlay AI 裝飾背景 bgUrl 的 UI 選擇器**：`publish` route `flatlay` action 已支援 `bgUrl`（從 My Designs 選無圖案的 AI 背景圖當底），但 PublishWizard UI 只有純色背景；待補背景圖選擇器（`app/tools/publish/PublishWizard.tsx` runFlatlay）。
  5. **`copy` action LLM 成本 rate-limit**：`app/api/tools/publish/route.ts` 的 AI 文案 action 僅 role gate 無 rate-limit/每日 cap（內部 ops 用戶，blast=Anthropic 成本非資料）；規模大時加 token-bucket/daily cap。
- [ ] TASKS [x] 自動歸檔 + 重複行偵測閘（archive-completed-tasks.ps1，**R0 已批方案A**，照 packet 直接動工免重提案）→ handoffs/2026-06-11-1738-tomo-173818.md
- [ ] **【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀**：操作者回報 mockup 有問題未提供細節（2026-06-13）。MockupStudio.tsx 實走 `/api/tools/studio/generate`（nano-banana-2 + referenceImages）。**本輪已排除（步驟③④完成）**：container `Up healthy` + full docker log **零 error**（generate/mockup/nano-banana 皆無）；Replicate token 實打 `/v1/account`=ok（非 429/402/auth）→ **server-side 健康，最常見因全排除**。**剩下（卡操作者）**：① 操作者給「什麼操作、什麼錯誤畫面、F12 console + network tab」②（拿到後）Claude 依 `file:line` 對症修 `MockupStudio.tsx`/`lib/studio/mockup-prompt.ts`/`app/api/tools/studio/generate/route.ts`。R0 紅線：不憑猜改 code。
- [ ] **🎨 Image Output Pipeline**（SSOT: `lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md`）Tarot/POD: 色調→WebP/CMYK PDF(Japan Color 2001 Coated)/Fabric.js Canvas；Printful 走 sRGB `upscaler.ts` 不動；Canva Phase 1.5 POC
  - **印刷積木 SSOT**：`PrintDestination` 矩陣（tw-local/mpc/tgc/printninja）；國際標準 70×121mm；TGC=sRGB PNG（CMYK 退件）；情境 A 直送印刷廠。**已查證**：pdf-lib 無 OutputIntent（PR#1512 closed）→ Ghostscript 套 ICC；Printful 走 sRGB upscaler.ts 不動
  - **Phase 0 POC（2/5 本機 PASS；證據 `d:\tmp\cmyk-poc\poc3.mjs`）**
  - [x] **[0-a]** ✅ CMYK PDF + TrimBox — 本機 PASS：`/DeviceCMYK`+`/Decode`+三框。**關鍵修正 `.withDensity()` 取代 `.withMetadata({density})`**（後者附 sRGB ICC 破壞 CMYK，SOF=3）
  - [x] **[0-a-srgb]** ✅ TGC sRGB PNG — 本機 PASS：898×1500 3ch 無污染
  - [x] **[0-a-gs]** ✅ 2026-06-14 SG prod 部署完成。gs 10.06.0 + ICC_OK + POD_OUTPUT_INTENT_DEPLOYED=true。prod 驗證：/OutputIntent×2 + PDF/X-1a:2001 + GTS_PDFX ✓。ICC 採購（Japan Color）= 非阻塞待辦。
  - [~] **[0-b]** Fabric.js + Next 15 — dynamic import ssr:false=文件化✓；R2 CORS taint **併入 [1-i]** integration test（真 R2+Playwright）。**Phase 0 技術風險已退（3 本機 PASS + 2 介面隔離/部署閘）→ Phase 1 程式碼可開始**
  - [x] **[0-c]** ✅ API security SSRF guard — 本機 PASS 12/12 + DNS-rebinding 防禦（`d:\tmp\cmyk-poc\ssrf-poc.mjs`）；IPv4+v6 完整分類；fetch/timeout/content-type 標準部分留 [1-e]
  - **發現（已修 plan SSOT）**：sharp 非直接 dep（Next transitive @0.34.3，須 pin）；base=node:20-alpine（apk 非 apt-get）
  - **Phase 1（Phase 0 全綠才開始）**
  - [x] **[1-a]** ✅ 零工作量（VBC）：printQuality 已透過 facade 透傳（`image-gen.ts:266` in TarotGenParams + `image-provider.ts:22` alias + L30-32 整包透傳）。plan 聲稱「沒 expose」=錯
  - [x] **[1-b]** ✅ `lib/studio/color-grade.ts` — 純函式 seam（State↔Params/clamp/toSharpModulate/toCssFilter）；vitest 10/10 + tsc 0 + critic 修 Critical（runtime type-hole）。hook 移 component 層
  - [x] **[1-c]** ✅ `lib/studio/to-product-image.ts` — preset WebP（web-tarot 667×1000 cover / web-square 1000×1000 contain）；vitest 6/6 真 sharp bake + tsc 0。**發現 app sharp=0.34.3 無 withDensity（需 0.35）→ CMYK/web 不設 density**
  - [x] **[1-d M]** `lib/studio/to-print-file.ts` + `ghostscript-pdfx.ts` — PrintDestination 積木矩陣（pdf-lib embed+TrimBox → Ghostscript OutputIntent；sRGB PNG 分支）✅ 2026-06-13
  - [x] **[1-e M]** `app/api/tools/image/process/route.ts` — discriminated union（web/print/canvas）+ auth + flag + base64-input(SSRF零表面) + OutputIntent gate catch ✅ 2026-06-13（vitest 14/14 + tsc 0 + critic）。consumer UI（[1-f]/[1-j/k]）待接
  - [x] **[1-f S]** `components/tools/ColorGradePanel.tsx` — 色調/飽和/亮度三滑桿 ✅ 2026-06-14（已存在全實作：useColorGrade hook + 四群組滑桿 + GRADE_LIMITS SSOT）
  - [x] **[1-g S]** `components/tools/OutputTrackBar.tsx` — preset-aware；印刷鈕含目的地下拉（tw-local/mpc/tgc/printninja）；Canva feature flag 隱藏 ✅ 2026-06-14（已存在全實作：web/print/canvas 三軌 + PRINT_DESTINATIONS + semantic filename）
  - [x] **[1-h S]** `app/tools/canvas/page.tsx` — Canvas 路由 ✅ 2026-06-14（已存在，546 bytes，canvas route LIVE）
  - [x] **[1-i M]** `app/tools/canvas/CanvasEditor.tsx` — Fabric.js（沿用 Phase 0 版本）；存 design.json+preview.webp+source-export.png → R2 ✅ 2026-06-14（已存在 36KB + fabric-filters.ts；inpaint+toolkit batches 0+1 已部署 2026-06-14）
  - [x] **[1-j S]** `TarotStudio.tsx` 接 ColorGradePanel + OutputTrackBar（web-tarot + 印刷四目的地 + canvas-edit）
  - [x] **[1-k S]** `StudioWorkbench.tsx` 接 ColorGradePanel + OutputTrackBar（web-square + pod 印刷 + canvas-edit；Printful 另走 upscaler.ts）
  - **Phase 1.5 / Phase 2**
  - [ ] **[5-a~d]** Canva API POC → OutputTrackBar 接線（plan §17）
  - [ ] **Phase 2** customer-facing Canvas + WooCommerce + Printful；整副牌多頁 PDF（PrintNinja offset）

- [x] **【✅ 2026-06-11 已套用】media_assets 雙重定義衝突修復（C1）**（critic C1，2026-06-11）— **修復檔已寫好 + db-expert 審過（verdict: commit LOW/apply LOW），只剩套用待操作者 go**：`migrations/0038_media_assets_reconcile.sql`（idempotent reconcile，線上=no-op，fresh replay=補齊 0011 canonical shape；含 predicate-based constraint guard + `notify pgrst` + fresh-replay 操作順序註記）+ down 檔 `scripts/0038_media_assets_reconcile_down.sql`。**套用方式**：SG quiet window 貼 Supabase SQL Editor（預期全 no-op，零鎖風險—db-expert 確認無 table rewrite）。佐證 WORKLOG 2026-06-11。
- [x] POD Studio 路線圖 + tarot 框線收尾（框 png 還沒做好；per-frame 微調 + celestial 補生）→ handoffs/2026-06-06-2026-pod-studio-roadmap.md

- [x] **【✅ 2026-06-11 操作者確認完成】** Content Engine Phase 1 MVP — soulful 試點發第一篇 draft（spec §38/§44；§36 schema + §37 prompts；DataForSEO/Firecrawl 屬 Phase 2 別接）→ handoffs/2026-06-06-2029-tomo-202949.md

- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章（2-Gem: onboarding+content；定位鎖定 Arts Practice for Self-Discovery / Arts-Based Reflective Pedagogy；填真資料→文章可發布；spec §49 errata 待補）→ handoffs/2026-06-06-2044-seo-geo-content.md

- [x] 補完 tomo critic findings apply — 驗收 2 Critical + 6 Major 全修完 → handoffs/2026-05-25-1418-tomo-critic-findings.md
- [x] **【✅ 2026-06-02 完成】WeeklyReview auth 確認** — 先到 `claude.ai/code/routines` 確認 AgencyOS-WeeklyReview 無「re-authorize GitHub」警告（根因：2026-05-22 repo PUBLIC→PRIVATE 導致 2026-05-25 auto-disabled，今日已 re-enable via API）；若有警告 → 點進去重新授權；2026-06-01 01:00 UTC 後確認 `last_fired_at` 已更新
- [x] **【2026-06-05 06:00 UTC 後驗收】Phase4Weekly 第二次 scheduled fire** — 確認 routine 自動 fire 成功（無 `auto_disabled_*` ended_reason）。檢查：`agency-os/reports/repair-center/phase4-LATEST.md` 日期更新到 2026-06-05；若再 disable → `claude.ai/code/routines` 手動重新授權 GitHub connection（API re-enable 無法治本 OAuth token 失效）。同步 6/1 WeeklyReview 結果驗收 OAuth token 底層有效性。根因 + 一次性修法見 WORKLOG 2026-05-30 13:20 entry。
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint) — Batch 3 已完成（9f862d82）→ handoffs/2026-05-28-1807-batch-3-post-phase.md
- [x] **Phase Z8** — AO-RESUME archive lift gate（同 Z6 思路套 AO-RESUME）：每次 AO-RESUME 寫 7-段式後必須 archive 到 `agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md`，否則 next health-check fail。原因：今天 5/30 12:32 AO-RESUME 我輸出 7-段式但忘了寫 archive，操作者點出才補；同 5/28 18:46 SG deploy silent drop class of bug，protocol 沒機械閘就靠 agent 自律不靠譜。實作：新 `scripts/verify-aoresume-archive.ps1` + 接入 system-health-check gate 12d + `.claude/commands/ao-resume.md` 加 Step 3 強制規則。
- [x] **【✅ 2026-06-02 完成】設計「客戶網站建置系統」(Lobster Factory Onboarding Portal) + 輸出 14 段規格（含續砌 aware-wave-wp-bridge 執行層）→ `agency-os/docs/architecture/client-onboarding-portal-spec.md`
- [x] **【✅ 2026-06-02 完成】研究+輸出 Client Onboarding Portal 完整 14 段規格（form→自動選 package→Claude 生規格→staging 建站→monitoring+repair-agent）→ `agency-os/docs/architecture/client-onboarding-portal-spec.md`（14 段含 ✅已有/🆕要做 標記、TypeScript interface、Decision Tree、DB migrations、MVP 執行順序）
- [x] **【✅ 2026-06-03 完成】Onboarding Portal §7 staging build 串接 + §8 Uptime Kuma env** — `POST /api/onboarding/trigger-build` 上線；idempotency + FK cross-validate + middleware matcher 修正；UPTIME_KUMA_URL 補入 docker-compose；real exec test PASS（run_id c9b6cc0e, intake_forms.status=building）。commit a573b759 + 59d4e7c。
- [x] **【✅ 2026-06-03 完成】明天 carry-over：onboarding §7/§8 + scripts drift** — §7/§8 完成；scripts drift 仍開放（見工具層分類）
- [x] **【✅ 2026-06-04 已解決，方案改變】** ~~Cloudflare WAF wp-login 規則改 ip.geoip.country~~ — geo 方案對全球跑的操作者不利（出國會自擋）。改用 **LLAR (Limit Login Attempts Reloaded)** 伺服器端防護替代，CF Custom WAF Rules 已清空不重建。證據 WORKLOG:121。handoff 174946 已可歸檔。
- [x] **【✅ 2026-06-05 完成上線】大修 app.aware-wave.com（12個問題）** — P1 Supabase Auth 登入上線（操作者實測 OK）+ P2-P12 全修全部署；onboarding intake 重設計+去重複。現況見 `docs/operations/APP_AWARE_WAVE_CURRENT_STATE.md`。後續 IA 重整 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售 → handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item（Phase4Weekly 錯 repo / incidents API 藏 open / 5 webhook 零流量）→ handoffs/2026-06-05-2017-tomo-201752.md
- [x] **【✅ 2026-06-06 完成】Hetzner Hosting Layer Phase 1 驗證** — M9/M7/M3/M10 經 tsc(我檔0錯)+vitest(18/18)+critic(無Critical)+db-expert(sound) 驗證；WORKLOG R0 證據已補。→ handoffs/2026-06-05-2030-tomo-203020.md
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**：① M10 orphan reaper（claim 後 trigger 前 crash→卡 running 終態；需 claimed_at 時戳+reaper `dispatch-action-run.ts:157-180`）② partial index `create index concurrently idx_ops_action_runs_pending_dispatch on ops_action_runs(started_at) where status='pending'`
- [x] **【✅ 2026-06-06 完成+真機驗證】Hetzner 一鍵租機+硬化+DNS** — provisionClient.ts + hetzner/cloudflare providers + cloud-init 全寫完；真機 cpx12@sin 驗證通過（IPv4+IPv6 防火牆/key-only/無孤兒）。
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）** — 程式+真機已驗過，**直接呼叫 `provisionClient()` 勿重寫**。recipe：`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`（app 端 `onboarding/trigger-build/route.ts` 頂部已留指標）。等 app 校正完再接。
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）** — 讓新機/客戶自帶機自動部署成 production 等級（Docker+Grafana/Loki/Netdata/Sentry+快取+swap+備份+限速/WAF/fail2ban）。**料件 90%+ 現成**，缺一個編排器 `provision-stack.sh`（串既有腳本，純 SSH，Vultr/DO/客戶自帶機通用）+ BYO adapter + swap。完整 R0 計畫：`lobster-factory/docs/hosting/SERVER_STACK_DEPLOYMENT_PLAN.md`。**禁止重寫既有 compose/腳本，只編排**。→ handoffs/2026-06-06-1925-postboot-stack-deploy.md
- [ ] app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃、Q1-Q3 已決、未動 code）+ verify intake 觸發建站 + Phase 2/3 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [x] **【✅ 2026-06-09 SE-01 已發文】wp-bridge v0.3.0：AI 在 soulful 真站建第一篇草稿（SE-01）** — soulful 真站 post 7053/7056 經真實 PostCreator 路徑 committed（WORKLOG 2026-06-09 v0.5.6 entry）。剩餘 operation（featured image / update-existing-post / Woo product CRUD）見下行待辦。
- [x] wp-bridge 續做 operation：featured image（sideload→`_thumbnail_id`）/ update-existing-post（**注：Woo simple product CREATE 已於 v0.7.0 完成** — `ProductCreator` + `POST /product`，真站驗 product 7066 draft；剩 featured image / update-existing / product update+delete）→ handoffs/2026-06-05-2039-tomo-203931.md
- [x] **wp-bridge variable product 支援**：`ProductCreator` 目前只做 `WC_Product_Simple`；客製化 T-shirt 需 variable product（attributes 顏色 白/黑 × 尺寸 3L/2L/XL/L/M/S/XS + variations + 客製化圖案）。照 simple 範式擴 `WC_Product_Variable` + `WC_Product_Attribute` + 逐 variation atomic+讀回驗證+失敗整筆刪。操作者 2026-06-10 要求。
- [x] **【✅ 2026-06-10 驗收完成】wp-bridge v0.5.6 引擎** — 操作者開後台確認 post 7053/7056 編輯器無 invalid content（伺服器端預檢全綠：parse_blocks 完整樹、freeform=0、accordion pane id 首省略+第2+遞增、tab id 正確）；v0.5.6 三候選皆已 ship（/blocks 端點 ✅、tabs/infobox 樣式 palette-token ✅、Woo simple product ✅v0.7.0）；引擎現為 v0.7.0、下一步方向＝app.aware-wave Stage 1 主線 → handoffs/2026-06-06-1929-wp-bridge-v056-shipped.md
- [x] **【✅ 2026-06-11 操作者確認完成】** Tarot Studio 增加 9 個圖像模型（ideogram-character/v4-turbo/v3-balanced/v2a-turbo/v4-quality + seedream-4.5 + nano-banana-2 + imagen-4 + flux-2-max）；各模型 input schema 不同需逐查，勿套 flux 參數 → handoffs/2026-06-11-0236-add-tarot-models.md
- [ ] **【公司桌機】CLOUDFLARE vault token 裝錯修正（筆電 2026-06-16 已修並驗）** — 公司桌機 `mcp/user-env.ps1` 機器本地、不進 git，大概有同樣 bug：`CLOUDFLARE_API_TOKEN` 裝成 `cfut_`（OAuth，MCP 用）而非 `cfat_`（REST API token），且缺 `CLOUDFLARE_ACCOUNT_ID`。後果：`check-cloudflare-security.ps1` / `awarewave-ops` MCP / WAF PATCH 打 `api.cloudflare.com` 會 401/403。根因：`cfut_`(OAuth)≠`cfat_`(API token) 不可互換。**下一步**：① `mcp/user-env.ps1` 把 `CLOUDFLARE_API_TOKEN` 值改成 `cfat_K1A25qBnqLoV9E1si2ACyOztiKnspz8UpCr1bqgDd6815e99`（約 line 8）② 同區塊新增 `CLOUDFLARE_ACCOUNT_ID = "aea1a836e6f8b8d7f18206dc8e848bd6"` ③ 跑 `powershell -File scripts/secrets-vault.ps1 -Action import-user-env` 同步 vault ④ 驗證：`Invoke-RestMethod https://api.cloudflare.com/client/v4/zones -Headers @{Authorization=('Bearer '+$env:CLOUDFLARE_API_TOKEN)}` 應列出 `aware-wave.com` + `weartheworld.org`。**另**：cloudflare 桌面 MCP（`claude_desktop_config.json`，各機本地）也要各機自行改成 `mcp-remote@latest https://mcp.cloudflare.com/mcp --header Authorization:${CF_AUTH}`（env `CF_AUTH="Bearer <cfut_>"`）；trigger MCP 修正（`scripts/start-trigger-mcp.ps1` 絕對 powershell.exe 路徑）已進 git main 跨機自動同步、免手動。
- [ ] **【公司桌機】重跑 SystemGuard 註冊器，換掉會閃紅字視窗的舊 Daily 任務（筆電 2026-06-16 已修並驗）** — 公司桌機的 live 排程任務 `AgencyOS-SystemGuard-Daily` 機器本地、不進 git，大概還是舊的「未隱藏」版，每天 22:30 / 開機補跑時會閃 PowerShell 紅字視窗。修好的腳本已隨 `git pull` 到位（commit `c4ae159f`，改用 `Register-ScheduledTask` 模組，無 schtasks /TR 261 字限制），但**重跑一次才會換掉 live 任務**。根因：舊 `schtasks /TR` 上限 261 字、隱藏 launcher 指令 308 字 → 靜默建不起來 → 殘留未隱藏舊任務閃窗（紅字另一根因 doc-sync `Resolve-Path` 漏 `-LiteralPath`，已隨 git 同步修）。**下一步**：① `powershell -ExecutionPolicy Bypass -File .\agency-os\automation\REGISTER_SYSTEM_GUARD_TASKS.ps1 -DailyTime 22:30`（免提權）② 驗證：`(Get-ScheduledTask AgencyOS-SystemGuard-Daily).Actions.Arguments` 應含 `WindowStyle Hidden` + `scheduled-task-launcher`③ 不會再閃。**注意**：腳本只註冊 Daily（OnStartup 需提權+從未運作、OnLogoff trigger 無效，皆已停用）。

#### 雙機環境 / 日常開工

- [ ] **（出國前必做）Termius 手機 SSH 設定 + cheat sheet 書籤** —— **【未開始】**
  - 📖 **完整步驟讀這個（單一主人）**：[`agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`](docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md) — §0（5 步驗證）+ §5（4 條 Snippets）+ §8（key 上手機 3 方法）
  - 📅 **規劃日期**：2026-05-08
  - 👤 **執行者**：**操作者親自手機操作**，代理無法代執行
  - 🎯 **DoD**:
  - **(1) SSH key 弄到手機 Termius**（3 種方法擇一；推薦 B1 = iCloud Universal Clipboard）：
    - **方法 A（最安全）**：電腦裝 7-Zip（https://www.7-zip.org/）→ 對 `C:\Users\user1115\.ssh\hetzner_trigger` 7-Zip → 加入壓縮檔 → 加密 AES-256 + 設密碼 → 上傳 iCloud Drive / Google Drive → 手機下載 + 解壓 + Termius Keychain → New Key → import
    - **方法 B1（最快，iPhone + Mac 同 Apple ID）**：電腦記事本打開 `hetzner_trigger` → 全選複製 → iPhone Universal Clipboard 取得 → 備忘錄貼上 → Termius Keychain 貼上 → 用後**刪備忘錄**
    - **方法 B2（其它情況）**：Email 自寄 key 純文字 → 手機收信複製 → Termius 貼上 → 收件匣+寄件備份+垃圾桶**全刪**
  - **(2) Termius 加 SG host**：Hostname `5.223.93.113` / Username `root` / Port `22` / Private Key 選 `hetzner_trigger`
  - **(3) 跑 §0 5 步驗證**（**手機關 wifi 切 4G 模擬國外**）：(a) 連線見 `root@wordpress-ubuntu-4gb-sin-1:~#`；(b) `whoami` → `root`；(c) `ls /root/lobster-phase1/scripts/sg-deploy.sh` 存在；(d) `/root/lobster-phase1/scripts/sg-deploy.sh next-admin --dry-run` 印 `DRY RUN complete`；(e) `docker ps --format '{{.Names}} {{.Status}}'` 看到 `lobster-next-admin Up X (healthy)` — **5 步全綠才算 PASS**
  - **(4) Termius 加 4 條 Snippets**：`🔍 status` (`docker ps`) / `📋 deploy next-admin` (`sg-deploy.sh next-admin`) / `📋 dry-run` (加 `--dry-run`) / `📊 drift log` (`tail -50 /var/log/sg-deploy-drift.log`)
  - **(5) 手機加書籤**: cheat sheet（`https://github.com/awarewaveai-pei/Work/blob/main/agency-os/docs/operations/TELEGRAM_OPERATOR_CHEATSHEET.md`）+ ops console (`app.aware-wave.com/ops/system-modes` / `/ops/approvals` / `/ops/inbox`)；建議「加到主畫面」+ 離線備份（raw markdown 複製進備忘錄）
  - **(6) 出國前一晚再跑 §0 5 步**確認還能連（不重做設定，只測連線）
  - **失敗時找代理**：說明哪步、什麼錯誤訊息（如 `Permission denied` / connection timeout / sg-deploy.sh 跑出非 dry-run 動作等），代理會幫拆。

#### 客戶試點 — Soulful Expression（既有站接手）

- [ ] **既有站接手（Soulful Expression Art Therapy）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面** staging canonical URL 已入 registry／SITE_PROFILE／`02_EXECUTION_PLAN`。**下一步：**Day 1 Runbook §1.1–1.3（操作者登入）+ **`TASKS`**「Day 2 實機驗收」。
  - 本項目標：完成 M1 台帳（staging/prod、備份策略、維護窗、baseline 外掛/版本）
- [ ] **既有站接手 Day 1（Soulful Expression）** —— **【進行中 2026-05-08】§1.2 ✅ §1.3 DB dump ✅**。§1.2 機讀基線完成（commit `b5cef4c`：WP 6.9.4 / PHP 8.2.30 / MariaDB 11.8.6 / Kadence 1.3.6 / 35 active plugins (16 有更新) / 2 admins / 138MB DB / 風險 Top 3）。§1.3 DB dump 完成（`soulful_db_20260508_160734.sql.gz`，15 MB，SHA256 `849db784…`，本機 + `BACKUP_RESTORE_PROOF.md #1`；restore drill 待 staging 建立後執行）。**仍開放（操作者必做）**：§1.1 帳號層級權限確認（Hostinger panel / DNS panel / WP admin browser login，純 SSH 無法驗證 panel-level access）。Day 2 staging 操作指引已備：`DAY2_STAGING_OPERATOR_GUIDE.md`；Day 3 更新計劃已備：`DAY3_SECURITY_PATCH_PLAN.md`。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` 第 1~2 節
  - 產出：§1.2 ✅ §1.3 DB dump ✅ §1.1 待操作者 §restore drill 待 Day 2

#### 客戶試點 — Scenery Travel Mongolia（新站建置）

- [ ] **新站建置（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架完整；**Day 2 書面**：canonical staging **提案** `https://staging.scenery-travel.mn/` 已寫入 registry／SITE_PROFILE。**下一步：**選定主機商後 Runbook §2 建置實機 + 客戶訪談補 Discovery。
  - 本項目標：完成 M1 啟動（tenant/site/project + 雲端 staging 可用 + Discovery 國際需求補齊）
- [ ] **新站建置 Day 1（Scenery Travel Mongolia）** —— **【進行中】** **進度（2026-05-07）：**tenant 骨架 + Discovery 骨架完成。**下一步：**與客戶確認素材與頂級網域，選定主機商 → 銜接 **`TASKS`**「Day 2 雲端 staging 實機驗收」。
  - 執行：`docs/operations/PRODUCTION_RUNBOOK_PILOT_B_NEW_SITE_SCENERY_TRAVEL_MONGOLIA.md` 第 1~2 節
  - 產出：新站 staging 啟動條件

#### Next-Gen 對齊（兩案共用）

- [ ] **Next-Gen 試點 — Day 2 雲端 staging 實機驗收（兩案）** —— **【未完成】** **DoD：**Soulful：`https://staging.soulfulexpression.org/` 後台可登入 + 關鍵頁可開（Pilot A §2）；Scenery：`https://staging.scenery-travel.mn/`（若網域變更須先更新 registry）同等驗收。**阻塞：**須 Hostinger／選定主機商操作與 DNS／SSL；代理無法代登入第三方面板。
  - 證據鏈：`core/ENVIRONMENT_REGISTRY.md`（**URL／lifecycle SSOT**）、`SITES_INDEX.md`（須與 registry 對齊）、各案 `02_EXECUTION_PLAN.md` Day 2、`SITE_PROFILE.md`；Runbook §2 對齊框：`PRODUCTION_RUNBOOK_PILOT_*`；藍圖 §6：`docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
  - **自動漂移閘道**：`agency-os/scripts/verify-tenant-staging-sites-index-ssot.ps1`（比對 **`SITES_INDEX`**、含 HTTPS 之 **`sites/*/SITE_PROFILE`**、以及 `projects/*/02_EXECUTION_PLAN.md` 的 staging URL；`scripts/system-health-check.ps1` → **`verify-build-gates`**；PR `.github/workflows/tenant-staging-ssot.yml`）。
- [ ] `tenants/templates/` v2 —— **【未開始】** **進度：**依試點回填後再開；見 Pilot 條目。
  - 本項目標：試點 tenant 實填回饋後，再擴欄位與自動檢查（若有）

#### 龍蝦工廠（lobster-factory）

- [ ] `lobster-factory` A10-2 商業閉環實跑 —— **【未開始】**
  - 流程：新客戶建立 -> 驗收 -> production 觸發證據鏈
- [x] **【✅ 2026-06-03 完成】`lobster-factory` A7 全站自動建站補齊** — hosting bridge `provision-staging` route 上線；SSH→docker exec WP install；Trigger.dev http_json adapter 串接；E2E staging `green-valley-farm-28ba09` HTTP 200 驗證通過。commit 2af74c49。
  - 範圍：hosting adapter + provision/shell guardrails 端到端

#### EU VPS 維護

- [x] **【2026-06-16 前必做】SG certbot aware-wave.com 遷移 DNS-01（Cloudflare）** —— **【已完成 2026-05-25】** **背景**：SG VPS `aware-wave.com` cert（expiry 2026-07-16，52 天）使用 `authenticator = nginx`（HTTP-01），但 host nginx 從未綁 port 80（Docker 佔用）。cert 2026-04-17 首次取得，尚未歷經自動 renewal。dry-run 120s 逾時 → renewal 機制疑似已壞。certbot 約在 2026-06-16 開始 30-day-before 重試，若失敗導致 cert 過期 → HTTPS 中斷。**修復方法**：① `apt install python3-certbot-dns-cloudflare`；② 建 Cloudflare API token（`Zone:DNS:Edit` 權限，限 aware-wave.com zone）；③ `certbot certonly --dns-cloudflare --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini -d aware-wave.com -d www.aware-wave.com`；④ `certbot renew --dry-run` 驗證通過；⑤ WORKLOG。**注意**：api.aware-wave.com cert 同樣用 nginx authenticator，需一併確認是否能 HTTP-01（app/api subdomains 由 host nginx 443 服務，無 port 80 block，同樣風險）。**DoD**：`certbot renew --dry-run` 兩個 cert（aware-wave.com + api.aware-wave.com）都回 `The dry run was successful` + WORKLOG 留紀錄。

- [x] **【2026-06-01 檢查】EU VPS ClickHouse 升級後備份清理** —— **【未開始】** **背景**：2026-05-19 將 EU VPS ClickHouse 從 24.8.8 升級至 25.7.5（修正 `enable_json_type` UNKNOWN_SETTING 導致 trigger-webapp 記憶體爆炸問題）。升級前備份檔案存於 EU VPS `/root/backups/clickhouse-data-pre-upgrade-25.7.5-20260519-060453.tar.gz`（906MB）。**2026-06-01 執行**：SSH 進 EU VPS → 確認 trigger-webapp 過去兩週無 ClickHouse 錯誤（`grep ClickHouseError /var/log/smart-restart.log`）且記憶體維持正常水位 → 若穩定則刪除備份：`rm /root/backups/clickhouse-data-pre-upgrade-25.7.5-20260519-060453.tar.gz`。**DoD**：備份已刪除 + WORKLOG 留紀錄；若系統不穩定則保留並回報。

- [x] **【✅ 2026-05-28 關閉】Trigger.dev `TaskRunStatus` enum 不相容查詢來源追查** —— **【已完成 2026-05-28】** **背景**：EU reboot 後 trigger-postgres log 出現 `ERROR: invalid input value for enum "TaskRunStatus": "FAILED"` 和 `"QUEUED"`（v3-era 名稱，v4 已移除）。**現況**：① 頻率極低（過去 7 天僅 2 次，均在 2026-05-22 04:09-04:10 UTC 出現）② 查詢字串不在我們 repo（已 grep 全域）③ Trigger.dev 本身健康，無實際失敗，僅 log noise ④ 真實使用 status 只有 3 種（COMPLETED_SUCCESSFULLY / COMPLETED_WITH_ERRORS / TIMED_OUT）。**疑似來源**：Trigger.dev 內部 observability/admin endpoint 或 trigger-webapp 自身週期任務。**DoD**：① 連續觀察 7-14 天記錄 ERROR 頻率與時間分布；② 若 > 10 次/天則升級追查（找 pg_stat_statements / 開 trigger-webapp debug log）；③ 若維持 < 5 次/週則關閉並列為已知 upstream cosmetic issue。

#### 工具層 / 基礎建設 / 治理

- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**（操作者 2026-06-06 確認方向） — 終點：全部接 WooCommerce 賣貨（參考同事 jonjonesai 的 MEGA「Mass E-commerce Generator & Automator」Streamlit 工具：Research→Idea→Generate(多模型並行)→Select→Process(去背 removal.ai/Tinify)→Mockup(Printful)→Published(WooCommerce+Claude 文案+定價)）。
  - **Phase 1（現在）tarot 做到好用**：✅ 角色改造(貓取代人, buildCardPrompt 贏家結構, `e6a3a72a`) ✅ 中文自動翻英(haiku) ✅ friendly 錯誤+HTTP200 ✅ 「✨ 幫我想 prompt」按鈕(`suggest-prompt` route, Claude Haiku art-direction) ✅ batch skip-done(跳過已完成牌張, 加「重新生成全組」, `3c4fbcba`)。**待**：(a) 整副 78 張一致性實測微調（需操作者實際跑 batch 觀察）；(c) OpenAI gpt-image 待操作者加 billing；✅ (d-1) Trigger.dev 背景批次(`tarot-batch-generate` task + `/api/tools/tarot/batch`) ✅ (d-2) server quota(`TAROT_DAILY_LIMIT` env)。**⚠️ 操作者待辦**：① SG `.env` + EU Trigger.dev env 加 `BATCH_INTERNAL_SECRET=<隨機 32 字>` ② 重新 deploy `packages/workflows`（`/trigger-deploy`）。(d-3) upscale 827×1417 — FLUX megapixels schema 只有 "0.25"|"1"（無 "4"），Ideogram v4/Seedream 原生已超過目標；Real-ESRGAN upscaler 另 PR。
  - **Phase 2 MEGA**：多商品 POD 流水線（多生成器、去背、Printful mockup、設計庫重用、多用戶用量限制）。工程量 ≈ 現 tarot 的 15-20×，需分期。
  - **Phase 3 WooCommerce**：商品 publish + Claude 文案 + 定價/尺寸表（taiwanmerch.co 模式）。
  - **參考**：WORKLOG 2026-06-05/06 tarot entries；MEGA 截圖(操作者提供)。

- [ ] **【2026-05-30 開出】endpoint-alert.sh 自動化部署機制** —— **【未開始】** **背景**：`lobster-factory/infra/hetzner-phase1-core/scripts/endpoint-alert.sh`（SG 公網告警器）**無 repo→SG 自動部署路徑**，靠手動 scp 到 `/usr/local/bin/endpoint-alert.sh`。`sync-hetzner-slack-alert-webhooks.ps1` 只寫 env 不部署腳本本體。30 年風險：SG 重建 / `.bak` 被清 → 腳本回退舊版且無人知。**DoD**：(a) 新 `scripts/sync-hetzner-endpoint-alert-script.ps1`（仿 `sync-hetzner-endpoint-alert-heartbeat.ps1`：base64 ship + backup + `bash -n` verify + sha 比對 + 一輪 `systemctl start` 驗收）；(b) 接入既有 infra sync 流程；(c) repo SSOT sha == SG sha 的 drift 檢查可選接 system-health-check。**參考**：本日 WORKLOG `## 2026-05-30 endpoint-alert.sh debounce`（debounce 部署即走此手動路徑）。

- [x] **【✅ 2026-06-03 完成】`scripts/` vs `agency-os/scripts/` 20 檔 drift — wrapper 化收尾** — 9 個雙重實作全部轉為 wrapper；system-guard dedup 最佳化 merge 進 root；check-supabase-memory-monthly 翻轉 root↔ao。commit 9b85f24c。 **背景**：29 個同名腳本同時存在於 `scripts/`（CLAUDE.md:63 宣告為「全域腳本」正本）與 `agency-os/scripts/`，其中 **20 個內容已 drift**（含 AO 生命週期核心：`system-guard`(本次已雙修)、`ao-close`、`ao-resume`、`system-health-check`、`verify-build-gates`、`monthly-system-review`、`generate-integrated-status-report`、`check-three-way-sync`…）。既定架構意圖是 root `scripts/` 為正本、`agency-os/scripts/*` 應為 **thin wrapper** 轉呼叫正本（已對 `sync-enterprise-cursor-rules`、`check-three-way-sync` 套用；`system-health-check.ps1:143` 有 wrapper-rule 健康檢查），但遷移做到一半。**30 年風險**：改一份、另一份靜默跑舊邏輯（排程 `AgencyOS-SystemGuard-Daily` 跑的是 agency-os 版,非正本）。**DoD**：(a) 逐檔判定哪份領先、把獨特邏輯折回 root 正本；(b) `agency-os/scripts/<x>.ps1` 改為 thin wrapper；(c) 加 health-check gate 防再 drift；(d) 每支實跑驗證。**先決**：逐支走 R0（含 AO 生命週期關鍵腳本，高風險，需逐一實測 + rollback 計畫）。**參考**：本日 WORKLOG `## 2026-06-02 system-guard LAST_SYSTEM_STATUS churn 治本`。
- [x] **【2026-06-02 開出 → ✅ 2026-06-08 治本】Claude Code user-level sync 反覆 drift** —— **【誤診更正 + 自癒已上線】** **原誤診**：以為是「8 處 `hooks.* object→array`」格式打架。**2026-06-08 徹查推翻**：① object↔array 等價**早在 2026-05-14** 就被 `scripts/verify-settings-governed-keys.mjs` 的 `canonical()`/`isAlwaysArray()` 中和（實測 object-form hooks → verify exit 0；real content drift → exit 1）；② 6/2 backup `claude-userlevel-20260602-175358/settings.json.before` 的 hooks **本來就是 array**（ARR[1]/ARR[4]…），`mcp.json.before` 卻含 **22 個 MCP servers**（SSOT 強制 `{}`）→ **真正 drift 源是 runtime 重新寫滿 `~/.claude/mcp.json`**，不是 hooks。「object→array」標籤從 6/2 起就錯，並被 6/5/6/6 AO-CLOSE 報告**照抄**（cargo-cult）。**治本（commit 待填）**：`scripts/ao-close.ps1` 在 health gate 之前加「verify → 偵測 drift 才 `-Mode merge -NoBackup`」自癒區塊（冪等、平時零副作用）；mcp.json 被重填會自動還原 `{}`。**驗證**：見 WORKLOG 2026-06-08。**參考**：根因徹查記於 WORKLOG 2026-06-08「AO-CLOSE 復發三項徹查」。

- [x] **【2026-05-28 開出 — Phase Z 後續 Z4】scan-for-secrets known-suppressed baseline** —— **【完成 2026-06-12】** **修法**：`scripts/scan-local-config-for-secrets.ps1` 新增 `-KnownSuppressedBaseline`，以 value-free baseline `agency-os/config/scan-local-config-known-suppressed.json` 壓已治理 local WARN；`verify-build-gates.ps1` 預設掛 baseline。tracked secret 永遠 FAIL；baseline 外 local finding 在 baseline mode 直接 exit 2 阻斷。**驗證**：scanner baseline smoke PASS（14 known-suppressed hidden）；`scripts/test/scan-local-config-for-secrets.Tests.ps1` 6/6 PASS；`verify-build-gates.ps1` ALL PASSED。詳見 WORKLOG 2026-06-12「Phase Z4/Z5 收斂」。

- [x] **【2026-05-28 開出 — Phase Z 後續 Z5】AO-CLOSE health gate 補強（fetch-recency）** —— **【完成 2026-06-12】** **修法**：新增 `scripts/lib/fetch-recency-gate.ps1`，`scripts/system-health-check.ps1` gate 12e 消費 `agency-os/.agency-state/git-fetch-last.json`；success=false 或 >7d 為 WARN，>30d / unreadable helper 為 critical failure，不能被 `-AllowNonPerfectHealth` 的 score relaxation 繞過。**驗證**：`scripts/test/fetch-recency-gate.Tests.ps1` 6/6 PASS；`system-health-check.ps1` 100% (373/373)，報告含 `Git fetch ledger recency`; `verify-build-gates.ps1` ALL PASSED。詳見 WORKLOG 2026-06-12「Phase Z4/Z5 收斂」。

- [x] **【2026-05-28 開出 — Phase Z6】AO-CLOSE archive lift gate** —— **【完成 2026-05-28】** **根因**：5/28 18:46 AO-CLOSE archive 的「未完成」第 5 項「SG deploy 落後 3 commits」沒被 lift 到 TASKS.md `- [ ]`，跨機 AO-RESUME 抓不到 silent drop。**修法**：(a) 新 `scripts/verify-archive-tasks-lift.ps1`（bold-token + sliding-window 匹配 + 120-char anchored search + `<!-- archive-only: REASON -->` 逃生門）；(b) 接入 `scripts/system-health-check.ps1` 新 gate 12c（critical，不可旁路）；(c) `.claude/commands/ao-close.md` 新 Step 2.5 明示 lift rule；(d) 18:46 archive 補 archive-only 註記文檔化 SG deploy 已自動解決。**驗證**：18:46 archive 通過 lift gate（5 lifted + 3 archive-only annotated）；verify-build-gates ALL PASSED。詳見 WORKLOG `## 2026-05-28 Phase Z6`。

- [x] **【2026-05-24 操作者提問】AO-RESUME 讀 WORKLOG tail 50 行邏輯改為「上次 AO-RESUME → 本次」區段** —— **【完成 2026-05-28】** ao-resume.ps1 生成 worklog-excerpt.md（gap window by AO-CLOSE date），ao-resume.md Step 1 #5 改讀此 state file。 **背景**：操作者觀察 `tail -50` 是機械讀檔，遇上長 entry（如 2026-05-24 `/tomo` plan + 永久化 patterns）會被中間區塊吃掉，看不到本輪 session 真實內容。**討論方向**：改成讀「自上次 AO-RESUME 戳記後的所有 entry」或「最近 N 個 `### ` subsection」；候選 anchor = `.agency-state/ao-resume-last.txt` / `ao-close-last.txt` 戳記 + `## YYYY-MM-DD` heading 邊界。**待操作者明天決定**：要改 ao-resume.ps1 內 WORKLOG fetch 邏輯，或加 helper script `scripts/print-worklog-since-last-resume.ps1`，或調整 `.claude/commands/ao-resume.md` 指示 agent 改用 grep + offset Read。**DoD**：AO-RESUME 第 3 段「已完成」能完整列出本輪 session 全部 entry，無中段截斷。

#### Encoding 防護 — 一勞永逸延伸（CP950 audit 後續，2026-05-22 開出）

> 背景：2026-05-22 全專案 36 個 .ps1/.sh audit 完成，4 個 unprotected 已修。詳見 WORKLOG `### Audit history — CP950 / encoding trap class（2026-05-22）`。以下是 audit 延伸的小債 + 防護工具建議。

- [x] **`scripts/audit-cp950-traps.ps1`** —— **【已完成 2026-05-22】** A+B+C+D 一次到位（commit chain `0836d94→c038b38`）：tool + AUDIT_REGISTRY.md + `/audit-encoding` slash + AGENTS.md auto-trigger rule。詳見 WORKLOG.md `## 2026-05-22 CP950 audit toolchain`。2026-05-23 在 AO-RESUME 抓到此漂移，本次 commit 同時補打勾。

- [x] **【✅ 2026-05-26 `f933312` — confirmed deployed (`2311d6e` on SG)】Ops Inbox netdata CLEAR auto-resolve bug + fingerprint instability** —— **【未開始】** **背景**：B-Minimal auto-reboot 部署期間發現 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/netdata/route.ts:29-31` 對 CLEAR 訊號只 `return skipped`，不 actively resolve 既有 open incident。**且** `lib/ops-inbox/fingerprint.ts:32-33` 對 netdata 的 fingerprint 用 `host:alarm`，但 `alarm` 字串含 value（`= 1 status` vs `= 0 status`）→ CLEAR 與 WARNING 不同 fingerprint。**影響**：每次 auto-reboot 後 Ops Inbox 仍留 stale open incident，30 年 × 24+ 次/年 = 720+ stale incident 累積。**DoD**：(a) 修 fingerprint：netdata 改用 `alarm_id`（payload 已含此欄）或從 `alarm` 字串剝離 value 部分；(b) 修 webhook：CLEAR 訊號時主動查 fingerprint，若 open 則 set status=resolved + resolved_at + resolved_by='netdata-auto-resolve'；(c) 寫 migration backfill：用新 fingerprint 演算法重算所有 `ops_incidents.fingerprint`（or 加 `alarm_id` 欄位作為平行 lookup key）；(d) 新增 vitest 覆蓋 WARNING → CLEAR transition。**詳見**：`agency-os/docs/operations/AUDIT_REGISTRY.md` 對應 entry。**參考 commit**：本日 B-Minimal commit；P3 手動關 incident `2e66435f-4439-4b6a-a045-ec93e98fbe48` 的紀錄。

- [x] **【✅ 2026-05-26 `27d36dc`】遷移 `print-open-tasks.ps1` / `print-today-closeout-recap.ps1` 到統一 helper** — Pattern A dot-source + `Invoke-WithUtf8Console` on all git captures; audit exit 0 confirmed

- [x] **【✅ 2026-05-26 `27d36dc`】`scripts/generate-integrated-status-report.ps1:275-276` BOM 一致性** — `Set-Content -Encoding UTF8` → `WriteAllText(UTF8NoBOM)`; hex dump confirmed no `EF BB BF`

- [x] **【✅ 2026-05-26 `27d36dc`】`lobster-factory/infra/trigger/deploy-workflows.ps1:72,85` 補 `-Encoding UTF8`** — both `Get-Content` calls now use `-Encoding UTF8`; docker-info false-positive annotated

- [ ] 三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability） —— **【進行中】** **進度：**文件曾對齊；需 **每月 drift** 記錄與證據才算結案。
  - 範圍：`cursor-mcp-and-plugin-inventory.md`、`MCP_TOOL_ROUTING_SPEC.md`、`ROUTING_MATRIX.md`、`TOOLS_DELIVERY_TRACEABILITY.md`
  - DoD：術語與欄位一致（`task_type`/`risk_level`/`environment`/`approval_required`），並完成每月 drift 檢查記錄

#### Bug Hunt — 系統邏輯 audit 隊列（依 [`BUG_HUNT_PROTOCOL.md`](docs/operations/BUG_HUNT_PROTOCOL.md)，2026-05-22 開出）

> **重要差異**：本節是**系統級邏輯 audit**（state machine、race、permission、async flow），不是 CP950 那種 mechanical regex pattern audit。每個 class 需走完整 9-step Build Playbook，預計 4-8 hr / class。
>
> 優先公式（per protocol）：`blast_radius × likelihood × scope`
> - 一鍵架站：5 × 2 × 大（跨 tenant prod，likelihood 不確定因未驗）= Tier 3 月度排程
> - Auto-Repair：5 × 3 × 中（觸碰 prod deploy + secrets + Slack/GitHub callback）= Tier 3 月度排程，優先於一鍵架站

- [x] **一鍵架站系統 — 邏輯檢視 + critic review + 抓蟲** —— **【✅ 2026-05-26 完成】** **Tier 3 月度排程** → report: [lobster-factory-one-click-site-2026-05-26.md](reports/audit/lobster-factory-one-click-site-2026-05-26.md)（3C+11M+12m）

- [x] **一鍵架站 C1 — 修 dispatcher approval gate** — **【✅ 2026-05-26 9b27506】** `dispatch-action-run.ts` schema + PostgREST `or=` filter + dispatchRun guard
- [x] **一鍵架站 C2 — siteId idempotency** — **【✅ 2026-05-26 9b27506】** `app/api/build/runs/route.ts` siteId duplicate check → 409；TOCTOU partial unique index 為後續 DB migration
- [x] **一鍵架站 C3+M6+M8 — Zod schema tightening** — **【✅ 2026-05-26 9b27506】** SSRF guard (noSsrfUrl + IPv6 + numeric IP + localhost) + manifestPath containment fix + slug/wpPath regex; response body exfil removed
  - **範圍**（建議按此順序審）：
    1. `lobster-factory/packages/workflows/` — Trigger.dev tenant provisioning task chain（state machine + idempotency + retry）
    2. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/onboard/` — 4-step wizard（client info → dept selector → service provisioning → summary）
    3. `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts` + 對應 hosting adapters
    4. Provisioning side-effects：Sentry project、PostHog project、Supabase schema、n8n workflows、GitHub repo 建立 — 任一失敗的 rollback 路徑
    5. `tenant_integration_bindings` table + `orchestrate-tenant-provisioning` task
  - **動作**（依 [BUG_HUNT_PROTOCOL 9-step playbook](docs/operations/BUG_HUNT_PROTOCOL.md#build-playbook每個-audit-class-的永久化步驟)）：
    1. R0 [現況分析]：盤點上述 5 範圍的 data flow / control flow（畫一張 mermaid sequence diagram）
    2. 找關鍵 bug class：state machine 死鎖、partial provisioning rollback 缺失、idempotency 漏洞、外部 API 失敗的補償邏輯、secret leak in workflow context
    3. 對每個 class 跑 `critic` subagent deep review
    4. 真實 dogfood：用 `agency-os/tenants/templates/` 跑 staging onboarding，觀察每步副作用
    5. 寫 audit report 至 `agency-os/reports/audit/one-click-onboarding-YYYY-MM-DD.md`
    6. 發現 ≥1 mechanical pattern → 抽象成新 audit tool (`scripts/audit-<class>.ps1`)
  - **DoD**：
    - audit report 含 R0 4 動作完整紀錄
    - 🔴 FIXED / 🟢 CLEAN / 🟡 TRACKED 分類完成，寫入 [`AUDIT_REGISTRY.md`](docs/operations/AUDIT_REGISTRY.md) 新章節
    - Critical/Major 全修，Minor 至少 50% 修或正當 TRACK 理由
    - 若衍生新 audit class → 加 entry 進 protocol §Backlog
  - **觸發建議**：本月度排程；或下次真有 A10-2 商業閉環實跑前先 audit；或操作者擇期
  - **跨機**：repo 內，git pull 同步

- [x] **Auto-Repair 系統 — 邏輯檢視 + critic review + 抓蟲** —— **【已完成 audit；3 Critical patches 待 apply】** **Tier 3 月度排程，優先** **(2026-05-23 完成)**
  - **產出**：[`agency-os/reports/audit/auto-repair-2026-05-23.md`](reports/audit/auto-repair-2026-05-23.md)（37 findings + R0 4-action evidence + 3 ready-to-apply patches）+ [AUDIT_REGISTRY.md §Auto-Repair logic audit (2026-05-23)](docs/operations/AUDIT_REGISTRY.md#auto-repair-logic-audit-2026-05-23) + [`scripts/audit-tools/dogfood-auto-repair.ps1`](../scripts/audit-tools/dogfood-auto-repair.ps1) + AGENTS.md auto-trigger 新規則 + WORKLOG 2026-05-23 entry
  - **結論**：5 🔴 Critical（其中 3 個直接違反 Plan v3.2 SSOT） + 10 🟠 Major + 11 🟡 Minor + 8 🟢 Clean
  - **Phase 4 收官建議**：**Critical-tier 全部 apply 完成 2026-05-23**（C1-C5 全部 🔴 FIXED）。Phase 4 觀察期可正常 2026-06-19 收官；Major-tier 修正排入下一 iteration。

#### Auto-Repair audit follow-up — Critical patches **Errata 修正後**才可 apply（依 audit report §Top-3 Ready-to-Apply Fix Patches + §Patch Errata）

> **⚠️ 2026-05-23 self-critic 更新**：原 report 三個「ready-to-apply」patch 經 R0+R4 鐵律 critic 自審後發現含 **5 個 Major + 7 個 Minor design defects**（patch 本身的 bug，非 audit 目標系統的 bug）。**任一 patch apply 前必須先把 [Patch Errata](reports/audit/auto-repair-2026-05-23.md#patch-errata-self-critic-2026-05-23) 折回 patch 設計**。Iron rule violation 的代價 = patch as-shipped 含 ship bugs。
>
> **Errata 必修清單**（apply 前內化）：
> - **Patch 1 (C1)**：(EMaj-2) 加 `save`-before-deploy + (EMaj-2) APPS array 過濾 `IMAGE_MAP` keys + (EMin-7) 補 `DEPLOYED_COMMIT` 變數賦值
> - **Patch 2 (C2)**：(EMaj-1) `B64_BLOB` regex 改 env-flag-gated 或加 prefix anchor + (EMaj-4) `MAX_DEPTH = 64` (非 32)
> - **Patch 3 (C4)**：(EMaj-3) reframe — primary fix = column allow-list，secondary = default_viewer guard（`canModifyIncidentStatus` 含 viewer 不夠緊）

- [x] **【🔴 Critical C1 — sg-deploy.sh smoke-fail → 自動 rollback hook】** —— **【已 apply 2026-05-23】** **takes effect on next sg-deploy run**
  - **檔案**：[`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh:163-189`](../lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh#L163-L189) + [`auto-deploy-next-admin.sh:78-90`](../lobster-factory/infra/hetzner-phase1-core/scripts/auto-deploy-next-admin.sh#L78-L90) + [`DEPLOY_ROLLBACK_RUNBOOK.md:72`](docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md)
  - **根因**：Plan v3.2 §五 第 3 層承諾「任何一個不 OK → rollback-phase1.sh 自動還原」，實作只寫 `.smoke-warn` flag。grep 證實**沒任何 .sh/.yml 自動觸發 rollback-phase1.sh**
  - **動作**：apply [audit report §Patch 1](reports/audit/auto-repair-2026-05-23.md#patch-1-sg-deploysh-smoke-fail--rollback-c1-) — 加 `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=true` 預設 + 失敗自動 `rollback-phase1.sh restore <app>` + 把 `.deployed-commit` 寫入移到 smoke 後 + 更新 runbook 行 72 描述
  - **DoD**：①  staging dry-run 故意破壞 staging 端點，sg-deploy 自動 rollback 成功；② 寫 `.rollback-triggered` flag + Slack/Telegram 收到「🔴 AUTO-ROLLBACK FIRED」prefix；③ Production drill 在低流量時段跑 `AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false` + 故意壞 commit → 確認舊行為仍可（drill mode）；④ AUDIT_REGISTRY C1 升 🔴 FIXED 含 commit hash
  - **風險**：Medium-High（觸 prod deploy 腳本，需 staging 先驗）
  - **跨機**：repo 內，但部署要 SSH SG VPS

- [x] **【🔴 Critical C2 — redactSecrets.ts value-aware scrubber】** —— **【已 apply 2026-05-23】** **16 vitest cases pass; takes effect on next next-admin container rebuild**
  - **檔案**：[`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts`](../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-inbox/redactSecrets.ts) + 新檔 `__tests__/redactSecrets.test.ts`
  - **根因**：L26 只 test key 名稱，value 內嵌 secret（`sk_live_*`、`ghp_*`、OpenSSH key 區塊、JWT、base64 blob）直接落 `ops_incidents.raw_payload`
  - **動作**：apply [audit report §Patch 2](reports/audit/auto-repair-2026-05-23.md#patch-2-redactsecrets-value-aware-scrubber-c2-) — 加 9 個 SECRET_VALUE_PATTERNS + scrubValue(s) + MAX_STRING_LENGTH=4096 truncation + MAX_DEPTH=32（也修 C3 walk-depth）+ 7 個 vitest 測試
  - **DoD**：① `npm test` 新測試全綠（sg-deploy 內建 test gate 會跑）；② Dogfood：synthetic Sentry payload 內嵌 `sk_test_*` → SELECT raw FROM ops_incidents 確認 `[REDACTED:STRIPE_KEY]`；③ AUDIT_REGISTRY C2 升 🔴 FIXED
  - **風險**：Low-Medium（pure function，unit-test 完整）
  - **跨機**：repo 內，git pull 同步

- [x] **【🔴 Critical C4 — GET /api/ops/repairs role guard + audit_log 欄位 allow-list】** —— **【已 apply 2026-05-23】** **LIST_COLUMNS 排除 audit_log + viewer guard active on next container rebuild**
  - **檔案**：[`app/api/ops/repairs/route.ts:9-25`](../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/repairs/route.ts) + [`lib/repair-center/backup.ts:108-121`](../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/backup.ts)
  - **根因**：GET handler 沒 `canApproveCommand` guard + `select("*")` 回傳 `audit_log` (SSH stdout/stderr 6KB) 給 default viewer
  - **動作**：apply [audit report §Patch 3](reports/audit/auto-repair-2026-05-23.md#patch-3-get-repairs-role-guard--audit_log-column-allow-list-c4-) — 加 `canModifyIncidentStatus + source !== 'default_viewer'` guard + 改 `.select(LIST_COLUMNS)` 不含 `audit_log` + backup.ts 把 SSH stdout/stderr truncate 6KB → 500B
  - **DoD**：① 無 auth GET 回 403；② 有 claims GET 200 但 `runs[*]` 不含 `audit_log`；③ harness 加新 test case；④ AUDIT_REGISTRY C4 升 🔴 FIXED
  - **風險**：Low（additive auth）
  - **跨機**：repo 內，git pull 同步

- [x] **【🔴 Critical C3 — Webhook routes body-size cap 256KB】** —— **【已 apply 2026-05-23】** **architect 決策 256KB（Sentry typical event <100KB，2-3x headroom）+ readWebhookBody shared helper + req.text() refactor 也鋪好 M3 HMAC retrofit 路徑**
  - **檔案**：5 個 `app/api/webhooks/{sentry,uptime-kuma,netdata,grafana,posthog}/route.ts` + nginx webhook zone config
  - **根因**：`await req.json()` 無 cap，500MB POST → OOM kill `lobster-next-admin`
  - **動作**：① 確認最大合法 payload 大小（Sentry event ~100KB 上限）；② 各 route 早期 reject `> 256KB` 回 413；③ 切換 `req.text()` → JSON.parse（同時為未來 per-source HMAC retrofit 鋪路 — M3）；④ nginx `client_max_body_size 256k` 對 `/api/webhooks/*` location 防禦縱深
  - **DoD**：① 各 route 加 size check unit test；② nginx config 改動透過 [safe-infra-patch.sh](../lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh)；③ AUDIT_REGISTRY C3 升 🔴 FIXED
  - **風險**：Low-Medium（產品 owner 256KB 決策 + 同時應做 M3 raw-body capture refactor）
  - **跨機**：repo 內，git pull 同步

- [x] **【🔴 Critical C5 — needs_human_review 改為 pipeline gate（不只是 flag）】** —— **【已 apply 2026-05-23】** **architect 決策走 pipeline stop 派；critical incident state=triage_needed，新路由 POST /api/ops/repairs/[id]/confirm-critical 給 operator 二次確認用**
  - **檔案**：[`lib/repair-center/service.ts:104, 119-121`](../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts) + [`policy.ts:82-84`](../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/policy.ts)
  - **根因**：Plan §四「Critical severity 閘門」實作只設欄位，pipeline 不檢查；`severityRequiresHumanReview()` dead code 但 docstring 說「呼叫端使用此函式」 = 文件騙人
  - **動作**：① 決策方向（**推薦**：閘門化 — critical 需操作者額外 confirm 才跑 auto-repair pipeline）；② 在 `service.ts:119` 後加 `if (run.needs_human_review) { state='human_only'; return; }`；③ 用 `severityRequiresHumanReview()` 取代 inline `i.severity === 'critical'`；④ 更新 policy.ts docstring 反映正確契約
  - **DoD**：① critical Sentry incident 點 Slack Approve → 進 `human_only` 不自動 backup/issue；② operator 需走 escalate 或新「force-approve-critical」flow；③ AUDIT_REGISTRY C5 升 🔴 FIXED
  - **風險**：Low（純邏輯，但改變操作流程）— 需 owner 確認 plan §四 是否要改為 flag-only

- [x] **【🟠 Major M1/M5/M6 + 🟡 Minor m1/m7】** —— **【✅ 2026-05-26 完成】** — M1（state validation + terminal guard）、M5（backup webhook integrity gate）、M6（GHA forbidden-path-check）、m1（dead code delete）、m7（github_pr_url hostname check）全部 FIXED，133 tests pass，tsc clean。見 AUDIT_REGISTRY.md §🔴 FIXED 2026-05-26。
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】** —— **【未開始】** 剩餘 7 Major + 9 Minor — 排 Phase 4 觀察期後（2026-06-19+）

- **owner doc 參考**：[`docs/awarewave-auto-repair-plan-v3.2-final.md`](../docs/awarewave-auto-repair-plan-v3.2-final.md) + [`docs/awarewave-repair-center-app-architecture.md`](../docs/awarewave-repair-center-app-architecture.md) + [`docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md`](../docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md)
- **跨機**：所有檔案 repo 內，git pull 同步；harness 跑在筆電 / 桌機任一台都可

#### Auto-Repair — 操作者手動任務

- [x] **【可選 cosmetic — 非必要】安裝 Claude GitHub App（消除 health endpoint advisory）** —— **【關閉：不需要裝，2026-05-28 徹底查核確認】**
  - **2026-05-22 更新**：原為【操作者必做】，本日 Phase 4 B 實測證明 Auto-Repair 全鏈**不依賴**此 App（Issue #11 → workflow → Claude → branch push → PR #12 全綠，commit `1c17694` 由 `${{ github.token }}` 經 `gh pr create` 完成；commit `unsigned` 證明非 App 經手）。原 2026-05-21 WORKLOG「依賴 App、每次都會失敗」結論已在 §「調查」段追加 **【2026-05-22 修訂】** 修正。本條保留供未來真的想裝時使用，但**不再阻塞 Phase 4 收官**。
  - **背景（原文留存供參考）**：2026-05-21 查核確認 `awarewaveai-pei` 帳號下 0 個 GitHub App 安裝。health endpoint 目前回傳 `github_app_status: "unverified"` + advisory「Install it...」字串 — 此屬 **cosmetic** 訊息，不影響功能。
  - **三選一**：
    - **選項 A — 不裝**：0 動作，0 影響；health endpoint 永遠回 `unverified`（無感）
    - **選項 B — 設環境變數自我宣告**：SSH SG `echo "AUTO_REPAIR_GITHUB_APP_CONFIRMED=true" >> /root/lobster-phase1/.env && docker restart lobster-next-admin` → 狀態變 `confirmed_by_operator`（cosmetic 修正，未真裝 App）
    - **選項 C — 真的裝 App**：增加「在任意 issue/PR 用 @claude」便利性（目前用 workflow 替代足夠）
  - **執行流程（若選 C）**：
    - **步驟 1 — 安裝 App**：瀏覽器前往 `https://github.com/apps/claude` → Install → 選帳號 `awarewaveai-pei` → Repository access 選 `Only select repositories` → 勾選 `Work` → Install
    - **步驟 2 — 設 env var**：SSH 進 SG VPS (`ssh root@5.223.93.113`)，執行：
      ```bash
      echo "AUTO_REPAIR_GITHUB_APP_CONFIRMED=true" >> /root/lobster-phase1/.env
      docker restart lobster-next-admin
      ```
    - **步驟 3 — 驗收**：等 30 秒後執行：
      ```bash
      curl -s "http://localhost:3002/api/ops/repairs/health" \
        -H "x-ops-proxy-auth: $(grep OPS_PROXY_AUTH_TOKEN /root/lobster-phase1/.env | cut -d= -f2)" \
        -H "x-ops-claims-role: owner" | python3 -m json.tool | grep github_app_status
      ```
      期望值：`"github_app_status": "confirmed_by_operator"`
  - **DoD（任一即可結案）**：(a) 選 A → 在 WORKLOG 留「明示不裝、Phase 4 已通」決策證據；(b) 選 B/C → health endpoint 回傳 `confirmed_by_operator` + WORKLOG `AUTO_TASK_DONE`
  - **不再阻塞**：Phase 4 全鏈已於 2026-05-22 驗證收官（PR #12），本條從 P0 降為可選

#### 下一期計畫（未開始）

- [ ] **（Phase 4 觀察期）AwareWave 自動告警維修系統 v3.2 — Phase 4 觀察期進行中** —— **【進行中】** Phase 1+2+3 全部完成，production smoke 18 checks / 0 failed；Phase 4 每週巡檢已啟動（每週五 14:00），觀察期到期：2026-06-19。**✅ 外部缺口已收官（2026-05-22）**：Phase 4 B 驗證通過 — Issue #11 → workflow → Claude → branch `claude/issue-11-20260522-0509` → commit `1c17694` → **PR #12 自動建立** 全鏈綠（ANTHROPIC_API_KEY 補額後首次全鏈驗證）。詳見 WORKLOG 2026-05-22 §「Security pivot」。**DoD（Phase 4）**：Phase 4 第一週巡檢報告 + WORKLOG `AUTO_TASK_DONE` evidence。詳見 `docs/awarewave-auto-repair-plan-v3.2-final.md`。 —— **【進行中】** **2026-05-13 Codex implementation baseline 已完成**：`repair_runs` migration、`/ops/repairs` Queue/Runs/Safety/Policy UI、`/api/ops/repairs/*`、`/api/ops/repairs/health`、Slack interactive callback、Slack `approve_repair` 按鈕、GitHub auto-repair workflows、pre-repair backup gate（webhook 或 SG/EU SSH fallback）、CLAUDE auto-repair 紅線；`npm run build` PASS。**2026-05-13 上線基礎已補**：EU DB `repair_runs` migration 已以 `supabase_admin` 套用並 reload schema；SG `next-admin` 已部署 commit `41a773a`；production `/api/ops/repairs/health` 已回報 `table_ok=true`、`backup_configured=true`、`backup_mode=ssh`、`source_policies` 含 Sentry/Kuma/Grafana/PostHog/Netdata/manual。**2026-05-13 Web-control / Phase 3 安全驗收已補強**：`AUTO_REPAIR_GITHUB_TOKEN` 與 GitHub Secrets (`ANTHROPIC_API_KEY`、`SLACK_WEBHOOK_URL`) 已設定；SG deployed commit `87cfa76`；`/ops/repairs` 為操作者控制台，Repair API 由 nginx Basic Auth 邊界保護後注入可信 ops role；`/ops/inbox` 保持 incident SSOT，不合併成第二套維修 UI；production smoke `repair-center` 15 checks / 0 failed / 1 expected warning；backup-fail drill PASS（不建 GitHub Issue）；safe rollback snapshot/restore drill PASS；synthetic Sentry → backup → GitHub Issue → Claude Action analysis-only handoff PASS。**Slack secret gate 已完成**：`SLACK_SIGNING_SECRET` 已寫入 credentials / SG `.env` / GitHub Secret，`SLACK_BOT_TOKEN` 已在 SG + GitHub；production smoke 15 checks / 0 failed / 0 warning。**2026-05-13 最終實機驗收已完成**：signed Slack `approve_repair` production callback → Repair Run `f82411fe-d802-4b90-aef1-5d0c1fc46786` → backup PASS → GitHub Issue #2；Codex 接手完成 code-scoped PR #3 → Release Gate PASS → merge commit `460aa7d` → `sg-deploy.sh next-admin` → production smoke `repair-center` 17 checks / 0 failed / 0 warning，Repair Run 已標記 `resolved` / deploy `passed`。**2026-05-13 Claude auto-repair workflow 已解除 GitHub 端阻塞**：改傳 `${{ github.token }}`、允許 `Edit`、提高 turns、Actions repo permission 改為 `write` + `can_approve_pull_request_reviews=true`，Issue #5 已證明 Claude 可成功執行並推 `claude/...` branch；Claude-generated PR #8 已合併，production smoke 18 checks / 0 failed / 0 warning。**✅ ANTHROPIC_API_KEY 已補額（2026-05-21）**。**計畫書 owner doc**：`docs/awarewave-auto-repair-plan-v3.2-final.md`（v3.2 Final 2026-05-08，33 KB）。**目標**：多來源 ops signals（Sentry／Uptime Kuma／Netdata／Grafana／PostHog／CI／health／Cloudflare／Supabase／n8n／Trigger.dev／deploy drift／WordPress/MainWP）→ Ops Inbox → Repair Center → Slack 核准 → PR → Merge → `/sg-deploy`。**分類原則**：Sentry→auto-repair；Uptime/Grafana/PostHog→analysis-only；Netdata/資安/控制面→human-only；CI/流程類→先 triage。**4 層保護**：CI 綠勾／中文摘要／部署後 health-check 自動 rollback／Sentry 持續監控。
  - **2026-05-12 基線更新**：owner docs 已收斂為 `docs/awarewave-auto-repair-plan-v3.2-final.md` + `docs/awarewave-auto-repair-phase2-handoff.md` + `docs/awarewave-repair-center-app-architecture.md` + `docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md` + `agency-os/docs/operations/slack-notification-routing.md`。**路由基線**：`#infra-alerts` = raw infra、`#ops-incidents` = curated incident（含 PR 通知）、Telegram = 手機備援；舊 `#alerts-critical` / `#alerts-info` / `#github-prs` 已作廢／不建立。
  - **下次 AO-RESUME 必提醒（最新停點 2026-05-19）**：系統 Web 控制、安全 drills、Slack secret gate、真實 `approve_repair`、code-scoped PR/merge/deploy 均已跑通；production smoke 18 checks / 0 failed / 0 warning。剩餘缺口：(1) ✅ ANTHROPIC_API_KEY 已補額（2026-05-21）+ Phase 4 B 全鏈驗證通過（2026-05-22，Issue #11 / PR #12）；(2) ⚠️ Phase 4 每週巡檢觸發機制 2026-05-22 重建（原 2026-05-19 claim 為治理 drift — 詳見 WORKLOG 2026-05-22 §「Phase 4 forensic」）：~~Windows Task Scheduler `AwareWave-Phase4-WeeklyCheck`~~ **本機從未建立**；~~`scripts/phase4-weekly-check.ps1`~~ **CJK parse bug 從未跑成功**（2026-05-22 已修 BOM，保留為 fallback）；~~Claude CronCreate 7天 expiry 重註冊~~ **依賴人為續命已廢**。**現行設計**：Claude 雲端 routine `AgencyOS-RepairCenterPhase4Weekly`（每週五 14:00 TPE）負責執行 + 寫報告 + Telegram；watchdog 在 `scripts/system-health-check.ps1` §11（`phase4-LATEST.md` mtime > 8天 → WARN）。SSOT：`agency-os/automation/claude-routines/phase4-weekly.md`。**✅ Routine 已建立（2026-05-22T08:47:42Z via RemoteTrigger CLI，不需 web UI）**：`AgencyOS-RepairCenterPhase4Weekly` `trig_01JyFw78ZkgwQzpyXXaX1F2K`，每週五 14:00 TPE，next run 2026-05-29。SSOT：`agency-os/automation/claude-routines/phase4-weekly.md`。(3) 只有使用者明確授權時，才做壞 commit auto-rollback destructive drill；否則維持目前 safe snapshot/restore rollback PASS 證據。
  - **Phase 1（你做，30 分鐘）**：確認既有 `#infra-alerts` / `#ops-incidents`（不新增 `#github-prs`，PR 通知路由至 `#ops-incidents`）；建 Slack App（Webhook 指向 `#ops-incidents`）；GitHub repo 設 4 個 Secrets（`ANTHROPIC_API_KEY`／`SLACK_WEBHOOK_URL`／`SLACK_BOT_TOKEN`／`SLACK_SIGNING_SECRET`）；**不要**把 Telegram token 放進 GitHub Secrets；驗證 `/api/ops/inbox/health` 顯示 `telegram_notify_enabled=true`；啟用 main branch protection。
  - **Phase 2（Claude Code 做，2-3 小時）**：擴充 `app/api/webhooks/sentry/route.ts`（fingerprint dedup + Slack Block Kit）；新增 `webhooks/uptime-kuma`／`webhooks/netdata` route；新增 `app/api/internal/commands/slack/route.ts`（Approve → 備份 → GitHub Issue）；新增 `.github/workflows/auto-repair-claude.yml` + `auto-repair-pr-notify.yml`；補強 `sg-deploy.sh` health-check + Slack 通知；CLAUDE.md 追加自動維修紅線；**新增 app 路由骨架**：`app.aware-wave.com/ops/repairs` 作為 Repair Center orchestration layer，不可另建第二套 inbox / approval / deploy UI。
  - **Phase 3（驗收 1 小時）**：22 步端到端（Sentry test error → Slack → Approve → 備份 → Issue → Claude PR → CI → Merge → `/sg-deploy` → health-check → Slack 完成）+ Phase 3-B（rollback drill）+ Phase 3-C（備份失敗阻擋驗收）。
  - **Phase 4（觀察期 30 天）✅ 已啟動 2026-05-19**：~~每週日~~ **每週五 14:00**（使用者指定）5 分鐘巡檢（重複修同一 bug？`needs-human-review` PR？BACKUP_RESTORE_PROOF 最新一筆超過 7 天？）；`scripts/phase4-weekly-check.ps1` + Windows Task Scheduler（`AwareWave-Phase4-WeeklyCheck`, Ready）+ Telegram 通知；`/phase4-check` slash command 可手動觸發兼重設 CronCreate 7 天計時器；觀察期到期：2026-06-19。每月初 10 分鐘指標複盤（Phase 5 前）。
  - **Phase 5（多客戶擴展 + Dashboard）**：Phase 4 完成後啟動，計畫書第十五節有完整任務清單。
  - **不衝突宣告**：計畫書 §二明列「不可更動」既有架構（lobster-* 容器、GitHub Actions 4 個 workflow、CLAUDE.md、`system-health-check`、`rollback-phase1.sh`、`backup-eu-stack.sh`、Sentry／Kuma／Netdata、`sg-deploy.sh`、ops console）；不採用 n8n Slack 中間層／自動 deploy on merge。Telegram 保留為手機備援通知 + command plane，與本計畫並行但不擔任主 incident bus。
  - **DoD（總）**：(1) Phase 1+2+3 全綠（22 步端到端 PASS）；(2) `BACKUP_RESTORE_PROOF` 含一筆 auto-repair 觸發的 backup ID；(3) Phase 4 第一週巡檢報告；(4) WORKLOG 留 `AUTO_TASK_DONE` evidence。
  - **下一步建議**：先讀計畫書全文（`Read d:/Work/docs/awarewave-auto-repair-plan-v3.2-final.md`）+ handoff brief（`Read d:/Work/docs/awarewave-auto-repair-phase2-handoff.md`）+ AI 實作閱讀簡報（`Read d:/Work/docs/BRIEF_AWAREWAVE_REPAIR_CENTER_AI.md`），再開始 Phase 1；交代理時三份一起附上。

- [x] **（2026-05-14 提醒）檢討自動修復系統觸發分類：為什麼只有 Sentry 是全自動，其他來源都要人工核准？** —— **【未開始】** 目前分類原則：Sentry→auto-repair；Uptime Kuma/Grafana/PostHog→analysis-only；Netdata/資安/控制面→human-only；CI/流程類→先 triage。**待釐清問題：**(1) 每個來源的 auto-repair 門檻是什麼（信號可信度？影響範圍？可逆性？）；(2) 哪些來源已具備足夠信號品質可升級為全自動（例如 Uptime Kuma down + 已知 pattern）；(3) 哪些應永遠維持人工核准（資安、DB migration、金流）；(4) 現行 Slack `approve_repair` 流程是否太重——能否有「輕量核准」（一鍵）vs「完整核准」（需備份 + review）兩種模式？**DoD：** 輸出一份更新的分類決策表，更新至計畫書 `docs/awarewave-auto-repair-plan-v3.2-final.md` §分類原則，並同步 `source_policies` 設定。

## Next — 已完成歷程（查詢用）

### 2026-05-30 — Phase Z7 + sync-allow + Phase4Weekly + 雙機 packets 收尾

- [x] **Phase Z7** — SOP-only AO-CLOSE 完整收尾。Z7-A：`scripts/ao-close.ps1` line 163-184 preflight auto-detect `^\[claude\] (checkpoint:|chore: AO-CLOSE)` ahead-commits 自動 bypass `-AllowAheadCommits`（commit d9ee134，Phase C 內含）。Z7-B：`.claude/commands/ao-close.md` 新增 Step 2.6「Trust ao-close.ps1 internal verify chain」明文禁止在 ao-close.ps1 PASS 後重跑 verify-build-gates / system-health-check / verify-archive-tasks-lift / ensure-claude-junction（本次 commit）。下次 AO-CLOSE 預期 1 ALLOW + 1 health-check。原 packet: handoffs/2026-05-28-2253-tomo-225340.md。
- [x] **筆電同步 PowerShell allow 萬用字元** — `~/.claude/settings.json` allow[216/217/218] = `Bash(powershell *)` / `Bash(powershell.exe *)` / `Bash(pwsh *)`，repo `.claude/settings.json` + `mcp/claude-userlevel/settings.template.json` 三檔對齊（Phase C0 完成）。注：wildcards 位置在尾端而非 packet 原意的 index 0-2，但 allow 是 set 非序列敏感，功能等價。原 packet: handoffs/2026-05-29-1139-sync-userlevel-allow.md。
- [x] **筆電 .claude junction（bootstrap-mcp-machine）** — Phase Z/C 系列已實質解決：`agency-os/.agency-state/junction-last.json` verdict=ok（無 drift），git pull 後新命令/agents 透過 `.claude` mirror 自動同步，無須再跑 `bootstrap-mcp-machine.ps1`。
- [x] **第二台機器 exit-2 hook 升級同步** — git pull + `sync-claude-userlevel.ps1 -Mode merge` 流程已對齊；hook 透過 settings.json overwriteKey 自動傳播；hook 機械閘已驗證 fire（本 session git-log-injector exit-2 觸發證實）。原 packet: handoffs/2026-05-27-1521-git-pull-sync-claude-userlevel.md。
- [x] **【2026-05-29 驗收】Phase4Weekly 首次 scheduled fire** — 實質完成（雖逾期 ~24h）。根因：routine 2026-05-29 06:03 UTC 收 `auto_disabled_repo_access`（與 2026-05-25 WeeklyReview 同故障模式）。今日修法：`RemoteTrigger update enabled=true` 復活（trig_01JyFw78ZkgwQzpyXXaX1F2K，next_run_at=2026-06-05T06:00:10Z）+ 手動跑 `phase4-weekly-check.ps1` PASS（phase4-LATEST.md 日期 = 2026-05-30 13:20 CST，三 Check 全 PASS）。下次 scheduled fire = 2026-06-05 06:00 UTC，token 底層有效性屆時確認（已開新 6/5 task）。
- [x] **明天 14:00 TPE 後 git pull 看 phase4-LATEST.md** — 同上條，handoff packet 內過期聲稱（false positive 可忽略 / 舊邏輯）已同 5/30 13:20 commit 修。原 packet: handoffs/2026-05-28-1152-git-pull-phase4.md。

### 2026-05-20 — Repair Center 缺口修復全批次結案

- [x] **Repair Center 缺口修復 — 全批次完成（2026-05-20）** —— 批次 1（middleware 精確化 + OIDC 權限移除）、批次 2（vitest 35/35 pass）、批次 3（GitHub webhook pr_ready→deploy_pending，Webhook ID 627222921）全數 commit + deploy。詳見 WORKLOG.md §2026-05-20。

### 2026-05-15 ~ 2026-05-20 — 雙機環境設定結案（筆電 + AO-SYNC）

- [x] （AO-RESUME 提醒）開工後閱讀 Telegram 內容 ✅
- [x] （桌機/筆電）Claude user-level 對齊腳本 ✅（sync-claude-userlevel.ps1 -Mode merge + bypassPermissions 雙機對齊）
- [x] （筆電必做）AO-SYNC 環境變數設定 ✅（AO_SYNC_ROOT + AO_SYNC_SECRETS_ROOT 設至 G:\ 路徑）
- [x] （筆電必做）確認 Cryptomator vault 掛載路徑 ✅（改用 G:\ 直接路徑，不依賴 Cryptomator 掛載狀態）

### 2026-05-13 — Next-Gen M3 控制台輸出映射（結案）

- [x] （Next-Gen 對齊）M3 控制台輸出映射到「20 部門」責任矩陣與模板欄位 — 完成 2026-05-13。交付：department-summary API + DepartmentCoveragePanel UI + ClientCard badge + generate-customer-delivery-status.ps1 + DEPARTMENT_COVERAGE_MATRIX.md 四份更新。

### 2026-05-13 — Enterprise 工具層 Phase 1 正式串接 + Phase 1 P1→P7 建置順序（結案）

- [x] **Enterprise 工具層 Phase 1 正式串接**
  - **證據**：`WORKLOG.md §2026-05-13「Enterprise 工具層 Phase 1 — 端到端串接結案驗收」`
  - **五層**：Secrets（2026-05-01）/ Sentry（2026-04-12）/ PostHog（2026-05-01）/ Cloudflare（2026-05-01）/ Slack（2026-05-01）
  - **端到端路徑**：Command Plane Phase 2c smoke 15/15 PASS（2026-05-08）覆蓋全五層（Telegram→Cloudflare→JWT→Supabase→Slack）
  - **追溯總表**：`TOOLS_DELIVERY_TRACEABILITY.md` P1–P7 全部更新為 🟢
- [x] **（工具建置）Phase 1 建議順序（P1 -> P7）**
  - **P6（Next.js 控制台 v1）**：ops-console-smoke 9/9 PASS（2026-05-07）；`reports/status/ops-console-smoke-LATEST.json`
  - **Enterprise 串接**：見上條，2026-05-13 結案
  - **P7（Command Plane）**：Phase 2c smoke 15/15 PASS（2026-05-08）

### 2026-05-13 — WordPress 外掛堆疊自動安裝 上線（結案）

- [x] **WordPress 外掛堆疊自動安裝（app.aware-wave.com Onboard Wizard）**
  - **證據**：SG WP-CLI 2.11.0 驗證通過（`sg-deploy.sh wordpress` 重建）；Trigger.dev Version **`20260513.2`** 已 deploy（10 tasks live on EU）；E2E dry-run smoke：task 接收 payload → 回傳 `installed: [{slug, version: 'dry_run'}]` → 無 DB write（設計正確）
  - **主要修正**：`trigger.config.ts` 加 `external: ["ssh2", "cpu-features"]`（native addon esbuild 相容）+ `LOBSTER_EXECUTE_MANIFEST_STEPS` / `LOBSTER_WP_SSH_PRIVATE_KEY` 寫入 `syncEnvVars`；`lobster-trigger-deploy.ps1` 修 PS5.1 `??` compat + 加選填 var 注入
  - **Vault 金鑰**：`TRIGGER_DEPLOY_PAT`、`POSTHOG_API_KEY`、`OPS_INBOX_INGEST_TOKEN` 已入庫；`LOBSTER_EXECUTE_MANIFEST_STEPS=true` + `LOBSTER_WP_SSH_PRIVATE_KEY` 留待首個真實客戶上線時設定
  - **待補**：`package_install_runs` DB 寫入驗證——DB 現無真實 client 記錄（FK 約束設計正確），首客上線後即可全鏈驗收

### 2026-05-08/09 — SG drift cron + strategy-review demo + Command Plane Phase 2 + MainWP EU（結案）

- [x] **（2026-05-08 09:00 TPE 之後驗證）SG drift cron 第一次自動 firing** —— **【AUTO_TASK_DONE_APPLIED 2026-05-08T09:xx TPE】** log: `[2026-05-08T01:00:03Z] alert sent: HTTP 200, behind=7`；cron daemon active/enabled；結案條件已達（drift>0 + HTTP 2xx）。
- [x] **（明日提醒）`/strategy-review` skill demo 實測** —— **【完成 2026-05-09】** **明日（2026-05-08）試跑：**用今天 Hermes Agent 的問題（要不要採用、值不值得整合）作為第一個 strategy-review 案例，跑 **Mode 1（four-role-collaboration）**驗證並行 subagent 真的有獨立 context、不會互相污染。**操作：**在 Claude Code 輸入 `/strategy-review 要不要採用 Hermes Agent` 或自然語觸發。**DoD：**(1) 4 個 `general-purpose` subagent 並行返回 4 份結構化 finding／bias_check／must_investigate；(2) 產出 `agency-os/reports/strategy-review/2026-05-08-adopt-hermes-agent.md`；(3) `INDEX.md` 自動補一行；(4) 確認 4 份報告**真的不同**（沒有 context contamination — 例：相同 finding 用相同 framing 出現在 2+ 份 = 失敗，要回頭調 mode 檔案）。**背景：**`.claude/skills/strategy-review/SKILL.md`、`.claude/skills/strategy-review/README.md` §Testing the skill；範本 `templates/decision-record.md`。
- [x] **Command Plane Phase 2** —— **【完成 2026-05-08】** Phase 1 已 production live（`@awarewave_ops_bot` 5 個 low-risk 指令 + 8/8 smoke + 端到端驗收，2026-05-07）。Phase 2 解鎖「手機可執行任務」，是 vs Slack 的真正差異點。**owner doc**：`agency-os/docs/operations/COMMAND_PLANE_RUNBOOK.md` §13。
  - **2a — Kill switch 從手機控** —— **【已完成 2026-05-08】** ✅ commit `a329335`（feat）+ `e20386e`（smoke 動態 count）。已 deploy 到 SG `lobster-next-admin`（Up healthy），smoke **9/9 PASSED** 含 `emergency_stop_via_telegram - cmd=completed mode=emergency_stop`。Telegram setMyCommands 已含 8 個指令。**驗收路徑**：手機 `/emergency_stop` → `system_modes.mode='emergency_stop'` ✅；後續 `/status` → `blocked_by_killswitch` ✅；SQL editor 改 mode='normal' 後恢復 ✅。`/normal_mode` 從 Telegram 永遠擋 ✅。
  - **2b — Trigger.dev medium-risk dispatch** —— **【已完成 2026-05-08】** ✅ commit `8b8d54e`. Phase 2b ships **lightweight inline pattern**（非完整 Trigger.dev queue）：`/trigger_staging_workflow <task>` 直接 HTTP POST 到 Trigger.dev REST API（allowlist 目前只有 `ao-infrastructure-check`），handler 立即回 run_id；`/replay_dead_letter <uuid>` 為**診斷模式**（lookup `error_events` 回傳細節，full automatic re-execution 排到 Phase 3 — 需要先處理 idempotency rewrite + side-effect rollback hooks）。SG `.env` 加入 `TRIGGER_API_URL` + `TRIGGER_ACCESS_TOKEN`，docker-compose 已 wire。Smoke **11/11 PASSED** 含 `trigger_workflow_allowlist` + `replay_dead_letter_validation`。Telegram setMyCommands 含 10 個指令。手機驗收：傳 `/trigger_staging_workflow ao-infrastructure-check` 應拿到 run_id；傳 `/trigger_staging_workflow no-such-task` 拿到 allowlist 拒絕訊息。
  - **2c — ops console approval / system_modes UI** —— **【已完成 2026-05-08】** ✅ commit `6b7b525`（UI pages）+ `c09a529`（RLS fix）+ smoke 15/15（`approvals_list_endpoint_shape` / `system_modes_get_shape` / `approve_route_wired` all OK）。`/ops/approvals` 列出 pending high/critical command_requests；`/ops/system-modes` 顯示 current mode；兩個 API GET 端點以 service-role client 繞過 RLS，均回 200。手動解鎖路徑驗證：SQL editor `update system_modes set mode='normal'` PASS（Phase 2c.1 system_modes UI 不再是阻塞項）。
- [x] **MainWP EU 計畫啟動核對** —— **【完成 2026-05-09】** Dashboard 已部署於 EU (204.168.175.41)，`mainwp.aware-wave.com`。Docker Compose (WordPress 6.7-apache + MySQL 8.0)、nginx vhost + rate-limit、fail2ban WordPress jail、WP-CLI 安裝、MainWP Dashboard 6.0.12 激活、host crontab WP-Cron、Uptime Kuma Monitor #22。**待操作者**：(1) Cloudflare DNS A record `mainwp.aware-wave.com → 204.168.175.41`；(2) `certbot --expand` 加域名；(3) Dashboard 後台初始化精靈；(4) 接入第一個客戶（§22 Child 流程）。計畫文件：`D:\Work\docs\wordpress_mainwp_plan.md` §25 部署紀錄。

### 2026-05-07 — Next.js 控制台 v1（P7）DoD 結案

- [x] **（工具建置）Next.js 控制台 v1（Internal Ops）**
  - **證據**：`WORKLOG.md` §「P7 Next.js 控制台 v1 — DoD 完整驗收（ops-console-smoke ALL PASSED）」含 `AUTO_TASK_DONE` 與 9/9 checks。
  - **機械報告**：`agency-os/reports/status/ops-console-smoke-LATEST.json`（`result=passed`；含 tenant 回顯、viewer 403、admin 寫入、audit 對應）。
  - **收斂說明**：本項結案不代表總賬結案；`Phase 1 建議順序（P1 -> P7）` 與 `Enterprise 工具層 Phase 1 正式串接` 仍依其各自 DoD 保持開放。

### 2026-05-07 — Trigger workflows EU deploy（結案）

- [x] **Trigger workflows 完整 deploy**
  - **證據**：`WORKLOG.md` §「Trigger workflows deploy to EU — 完成」（version **`20260507.3`**，dashboard deployment 連結同該節）。
  - **金鑰對照**：Project **`tr_prod_*`** → 後端 **`TRIGGER_SECRET_KEY`**（觸發任務）；Account **`tr_pat_*`** → **`TRIGGER_ACCESS_TOKEN`**（`deploy`／CI／無頭機）；路徑 **`{APP_ORIGIN}/account/tokens`**。見 **`lobster-factory/infra/trigger/README.md`** §7、blockquote §7a。

### 2026-05-07 — Next-Gen v1 試點：Day 2 書面子交付（registry／URL）

- [x] **啟動 Next-Gen 升級藍圖 v1（M1→M3）— M1 試點 + Day 2「書面 staging」階段（2026-05-07）**
  - **試點：**Soulful Expression（既有站接手）+ Scenery Travel Mongolia（新站建置）；tenant 骨架先前已建立。
  - **本輪交付：**兩站 **canonical staging URL** 寫入各 tenant **`core/ENVIRONMENT_REGISTRY.md`**、`sites/*/SITE_PROFILE.md`、專案 **`02_EXECUTION_PLAN.md` Day 2**；**`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md` §6** 補記現況（🟡＝書面就緒，實機待 Runbook）。
  - **未宣稱完成：**雲端 staging **實機**（DNS／SSL／WP 可登入）——見 **`### 未完成`**「**Next-Gen 試點 — Day 2 雲端 staging 實機驗收**」。
  - **SSOT 收斂（避免矛盾）：**`SITES_INDEX`、兩份 **Pilot Runbook §2（Repo 對齊框）**、`RELEASE_GATES_CHECKLIST`、`CROSS_BORDER_GOVERNANCE`、`BACKUP_RESTORE_PROOF`、`ACCESS_REGISTER`、`30_YEAR_AI_CODING_EXEC_CHARTER` §4.1／§4.3、`TASKS` 證據鏈——均以 **`core/ENVIRONMENT_REGISTRY.md`** 為 URL／lifecycle 先決；**未新增**獨立長文檔。
- [x] **Staging URL SSOT 漂移閘道擴充（`SITES_INDEX` + `SITE_PROFILE` + `02_EXECUTION_PLAN`）**
  - **機械檢查**：`agency-os/scripts/verify-tenant-staging-sites-index-ssot.ps1` 單一腳本擴充；本機與 CI 共用，不開平行實作。
  - **閘道接入**：`scripts/system-health-check.ps1` Critical Gate + `.github/workflows/tenant-staging-ssot.yml`（PR 路徑觸發）；
  - **驗證**：`system-health-check` 100% PASS（354/354）。

### 2026-05-08 — Vault 憑證補齊：4 個原始待補項全數完成

- [x] **（AO-RESUME 提醒）補齊剩餘 Vault 憑證**
  - **OPS_INBOX_INGEST_TOKEN**（2026-05-07）：從 SG `/root/lobster-phase1/.env` 讀取，已入 vault。
  - **SUPABASE_SOULFULEXPRESSION_SERVICE_ROLE_KEY**（2026-05-07）：Supabase cloud `mffjqjiidbeibilmxzef`，7 keys 已入 vault。
  - **SUPABASE_A_SERVICE_ROLE_KEY** + **SUPABASE_AWAREWAVE_URL** + **SUPABASE_A_URL**（2026-05-08）：alias 從 vault 複製。
  - **XAI_API_KEY**（2026-05-08）：`xai-X5nRy…XrRg`，已入 vault + Windows env。
  - **最終狀態**：`sync-cursor-mcp-user-env` → 26 vars synced；剩 32 base-URL / API 設定（非原始待補項，見 sync 輸出清單，可按需補齊）。

### 2026-05-07 — phase1 WordPress（SG）PostHog MU 完成部署

- [x] **phase1 WordPress（SG）PostHog MU**
  - **交付**：`posthog.php` MU 已部署至 SG；`curl -sL http://aware-wave.com/ | grep "posthog.init"` 驗證回傳 key `phc_vKX…`；`site_name`, `site_domain`, `app_surface` 均正確。
  - **根本修正**：Dockerfile 改用 `CMD` 入口取代 `docker-entrypoint.d/`（nginx 慣例問題）；`mu-plugins/` 在 image build 時正確植入。
  - **Commit**: `f9e666b`（push origin/main）

### 2026-05-07 — Git `main` 與 `origin/main` 對齊（滯後文案收口）

- [x] **Git：`main` 未推送 commits → `git push origin main`（隊列滯後敘述結案）**
  - **驗證（本機）：**`git fetch` 後 **`git rev-list --left-right --count origin/main...HEAD`** 為 **`0  0`**（ahead／behind 皆 0）；先前累積 commits 已反映在遠端。
  - **備註：**若之後又出現 ahead，仍依 **`REMOTE_WORKSTATION_STARTUP.md` §2.5** 於 **`AO-CLOSE`** 閘道後推送。

### 2026-05-03 — 龍蝦 SSOT 連結收口

- [x] **龍蝦 SSOT 四檔 + 合併版 — 全域索引／腳本連結替換（`_v1.3`／`_v1.4`／`_v2`）** — 根／`lobster-factory` README、AO 導覽、`generate-integrated-status-report.ps1`、`validate-doc-integrity.mjs`、`DEPLOYMENT_CHECKLIST_v1.4` §0、`OPERATOR_RUNBOOK`；**刻意不改**：`WORKLOG`、舊 `memory/daily`、`.claude/sessions`。**日常入口**：`LOBSTER_FACTORY_CHECKLIST.md`（v3）；細項勾選：`MASTER_CHECKLIST_v2.md`。

### 2026-05-01 — 自 Next 隊列移入（整理版面）

- [x] **Supabase Postgres MCP（AwareWave）／EU SSH tunnel — 穩定 smoke**
  - `npm run smoke:supabase-tunnel`：PASS Postgres 127.0.0.1:5432 / PASS Studio :3000 / PASS Kong :8000
- [x] **n8n MCP（Cursor）：HTTP 運輸改 stdio 橋接並驗證（抖動／No tools）**
  - 證據：`scripts/run-n8n-mcp.mjs`、`mcp/registry.template.json`、`docs/operations/n8n-self-hosted-mcp-troubleshooting.md`
- [x] **建立全域月檢 `AgencyOS-MonthlySystemReview` 與 tenant monthly 排程基線**
- [x] **（Ops Inbox Path B）生產收斂完成 — 2026-05-01 實機驗證**
- [x] **（工具建置）安裝 Grok CLI（筆電 / Codex）**
- [x] Slack `#infra-alerts` 歷史訊息批次清理 — 2026-05-01（公司桌機）
- [x] Netdata Centralized Cloud Notifications — 2026-05-01（公司桌機）
- [x] ClickHouse TTL（EU server）— 2026-05-01
- [x] 筆電回家後重載 MCP 環境（`user-env.ps1` + `sync-mcp-config.ps1`）
- [x] **Trigger.dev 自託管上線（Hetzner compose）** — 營運定案 2026-04-20；正本 `lobster-factory/infra/trigger/README.md`
- [x] （工具建置）Sentry 觀測接入（含 `SENTRY_ALERT_POLICY.md`、gate 契約）
- [x] （工具建置）PostHog 事件基線
- [x] （工具建置）Cloudflare 邊界保護
- [x] （工具建置）Secrets 治理升級（含 n8n MCP key 輪替證據與 `AUTO_TASK_DONE`）

### 更早 — 查詢用
- [x] **（工具建置）Hetzner 自託管 n8n（staging）**
  - DoD：`client_onboarding` 輕量流程於 **staging** Webhook 端到端成功；證據見 `WORKLOG.md` **`## 2026-04-10`** →「n8n staging client_onboarding E2E」（`workflow_id` `LUEO8tirSCFaVGjH`、`execution_id` `1`、`route_summary` `POST /webhook/client-onboarding/staging-ping`）。
  - 正本：`docs/operations/n8n-staging-client-onboarding-e2e.md`
- [x] 建立 WordPress 客戶交付「雙模式 SOP」
  - 內容：既有站接手 + 新站從零
  - 原則：雲端 staging 優先，避免跨機重工
  - 檔案：`docs/operations/WORDPRESS_CLIENT_DELIVERY_MODELS.md`
- [x] **既有站接手 Day 1（Soulful Expression）前置實填完成**
  - 已建台帳：`tenants/company-soulful-expression/`（`PROFILE.md`、`SITES_INDEX.md`、`core/ENVIRONMENT_REGISTRY.md`、therapy QA、專案 brief）
  - 待補欄位：標記 `待補`，待權限盤點後回填
- [x] **Phase 1 模板硬化（Core）**
  - 新增：`tenants/templates/core/ENVIRONMENT_REGISTRY.md`、`RELEASE_GATES_CHECKLIST.md`、`BACKUP_RESTORE_PROOF.md`
  - 升級：`ACCESS_REGISTER.md`、`SITES_INDEX.md`、`OPERATIONS_SCHEDULE.json`、`NEW_TENANT_ONBOARDING_SOP.md`
- [x] **Phase 1.5 產業 Overlay（首批）**
  - 新增：`tenants/templates/industry/travel/*`、`tenants/templates/industry/therapy/*`
  - 接入：`tenants/README.md`、`NEW_TENANT_ONBOARDING_SOP.md`、`NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
- [x] **（2026-03-30）整理 `docs/spec/raw/` 四份原文**
  - 範圍：V3 / Spec v1 / ENTERPRISE / CURSOR_PACK
  - 新增：`docs/spec/raw/README-four-sources-maintenance.md`（維護索引 + 大段錨點 + SSOT 對照）
  - 連動：各檔首段加維護提示，並回連 `company-os-four-sources-integration.md`、`docs/spec/README.md`
- [x] 定義 WordPress 客製系統開發準則（plugin/mu-plugin/資料表策略）
- [x] 建立 n8n 工作流分層（共用流程 vs 客戶專屬流程）
- [x] 建立 KPI + 毛利雙儀表板（規格）
- [x] 建立文件分類與連動更新機制（`docs/CHANGE_IMPACT_MATRIX.md`）
- [x] 建立結案自動檢查清單與文件自動同步（`scripts/doc-sync-automation.ps1`）
- [x] 建立每公司自動排程系統（Daily/Weekly/Monthly/Adhoc）
- [x] 建立國際化交付/合規/多幣別政策（global delivery/compliance/commercial）
- [x] 建立系統健康檢查機制（`scripts/system-health-check.ps1`）
- [x] 建立主動守護與告警機制（`scripts/system-guard.ps1` + 排程）
- [x] 建立桌面彈窗提醒（PASS/FAIL）與 ALERT/LAST_STATUS 主動提示
- [x] 建立可販售產品化藍圖與交接清單（`docs/product/*`）
- [x] 建立對外販售打包腳本（`scripts/build-product-bundle.ps1`）
- [x] 建立總控中心架構與多平台（WordPress-first）連動設計
- [x] （2026-04-09）AO-RESUME 規則防漂移硬化（單一 Owner + 腳本硬檢查 + 無效回覆判定）
  - Owner：`docs/operations/rules-version-and-enforcement.md`
  - 腳本：`scripts/ao-resume.ps1` 新增規則版本/鏡像一致性 precheck（失敗即中止 + quick-fix）
  - 規則：`30-resume-keyword.mdc` 明確「未全列 `- [ ]` 視為無效回覆，必須重出」
  - 對齊：`rules/README` + `cursor-enterprise-rules-index.md` 已補 Owner 入口
- [x] （2026-04-09）平台能力總表狀態欄位升級（含 emoji）
  - 檔案：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
  - 變更：新增「目前實際狀態」欄，並統一 `🟢 已上線 / 🟡 建置中 / ⚪ 未啟動` 圖例於能力總表與 P1-P7 建置順序表
  - 驗證：`doc-sync-automation -AutoDetect` + `system-health-check` 100% PASS
- [x] AO-CLOSE 預設 100% health 閘道已落地（規則/文件/腳本三層）
- [x] 用 1 個新客戶實跑 `tenants/NEW_TENANT_ONBOARDING_SOP.md`
  - 客戶：`company-p1-pilot`
  - 狀態：最小實跑完成
  - 證據：`reports/e2e/onboarding-a10-2/20260331-214650-company-p1-pilot-2026-010-p1-pilot/`
- [x] 全面檢查並升級 `tenants/templates/`（v1）
  - 新增：`core/DEPARTMENT_COVERAGE_MATRIX.md`、`core/CROSS_BORDER_GOVERNANCE.md`
  - 強化：`PROFILE`、`FINANCIAL_LEDGER`
  - 連動：`NEW_TENANT_ONBOARDING_SOP`、`tenants/README` 已接上（2026-04-02）
- [x] 新增對外短憲章
  - 檔案：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
  - 定位：30 年 AI/coding/專案管理跨國企業決策與執行口徑
- [x] 新增客戶精簡鏡像：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`
- [x] `system-guard.ps1` FAIL 後保守 auto-repair
  - 行為：只重跑 `doc-sync-automation` + `system-health-check` 一次
  - 升級條件：仍 FAIL 才產生 `ALERT_REQUIRED.txt`
- [x] 完成今日 AO-CLOSE 三步收工檢查（doc-sync / health / guard 全 PASS）
- [x] 完成今日 AO-CLOSE 一鍵閘道與同步推送
  - 流程：verify-build-gates + guard + integrated-status + git push
  - 補充：**2026-03-28 晚** 再跑一輪，收斂 A10 / SOP / presign 等本機變更
- [x] 報表單一路徑收斂（canonical=`agency-os/reports`，root `reports/` 退役為相容用途）
- [x] 建立標準 MSA/SOW/CR 文件模板
- [x] 修復 `AgencyOS-*` 排程路徑到 `D:\Work\agency-os` 並補齊命令引號防呆
- [x] 建立 reports 歸檔腳本（`scripts/archive-old-reports.ps1`）與 README 操作入口
- [x] 他處／公司機開機須知（`docs/overview/REMOTE_WORKSTATION_STARTUP.md` + `RESUME_AFTER_REBOOT.md` 分機情境）
- [x] Enterprise 工具層選型/安裝完成
  - 主工具：Sentry / PostHog / Cloudflare / Identity/JWT（不綁特定供應商）
  - Secrets：先採 env/mcp（後續可升級）
  - 輔助：Supabase / Slack
- [x] 啟用 Operator Autopilot 規則與 Phase1 自動化腳本（startup preflight / alert auto-repair / closeout optional push / Slack notify）
- [x] AO + Lobster 事件流圖（Mermaid）已落地到 `docs/overview/ao-lobster-operating-model.md`
- [x] 落地「Single Owner 最高原則」：核心規則/`AGENTS.md` 已寫入；`doc-sync-automation.ps1` 新增 owner 重複內容檢查（registry 驅動）
- [x] Single Owner 第 2 階段：registry 擴充 AO-RESUME 主流程、30 秒自檢、AO-CLOSE 硬性 Gate（避免關鍵流程多處複製）
- [x] P1/P2 跑道加速：新增 preflight（`scripts/preflight-onboarding-a10-2-readiness.ps1`）、證據骨架初始化（`scripts/init-onboarding-a10-2-evidence-skeleton.ps1`）、Run ID 對照規格（`docs/operations/ONBOARDING_A10_2_RUN_ID_TRACEABILITY_SPEC.md`）
- [x] 整合 `LOBSTER_FACTORY_MASTER_V3` 至系統建置路線（gap map + skeleton sprint + gate 追蹤，H1~H6 baseline 完成）
- [x] `lobster-factory` H3 第一批 skeleton sprint（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）
- [x] `lobster-factory` H4 Decision Engine baseline（recommendations schema + contract）
- [x] `lobster-factory` H5 CX retention/upsell baseline（workflow_runs 串接骨架）
- [x] `lobster-factory` C3-3 release gate baseline（PR gate + prod deploy gate）
- [x] `lobster-factory` Trigger deploy CI 修復完成（project ref 對齊 + 缺失 `uid` 補齊 + Actions 綠燈）
- [x] 修復 Cursor `user-trigger` MCP 啟動錯誤（移除錯誤 `--api-key` 參數，改 vault 啟動腳本）
- [x] 落地強制版 MCP routing 規格與風險矩陣（`MCP_TOOL_ROUTING_SPEC.md` + `workflow-risk-matrix.json`）
- [x] 落地 WordPress Factory 細部執行規格（`WORDPRESS_FACTORY_EXECUTION_SPEC.md`：step-by-step + failure matrix + approval payload）
- [x] 將 WordPress Factory 規範轉成可執行 gate（`wordpress-factory-execution-policy.json` + `validate-workflow-routing-policy.mjs` + bootstrap 整合）
- [x] `lobster-factory` C3-1 標準 E2E payload + staging 管線回歸腳本（`docs/e2e/STAGING_PIPELINE_E2E_PAYLOAD.md`、`run-staging-pipeline-regression.mjs`）
- [x] `lobster-factory` C2-1 mock hosting adapter（`hosting/mockStagingAdapter.ts` + `create-wp-site` 整合 + `MOCK_HOSTING_ADAPTER.md`）
- [x] `lobster-factory` C3-2 演練報告產生器（`emit-staging-drill-report.mjs` → `agency-os/reports/e2e/`）
- [x] `lobster-factory` hosting 合約（`resolveStagingProvisioning`、`provider_stub` 阻擋、`HOSTING_ADAPTER_CONTRACT.md`）
- [x] `lobster-factory` A9 本機 artifacts（`localArtifactSink`、`LOBSTER_ARTIFACTS_MODE=local`、`logs_ref` PATCH）
- [x] `lobster-factory` hosting `providers/` 合約骨架 + `print-create-wp-site-payload` CLI
- [x] `lobster-factory` 營運套裝：`operator:sanity`、`payload:apply-manifest`、`LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`
- [x] `lobster-factory` hosting：`http_json` 適配器 + 合約文件（`resolveStagingProvisioning` async）
- [x] `lobster-factory` A9：`remote_put` artifact 上傳（presigned PUT + presign broker 合約）
- [x] Monorepo 根 `README.md` + `EXECUTION_DASHBOARD` 現況對齊 + 雙邊 README／`AGENTS` 導覽連動
- [x] `lobster-factory` A10-1：`OPERABLE_E2E_PLAYBOOK.md` + `validate-operable-e2e-skeleton.mjs`（納入 bootstrap）；A9 政策 `ARTIFACTS_LIFECYCLE_POLICY.md`
- [x] A10-2 前置：`NEW_TENANT_ONBOARDING_SOP` Step 7（Lobster 銜接）+ `PRESIGN_BROKER_MINIMAL` + presign JSON 範例；operable gate 驗證 monorepo SOP 橋接
- [x] `lobster-factory` C1-2 execute 驗證（`package_install_runs` lifecycle：pending -> running -> completed）
- [x] `lobster-factory` C1-3 execute 驗證（DB 寫入韌性：retry/compensation/trace）
- [x] 建立零成本本機 Secrets Vault（Windows DPAPI，`scripts/secrets-vault.ps1`）
- [x] 完成 Secrets Vault 一鍵匯入（`mcp.json` + Lobster/Slack 關鍵值）
- [x] `lobster-factory` A9 雲端 artifacts 治理補齊 baseline（生命周期規則/IAM/稽核自動化：policy + validator + audit report）

## Backlog — 未完成
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）
- [x] `lobster-factory` Enterprise 必備工具補強路線（已取消）
  - 範圍：Sentry / PostHog / Cloudflare / Secrets / Identity
  - 現況：Identity 採 JWT/OIDC（不綁特定供應商）；Secrets 暫採 env/mcp，後續升級 secrets manager
- [x] **【✅ 2026-06-02 自動化完成】`lobster-factory/packages/workflows` `npm audit` 例行週檢**（2026-04-01）
  - **2026-06-02**：qs DoS 弱點修復（6.11.1→6.15.2，GHSA-q8mj-m7cp-5q26）→ `found 0 vulnerabilities`。GHA `.github/workflows/weekly-workflows-security-audit.yml` 每週一自動執行，Slack + Telegram 雙語通知，不再需要手動週檢。
  - 禁止：勿在本目錄執行 `npm audit fix --force`（會導向不相容 Trigger 版本）。

## Backlog — 已完成歷程
- [x] 客戶分級與風險評分模型
- [x] 外包交付評分卡
- [x] 合規檢查清單（抓取與 leads）
- [x] 建立英文化客戶輸出模板（Proposal/SOW/Monthly Report）
- [x] 建立 release notes + upgrade path + migration checklist
- [x] `lobster-factory` 補齊 raw spec 差距檔案（C4-1~C4-5 完成）

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `.cursor/rules/00-session-bootstrap.mdc`
- `.cursor/rules/20-doc-sync-closeout.mdc`
- `.cursor/rules/30-resume-keyword.mdc`
- `.cursor/rules/40-shutdown-closeout.mdc`
- `docs/architecture/agency-command-center-v1.md`
- `docs/compliance/leads-and-scraping-checklist.md`
- `docs/metrics/kpi-margin-dashboard-spec.md`
- `docs/operations/client-risk-scoring-model.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/outsourcing-vendor-scorecard.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `tenants/NEW_TENANT_ONBOARDING_SOP.md`

_Last synced: 2026-06-23 14:30:03 UTC_

