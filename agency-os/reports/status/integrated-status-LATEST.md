# Integrated status report (assembled)

- Generated: 2026-10-26 05:46:57
- agency-os root: `D:\Work\agency-os`

> Assembled from canonical sources only; edit those files to change truth. Chinese legend: `docs/overview/INTEGRATED_STATUS_REPORT.md`
>
> Regenerate: `powershell -ExecutionPolicy Bypass -File .\scripts\generate-integrated-status-report.ps1`

## Source index
- `TASKS.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- `memory/CONVERSATION_MEMORY.md`
- `memory/daily/YYYY-MM-DD.md`
- `LAST_SYSTEM_STATUS.md`, `WORKLOG.md`

## 1) TASKS.md - Next (unchecked)
- [ ] **【≈2026-11-01】員工逐工具權限：看 7 天「本來會擋」紀錄，再決定要不要開始擋**
- [ ] **【≈2026-11-06 觸發】aware-wave.com DMARC 升級第三階段（p=quarantine → p=reject）** — 決策正本 [`reports/decisions/2026-09-10-dmarc-enforcement-timeline.md`](reports/decisions/2026-09-10-dmarc-enforcement-timeline.md) 同款檢查：10-23 起的 rua 報表寄 `dmarc@aware-wave.com` → 轉寄 awarewaveai（Gmail 連線器可讀；10-22 前的舊報表在 peijingartstudio），零未解釋失敗才改。**提醒已建**：peijingartstudio 日曆 2026-11-06 09:00（前一天彈窗＋當天 email），勿重複建立。
- [ ] **【Soulful 搬站後收尾｜無死線】網域轉 Cloudflare Registrar** — 網域付到 2028，無時壓；DKIM selector 是 `hostingermail1`，轉移時勿動 DNS。（付費外掛授權盤點：操作者 2026-10-23 說不用做。）
- [ ] **【產品｜社群管理平台 V1】照 ADR 016 與 SOCIAL_MANAGER_PLAN.md 做：G5 升級 Postiz，C3 起逐卡**（文章→社群自動排程已由 `AUTO_CONTENT_EXECUTION_PLAN.md` P2／P4 做完。舊 `/api/content/social-publish`、`social-admin`、`social-channels` 還有 caller：影片 Release 面板 `ReleaseDeliveryPanel.tsx:90`、客戶中心社群頻道分頁 `ClientHubTabs.tsx:1892-1972`；兩處改走社群產品後才能刪三支 route，2026-10-25 查，計畫 P6.3）
- [ ] **【研究線｜P1 全部完成（WC-15 ⑤ 2026-10-02 驗過）；P2 DOD 8/8 完成（2026-10-02）；剩操作者定門檻】三條線（合作風險／決策利弊／EdD）做成 Cognitive OS 上的 Project 工作流** — 現況與下一步只看計畫正本 `Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md` §0／§12.8／§12.9；P1 紀錄 WORKLOG 續37／41／52／54／55／59；P2 09b 剩：操作者門檻裁定（DOD-2 已用新專案 `857b6f41…`「勿刪」通過，WORKLOG 2026-10-02 續2）；「舊專案刪不掉」後端已排除、待操作者描述畫面（WORKLOG 2026-10-02 續1）。
- [ ] **【Cognitive OS P4｜待操作者決定】報告核准角色與來源搜尋規模** — ① `POST /projects/{id}/reports/{rid}/approval` 任何有效 session 都能核准，是否限角色；② `GET /sources/search` 無分頁／全文索引／限流（現為上限 100 筆＋每請求讀 200 份 artifact，超出標 `truncated`／`incomplete`），租戶或資料量變大時再做；③ 報告 `run_results` 要等 project-level run binding 才開放。WORKLOG 2026-10-01（續7）。
- [ ] **【蒐集｜設計問題，需判斷】density 是不是該有單獨否決權** — 同一批實測裡 `rusi.org/people/farrell`、`royalsoc.org.au/...`被 `low_text_density` 擋下，但那些頁面的抽取其實是對的：正文短、站本身 HTML 很重（605KB）。`MIN_DENSITY` 的用意是「抽到的是導覽列而不是正文」，可是對「短但完整的個人檔案頁」它會誤判，而個人檔案頁正是背景調查最需要的東西。可能的治本方向：density 改成第二訊號（只在 textBytes 貼近下限時才否決），與 soft-404 的 weak-marker 邏輯同構——但這會放寬所有來源的入庫條件，影響客戶 KB，**不是可以順手改的東西**。需要先蒐集實際 textBytes/density 分布再決定。
- [ ] **【2026-09-11 開出｜影片｜待查】`/api/video/regenerate-image` 502，與 remotion-render 502 不同根因，未修**
- [ ] **【人工｜Postiz Task 2 OAuth app 審核】各平台 dev app 提交** — （YouTube＝Google OAuth app 也走這條；完成後解鎖 `AUTO_CONTENT_EXECUTION_PLAN.md` P7。）Meta IG+FB（一個 Meta app，App Review，最高價值）/ Reddit / LinkedIn。callback = `https://postiz.aware-wave.com/integrations/social/<slug>`；client_id/secret 加進 EU `/root/postiz/.env`（`<PLATFORM>_CLIENT_ID/SECRET`）+ restart。
- [ ] **【診斷】Mockup Studio 功能異常 — server-side 已排除（2026-06-16），卡操作者症狀**：操作者回報 mockup 有問題未提供細節（2026-06-13）。MockupStudio.tsx 實走 `/api/tools/studio/generate`（nano-banana-2 + referenceImages）。
- [ ] **【驗證債】Canvas 編輯器 `/tools/canvas` 整輪瀏覽器實測** — 整個 PS 功能目錄已全部 build+deploy（HEAD 含 `09b81ee4`/`5b73b77d`，tsc 0+build 0+critic 過），但**使用者尚未瀏覽器實測**（Claude 無登入 session 無法測）。主檔 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/tools/canvas/CanvasEditor.tsx`。待驗清單：
- [ ] **【POD A1 已完工｜剩 e2e + A2】** A1（一鍵 native 建品）後端+UI+hardening 全 live。剩：
- [ ] **【POD A2 confirm phase — 🔴 金流紅線，測試結束 + 操作者明示批准才做】** A2 draft-only 管線已上 prod dormant。真正「自動扣款 + 送印」需未來明確建 confirm step（目前 code 完全沒有）。
- [ ] **【未開始｜待使用者明確下指令】會議服務網路版安裝** — 客戶筆電無 NVIDIA GPU（2026-08-20 確認），本機版 CPU 路線慢 20-27 倍不可用。
- [ ] Soulful 課程類開 AI 自動回覆：考試閘已寫好（只有考過的意圖能開自動，見 WORKLOG 2026-10-16（續11））。剩：部署 → 匯入 `agency-os/tenants/company-soulful-expression/core/cs-eval-courses_services.json`（30 題，操作者看過）→ 客服分頁「開始考試」→ 過了操作者自己按「自動」；沒過看逐題結果決定（價格／時間題預期會失敗：AI 說「沒有資料」不算轉真人）。
- [ ] **危機訊息：真人接手中也回一句（0104）上線後實測** — 部署後 John Doe 在真人接手中的對話傳「我想死」→ 預期 Telegram 一則＋客人收到三行專線句；30 分鐘內再傳 → 只有 Telegram。程式＋`0104_cs_crisis_holding_replies` 已上正式（2026-10-17）。建議模型：Opus 5.5
- [ ] 產品決定：知識庫內容／模型／prompt 變動要不要讓「考過」失效並自動重考（計畫 §5.2 CI 閘）。現況不失效；網站每週重爬，若失效又沒自動重考，自動回覆每週會退回草稿。見 WORKLOG 2026-10-16（續11）「沒涵蓋」。
- [ ] Soulful 常見問答的價格／時間／地點／報名是**測試值**（WORKLOG 2026-10-16（續22））：對外宣傳前操作者給真值，在客服分頁「常見問答」改 `pricing`／`schedule`／`location`（＋ -en）四條。
- [ ] Chatwoot 基本設定（`lib/cs/chatwoot-baseline.ts`）：自動結案＋結案巨集已**自動套用**（存個人 token 時一次＋每日排程 `cs_chatwoot_baseline`，WORKLOG 2026-10-16（續29））。剩：①操作者到 `/ops/schedules` 勾 Soulful 這一格（預設關）②標籤、預設回覆、收件匣營業時間仍手動，有第二個客服客戶時再納入。
- [ ] **【從舊 EU-origin 項拆出，仍待辦】`awmainwp` 帳號名已外洩（320 次針對性嘗試），改名或加 2FA** — 需操作者在 MainWP 後台執行，與主機拓樸無關。
- [ ] **HCI-30 C6 真實登入串接計畫（2026-09-17 `planner` 產出，審閱中，未授權執行）** — 12 個 Task Prompt，Task 3/5/6/7/9 為 High-risk STOP。計畫：`Projects/internal/hci30/docs/HCI_C6_REAL_LOGIN_PLAN.md`。C6 仍為 DEFERRED，本項只記錄計畫已產出，不代表開工授權。**2026-09-18 補記（Task 10 critic 覆審 Major，未修，已追蹤）**：`app/server.mjs` 的既有「尚無 auth 層」缺口，因 Task 10 新增 `POST /api/hci/v1/seeds` 而具體化——該端點無 rate limit，由外部輸入 `targetUrl` 驅動後端對任意外部網址發真實 fetch，暴露前需先解決（rate limit 或本 C6 計畫其中之一）；目前僅本機單一受信任操作者使用，未對外暴露，非阻塞。詳見 WORKLOG 2026-09-18（續5）。
- [ ] **【2026-08-26 開出｜營運｜搬站前必處理｜⚠️ 2026-08-30 稽核：疑似 MOOT，需操作者確認】soulful 週備份近 10 次有 5 次失敗，最新一次就是失敗** — 現況查證：`BACKUP_AUTO_STATUS.json` 最新 3 筆已全部 `Succeeded`（2026-08-26 起），`last_failure`（2026-08-24）已不是最新事件，本項描述的即時狀態已經過期。**更根本的是**：這條追的是 Hostinger 時代 WPvivid→Google Drive 那條備份鏈；Soulful 已於 2026-08-28 正式切換 Hostinger→ks-aw-01（`WORKLOG.md` "🎉 Soulful 正式切換完成"），現行備份走全新的 `ks-aw-01-backup` 管線（已實測 PASS，見 WORKLOG 2026-08-27）。舊 WPvivid 鏈的失敗模式**很可能隨舊主機一起結束**，但 WPvivid 外掛在新機上是否還在跑、是否該完全停用，本次稽核未查證，故列 MOOT 疑似而非直接關閉——需操作者確認新機上是否還留著這條舊備份路徑。
- [ ] **【未開始｜先預留】Composable AI Commerce OS** — 藍圖已吸收為參考素材（`agency-os/docs/Composable AI Commerce OS/`，含 Master Plan / Implementation Roadmap / LEGO Documentation Pack；absorbed via commit `97cdea3ed`）。操作者 2026-09-05 明示「之後要做，先預留」，**目前不動工**，勿主動排入排程；待操作者明示啟動再展開任務拆解。
- [ ] **【2026-09-07 開，低優先，操作者決定】兩個未決**：① all-users Start Menu 捷徑（`%ProgramData%\...\Docker Desktop.lnk`）繞過守衛，需一次性 elevated session 手動 retarget（runbook 已附指令，非本次自動執行——腳本本身維持 unelevated）；② `run.socket-archive-*` 封存目錄保留政策（目前 rename-only 永不刪，已 5 個，各 0 bytes——維持或 14 天後清）。
- [ ] **【site-watch｜客戶站】建 staging 會把客戶的正式網址蓋成 staging 網址 → site-watch 改巡 staging、正式站沒人看**
- [ ] 客人最後訊息 >24h 後無法回覆（`ENABLE_MESSENGER_CHANNEL_HUMAN_AGENT`=false）；要開需 Meta App Review `HUMAN_AGENT`＋等上游 PR #15932 釋出（現版開了會連 bot 回覆都標 tag）。
- [ ] **客戶自助登記 WordPress 站（現在只限員工寫網址）的前置：站別網址的每個使用端都要能承受客戶給的網址**
- [ ] **Codex 佇列的驗收 check 在沙箱外跑 Codex 寫的程式**
- [ ] **【2026-10-23 開出｜Codex 驗證】collection 事件不走 `upsertIncidentAtomic`** — `lib/collect/report-store.ts:166` 直接 `upsert`：已 resolved 的同類失敗再發生不會重開、`occurrence_count` 不增（對照 `packages/db/migrations/0035_upsert_incident_atomic.sql`）；fingerprint `collection:<org>:<shape>` 不含 environment，本機 dev 與 prod 互蓋同一列。修 = 改走 `upsertIncidentAtomic`＋fingerprint 帶 environment。見 WORKLOG 2026-10-23「/ops/repairs 500」。
- [ ] **【2026-09-11 開出｜蒐集 C1 × KB】`provenance` 與 `author` 到 sink 就斷** — 蒐集端每份文件都蓋 `EVIDENCE`/`SOURCE_QUOTATION`（`lib/collect/provenance.ts`）並抓 byline，但 `KnowledgeInput`（`lib/kb/types.ts`）沒有這兩個欄位，`sink/kb` 只能丟掉。後果：客服 AI 從 KB 撈到爬來的廠商行銷文案時，沒有任何標記可據以包裝成 untrusted quote——正是 `DATA_COLLECTION_PLAN.md` §1.3b「傳遞」列要防的整條路徑。KB 側屬 K2e（三軸 + locked），本項在那之前不得宣稱 §1.3b 完成。
- [ ] **【資料正確性｜共用層】生圖額度改成三軸五對象（操作者 2026-10-21 定案；「塔羅牌是一個樂高積木」＝做在共用層，不做在 tarot 裡）**：額度只由共用 `can()` 決定、花費煞車只做在共用 `lib/ai/gateway.ts`（所有付費 AI 都經過它；目前無任何花費控制），每塊積木繼承、不各自計數；tarot 只刪自己的 `quota.ts`。原狀：現在 `lib/tarot/quota.ts:15` 是全站一天 300 張（`TAROT_DAILY_LIMIT`），只存在記憶體、重啟歸零，且一天做 5 套（390 張）就被擋。改為：(1) 每張圖前由 `can(主體, feature_key, actor)` 決定扣誰的額度——自用（comp、staff）不限張數；代操扣被代操客戶；訂閱／點數扣客戶自己；買斷用客戶自己的金鑰、不限（ADR 017 §0）；(2) 全站只留**花費煞車**（以金額計、例如每小時上限、存資料庫、觸發即暫停並通知操作者），不再有全站張數上限；(3) 刪 `checkAndConsumeQuota`（呼叫點 `app/api/tools/tarot/generate/route.ts:92`、`app/api/internal/tarot/batch/[jobId]/card/route.ts:58`）。排在批次 B 方案之後（B 改同一支 card route）。
- [ ] **【2026-08-25 開出｜類別級重設計】影片歸屬改為持久化 `outName → organization_id` mapping，停止從 object key 反解** — critic（2026-08-25）指出 2026-08-25 那批修正裡的三條 finding（crafted legacy prefix / 大小寫不一致 / ctx 缺欄位 fallback）是
- [ ] **【2026-08-26 開出｜中】手動新增的站拿不到租戶歸屬
- [ ] **【2026-09-26 開出｜小｜設定】env 設定的 WP 站與 bridge 站綁 org** — env 站（`lib/content/wp-sites.ts:42` organizationId null）只受 global 模式管、社群發文回 422；bridge 站以網址 host 對應 active wp_sites 列取 org（`lib/payments/woo.ts` bridgeSiteOrg），無列 = 只看 global。修：把這些站建成 wp_sites 列並填 organization_id。T18 critic M2＋m5，詳 WORKLOG 續26。
- [ ] **【2026-09-19 開出｜HCI30｜中】快照未存抓取時的 HTTP header charset** — 「採用為證據」從已存 bytes 重新擷取文字時只剩 BOM/`<meta>` 可判斷編碼；只在 header 宣告 Big5/GBK/Shift_JIS 的頁面會變亂碼證據（人工預覽看得到，append-only 無法事後改）。治本＝`hci.source_snapshots` 加 `content_charset`（migration，High）+ sink 寫入 + `/snapshot-text` 帶入 `detectHtmlEncoding`。來源：critic m2，WORKLOG 2026-09-19「HCI 採用為證據」。
- [ ] **已知債務追蹤：`queryAsTenant()`(`Projects/internal/hci30/app/server.mjs:79-88`) 的 `SET ROLE`/查詢/`RESET ROLE` 缺明確 transaction 包裹** — db-expert 2026-09-17 審查 C6 時發現（與 C6 本身無關的既存缺口）。今天安全只因 node-postgres `pool.connect()` 釘住單一實體連線；若未來加 PgBouncer 且用 transaction pooling mode，`SET ROLE` 可能落在不同 backend 連線上且不報錯，形同繞過 RLS。修法：包一層明確 `BEGIN...COMMIT`（低風險、無行為改變），或 Task 9 部署時確認絕不用 transaction pooling mode。觸碰身分/RLS 邊界程式碼，需操作者對此項單獨確認才動工。
- [ ] **【次要，critic 覆審發現，非阻塞】`POST /api/hci/v1/cases`（`app/server.mjs`）的 active-authorization 檢查有 TOCTOU 窗口** — `hci.cases.tenant_authorization_id` 只有 FK 存在性檢查（`migrations/0002`），不像 `hci.research_workflows` 有 `hci.require_active_authorization()` trigger（`migrations/0001:110-123`）；本次新增的端點在**應用層**複製同一條規則（SELECT 找 ACTIVE+未過期授權 → INSERT），但兩條語句走 `queryAsTenant()` 各自獨立的連線（非同一 transaction），中間若授權被併發 REVOKE，新案子仍會綁到剛失效的授權上——正是該端點自己的註解說要防止的「schema 允許但語意錯誤」情況。單一操作者本機 demo 環境機率極低，故未阻斷本次功能上線。**治本方向**：比照 `hci.require_active_authorization()` 的既有模式，在 `hci.cases` 也加一個等價 trigger（新 migration，非 app 層 workaround），讓檢查與 INSERT 在同一陳述式內原子化；或至少把 app 層檢查改成單一 transaction 內 `SELECT ... FOR UPDATE`。**完成定義**：選定方案並落地，`POST /cases` 併發 REVOKE 情境不再可能建立引用已失效授權的案子。
- [ ] **【2026-09-12 開出｜KB migration 0076】critic 覆審找到的五個延後項（皆非阻擋，已個別記在程式註解裡）**
- [ ] **【2026-09-26 開出｜POD｜Medium】Woo 端對帳：webhook 是否仍啟用、有無投遞失敗** — pod_order_inbox 只看得到「有送到」的訂單；WooCommerce 停用 webhook（>5 次失敗）或部署重啟時的單筆失敗，收件匣看不到。偵測：讀 soulful `wp_wc_webhooks`（delivery_url 含 `/api/webhooks/woo-order`）的 status＝active 且 failure_count＝0，沿用 `scripts/check-smoke-tests.ps1` client_mail 的 SOULFUL_DB_PROFILE 傳輸（Hostinger／ks-aw-01 切換期）。critic M2 延伸，WORKLOG 續51。
- [ ] **【2026-10-01 開出｜Cognitive OS｜低優先】渲染後的字級／行寬檢查（U22）還不是任何閘：`render-mocks.cjs` exit 4 只在手動跑時擋**
- [ ] **【2026-10-01 開出｜Cognitive OS｜低優先】結果頁快照 fixture 過期：`check-mocks-selftest.py` 的 page 突變 2/2 漏抓**
- [ ] **【2026-09-28 開出｜Cognitive OS｜低優先】run_recipe_async 終態 FAILED flake：`test_async_run_reaches_a_terminal_state_via_the_existing_status_endpoint` 高負載下 async run 以 FAILED 收尾**
- [ ] **【2026-09-11 開出｜HCI30｜低優先】mutation-check-wave1.ps1 的 `drop-all-subject-records-referencing-fks` 疑似 flaky**
- [ ] **已知模式債務：`dev-db-init.ps1` 的「hardcode 最新 migration marker + loop bound」模式會在下個 migration 忘記同步時重演** — Task 8（2026-09-18）critic 覆審發現：這次的根因類型本身沒根治，只修了症狀（0019→0020）。根治需 migration 帳本表（記錄哪些 id 已套用，逐檔比對現有 migrations 目錄），非本次範圍。
- [ ] **【欠的 review｜2026-09-07 11:06 後才能做】** 對 commit `f2eb6cefa`（+ `e6f9e31a7`）補跑 `/codex-review`：2026-09-04 當天 critic 回 429 session limit、Codex 回 usage limit（reset 9/7 11:06），只做了書面自審 + 7 個突變（WORKLOG 2026-09-04 續2 `ORACLE_WAIVED`）。capture 檔在 `%TEMP%\oracle-capture-20260904-091506.diff`（含其他 session 的 62 檔改動，跑時要帶 scope 限制文字，或直接對 `git show f2eb6cefa` 的 26 檔審）。有 finding 才開新條目修。
- [ ] **【次要，db-expert 覆審發現，非阻塞】mutability matrix SSOT 漂移** — `0001_wave1_synthetic_up.sql:50-64` 的欄位可變性矩陣自稱是 triggers/grants 的 SSOT，但 `cases`/`source_snapshots`/`source_relationships`/`decisions` 四張後續 migration 加的表都不在表格裡，跟錯誤碼清單 2026-09-05 已經歷過的同款漂移（後來搬進 `ERROR_CODE_REGISTRY.md`）一樣。比照辦理：把矩陣搬進獨立檔案當真 SSOT，或至少補上四張表的列。
- [ ] **【產品｜施工】app.aware-wave.com 排程頁：一個地方管理所有例行工作**
- [ ] **【產品｜ADR 017 客戶怎麼買】已接受；照 ADR「順序」1–7 開卡做**
    - [ ] 第一個方案列（plans 0 筆；訂閱付款前必須，功能與上限由操作者定）。建議模型：Opus 5.5
    - [ ] 待決 2：買斷交付前請律師確認授權——Postiz（AGPL-3.0）、MinIO（AGPLv3，Trigger 內含）、Redis（Trigger 與核心用浮動 7-alpine，7.4 起 RSALv2／SSPL）、Keygen CE（Fair Core License，買斷授權檔簽發，2026-10-25 現成方案評估）（ADR 017 §5 授權盤點）→ 擋第 5 步
    - [ ] 待決 4：客戶白牌網址的憑證走 Cloudflare for SaaS 還是主機 on-demand ACME（ADR 018 §2）→ 擋第 9 步（白牌網址），等第一個客戶再定
  - [ ] **4b 對帳報表**（設計 2026-10-25，WORKLOG 續26）：`/ops/billing` 每天比對「WooCommerce 已付款、含 AwareWave 商品、付款方式在白名單」的訂單與 `payment_events`，列出漏送／多送；wp-bridge 0.18.1 的付款方式白名單是第 1、2 層，這是第 3 層。建議模型：Opus 5.5
- [ ] **【Cognitive OS｜小】`.runtime` 的 run lock 檔只增不刪：分析和背景 AI 動作每次各留一個檔**
- [ ] **【Cognitive OS web】結果頁已照示意稿（已上線）；剩各頁渲染閘與示意稿裡還沒做的動作** — 已上正式站：外框／首頁／工具／工作流／專案（WORKLOG 續36）、填寫頁（續38）、兩堂課＋課程連結（續39），`79bf7cc5`（續40）。結果頁＝卡片①–⑨＋核准卡、解讀契約 1.1.0 與 detail_integrity 閘（續61），已上正式站 `1fbb021f`（續62）。我的專案：專案名點得進專案頁、每次分析一列且打得開、每次「執行分析」開自己的專案、建立／最後更新到分鐘（2026-09-27 續1），已上正式站 `b6936ecc`（續3）。剩：① `check-mocks.py --page` 只有 result，首頁／工具目錄／工具頁／工作流頁沒有渲染 HTML 閘；② 工作流逐站頁（P3）；③ 結果頁對示意稿 310 筆已全修（2026-09-28 續11＋續15），已隨 `73b9ac8f8` 上線（2026-09-29 續8；登入後畫面待正式站測試身分），見 `Projects/internal/cognitive-engineering-os/docs/RESULT_PAGE_GAP_REPORT.md`；④ 上線 High-STOP（報告 §9），先定每租戶每日 token 額度（一次分析約 1.8–4.3 萬）。
- [ ] **下一步（操作者 2026-10-15 同意順序）** ① 轉真人確認句＋問名字：程式在 main（`c3ef11ba9`），**未部署**。操作者 2026-10-15 決定：不單獨部署（sg-deploy 只能部署 main HEAD，會連帶上線還沒套 0100–0102 的社群 C5–C11），**跟社群 C12 同一次 sg-deploy 上線**（見本檔「社群發文 C12 上線」③）。部署後驗收：非角色帳號（John Doe）傳訊 → AI 轉真人 → 客人收到確認句＋問名字 → 回名字 → Chatwoot 聯絡人改名；`cs_ai_replies` 有 completed_at。見 WORKLOG 2026-10-15（續19）。② 再做下一項 KB。
- [ ] 考試要照正式路徑先過常見問答：現在 `runEvalCase` 只跑 `planReply`（AI 層），正式 `webhooks/chatwoot/route.ts:163` 先 `matchFaq`。價格／報名題在正式環境由 FAQ 回，考試卻記成「危險誤答」。修法：考試先 `matchFaq`，命中＝依 entry.handoff 判定。見 WORKLOG 2026-10-16（續19）（續22）。
- [ ] **【2026-09-05 開出｜P0/P1｜Media Production LEGO Platform】統一影片、短劇、字幕、實拍 QA 與網站／社群交付** — 正本：[`docs/video_generator/MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md`](docs/video_generator/MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md)。
- [ ] **【進行中｜軟體先行·U0–U5 + widget U4 完成並 prod live，剩 U6 gated】全自動客服系統**
- [ ] **【進行中｜POD 一鍵自動上架】設計圖 → Woo + Printful 多款多色全自動** — 計畫 SSOT = `lobster-factory/docs/PLAN-pod-one-click-auto-publish-design-to-woo-printful.md`（5 階段）。目標：操作者**只做設計圖**、一鍵自動 合成商品圖(白背/2模特/平拍,分長短袖,<100KB) + 建 3 款 Woo 草稿(Gildan 2400 **長袖** id57 / Stanley-Stella STTU169 id456 / Gildan 5000 id438，各 4 色 × S-2XL) + Printful native 建品綁設計稿。
- [ ] **【進行中｜內容引擎積木化】搜尋積木 registry 已 live，剩來源/UI/第二批** — **2026-10-25：管線部分（舊 §0.5 B 段 P5／P6／P9）由 `agency-os/docs/AUTO_CONTENT/AUTO_CONTENT_EXECUTION_PLAN.md` 接手，進度看那邊的監工台；本條只剩積木來源／UI。Perplexity 積木已於 2026-10-25 退役（`6cfcba142`，操作者不再使用），即時搜尋改 `search/serper`（`lib/content/trending-sources.ts:289`）；下文 perplexity 字樣是 06-16 當時的紀錄。** ✅ **已完成並部署（2026-06-16，commit `e336d5da`）**：後端積木註冊骨架 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts`（`register/byKind/listAll/geoMatch` + `ContentBlock` 契約，前端 `AB.registerBlock` 後端鏡像）+ 搜尋家族 5 source 自註冊 `lib/content/trending-sources.ts`（google-news/reddit/ptt/perplexity/env-custom-rss）+ 契約 SSOT `lib/content/blocks/README.md`（修好 `public/vector-editor.html:902` 斷裂參照）。
- [ ] **wp-bridge plugin 補 `/product` dry_run 支援**：現只有 /option 有（RestController:167）；2026-06-11 一鍵上架測試因此真建了 draft #7164。plugin 端改 → bump AWBRIDGE_VERSION → release flow（WP-BRIDGE-RELEASE-RUNBOOK）。
- [ ] **wp-bridge 續做 operation：featured image** / update-existing-post / product update+delete（v0.7.0 只做 product CREATE，其餘端點仍待補）。
- [ ] **【POD Studio 自建動工】** plan=`.claude/plans/pod-studio-p2a-p4-execution-PLAN.md`；藍本=`lobster-factory/docs/POD_STUDIO_ROADMAP.md`。✅
- [ ] **【POD 服飾 Phase 1-4 後續｜2026-06-15 已部署 37dfba85】** 服飾 POD 全功能（忠實印刷檔 / Printful 多風格+真人模特 mockup+存圖庫 / 平拍真實 overlay 雙軌 / 台灣本地印刷檔 seam / AI 商品文案 SEO-GEO-AEO-RankMath）已 **live on app.aware-wave.com**（smoke 24 pass）。剩餘未做：
- [ ] **🎨 Image Output Pipeline**（SSOT: `lobster-factory/docs/PLAN-tarot-pod-image-output-pipeline-plus.md`）Tarot/POD: 色調→WebP/CMYK PDF(Japan Color 2001 Coated)/Fabric.js Canvas；Printful 走 sRGB `upscaler.ts` 不動；Canva Phase 1.5 POC
  - [ ] **[5-a~d]** Canva API POC → OutputTrackBar 接線（plan §17）
  - [ ] **Phase 2** customer-facing Canvas + WooCommerce + Printful；整副牌多頁 PDF（PrintNinja offset）
- [ ] SEO/GEO 引擎產品化 + Soulful 定位/文章（2-Gem: onboarding+content；定位鎖定 Arts Practice for Self-Discovery / Arts-Based Reflective Pedagogy；填真資料→文章可發布；spec §49 errata 待補）→ handoffs/2026-06-06-2044-seo-geo-content.md
- [ ] wp-bridge 外掛：接進 app.aware-wave.com Ops Dashboard + aware-wave.com 展示頁 + 販售 → handoffs/2026-06-05-1948-wp-bridge-deploy-sell.md
- [ ] **【2026-06-05 開出】塔羅牌工具 → MEGA → WooCommerce 三階段路線圖**（操作者 2026-06-06 確認方向） — 終點：全部接 WooCommerce 賣貨（參考同事 jonjonesai 的 MEGA「Mass E-commerce Generator & Automator」Streamlit 工具：Research→Idea→Generate(多模型並行)→Select→Process(去背 removal.ai/Tinify)→Mockup(Printful)→Published(WooCommerce+Claude 文案+定價)）。
- [ ] **SearchContent vertical SC-Phase 1（Domain Foundation）：把 122 筆 PROPOSED registry 記錄逐一寫成 contract 並升入全域 registry**
- [ ] **【2026-09-06 HCI_CONFIDENCE_SPEC.md critic 覆審 C1 揭露；同日第八輪，操作者「你做最完美的決定」授權，兩問中的一問已解——「dimension 層 cross-method disagreement 該不該往上傳」仍 OPEN】disagreement flag 從 dimension 層傳到 domain 層的路徑** — 原文揭露兩個不同問題混在一起：①「domain 內兩個維度自己互相不同意」（inter-dimension spread）②「dimension 層的 cross-method disagreement 該不該往上傳」（`combineMethodFindings` 輸出的 `disagreement` 欄位餵進 `rollupTrustDomains` 會被靜默丟棄）。**①已解**：`rollupTrustDomains` 新增 `dimension_disagreement: boolean`（同日第八輪，`packages/intelligence/rollup-trust-domains.mjs`），比較該 domain 兩個已賦值維度自己的 rank spread（獨立命名常數 `DOMAIN_DIMENSION_SPREAD_THRESHOLD=2`，故意不跟 `combineMethodFindings` 共用同一常數——兩者比較的對象結構不同，`dimension-score.mjs` 已有「不強行共用巧合相似的比較」先例）；gate 4 白名單同步加欄位（第二次修訂 gate 4 契約，第一次是 `9888bd5d7` 的 ADR-0032 band 修正；`HCI_CONFIDENCE_SPEC.md` 原文預期的「不會再碰」已不成立，已在該檔更新揭露，同時修正該檔一處把此次誤算成「第三次」的筆誤）。coverage=PARTIAL（只有一個維度）時公式自然回傳 `false`，無需特判。**②仍 OPEN，未被①解答**：`dimension_disagreement` 純粹從兩個維度已賦值的**值**計算，對任一維度自己的值是否來自互相矛盾的 method findings零可見性——一個 `combineMethodFindings` 回傳 `disagreement=true` 的維度，仍可能 roll up 進一個 `dimension_disagreement=false` 的 domain（反之亦然）。真正的「flag 本身要不要往上傳」設計問題留給下一次真有 trust-read endpoint consumer 逼出決定時處理。驗證：154→161 Node assertion（詳見同日 WORKLOG），mutation-check-node-gates.ps1 24→27 全殺。
- [ ] **認知主權平台：步驟 2 已併進 main（未 push）；接下來儲存切換 W1–W3（PostgreSQL 每區域一台）→ 步驟 3+4 → 才問上線；Codex 可照接手包接手** → handoffs/2026-10-04-1400-cos-step2-merged-storage-next.md
- [ ] **`decision.eisenhower_matrix` 內聯 provenance 正規化改呼叫共用函式**
- [ ] **COS Codex→Claude 接手（未完成；主線勿合併）**：隔離樹 `D:/tmp/cos-codex` 的卡 51 已暫存未提交，`D:/tmp/cos-pg` 的 W1–W3 被實測擦除資料遺失擋住；全情見 `agency-os/handoffs/2026-10-08-cos-codex-to-claude.md`。根因/卡點：`ai_lego/platform/exports/render.py:153` 的固定字數換行裁切 PDF 中文；PG `ai_lego/data/repositories/project_source_repository.py:765` 先 unlink CAS 再 commit，故障注入得 `row_survives=True blob_survives=False`。已試：卡 51 局部測試 8+14+43+20+109 綠，5 突變紅；真 PG 重現資料遺失。**下一步**：① 讀交接包，核對兩樹 `git status` 與 queue 過期 `running` ② 修卡 51 排版/已讀/並發並完成私有索引提交、Claude review ③ 以可重試擦除流程修 PG P0 並做故障回歸，雙重審查和真 PG 過閘前不 merge／push／部署。
- [ ] **【基礎設施｜小】主機 nginx 有 repo 沒有的 `hci.aware-wave.com` server 區塊（漂移）** — `/root/lobster-phase1/nginx/default.conf` 含 hci 區塊，repo `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` 沒有；任何人以 repo 檔覆蓋主機檔會讓 hci 站下線。修：把該區塊收進 repo（先比對主機現值）。2026-09-26 PI-b 分流時發現，詳 WORKLOG 2026-09-26（續34）。
- [ ] **【MainWP】建站自動接上 MainWP：bridge 已修好（2026-09-24），剩 next-admin 部署（DEPLOY_HOLD）＋真建站 E2E**
- [ ] **【2026-09-11 開出｜KB K1】per-model partial HNSW 是否真的被用到，未經 EXPLAIN 證實** — 0072 加了 `idx_cs_chunks_hnsw_te3s`（`WHERE embed_model = 'text-embedding-3-small'`），0051 的全表 `idx_cs_chunks_embedding` 仍在，兩個 HNSW 同時維護 = 雙倍寫入成本；而 `p_model` 是 bind parameter，partial index 未必會被選中。塞 ~2000 列跑 `EXPLAIN (ANALYZE)` 確認後再決定刪哪一個。順帶：0051 的 `bm25_tsv` 欄與 `idx_cs_chunks_bm25` 至今無人寫也無人讀（死欄位＋死索引），一併處置。
- [ ] **已知債務：runner 端寫入 MinIO 但 DB 列因輪詢階段失敗而遺失時的孤兒物件** — Task 9（2026-09-18）critic 覆審指出架構層級取捨：若失敗發生在輪詢階段（例如 runner 重啟導致 job 狀態遺失），runner 可能已把內容寫進 MinIO，但呼叫端重新 enqueue 後找不到對應 DB 列可參照，形成孤兒物件；`object-storage-client.mjs` 沒有 TTL/GC。與既有「`jobs` Map 無 TTL」債務同源，Task 9 真實流量接上前應一併處理。 → 2026-10-23：job store TTL＋上限已合（40366864a，`fetch-runner/server.mjs:82`）。孤兒 GC 不可用 bucket lifecycle（會刪已引用的 append-only 證據）→ 需「先寫 DB pending 列 → 寫 MinIO → sweep 逾時 pending」；**觸發＝fetch-runner 接真實流量前**（現只在 `infra/local`）。
- [ ] **【部署 env｜續110 延後 ①–③】Trigger 部署 env 三個殘留：`TRIGGER_*` 同步不到、`triggerUrl` 型別、可選值不隨輪替傳播**
- [ ] **【進行中｜app.aware-wave 一鍵架站總藍圖】MASTER PLAN = `docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`**（5 階段路線圖 SSOT）。✅ Stage 0 建站引擎閉環已驗（run 655197bf completed + curl 200，2026-06-06）。
- [ ] `lobster-factory` A10-2 商業閉環實跑
- [ ] Auto-Repair Post-Phase 4 (M2 per-source HMAC + M4 fingerprint) — Batch 3 已完成（9f862d82）→ handoffs/2026-05-28-1807-batch-3-post-phase.md
- [ ] M2/M4 Phase 1 code 完成；剩 Phase 2 rollout + Phase 3 constraint swap + 3 side item（Phase4Weekly 錯 repo / incidents API 藏 open / 5 webhook 零流量）→ handoffs/2026-06-05-2017-tomo-201752.md
- [ ] **Hetzner dispatcher 上線前 follow-up（啟用 LOBSTER_EXECUTE_* 前必做，現 gated OFF）**：
- [ ] **【READY，未做】把 Hetzner 一鍵租機嵌進 app.aware-wave.com 一鍵架站按鈕（Phase 5）** — 程式+真機已驗過，**直接呼叫 `provisionClient()` 勿重寫**。recipe：`lobster-factory/docs/hosting/EMBED_PROVISION_INTO_APP.md`（app 端 `onboarding/trigger-build/route.ts` 頂部已留指標）。等 app 校正完再接。
- [ ] **【計畫完成，未實作】客戶機「開機後全棧部署+維護」層（provider 無關）** — 讓新機/客戶自帶機自動部署成 production 等級（Docker+Grafana/Loki/Netdata/Sentry+快取+swap+備份+限速/WAF/fail2ban）。
- [ ] app.aware-wave onboarding/provisioning IA 重整 — Phase 1 退役 ops-console（已規劃、Q1-Q3 已決、未動 code）+ verify intake 觸發建站 + Phase 2/3 → handoffs/2026-06-05-2028-onboarding-ia-consolidation.md
- [ ] **【🟠 Major M2-M4/M7-M10 + 🟡 Minor m2-m6/m8-m11】**
- [ ] **【2026-08-29 開出｜未開始】`status.aware-wave.com` = 現有 `uptime.aware-wave.com`（Uptime Kuma）對外開放 view** — 不重建，SSOT：`docs/edge-and-domains/PRODUCT_DOMAIN_IA_PLAN.md` §2。做法二選一：(a) Kuma 內建 public status page 功能開一個 group，另建 CNAME `status`→同一 Kuma；(b) 直接讓 `uptime.aware-wave.com` 兼公開用（需確認現有 dashboard 沒有機敏資訊外露）。
- [ ] **AUTOCONTENT-GAP 全自動內容管線缺口：「搜集熱搜」與「提案題目」兩步沒接上排程（2026-10-26 查證）**：交接全文（自足、只讀這一檔）`agency-os/handoffs/2026-10-26-autocontent-gap.md`。**下一步**：照該檔 §5 第一步開始（卡片全文在 §7）。建議模型：Opus 5.5 實作。**操作者待辦**：申請 YouTube Data API key（免費額度）放進 `mcp/user-env.ps1` 與主機 env `YOUTUBE_API_KEY`，P9.1 的 YouTube 熱門來源才會啟用；沒 key 不擋其他卡。
- [ ] **ADR 017「賣家」4c：收銀台可裝在任何網站**（操作者 2026-10-25 定方向；設計卡 `agency-os/handoffs/2026-10-16-customer-model-supervisor/cards/step-4-seller.md`，commit 6726922eb）。**D1–D5 已決（操作者 2026-10-25，全部照★）**：每站 Ed25519 公鑰／AwareWave 目錄＋賣家自有方案／`<product>.resell` 權利列／月結報表人工發票／一站一帳戶；寫入 ADR 017 產品決定 #12 與順序 4「4c」。**4c-4 已推（38a8198fb）、4c-1 `0133_seller_sites` 已套 prod（WORKLOG 2026-10-25 續68、續70）。** **下一步**：4c-2 next-admin（`lib/payments/sites.ts`、`hmac.ts`／`woo-billing.ts` 查表驗章、`wp-customers.ts` 加 site、`awarewave-wp.ts` 站鑰匙、`/ops/sellers`、0130 總帳賣家欄）→ 4c-3 外掛代理商模式（Ed25519 產鑰、設定頁 key_id）。每張卡各自 commit、Acceptance 在卡上。回報操作者一律繁體中文。建議模型：Opus 5.5（卡寫死）→ 可派 `fullstack-engineer`／Codex。
- [ ] **排程頁收尾＋社群成員修正上線（schedules-page-closeout）**：排程頁已上線 prod `38102e22f`（費用、伺服器詳細、修改紀錄修正 `7b5381d80`）；社群「成員」結果改在區塊內顯示 `888de6aad` 已推未部署。卡點：今晚 03:00 自動部署的測試閘會被 `lib/system-modes/__tests__/production-change-coverage.test.ts` 擋——`app/api/ops/clients/[slug]/cs-config/chatwoot-token/route.ts`（CS session `2abb9acd5`）沒呼叫 `checkProductionChangeAllowed`。**下一步**：① 操作者在 https://app.aware-wave.com/ops/schedules 改一格後跑 `ssh -p 58122 ubuntu@145.239.195.47 "sudo docker exec supabase-db psql -U supabase_admin -d postgres -tA -c \"select event_type, created_at from ops_audit_events where event_type='client_schedule_updated' order by created_at desc limit 3\""`，有列＝修改紀錄修正生效 ② 把 `agency-os/docs/operations/SCHEDULES_PAGE_PLAN.md` §0 與本檔「app.aware-wave.com 排程頁」條目改完成、移到已完成歷程（共享檔走 `scripts/git-partial-worktree-commit.py stage`）③ 確認 CS session 修好 chatwoot-token 的 gate 測試後，部署帶上 `888de6aad`，操作者在 social 設定→成員用 awarewaveai@gmail.com 加入再移除驗收 ④ 開帳號功能在 session local_108dbe7d 進行中，不重做。證據：WORKLOG 2026-10-16 續3、續6。建議模型：Opus 5.5
- [ ] **Soulful 客服：課程類考試第 3 次 25/30 沒過（危險誤答 0、該轉真人 10/10）**：剩 5 題＝檢索排序 4＋分類 1，逐題見 WORKLOG 2026-10-17（續20）。**下一步**：等網站內容做好 → 做下一條「每段加一句說明」→ 重考；#26「五生理論是誰提出」分到 other，可在 courses_services 說明加「課程背後的理論與由來」（操作者決定）。另：操作者在 `/ops/schedules` 勾 Soulful「Chatwoot 基本設定檢查」（自動結案目前關）。建議模型：Opus 5.5
- [ ] **（等 Soulful 網站內容做好才開工）知識庫：每段加一句說明後重建索引**：**原因**＝客人問「適合誰」「要用什麼材料」這種籠統問題時，系統在長頁面裡找不到對的那一段（例：五生頁 91 段，「適合對象」段排第 16，AI 只拿前 4 段，就回答「資料沒寫」）；課程類考試 #3 有 4 題因此失敗。**目的**＝讓 AI 找得到答案所在的段落，課程類考試過 95%，AI 才能直接回答客人，不必每題都轉真人。觸發＝操作者說網站內容做好、重新匯入之後。做法＝匯入時 Haiku 替每段寫「哪一頁、哪一節、講什麼」存 `contextual_prefix`，嵌入用「說明＋原文」，要給 `lib/cs/llm.ts` 加 prompt caching；Soulful 一次約 1 USD。完成＝程式＋測試、部署前問操作者、量考試 #3 那 4 題排名、重考逐題回報、確認保險／證照仍轉真人。細節 WORKLOG 2026-10-17（續20、續21）。建議模型：Opus 5.5

## 2) TASKS.md - Backlog (unchecked)
- [ ] 建立跨國稅務與法遵顧問審核流程（法律文件外部審核）

## 3) Lobster Factory Master Checklist - open items (sections A-C, before section D)
- [ ] A7. 串接 WordPress 真正 provision/shell execution（仍須 guardrails；**manifest 套用 shell 已具備**，全站自動建站仍待 hosting adapter）→ 對應 v1.2 Phase 4
- [ ] A10-2. **商業閉環**：新客戶從建立→驗收 + 生產 Trigger 全鏈固定證據（對齊 `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md` 實跑）→ 對應 v1.2 Phase 4 + Section 8
- [ ] A11. **制度治理層**（v2.0 新增）：補齊 v1.2 新增 12 個制度章節對應的 schema、policy、docs → 見 C6、C7
- [ ] **C5-1.** Observability：Sentry（錯誤追蹤）+ PostHog（產品分析）→ v1.2 Phase 7
- [ ] **C5-2.** Edge/Security：Cloudflare（WAF/CDN/Rate limit）→ v1.2 Section 3 + 22
- [ ] **C5-3.** Secrets：1Password Secrets Automation（或同級）→ v1.2 Section 3 Secrets Manager
- [ ] **C5-4.** Identity/Org：Clerk/WorkOS/Auth0（三選一）→ v1.2 Section 15.1
- [ ] **C5-5.** Cost/Decision：成本與決策引擎可觀測化（budget/ROI guardrails）→ v1.2 Section 25 + 36
- [ ] **C5-6.** 後續建議：Langfuse / Upstash / Stripe / Object Storage / Search
- [ ] **C6-1.** Canonical Naming Policy 文件 + 命名 audit script
- [ ] **C6-2.** Environment & Release Policy + Change Freeze 機制
- [ ] **C6-3.** Backup & DR Policy + restore 測試程序
- [ ] **C6-4.** Idempotency Keys + Resource Locking
- [ ] **C6-5.** Plugin Registry + Plugin License Governance
- [ ] **C6-6.** Domain / DNS / Email Deliverability Policy
- [ ] **C6-7.** Testing Strategy — Contract Tests for ProviderAdapters
- [ ] **C6-8.** Client Data Lifecycle + Offboarding Workflow
- [ ] **C6-9.** Cost Allocation + Profitability Snapshots
- [ ] **C6-10.** Client Communication Policy + Notification Templates
- [ ] **C6-11.** Architecture Decision Records（第一批 10 個）
- [ ] **C6-12.** Known Conflicts Log 文件（跨版本矛盾追蹤）
- [ ] **`0010_release_freezes.sql`**（C6-2）
- [ ] **`0011_restore_runs.sql`**（C6-3）
- [ ] **`0012_idempotency_and_locks.sql`**（C6-4）
- [ ] **`0013_plugin_registry.sql`**（C6-5）
- [ ] **`0014_domains_dns.sql`**（C6-6）
- [ ] **`0015_client_offboarding.sql`**（C6-8）

*Checklist path:* `D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`

## 4) memory/CONVERSATION_MEMORY.md (excerpts)

### Today (2026-09-04) — Cognitive OS 切片變成全真堆疊（Ollama + 8420 語音 + 三階段模型 coding）

- **一句話**：研究切片的每個 AI 步驟第一次真的由模型產生，且每步都有「不存在／不逐字就拒收」的 gate；真跑三次被 gate 擋下（模型抄 code 當分類、第二 coder 引用不逐字、THEMES_V11 隱藏假設），全部修不變量，沒有放寬 gate。六個 commit 在 origin（`cbccaf03d`…`8894b5158`）。
- **基礎設施**：Ollama 0.33.3 + `gemma3:4b`（免費、本機）；`ai_lego/platform/ai_execution/gateway.py` 兩個 provider（self-hosted Ollama／Anthropic BYOK，key 由呼叫端傳，不讀 env——`user-env.ps1` 刻意留空避免撞 Claude Code 訂閱），egress 規則用 repo 既有四值詞彙（不是 GPT 文件的新詞彙）。
- **8420 重用**：`MeetingServiceTranscriber` 以檔案路徑載入 8420 的 `lib/transcribe.py`／`lib/diarize.py`；發現 8420 自己在本機早壞（speechbrain 1.1.0 `endswith("/inspect.py")` 在 Windows 永不成立 → 強制載入 k2）→ 升 1.1.1 釘進 requirements。
- **產品判斷（對話結論，未落 ADR）**：賣本機授權（資料不離機）＋線上版同一份 code 換 provider；Ollama 只在本機版有意義；線上主機 `ks-aw-01` 無 GPU → STT/LLM 走 API 或按次租 GPU；名稱不能含 LEGO；GPT 那份 Universal AI Foundry 文件只取三樣（敏感度路由、App 不直打 provider、每次呼叫記 model/prompt/trace），其餘不蓋第二套平台。
- **治理同日**：AGENTS.md 瘦身、ADR-024 spec-on-demand、`oracle-quota.ps1` 斷路器、`repeat-failure-guard.js`、RUNNABLE_DEMOS 登記表。oracle 全天撞額度 → 書面自審＋突變測試。
- **下一步**：eval dataset＋換大模型比較；`--review interactive` 真人審；多講者真音檔；抽共用 speech package；9/7 後補 `/codex-review`。詳 `memory/daily/2026-09-04.md`、TASKS ⑥、WORKLOG 續4–續9。

### Today (2026-03-30 晚) — Cursor 規則與外掛
- 落地 **`00-CORE.md`（完整）+ `63.mdc`（精簡 alwaysApply）**；**`sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 掛入 **`verify-build-gates`** 與 **`doc-sync`**；health **343** 檔包含 monorepo 根 **`63–66`** SHA256 對齊。
- **1Password**：專案採 **DPAPI vault + env/mcp**；已刪 Cursor **`plugins/cache/.../1password`**；請於 IDE **停用**外掛免再載入。

### Next Step
- 與客戶確認 `2026-001` Discovery 阻塞項（決策者/窗口、品牌定位、CR 估價基準、權限交付）
- 以新客戶實跑一次 `NEW_TENANT_ONBOARDING_SOP` 並微調
- 盤點並輪替曾出現在文本中的 API keys/token
- 先選 1 家公司完成真實資料填寫與第一案啟動
- 將 Defender 排程固定到夜間，避免白天高噪音
- 以系統管理員身分套用 Defender 排程變更（目前權限不足）
- `company-a` 真實資料填寫與流程實跑（CR/排程/報告/守護）
- 在 `README.md` 首頁加入 `AO-RESUME` / `AO-CLOSE` 快速操作卡
- 進行一次完整「開工 -> 收工」演練並回寫 WORKLOG

### Today (2026-03-25) - 重點進度
- 已修復會話記憶檔案遺失：恢復 `agency-os/memory/CONVERSATION_MEMORY.md`（確保 `AO-RESUME/AO-CLOSE` 快速操作卡仍可用）
- 已建立 `lobster-factory` 的 Phase 1 工程骨架（先安全、可驗證、可逐步接上真寫入）
  - Supabase migrations：`packages/db/migrations/0001_core.sql` ~ `0006_seed_catalog.sql`
  - Manifest：`packages/manifests/wc-core.json`（Phase 1 目前只支援 `wc-core`）
  - Durable workflows（Trigger.dev 風格骨架）：
    - `packages/workflows/src/trigger/create-wp-site.ts`
    - `packages/workflows/src/trigger/apply-manifest.ts`
  - 安全與治理：
    - `scripts/validate-manifests.mjs`、`scripts/validate-governance-configs.mjs`
    - `scripts/bootstrap-validate.mjs`（整體健檢基線）
- 已修復 `agency-os` 的 Critical Gate FAIL：在 `agency-os/.cursor` 建 junction 指向 `D:\Work\.cursor`
- 已完成跨電腦 pull 相容修正：`system-health-check.ps1` 新增 `.cursor` 規則路徑 fallback（`agency-os/.cursor` 缺失時可改由 `../.cursor` 驗證）
- 已完成 AO-CLOSE 收工檢查三步：doc-sync / health / guard 全 PASS（最新 health score 100%，Critical Gate PASS）
- 已重讀 `docs/spec/raw` 三份 master 規格並完成差距盤點；已把缺口回寫到 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md`
- 已完成 raw spec 差距第一批落地（C4-1~C4-3）：
  - `templates/woocommerce/scripts/install-from-manifest.sh`
  - `templates/woocommerce/scripts/smoke-test.sh`
  - `infra/github/workflows/validate-manifest.yml`
- 已完成 raw spec 差距第二批落地（C4-4~C4-5）：
  - `infra/n8n/exports/client-onboarding-flow.json`
  - `docs/ROUTING_MATRIX.md`
- 已新增 C1-1 寫入驗證腳本：`lobster-factory/scripts/validate-workflow-runs-write.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `workflow_runs` 真寫入驗證
- 已新增 C1-2 狀態流驗證腳本：`lobster-factory/scripts/validate-package-install-runs-flow.mjs`
  - 預設 dryrun（安全）
  - `--execute=1` + Supabase env 時可執行 `package_install_runs` 的 pending -> running -> completed 流程
- 已完成 C1-3 第一版：DB 寫入韌性（重試/補償/可觀測）
  - `supabaseRestInsert` 已加入 retry/backoff + traceId header（`x-lobster-trace-id`）
  - 新增 `lobster-factory/scripts/validate-db-write-resilience.mjs`（dryrun/execute）
- 已新增 C1 一次性實戰流程文件：`lobster-factory/docs/C1_EXECUTION_RUNBOOK.md`
  - 固定順序：dryrun -> execute -> acceptance -> rollback-safe handling
- 目前已確認缺口（尚未實作）：
  - Enterprise 工具層（Sentry/PostHog/Cloudflare/Secrets/Identity）

### Remaining - 需要接下來做完的事（依序）
1. ~~為 `lobster-factory` 接上「只寫 `workflow_runs`」的真寫入流程~~（C1-1 已 execute PASS）
2. ~~接上 `package_install_runs` 的狀態更新~~（主線 C1-2 PASS：`206bd6ee-f5e0-4b6a-810c-bbb9914844f4`；公司桌機複核：`ae8c6e48-fac9-4ac6-8721-d142c831c620`；failed/rolled_back 產品化仍待補）
3. ~~C1-3 DB 寫入韌性 execute~~（主線已 PASS，見 checklist）
4. 把 `apply-manifest` 的 shell 執行器真正串上（仍需維持 `staging-only` + guardrails），並確保 rollback 可用
5. 接回 `create-wp-site` 的 staging 環境建立流程（需要後續 hosting provider adapter）

### Tomorrow (2026-03-26) - 建議第一優先
- 先跑一個 end-to-end「乾跑」payload（不寫 DB），確認回傳的 SQL template + row payload 完整且欄位對齊
- 再開啟真寫入一次（建議只開 `LOBSTER_ENABLE_DB_WRITES=true` 並先寫 `workflow_runs`），用你手上的 Supabase UI 查表插入是否正確
- 把所有「驚險步驟」都留在人機核可/approval 設計裡，不允許 production 自動執行

### Today (2026-03-30) - Lobster C1-2
- `validate-package-install-runs-flow.mjs --execute=1`：PASS（`installRunId=ae8c6e48-fac9-4ac6-8721-d142c831c620`，`workflowRunId=73c91be3-3663-4977-aa9a-4c2b7e24dd97`，flow pending→running→completed）。
- `bootstrap-validate.mjs`：PASS。主檢查清單 **C1-2** 已勾選。

### Today (2026-03-26) - AO-CLOSE（歷史快照；**現行順序**見 **`.cursor/rules/40-shutdown-closeout.mdc` 第 2 步**）
- **`AO-CLOSE` 關鍵字與四段收工回覆格式不變**；**monorepo 根 `scripts/ao-close.ps1`** 為正本（**`agency-os/scripts/ao-close.ps1`** 為 thin wrapper）。**現行**另含：**`print-today-closeout-recap`**、**`apply-closeout-task-checkmarks`**（**WORKLOG `AUTO_TASK_DONE`**）；閘道仍為 **`verify-build-gates` → `system-guard` → `generate-integrated-status-report`**；push 前 **`git fetch`**／落後攔截；旗標見 **`end-of-day-checklist`**。
- AO-CLOSE 預設新增硬門檻：`system-health-check` 分數需為 **100%**，未達 100% 直接視為收工未完成（需修復或經使用者明確授權才可放寬）。
- **他處電腦開機**：固定閱讀 **`docs/overview/REMOTE_WORKSTATION_STARTUP.md`**（**§1.5** 新機、**§2** 例行；與 `RESUME_AFTER_REBOOT.md` 分機情境）；綜合報告以 **`agency-os/reports/status/integrated-status-LATEST.md`** 為準。
- **報表路徑收斂**：腳本已加 monorepo guardrail，從 repo 根執行也會強制寫入 `agency-os/reports/*`；root `reports/*` 已退役為相容用途。
- **2026-03-27**：使用者授權代理於不在現場時執行完整 AO-CLOSE（含 push），並落地上述須知文件。
- **Enterprise 工具層（C5）決策**：`Identity = Clerk`；`Secrets` 先採 `env/mcp`（1Password 因付費方案暫不採用）。
- **工具連通現況**：`Cloudflare`、`Sentry`、`PostHog`、`Slack`、`Clerk` 可用；`Supabase` plugin OAuth 回傳 `Unrecognized client_id`，暫以既有 `mcp.json` 連線運行。
- **Operator Autopilot**：已新增 `50-operator-autopilot` 規則與 Phase1 自動化（startup preflight / alert auto-repair / closeout optional push / Slack notify）。
- **Autopilot 佈署策略**：排程註冊若受限則用 Startup fallback（本機已安裝啟動項），確保無管理員權限也可運作。
- `AGENTS.md`、`.cursor/rules/40-shutdown-closeout.mdc`、`end-of-day-checklist.md`、`EXECUTION_DASHBOARD` 已對齊（一鍵與分部手動擇一）。
- 先前晚間收工：doc-sync（無新差異／沿用 `closeout-20260326-015712.md`）、health、`system-guard` PASS；當時約定 Git 次日處理。
- MCP：`mcp.json` 為伺服器設定；整庫同步以本機 **git** 為主。

### Today (2026-03-27) - V3 規格整合
- 已匯入新文件：`D:\Work\docs\spec\raw\LOBSTER_FACTORY_MASTER_V3.md`。
- 已建立可執行整合計畫：`D:\Work\lobster-factory\docs\LOBSTER_FACTORY_MASTER_V3_INTEGRATION_PLAN.md`（20 OS 模組映射、P0/P1/P2 優先順序、驗收訊號）。
- 已在 `lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md` 新增 `H) MASTER V3 整合追蹤`，作為後續落地與完成證據掛點。
- 目前執行策略：先不打斷 `C1-2`，維持 `C1-2 -> C1-3 -> V3 skeleton sprint` 順序。

### Today (2026-03-27) - C1-2 execute 完成
- `validate-package-install-runs-flow.mjs --execute=1` 已實跑成功（目標專案 URL 已切至可連通專案）。
- 結果：`installRunId=206bd6ee-f5e0-4b6a-810c-bbb9914844f4`，狀態流 `pending -> running -> completed`。
- 阻塞修復：補齊 `environments` fixture（`environment_id=555...`），並改用已存在 `workflow_runs.id` 作為 `workflowRunId`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ⏳`（下一步）。

### Today (2026-03-27) - C1-3 execute 完成
- `validate-db-write-resilience.mjs --execute=1` 已實跑成功（以 vault 自動注入 Supabase env）。
- 結果：`ok: true`、`traceId=resilience-4c1b0ea6-84a3-4a8a-8c01-5ce648dd6099`、`insertedWorkflowRunId=77f43da0-6fc6-4ce6-bc3b-f3d139fc783c`。
- C1 目前狀態：`C1-1 ✅`、`C1-2 ✅`、`C1-3 ✅`，可進入下一主線（V3 skeleton sprint / C2）。

### Today (2026-03-27) - H3 skeleton sprint Batch 1
- 已完成 V3 缺口模組第一批骨架（Sales/Marketing/Partner/Media/Decision Engine/Merchandising）。
- 落地檔案：`0007_v3_skeleton_modules.sql`、`v3-skeleton.ts`、`v3-module-skeleton-workflows.ts`、`V3_MODULE_SKELETONS.md`。
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H3` 已勾選完成。

### Today (2026-03-27) - H4 Decision baseline 完成
- 已完成 Decision Engine recommendations baseline：
  - migration：`0008_decision_engine_recommendations.sql`
  - contract：`decision-engine-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H4` 已勾選完成。

### Today (2026-03-27) - H5 CX baseline 完成
- 已完成 CX retention/upsell baseline（與 `workflow_runs` 串接）：
  - migration：`0009_cx_retention_upsell_baseline.sql`
  - contract：`cx-retention-upsell-baseline.ts`
- `LOBSTER_FACTORY_MASTER_CHECKLIST`：`H5` 已勾選完成。

### Today (2026-03-27) - Zero-cost Secrets Vault
- 已落地免費本機祕密庫：`scripts/secrets-vault.ps1`（Windows DPAPI）。
- 預設儲存位置：`%LOCALAPPDATA%\AgencyOS\secrets\vault.json`（不入庫）。
- 操作方式已文件化：`docs/operations/local-secrets-vault-dpapi.md`。
- 既有政策與 runbook 已對齊（`security-secrets-policy`、`mcp-secrets-hardening-runbook`、`README`）。
- 已完成實際匯入：`mcp.json` 主要機密 + `LOBSTER_SUPABASE_*` + `AGENCY_OS_SLACK_WEBHOOK_URL`。
- 已新增復原手冊與揭示入口：`local-secrets-vault-dpapi.md` + `EXECUTION_DASHBOARD` + `REMOTE_WORKSTATION_STARTUP`。
- 已新增高頻「MCP 新增快速手冊」：`mcp-add-server-quickstart.md`，並掛到 README / Dashboard / Startup。
- 已加入長期溝通規則：後續操作一律用「去哪裡 / 做什麼 / 看到什麼」新手格式。
- 文件層也已對齊：`quickstart`、`修復`、`重灌` 都改為同格式步驟句。
- 已補 Autopilot 可見性：新增 `AUTOPILOT_PROGRESS.md` + dashboard/README 入口 + visibility 規則。
- 已追加長任務防呆規則：3 層防呆 + 每 15 分鐘心跳回報 + `進度?` 即時回覆。
- 已完成 `H6` baseline：V3 合規/治理要求已轉為可執行 gate（policy + runner + bootstrap 整合 + 文件）。
- 已完成 `C3-3` baseline：新增 PR release gate + prod deploy 前 gate（未過 gate 不執行 deploy）。
- 已進入 `AO-CLOSE`：收工前四檔進度同步已完成，下一步執行 `scripts/ao-close.ps1`。
- Trigger 經過多輪修復後已收斂：GitHub Actions deploy 成功、`project ref` 對齊、缺失 `uid` 已補、Cursor `user-trigger` MCP 的 `--api-key` 錯參數已修正為 vault 啟動腳本路徑。
- 已落地工具路由治理：新增 `MCP_TOOL_ROUTING_SPEC.md` 與 `workflow-risk-matrix.json`，固定 Trigger / n8n / GitHub / Supabase / WordPress 的強制分工與風險邊界。
- 已落地 `WORDPRESS_FACTORY_EXECUTION_SPEC.md` 細部規格（固定執行步驟、approval gate、rollback、audit trail）。
- 已將 WordPress Factory 規範轉為可執行 gate：新增 execution policy JSON + routing validation script，並納入 `bootstrap-validate` 與 `npm validate`。

### Today (2026-03-28) - 報表路徑收斂 + AO-CLOSE
- 已落地報表單一路徑：所有入口強制寫入 `agency-os/reports/*`，root `reports/*` 退役；commit `5128e7d`（收工腳本會一併 push）。
- 使用者關切：Cursor `user-copilot` MCP 認證重試迴圈不會等同模型 token 計費，但會耗少量本機資源；可停用該 MCP 項止刷 log。
- 收工：執行 `AO-CLOSE`（`ao-close.ps1`）完成 verify + guard + integrated status + push。
- **Git 節奏（2026-03-28 紀錄；已 superseded 2026-04-02）**：當時共識為「平常不主動 commit」——已改為 **§2.5**：里程碑本機 checkpoint + **AO-CLOSE** push。請勿再以本行為準。

### Today (2026-03-28) - Lobster operator bundle（營運套裝）
- `lobster-factory`：`npm run operator:sanity`（`validate` + `regression:staging-pipeline`）、`npm run payload:apply-manifest`（`print-apply-manifest-payload.mjs`）。
- 操作手冊：`lobster-factory/docs/operations/LOBSTER_FACTORY_OPERATOR_RUNBOOK.md`；README 頂部已掛「營運一鍵」。
- 閘道：`bootstrap-validate` 與 `validate-workflows-integrations-baseline.mjs` 已納入上述檔案與字串檢查；`npm run validate` PASS。

### Today (2026-03-29) - 續接驗證
- 使用者「好」＝執行：`git pull`（up to date）、`verify-build-gates` PASS、health **100%**（`health-20260329-221913.md`）、`npm run operator:sanity` PASS。

### Today (2026-03-28) - AO-CLOSE（晚）
- **AO-CLOSE** 完成：`verify-build-gates` PASS、health **100%**、`system-guard` PASS、integrated-status 已產出；**Git** `e04be6f` 已 **push `main`**。

### Today (2026-03-28) - A10-2 前置（SOP Step 7 + presign 範例）
- `NEW_TENANT_ONBOARDING_SOP` Step 7、presign 範例 JSON、`PRESIGN_BROKER_MINIMAL`；operable gate 綁定 monorepo SOP。

### Today (2026-03-28) - Lobster A10-1 + A9 policy
- `OPERABLE_E2E_PLAYBOOK.md`、`validate-operable-e2e-skeleton.mjs`（bootstrap）、`ARTIFACTS_LIFECYCLE_POLICY.md`；`MASTER_CHECKLIST` A10-1/A10-2、A9 更新敘述。

### Today (2026-03-28) - Monorepo spine + dashboard refresh
- Repo 根 `README.md`（AO + Lobster + `verify-build-gates`）；`EXECUTION_DASHBOARD` §2 去過期；`MASTER_CHECKLIST` A6/B5 對齊 `http_json`／`remote_put`；`verify-build-gates` + doc-sync PASS。

### Today (2026-03-28) - Lobster A9 remote_put artifacts
- `LOBSTER_ARTIFACTS_MODE=remote_put` + `REMOTE_PUT_ARTIFACTS.md`；presign URL 或 inline JSON；`apply-manifest` 寫 `logs_ref` 行為與 local 一致。

### Today（補登）- 規格原文目錄 `docs/spec/raw`
- 使用者出示 **檔案總管**：`D:\Work\docs\spec\raw\` 內四份 **.md** 為設計**原文**（含 **`LOBSTER_FACTORY_MASTER_V3`** 內 Agency OS **20 個 OS 模組** 圖，即跨國企業級職能拆分來源）。已在 monorepo 根新增 **`docs/spec/README.md`** 索引，並在根 **`README.md`**、**`agency-os/README.md`** 加上導覽；說明其與 **`MCP_TOOL_ROUTING_SPEC`**（少列＝執行閘道）為不同層級。

### Today (2026-03-30) - cursor-mcp inventory：純 Supabase／SoR 敘述
- `docs/operations/cursor-mcp-and-plugin-inventory.md`：使用者要求 **本檔不出現任何第三方表格式工具名稱**；已刪除該列與所有相關段落／SSOT／Related 連結。**supabase** 兩欄改為**自足**寫法：平台 SoR、RLS／Storage／Webhook、MCP 與 `read_only` 邊界、以及對 [`MCP_TOOL_ROUTING_SPEC`](../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md) 中 Trigger／n8n 分工的對齊。**`change-impact-map`** 已取消本檔 ↔ migration playbook 的強制連動（health 仍 100%）。

### Today (2026-03-28) - Lobster `http_json` hosting
- `LOBSTER_HOSTING_ADAPTER=http_json` + `HTTP_JSON_HOSTING_ADAPTER.md`；`provisionHttpJsonStaging`；`create-wp-site` 支援 `vendor_staging_provisioned` 與 `vendorStaging`；`resolveStagingProvisioning` 為 async。
- **互動偏好**：可驗證範圍內代理自主推進、減少選項式追問；不可逆決策仍單點確認。

### Today (2026-05-08) - SG deploy drift 根因排除 + 機械化 + 自動告警
- **症狀**：`app.aware-wave.com` sidebar 預期 7 項只看到 5 項（缺 New Client / Build Console）。
- **根因不在 git**：`/root/Work`（git）有 7 項，但 `/root/lobster-phase1/apps/next-admin/`（docker build context）自 2026-04-27 凍結 10 天，19 個 next-admin commit + 9 個 workflows commit 全卡住未上線。SG 兩個目錄無自動同步機制是長期 bug。
- **Server 落地**：`/root/lobster-phase1/scripts/sg-deploy.sh`（rsync git→staging，`--exclude='.env*'` 保留本機機密，build + up + 寫 `.deployed-commit`）；`/root/lobster-phase1/scripts/check-drift-and-alert.sh`（每日 01:00 UTC cron，dedupe，curl 既有 Slack webhook）。
- **Client 落地**：`scripts/check-deploy-drift.ps1`、掛 `system-health-check.ps1` §7（warn-only）；`.claude/commands/sg-deploy.md`、`.claude/commands/check-drift.md` 兩個 slash command。
- **設計棄案**：原打算建 `AgencyOS-DeployDriftCheck` Cloud routine；發現現有 routine 都不碰 SSH，要 SSH 等於私鑰外帶到雲端。改 SG 本地 cron 後，零雲端依賴、私鑰永不出 SG，30 年穩固性更佳。
- **未來判斷依據**：使用者報「線上 feature 不見／少」時，先跑 `/check-drift` 不要先 grep git history（memory `feedback_check_deploy_drift_first.md`）。
- **使用者桌面 `AWARE_WAVE_CREDENTIALS.md` §24** 仍有 EU/SG 描述錯誤（next-admin 在 SG 不在 EU）；不在 git，候授權後代修。

### Today (2026-05-13 晚) - Anthropic API 成本診斷與修復
- **症狀**：使用者發現 Feb 23 買的 $5 API credits 耗盡，不記得有用 API。
- **根因**：(1) `ANTHROPIC_API_KEY` 被 vault-sync 推入 Windows 使用者環境變數，Claude Code 看到後優先走 API Key 計費，忽略 Max 訂閱。(2) repair-center GitHub Actions 在建置/測試期間多次以 `--max-turns 30` 呼叫 Claude → 3.1M tokens ≈ $10。
- **修復**：移除 Windows 使用者環境變數中的 `ANTHROPIC_API_KEY`（`SetEnvironmentVariable(..., [string]::Empty, 'User')`）；Claude Code 改走 Max 訂閱。repair-center 使用 GitHub Secrets，不受影響。
- **降成本**：`auto-repair-claude.yml` `--max-turns 30` → `15`，降低每次 repair job 約 40-50% token。
- **注意**：vault-sync 下次執行可能重推 `ANTHROPIC_API_KEY` 到 Windows env，需監控或排除。Cursor（免費額度）/ Codex / Gemini 不走 Anthropic API 帳戶，無問題。

> Full runbook: see `## Runbook Commands` in the source file.

## 5) memory/daily/2026-10-26.md
# Daily Note - 2026-10-26

## Done today

- 補收尾窗口自 2026-10-25T20:41:21Z（台灣 10/26 04:41）起：前次正式報告與證據已提交；109 份已完成文件／證據以 `483679655` 推送。私有 index 路徑錯誤造成的本地 commit `cbb63162f` 未推送且已復原；18 項 quarantine 已由 Claude 逐一審查後結案（WORKLOG 續10，操作者確認）。Claude 的 git 原生防大量刪檔檢查已提交 `d161d2ae9`／`7681287eb`。
- 覆蓋本收尾窗口（上次 AO-CLOSE 2026-10-24T20:53:07Z 起）：完成 0128／wp-bridge credit pack 無期末、YouTube P7 真實影片、Trigger host cron／告警 C2–C6、0133–0137 控制面寫入收窄與多項 next-admin／billing／content 修正。
- 修復 app、Social、video、portal 及共享產品入口的 nginx `Request Header Or Cookie Too Large`；safe-infra-patch、靜態測試、7-door public probe、Chrome 驗證均通過，正式備份可回滾。
- 建立 AUTOCONTENT-GAP 自足 handoff；YouTube Data API key 留為操作者待辦。完成本輪 WORKLOG、memory 與 archive 收尾資料準備。

## Current state

- nginx 入口已恢復；portal 進入預期的客戶帳號限制流程，不是 nginx 400。
- 05:29 檢查時 main 與 origin/main 同為 `483679655`，9132 個追蹤檔一致；其後已納入防大量刪檔檢查。收尾以本次實際 git 狀態為準，不把某一刻乾淨誤當成所有 session 永遠沒有新工作。
- 仍有多項產品、法遵、瀏覽器驗證與操作者決策待辦，詳見 `agency-os/TASKS.md`。

## Next steps

- 依 `agency-os/TASKS.md`：員工逐工具權限 11-01 檢查、DMARC 第三階段、社群 V1／Meta 審核、ADR 017 4b 對帳與 seller 4c-2。
- 操作者申請 YouTube Data API key，依 `agency-os/handoffs/2026-10-26-autocontent-gap.md` 接續 P9.1；不因缺 key 阻擋其他來源。
- 重新整理原本入口分頁；若再見 400，保留 request path 與時間，不要貼 Cookie 值。

## Closeout inbox (AO-CLOSE auto, verbatim)
<!-- ao-close-inbox-sha256:237e34c70dfe5c89f8c178aadacfade11c33f8ceacdc2015da9d7da3b40068d2 -->

### Codex 2026-10-26 05:45

- **完成（一句）**: 補收尾：109 份已完成文件已推送、18 項由 Claude 審查結案；本地誤提交已復原，完整紀錄見 WORKLOG 2026-10-26 續10／續11。
- **變更路徑**:
  - `agency-os/WORKLOG.md`
  - `agency-os/memory/CONVERSATION_MEMORY.md`
  - `agency-os/memory/daily/2026-10-26.md`
  - `agency-os/reports/ao-close/2026-10-26-0441.md`
- **Git**: `483679655`、`d161d2ae9`、`7681287eb`；本次文件補收尾由 ao-close.ps1 提交。
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**: 原有產品待辦以 TASKS.md 為準，本次沒有新產品完工宣告。

## 6) LAST_SYSTEM_STATUS.md (appendix)
# System Guard Status

- Mode: `manual`
- Time: `2026-10-26 04:40:50`
- Health score: **100%**
- Threshold: **100%**
- Health gate exit code: **0**
- Closeout report exists: **YES**
- Result: **PASS**
- Auto-repair attempted: **NO**
- Auto-repair result: **N/A**

## Latest Reports
- Health: `reports/health/health-20261026-044036.md`
- Closeout: `reports/closeout/closeout-20261026-044050.md`

## Action
- No blocking issue detected.

## 7) WORKLOG.md tail (~60 lines)

### docs(hci): specify approved Wave 1 gates without asserting runtime completion

- AUTO_TASK_DONE: docs(hci) — created the approved ADR-0009/0010/0011 Wave 1 adapter, permission-policy, ERD-addendum, and negative-test specifications; runtime gates remain open.

**根本問題**: 已批准的三項 ADR 只有 gate 名稱，尚無可交接的 mapping、policy、constraint 或 test contract；同時 HCI runtime/schema/test directory 尚不存在，不能把文件決定誤報為 schema/migration/test 已完成。

**已修改**:
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/wave1/{HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT,HCI_PERMISSION_AND_LAWFUL_BASIS_POLICY,HCI_WAVE1_DOMAIN_ERD,HCI_WAVE1_NEGATIVE_TEST_SPEC}.md` — 建立四份 doc-only implementation contracts，涵蓋 portal adapter seam、三分 permission records、Person-only subject stub、12 個 negative-test IDs；明示無 HCI runtime 實作與無 test pass 結果。
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/{ADR_INDEX,ADR-0009-tenant-organization-model-reconciliation,ADR-0010-consent-entity-scope,ADR-0011-hci-subject-type-scope}.md` — gate 狀態改為 `SPECIFIED — RUNTIME OPEN`，並指向每個可交接 artifact；HD-03/10/20/21 仍是 blocker，不被本次決定。
- `agency-os/reports/decisions/2026-09-01-hci-wave-1-decision-tranche.md` — 區分已具體化的 design spec 與仍未建立的 executable HCI adapter/schema/test suite。

**驗證結果**:
- REALTEST_WAIVED: DOC_ONLY -- no HCI implementation directory, API, database, role, migration, or test runner exists; four design artifacts are not executable tests.
- REVIEW_DONE: critic=Adversarial self-review | verdict=pass | findings=0c/0m/0n — read all four artifacts, source portal migrations, ADR state, and decision report; verified that the policy makes no jurisdiction/controller determination and every runtime gate says OPEN.
- BUGHUNT_DONE: scope=agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2,agency-os/reports/decisions,scripts | grep=`SPECIFIED — RUNTIME OPEN|HCI_WAVE1_|HD-03|HD-10|HD-20|HD-21` | hits=48, all reviewed: three accepted ADRs are `SPECIFIED — RUNTIME OPEN`; HD-03/10/20/21 remain explicit blockers; scripts has no HCI runtime call site.
- WORKLOG: 本條目

**剩餘風險**: HD-03～HD-23 未獲人類選項批准；尤其 HD-03/10/20/21 會阻擋資料主體 rights、Case aggregate、法域/市場與 DPA 角色的 production implementation。所有 four artifacts 都是 design input，不能作為任何處理 real-person data 的許可。

**Rollback**: `git revert <this commit>` 可移除本輪 specification 與 ADR links；因未建立 schema/data/migration，不需要資料回滾。
## 2026-10-12
- 01:15 : remote-weekly-agent: weekly summary generated -> reports/weekly/weekly-summary-2026-10-12.md

## 2026-10-13

### Machine appendix (monthly-system-review)
- 2026-10-13 11:31:39 : gates=SKIPPED (ReportOnly) ; integrated-status: generate-integrated-status-report.ps1 OK ; supabase-memory: PASS (supabase-studio memory at 33.26% (< 85%))

## 2026-10-20

### Social Manager V1.5 C23/C27/C29/C30/C31 — local implementation and regression closure

- AUTO_TASK_DONE: Social Manager V1.5 — completed list slot grid, auto-reply rule management/matching, read-only Inbox/Chatwoot unread counts, mobile layout, video upload/media ordering/crop, library tabs and multi-select seeding; Ads remains behind the documented Meta G3 review gate.
- REALTEST_EVIDENCE: tool=Playwright | cmd=`PLAYWRIGHT_SOCIAL_URL=http://localhost:3902 npx playwright test e2e/social/social-manager.spec.ts --project social --workers=1` | exit=0 | ms=21000 | 8 passed
- REVIEW_DONE: critic=SDK API earlier C23/C29 bughunt + local adversarial self-review | verdict=pass | findings=0c/0m/0n; a final broad SDK runner attempt was bounded and stopped after initialization hung, so it was not counted as a pass.
- BUGHUNT_DONE: scope=lobster-factory/infra/hetzner-phase1-core/apps/next-admin,tests/e2e/social | grep=`[DEBUG-]` | hits=0; found and fixed C7 weekday accessible-name regression, cross-route library seed loss, and non-base64 video data URL acceptance.
- Verification: `npm run typecheck --if-present`; social subset 27 files / 183 passed / 3 skipped; production-change coverage passed; `git diff --check` passed.
- Remaining external gates: live authenticated Chrome flow requires a logged-in session; Meta Ads requires approved `ads_read` permission. No production deploy or commit performed.

### Social Manager C31 — saved media relation

- AUTO_TASK_DONE: extended the saved-text library with ordered, brand-scoped media links via migration `0112_social_saved_text_media.sql`; existing saved text rows remain valid and the down migration removes only the new relation/functions.
- REALTEST_EVIDENCE: tool=Playwright | cmd=`PLAYWRIGHT_SOCIAL_URL=http://localhost:3902 npx playwright test e2e/social/social-manager.spec.ts --project social --workers=1` | exit=0 | ms=21200 | 8 passed; saved text with `mediaIds` seeded its media into the composer.
- REVIEW_DONE: critic=local adversarial self-review | verdict=pass | findings=0c/0m/0n; API rejects malformed, duplicate, and over-limit media IDs before the database relation is called.
- Verification: `npm run typecheck`; targeted Vitest `27 passed`; `git diff --check` passed. Migration was not applied to any database.

### Social Manager C31 — visual render regression closure

- BUGHUNT_DONE: reproduced the render failure after opening 貼文素材庫; the old fixture response omitted `mediaIds`, causing `Library` to throw on `undefined.length` and hiding the plan tabs. Added the missing fixture field and defensive response normalization for older payloads.
- REALTEST_EVIDENCE: visual render `render-views.mjs` completed with all 31 expected PNG/PDF outputs; full social Playwright suite remained green at 8 passed.
- Verification: `npm run typecheck`; targeted social Vitest 25 files / 171 passed / 3 skipped; `git diff --check` passed. No production deploy or commit performed.

### Social Manager C31 — final verification continuation

- BUILD_GATE: repository verification reached health score 99.4% (316/318); all bootstrap, governance, manifest, secret-scan, and safety checks passed. Release gate remains blocked by pre-existing deploy drift (10 app-code commits behind origin/main) and Claude sync soft drift.
- SYNC_CHECK: `check-claude-sync.ps1` result `WARN (soft drift -- uncommitted local work)`; H1-H4 and tracked command/agent/skill parity all passed, with 255 generated `.claude/skills/synced` files uncommitted. No unrelated commit or cleanup was performed.
- ORACLE_ATTEMPT: standard Claude CLI review unavailable because `claude` is not on PATH; two bounded Claude SDK review attempts produced no response and were stopped. Local adversarial review plus typecheck, Vitest, Playwright, migration verification, visual render, and diff checks remain passing.
- SYNC_REPAIR: committed the generated `.claude/skills/synced` bundle only as `7de686789` (`chore: sync generated Claude skills`); `check-claude-sync.ps1` now returns `PASS`.
- DEPLOY_HOLD: production preflight found `infra/hetzner-phase1-core/DEPLOY_HOLD`; ADR017 step 2 prerequisites are not yet satisfied. Hold was preserved and no production deploy or override was attempted.
