# 社群管理平台 — 執行計畫

> 建立 2026-10-14。決策正本：`agency-os/docs/architecture/decisions/016-social-manager-third-product.md`。功能範圍：`SOCIAL_MANAGER_FEATURE_MATRIX.md`。介面規格：`mockups/social-manager-mock.html`（repo 檔＝預覽頁；改樣稿先跑 `mockups/check-social-mocks.py`，再 `sync-app-theme.py --check`）。Postiz 運維：`runbooks/POSTIZ-OPS-RUNBOOK.md`。
> 每張卡六項：目標／範圍／輸入／輸出／驗收／邊界。驗收照 AGENTS.md §1 四動作（實測、Review、抓蟲、WORKLOG）。`.ts/.tsx` 改動完成前 `npx tsc --noEmit` 必綠；只寫卡片點名的測試。
> 路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`，除非另寫。

## 0. 動工前 gate（G1–G4 CLOSED 才開 C1；G5 在 C3 之前 CLOSED——C1／C2 不碰 Postiz，可先做）

| Gate | 做法 | 證據 |
|---|---|---|
| G1 Postiz 端點實測 | ✅ 2026-10-14：v2.11.3 只有 integrations／posts 列表／find-slot／is-connected／upload-from-url／刪單則；連接帳號、改狀態、分組、通知、媒體、分析、刪整組全 404（表在 ADR 016「實測」）。回應存 `next-admin/lib/content/__tests__/fixtures/postiz-v2.11.3/*.json` | WORKLOG 2026-10-14 |
| G2 `API_LIMIT` | ✅ 未設＝預設 30／小時；`GET posts` 也扣額度 | 同上 |
| G3 Meta app 狀態 | 操作者登入 Meta 開發者後台確認 IG 權限與審核進度 | TASKS.md 371 更新 |
| G4 ADR 016 已接受、樣稿定案 | ✅ 2026-10-14 操作者「同意」 | ADR 狀態 |
| **G5 Postiz 升級到 v2.25.1** ✅ 2026-10-15（`lobster-factory/infra/postiz/upgrade-postiz.sh`，演練 `rehearse-postiz-upgrade.sh` 三輪後上正式機；G1 那組 12 條全在、Bluesky 草稿建／列／刪過、20:00 自動重開後 Temporal worker 與 missing-post workflow 照常；WORKLOG 2026-10-15 續7、續9） | 備份 Postiz DB（`pg_dump`）＋ `/root/postiz/.env`、`docker-compose.yml` → image tag 改 `v2.25.1`、加 `API_LIMIT=<值>` → 照 `safe-infra-patch.sh` 同款流程（備份 → apply → `docker compose config` → `up -d` → 等 healthy → 失敗還原）→ 重跑 G1 那組 curl，所有 404 消失、現有兩個 integration 仍 `disabled:false`、Bluesky 草稿可建可刪。跨 14 個小版本，先讀 v2.12–v2.25 release notes 的 breaking changes 與 migration | WORKLOG＋runbook `POSTIZ-OPS-RUNBOOK.md` 版本號 |

## 1. V1 卡片（自己管多品牌就能用）

### C1 資料表 ✅ 2026-10-14（`packages/db/migrations/0096_social_manager.sql`；證據 WORKLOG 2026-10-14；未套正式庫，跟 C4 同一次部署）
- 目標：ADR 016 §2 的表。
- 範圍：`lobster-factory/packages/db/migrations/00NN_social_manager.sql`（編號接現有最大）；`social_postiz_connections` 的列搬進 `social_accounts`，舊表保留一版再刪。
- 輸入：ADR 016 §2–§3；0094 的 RLS 寫法；`organizations` 現有欄位。
- 輸出：表、索引（`social_posts(brand_id, scheduled_at)`、`(state)`）、RLS default deny、`social_audit_log` 只增不改的 policy。
- 驗收：拋棄式 DB 套用（`feedback_never_test_against_prod_container`）；`db-expert` 審 migration；`npm test` 綠。
- 邊界：不碰 `media_credit_ledger`；不改 0094。

### C2 產品登記 ✅ 2026-10-14（`lib/portal/products.ts` 是唯一產品清單：signup 表單與 `/api/signup` 都讀它，`selfSignup` 旗標＋`products.test.ts` 對 0062 的資料庫 check）
- `lib/portal/products.ts` 加 `{ key:"social", name:"社群發文", domain:"social.aware-wave.com", status:"coming_soon" }`；`ProductKey` 型別加 `"social"`。
- 驗收：`npx tsc --noEmit`；`app/portal/launcher` 顯示 coming soon。

### C3 Postiz client 擴充 ✅ 2026-10-15（`lib/content/postiz.ts`：`listPosts`／`deletePost`／`changeStatus`／`connectUrl`／`listGroups`＋`PostizApiError`；fixture `__tests__/fixtures/postiz-v2.25.1/`；順手修 v2.25.1 兩個相容問題：純文字貼文要帶 `image: []`、建立回應是 `[{postId}]`）
- 範圍：`lib/content/postiz.ts` 加 `listPosts({start,end,customer})`、`deletePost(id)`、`changeStatus(id, "draft"|"schedule")`、`connectUrl(platform, refreshId?)`、`listGroups()`；回應型別照 G1 fixture。
- 驗收：每個函式一個測試，用 fixture（`lib/content/__tests__/postiz-*.test.ts`）；錯誤路徑：429 回傳 `retryAfter`。
- 邊界：不在 client 裡做重試迴圈；rate limit 的退讓在 C5。

### C4 API ✅ 2026-10-15（`d55ec7686`，0096＋0098 已套正式、next-admin 已部署；兩份審查加複查見 WORKLOG 2026-10-15 續12）
- 0096 交代的：改 target／media 的同一個 transaction 要碰父貼文（讓 version 涵蓋子列）；0096 與 C4 同一次部署，部署後重跑一次 0011→social_accounts 的同步（冪等）補上中間新連的帳號。
- 路由：`app/api/social/brands`、`accounts`（`POST connect` 回授權網址並記「進行中」、`POST reconnect`、`DELETE`、`GET` 含狀態）、`posts`（CRUD、`PUT state`、`POST bulk`、`GET ?start&end` 合併 WordPress 文章）、`lists`、`media`（沿用 `uploadMedia`）、`log`。
- 授權：每個 handler 先 `requireBrandRole(brandId, ["owner","editor"])`；審核相關要 `reviewer`；客戶唯讀只有 GET。
- 狀態轉換只在一處：`lib/social/state.ts`（`transition(post, action, role)`，非法轉換丟錯）。已發佈不可改。
- 驗收：每條路由一個測試；`state.ts` 的轉換表測試（全部合法／非法組合）；超出字數上限 400。
- 邊界：不呼叫 Postiz 建貼文（C5）。

### C5 送出與對帳 ✅ 程式 2026-10-15（`packages/db/migrations/0100_social_dispatch.sql`＋`lib/social/dispatch.ts`；不變量在 0100 檔頭；Codex 五輪見 WORKLOG 2026-10-15。**2026-10-15 已上線**：0100–0102 已套、next-admin `df4f87eba`、Trigger 20261015.4；draft 模式真送 Bluesky 草稿驗 id 回寫通過後改 apply——證據 WORKLOG 2026-10-15 C12 上線條目）
- 0096 交代的：先以 `UPDATE … SET state='queued' WHERE state='scheduled' AND scheduled_at <= … RETURNING`（`FOR UPDATE SKIP LOCKED`，走 `social_posts_due_idx`）認領，再呼叫 Postiz，兩個重疊的排程不會重發。
- 範圍：`lobster-factory/packages/workflows/` Trigger.dev 任務 `social-dispatch`（每 5 分鐘）：`scheduled` 且 `scheduled_at <= now + 10min` → `createSocialPost`（批次，429 → 退讓到 reset）→ 記 Postiz ids → `queued`；`queued` → `listPosts` 對帳 → `published`（含 `releaseURL`）或 `error`（含訊息）→ 失敗寫 ops inbox＋Telegram。改時間：`queued` 的先 `deletePost` 再重建。
- C4 交代的（2026-10-15 審查）：部分已送的貼文只重送 state 是 pending／error 的 target；error 的先 `deletePost` 掉它的 Postiz ERROR 貼文、清空 `postiz_post_id` 再送。0098 不讓存檔改掉或移除 queued／published 的 target，任一 target 送出後，貼文層的文字（body、第一則留言、連結）也不能改（要改就給其他頻道各自的文字）。先鎖 post 列再鎖 target（0098 檔頭的鎖順序）。帳號 connected／expired 以送出結果為準（重新連接時 C4 輪詢到 `disabled:false` 就標 connected，Postiz 公開 API 看不出授權有沒有換新）。
- 驗收：dry-run 模式（`LOBSTER_EXECUTE_MANIFEST_STEPS` 同款開關）先跑一輪只記錄不送；真送一則 Bluesky 草稿（`type:"draft"`）驗 id 回寫；對帳把 fixture 的 ERROR 轉成 `error`。
- 邊界：部署用 `tr_pat_*`（CLI），runtime 用 `tr_prod_*`；不碰其他 workflow。

### C6 畫面 ✅ 程式 2026-10-15（`app/(shell)/tools/social/`；UI 流程 `infra/hetzner-phase1-core/tests/e2e/social/social-manager.spec.ts`，跑在碰不到 Supabase 的 dev server `tests/e2e/social/dev-server-no-supabase.mjs`；平台色改為 `globals.css` 的 `--p-*`）
- 範圍：`app/(shell)/tools/social/page.tsx`＋`SocialManager.tsx`（行事曆：週／月／清單；編輯：帳號、文字、各平台另寫、字數、媒體、第一則留言、連結＋UTM、替代文字、常用文字、格式、預覽手機／電腦；時間列：固定時間／加入輪播；四個動作；立即發佈二次確認）。資料全走 C4 的 API。
- 規則：用 `globals.css` 的 token 與 `.btn-primary`／`.btn-secondary`；不用 `<select>`；一屏（1280×660 不捲動）；狀態色對應 ADR 016 §5。
- 驗收：`npx tsc --noEmit`；Playwright（`/playwright`）：建立→排程→拖拉→清單批次→還原；`scripts/`（或 `__tests__/`）加「頁面原始碼無 `<select>`、無 hex 顏色」檢查，和 `check-social-mocks.py` 同規則。
- 垃圾桶需要一個列出 `deleted` 貼文的 API（C4 的 `GET posts` 不含 deleted），在這張卡加。
- 邊界：不碰 ContentStudio；舊面板在 C12 退場。

### C7 輪播清單 ✅ 程式 2026-10-15（`0101_social_rotation.sql`＋`lib/social/rotation.ts`；清單存檔＝撤回未送出的具體化貼文再重排；同一格唯一靠不會被清掉的 `origin_list_id`）
- 0096 交代的：具體化出來的貼文帶 `list_id`＋`scheduled_at`，`social_posts_list_slot_idx` 讓同一格不會生兩次；刪清單前先刪它 `state='rotation'` 的項目（資料庫會擋，API 回 409）。
- C4 交代的：`list_position` 只存在 rotation 狀態；人對具體化貼文做任何動作（改時間、取消排程、刪除）都會清掉 `list_id`，它就變成手動貼文。所以「這一格做過沒」要記在清單的 cursor，不能靠找帶 `list_id` 的列；暫停撤回只撤還帶 `list_id` 的貼文（人動過的已是手動貼文，不撤）。
- 範圍：清單 CRUD（C4 `lists`）＋ Trigger.dev 任務 `social-rotation`（每日 00:05 把未來 7 天的輪播發文具體化成 `scheduled` 貼文並前推 cursor；清單暫停時撤回尚未 `queued` 的）。畫面：左「輪播」檢視＋右清單編輯（照樣稿）。
- 驗收：具體化冪等（同一天跑兩次不重複）；暫停撤回測試。

### C8 審核與角色與通知 ✅ 程式 2026-10-15（決定：審核預設不必經，每品牌「發文前要先審核」開關，`0102_social_review.sql`＋`lib/social/review.ts`；每品牌指定成員／審核人要等 middleware 帶出使用者 id——身分層，併 C12 的 go-ahead）
- 範圍：品牌成員表＋角色（C1 已建表）；`reviewer` 核准／退回＋理由進備註與紀錄；通知：`error`、`expired`、等待審核 → `needs()` 同款查詢供「通知 N」；Telegram 用既有 ops 通知管道。
- 先決定：審核是不是必經。現在 editor 可以從 draft 直接排程，owner 核准後 editor 也還能改內容（`lib/social/state.ts` RULES）。
- 驗收：角色矩陣測試（4 角色 × 6 動作）。

### C9 媒體庫 ✅ 程式 2026-10-15（`MediaView.tsx`；用過次數＝PostgREST embedded count）
- 範圍：`social_media` 列表＋上傳（沿用 `uploadMedia` 與現有 storage）；用過次數；貼文附圖從庫選。
- 邊界：R2 搬遷另開卡（runbook 的 R2 項目）。

### C10 WordPress 文章 → 貼文 ✅ 程式 2026-10-15（`lib/social/wp-article.ts`、`GET /api/social/wp-article`、`ArticleSource.tsx`）
- 範圍：行事曆上的文章卡 → 「用文章摘要」（WP REST `excerpt`＋主圖＋連結，免費）／「AI 改寫」（既有 `/api/content/syndicate`，按鈕標費用）→ 開編輯器預填。
- 驗收：兩條路徑各一測試；費用顯示來自 `lib/ai/cost-model.ts`。

### C11 紀錄 ✅ 程式 2026-10-15（`LogView.tsx`；連接／取消／移除帳號、上傳媒體、清單存檔與刪除補寫紀錄）
- 範圍：所有狀態轉換、改時間、連接、刪除、還原寫 `social_audit_log`（C4 的 `transition` 內統一寫）；「紀錄」檢視＋「需處理」篩選。
- 驗收：每個動作一筆紀錄的測試。

### C12 上線（Opus 5.5；High-STOP）——1→4 ✅ 2026-10-15；6 ✅ 程式、5 ✅ 程式 2026-10-15（ADR 018），5 上線待 go-ahead
- 範圍：nginx vhost `social.aware-wave.com`（`safe-infra-patch.sh host-nginx`）；`middleware.ts` 以 host 選產品；`sg-deploy.sh next-admin`；`/playwright smoke`；ContentStudio 的 Postiz 面板改成「到社群發文」連結。
- 驗收：`/check-drift` → `/verify` → deploy → smoke；runbook §9 更新；WORKLOG。
- 對外開放前（C4 審查 2026-10-15 留下的）：API 錯誤訊息改成固定文字（現在 `lib/social/store.ts` fail()／addImage 會帶資料庫與 Postiz 的原文，只限員工時可接受）；`GET /api/social/accounts` 會寫入（配對連接），而 GET 不經過 CSRF 檢查。
- 邊界：先 go-ahead 才 deploy。
- 2026-10-15 C5–C11 程式完成後，這張卡要一次 go-ahead 的項目（照順序）：
  1. 套 0100 → 0101 → 0102（`node scripts/apply-db-migration.mjs 0100 0101 0102`；純新增，0101 換掉 0098 的兩個函式，先部署前套，舊程式呼叫 `social_save_list` 的 7 參數版會 PGRST202 → 0101 與 next-admin 部署要同一個窗口）。
  2. compose 加 `SOCIAL_DISPATCH_TOKEN`（`safe-infra-patch.sh compose`），`SOCIAL_DISPATCH_ENABLED=true`、`SOCIAL_DISPATCH_MODE=draft` → `sg-deploy.sh next-admin` → `/playwright smoke`。
  3. Trigger deploy（`trigger-deploy-agent`，`tr_pat_*`）：`social-dispatch`、`social-rotation`。
  4. C5 驗收：排一則 Bluesky 貼文 → draft 模式送出 → Postiz 出現 DRAFT 且 `postiz_post_id` 回寫 → 刪掉 → 改 `SOCIAL_DISPATCH_MODE=apply`。
  5. 子網域（規則＝ADR 018 三扇門）。程式已完成：`lib/portal/doors.ts`、middleware 把 social 網址的頁面改寫到 `/social`（`app/social/`，不套員工側欄）、其他 API 404；登入 cookie 不跨子網域，social 網址自己登入。repo 已寫好 lobster-nginx `nginx/default.conf` social 區塊（擋 matcher 跳過的路徑與編碼路徑）與主機 `sg-stack.aware-wave.com.conf` server_name。**上線待 go**：Cloudflare DNS `social`（proxied）→ 憑證加 social（`/etc/letsencrypt/live/aware-wave.com` 2026-10-15 查：SAN 10 個網址，沒有 social；用該憑證原本的簽發方式 expand）→ 主機 nginx（`safe-infra-patch.sh host-nginx`）→ lobster-nginx（`safe-infra-patch.sh nginx`）→ `sg-deploy.sh next-admin` → `/playwright smoke`＋social 網址實測（未登入轉 /login、/api/ops 404、員工登入看得到社群）；ContentStudio 的 Postiz 面板換成「到社群發文」連結。
  6. ✅ 程式 2026-10-15：middleware 帶 `x-ops-user-id`；`authz.ts` 讀 `social_brand_members`（成員列優先，員工 owner/admin 全品牌 owner）；客戶不能開新頻道連接（時間配對只對員工安全）、看不到員工角色與 user id。成員管理畫面未做（目前只能 SQL 加成員）。隨 5 一起部署。

## 2. V2（開放訂閱前）
`social_audit_log` 保留期限或按月分割（每則貼文約 2 列，768 MB 主機）；WordPress 會員一鍵進入（ADR 015 §2）；方案與用量上限＋WooCommerce；Postiz analytics（審核後）；Chatwoot 入口與未讀數；最佳時段；重複貼文；find-slot 佇列；對外 API／MCP；服務條款、隱私政策、資料刪除；第二台 Postiz 的 instance 對應。

## 3. 順序與依賴
C1 → C2、C3（並行）→ C4 → C5、C6（並行；C6 可先用 C4 的 mock 資料）→ C7、C8、C9、C10、C11（並行，互不碰檔）→ C12。
寫程式的 session 一次一張卡、一組檔；兩個 session 不碰同一檔。
