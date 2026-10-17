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

### C8 審核與角色與通知 ✅ 程式 2026-10-15（決定：審核預設不必經，每品牌「發文前要先審核」開關，`0102_social_review.sql`＋`lib/social/review.ts`；每品牌成員／審核人：C12 第 6 點帶出使用者 id，2026-10-15 設定頁「成員」可管理，0103）
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

### C12 上線（Opus 5.5；High-STOP）——1→6 ✅ 2026-10-15（5、6 上線：next-admin `4c4e153a7`，social.aware-wave.com 開門；ContentStudio 換連結未做）
- 範圍：nginx vhost `social.aware-wave.com`（`safe-infra-patch.sh host-nginx`）；`middleware.ts` 以 host 選產品；`sg-deploy.sh next-admin`；`/playwright smoke`；ContentStudio 的 Postiz 面板改成「到社群發文」連結。
- 驗收：`/check-drift` → `/verify` → deploy → smoke；runbook §9 更新；WORKLOG。
- 對外開放前（C4 審查 2026-10-15 留下的）：API 錯誤訊息改成固定文字（現在 `lib/social/store.ts` fail()／addImage 會帶資料庫與 Postiz 的原文，只限員工時可接受）；`GET /api/social/accounts` 會寫入（配對連接），而 GET 不經過 CSRF 檢查。
- 邊界：先 go-ahead 才 deploy。
- 2026-10-15 C5–C11 程式完成後，這張卡要一次 go-ahead 的項目（照順序）：
  1. 套 0100 → 0101 → 0102（`node scripts/apply-db-migration.mjs 0100 0101 0102`；純新增，0101 換掉 0098 的兩個函式，先部署前套，舊程式呼叫 `social_save_list` 的 7 參數版會 PGRST202 → 0101 與 next-admin 部署要同一個窗口）。
  2. compose 加 `SOCIAL_DISPATCH_TOKEN`（`safe-infra-patch.sh compose`），`SOCIAL_DISPATCH_ENABLED=true`、`SOCIAL_DISPATCH_MODE=draft` → `sg-deploy.sh next-admin` → `/playwright smoke`。
  3. Trigger deploy（`trigger-deploy-agent`，`tr_pat_*`）：`social-dispatch`、`social-rotation`。
  4. C5 驗收：排一則 Bluesky 貼文 → draft 模式送出 → Postiz 出現 DRAFT 且 `postiz_post_id` 回寫 → 刪掉 → 改 `SOCIAL_DISPATCH_MODE=apply`。
  5. ✅ 2026-10-15 上線（DNS、憑證 11 SAN、主機 nginx、lobster-nginx、sg-deploy `4c4e153a7`；證據 WORKLOG 2026-10-15 C12 ⑤⑥ 上線條目）。未做：ContentStudio 的 Postiz 面板換連結。以下為當時的步驟：子網域（規則＝ADR 018 三扇門）。程式已完成：`lib/portal/doors.ts`、middleware 把 social 網址的頁面改寫到 `/social`（`app/social/`，不套員工側欄）、其他 API 404；登入 cookie 不跨子網域，social 網址自己登入。repo 已寫好 lobster-nginx `nginx/default.conf` social 區塊（擋 matcher 跳過的路徑與編碼路徑）與主機 `sg-stack.aware-wave.com.conf` server_name。**上線待 go**：Cloudflare DNS `social`（proxied）→ 憑證加 social（`/etc/letsencrypt/live/aware-wave.com` 2026-10-15 查：SAN 10 個網址，沒有 social；用該憑證原本的簽發方式 expand）→ 主機 nginx（`safe-infra-patch.sh host-nginx`）→ lobster-nginx（`safe-infra-patch.sh nginx`）→ `sg-deploy.sh next-admin` → `/playwright smoke`＋social 網址實測（未登入轉 /login、/api/ops 404、員工登入看得到社群）；ContentStudio 的 Postiz 面板換成「到社群發文」連結。
  6. ✅ 程式 2026-10-15：middleware 帶 `x-ops-user-id`；`authz.ts` 讀 `social_brand_members`（成員列優先，員工 owner/admin 全品牌 owner）；客戶不能開新頻道連接（時間配對只對員工安全）、看不到員工角色與 user id。2026-10-15 成員管理也完成：0103 RPC＋`/api/social/members`（只限擁有者）＋設定頁「成員」。

### C13 版面規格 ✅ 樣稿第 16 版 2026-10-17（`mockups/social-manager-mock.html`，`0755e32ab`；ADR 016 §5 操作者定案 1–6；檢查 `check-social-mocks.py`＝`[chips]`／`[card-thumb]`／`[one-screen]`／`[dead-button]` 全綠）
- 樣稿＝規格。下面 C19–C30 把它做進產品；每張卡的「樣稿對照」寫哪個 `[data-view]`／哪塊，做完 `render-views.mjs` 截圖跟 `--mock` 同一頁並排看，不猜。
- GAP §4 的 C14（媒體與影片）保留為 C31；C15 併入 C21；C16 併入 C30；C17 併入 C19／C22／C27；C18 作廢（F10 標籤、F21 方格、F22 已刪除都進 V1 卡）。

## 1b. V1.5 卡片（樣稿 v16 → 產品；2026-10-17 開卡）

> 共同規則（每張卡都適用，卡內不重抄）：
> - 路徑相對 `app/(shell)/tools/social/`；`/social` 門與 `/tools/social` 同一份元件（`app/social/page.tsx`，middleware.ts:233 以產品前綴答門）。
> - 樣式：只用 `app/globals.css` token（平台色 `--p-*`、狀態色 `model.ts:51` `STATE_TOKEN`）；沒有 `<select>`；文字 ≥14px；`__tests__/page-rules.test.ts` 守（C19 把它改成遞迴掃子資料夾）。
> - 三種控制：主要動作 `.btn-primary`／切換 `.seg`／篩選一顆鈕＋面板；pill 只放值。一屏 1280×660 不捲，只有面板內捲。
> - 驗收四動作（AGENTS.md §1）：`npx tsc --noEmit` → 卡內指名的 vitest → `node tests/e2e/social/render-views.mjs <tmp>` 看圖（新檢視要加進該腳本）→ WORKLOG 四行。critic 每卡 1 個 Quick／Standard。
> - 共享 `D:\Work`：一卡一 session 一組檔；兩卡不碰同一檔（§3 順序表寫明）。WORKLOG／TASKS 走 `scripts/git-partial-worktree-commit.py stage`。
> - 書面：code comment 只寫會踩的坑；調查進 WORKLOG。不做卡外的事；卡外問題寫 TASKS 一行。

### C19 骨架與路由（Opus 5.5；C20 之後、其餘卡之前）
- 目標：ADR 016 §5 定案 1–5 的骨架：頂部六區、貼文排程六分頁、左側頻道清單、一列工具列、建立貼文獨立頁；右欄編輯器退場。
- 範圍：`SocialManager.tsx`（`View` 型別 :18、`VIEWS` :19、`Selection` :22、右欄 :280–291）、`SocialApp.tsx`（slots）、`social.css`（:128 唯一斷點先不動，C30 做）、新 `compose/[id]/page.tsx`＋`compose/new/page.tsx`（撰寫頁路由，`?brand=` 帶品牌，`id` 帶貼文；`/social/compose/...` 同門）、新 `(sections)` 六個 route：`analytics/`、`reporting/`、`inbox/`、`smartlinks/`、`ads/` 各一 `page.tsx`（本卡只放外殼＋「尚未開通」空狀態，內容由 C24–C28 填）、`__tests__/page-rules.test.ts`（改掃子資料夾）。
- 輸入：樣稿 `header`／`.subbar`／`#chanPanel`／`.toolbar`（`social-manager-mock.html` 搜 `id="top"`、`id="tabs"`、`id="chanList"`、`class="toolbar"`）；現有 `Slots`（`SocialApp.tsx`）；`render-views.mjs` 的 12 張圖。
- 輸出：(a) `TopBar`（六區 `data-view`，深色 `--text-primary` 底，品牌切換鈕、樣稿鈕不要、鈴鐺＝需處理與紀錄、齒輪＝設定）；(b) `PlanTabs`（週／月在「排程日曆」內的 `.seg`；分頁＝排程日曆／貼文清單／貼文素材庫／自動發布清單／已刪除貼文／自動化流程）；(c) `ChannelList`（一列＝圖＋名稱＋平台·handle＋⋮：只看這個頻道／用這個頻道寫／重新連接或偏好／移除；搜尋；點列＝`chanOnly` 篩選）；(d) 工具列一列：搜尋／‹ 本週 ›／週｜月／篩選鈕＋面板／最佳發布時間（C22 填內容，本卡放鈕）／建立貼文；(e) 刪掉：`sm-bar` 兩排 chip（:247–265）、右欄 `<Editor>`（:284–291）、`Selection.kind==="new"` 的右欄流程改 `router.push("compose/new?date=&time=")`；(f) 一個 vitest `__tests__/mock-parity.test.ts`：讀樣稿所有 `data-view` 值，必須每個都對到產品的 `View`／route 常數（樣稿＝規格的機械閘）。
- 驗收：`render-views.mjs` 新增 `01-calendar`／`02-compose-route`／`10-<section>` 五張殼；`social-manager.spec.ts` 建立→撰寫頁→回日曆一條；`mock-parity.test.ts` 綠；`page-rules.test.ts` 綠（含子資料夾）；手機不管（C30）。
- 邊界：不改資料表、不改 `Editor.tsx` 內容（C21）、不改 `Calendar.tsx` 卡片（C22）；`Lists.tsx`／`MediaView.tsx`／`LogView.tsx`／`Settings.tsx` 只換掛載點不改內容。

### C20 資料表 0105（Opus 5.5 ＋ `db-expert` 審；最先做，其他卡等它）
- 目標：樣稿 v16 需要而 0096–0103 沒有的欄位與表，一次一支 migration（＋`.down.sql`），每張 UI 卡只讀寫、不再碰 schema。
- 範圍：`lobster-factory/packages/db/migrations/0105_social_v16.sql`＋`0105_social_v16.down.sql`；`lib/social/store.ts`、`lib/social/posts.ts` 的讀寫映射；`app/(shell)/tools/social/model.ts` 的型別（`Account` :7、`Post` :10–15）；`api.ts` 的 `PostInput` :31。
- 輸入：ADR 016 §2 不變量（真相在我們的庫、Postiz 送信）；0096 表（`social_accounts` :51、`social_posts` :91、`social_lists` :66 的 `weekdays`/`send_time` :70–71）；0101 輪播具體化（`rotation.ts:26` `listSlots` 用 `weekdays`×`send_time`）；0098 的寫入函式慣例（`p_expected_version` 樂觀鎖）。
- 輸出（表／欄位，名字就是規格）：
  1. `social_accounts`＋`picture text`、`handle text`（F17；`label` 保留＝顯示名稱）。回填：`lib/content/postiz.ts:81` integration 的 `picture`，`GET /api/social/accounts` 對帳時寫入。
  2. `social_tags(id, organization_id, name, colour text check (colour in ('a','b','c','d','e')))`、`social_post_tags(post_id, tag_id)`（F10；顏色存 token 鍵，畫面對 `--red/--accent/--green/--yellow/--p-li`，不存 hex）。
  3. `social_post_comments(id, post_id, position, body, delay_minutes integer check (delay_minutes in (0,1,5,60)), media_id)`；`social_posts.first_comment`（0096:100）搬進 position 0 後保留欄位一版，下一支 migration 刪。
  4. 週期性安排：`social_posts`＋`repeat jsonb null`（`{freq:'day'|'week'|'month', days:int[], mday:int, end:'never'|'count', count:int}`）＋`repeat_of uuid null references social_posts(id)`。做法照 0101 輪播：模板貼文＝第一次；每日任務把 60 天內的下一次具體化成子貼文（`repeat_of`＝模板），送信照舊（0100）。刪模板問「只刪這次／全部」。
  5. `social_list_slots(list_id, weekday smallint, send_time time, primary key(list_id, weekday, send_time))`（F21）；`listSlots`（`rotation.ts:26`）改讀它；`social_lists.weekdays`/`send_time` 回填成 slots 後保留一版。
  6. `social_auto_rules(id, organization_id, post_id uuid null, name, trigger text check in ('comment','dm'), keywords text[], platforms text[] check (platforms <@ array['facebook','instagram']), action text check in ('reply','dm','both'), reply text, active boolean, hits integer default 0)`；`social_posts`＋`auto_mode text not null default 'brand' check in ('brand','none','own')`（定案 6；`post_id` 非空＝單則規則，優先）。
  7. `social_smart_links(organization_id primary key, slug unique, title, bio, colour, published boolean)`、`social_smart_link_items(id, organization_id, position, title, url, active boolean)`、`social_smart_link_clicks(item_id, day date, n integer, primary key(item_id, day))`。
  8. `social_metrics_daily(account_id, day date, followers, reach, impressions, engagement, posts, primary key(account_id, day))`、`social_post_metrics(target_id primary key, reach, engagement, fetched_at)`（F18；每日快照，趨勢不靠平台回溯）。
  9. `social_reports(id, organization_id, name, period_from date, period_to date, format text check in ('pdf'), account_ids uuid[], sections text[], created_at, created_by)`（F23；PPT 是 V2，不開欄位）。
  10. `social_accounts`＋`chatwoot_inbox_id integer null`（C29 用：頻道 ↔ Chatwoot inbox）。
  RLS 全部 default deny＋org policy 照 0096；`social_audit_log` 寫入點：標籤、規則、智慧連結、報表各一動作名。
- 驗收：拋棄式 DB 套 0105 → down → 0105 再套（`feedback_never_test_against_prod_container`）；`db-expert` 審（鎖、回填、cascade）；`lib/social/__tests__/store.test.ts`、`rotation.test.ts` 加 slots 用例；`npm test` 綠；**不套正式庫**，跟第一張用到它的 UI 卡同一次部署（`DEPLOY_HOLD` 擋 03:00 自動部署直到 C19＋C21 都在 main）。
- 邊界：不動 0096–0104；不動 `dispatch.ts` 的送出邏輯（留言多則由 C21 改 `compose.ts`）。

### C21 撰寫頁（Opus 5.5；C19、C20 之後）
- 目標：定案 5 的獨立撰寫頁：左選頻道、中撰寫、右預覽；底部「設定發佈時間」鈕＋主按鈕＋▾（存草稿／存到素材庫／送審／設定行程／週期性安排／立即發佈）；留言 N 則＋延遲；要發成哪一種；標籤；這則的自動回覆。
- 範圍：`Editor.tsx`（整檔重排成 `compose/` 下的元件：`ChannelPicker`、`Writer`、`Comments`、`Formats`、`AutoReply`、`TagPicker`、`Footer`、`DateTimePicker`、`Previews`）、`compose/[id]/page.tsx`（C19 建殼）、`lib/social/compose.ts`（:91–93 `values`：第一則留言 → N 則留言）、`lib/social/limits.ts`（留言也算字數上限）、`api.ts`（`PostInput` 加 `comments[]`、`tags[]`、`repeat`、`auto_mode`／`auto_rule`）、`app/api/social/posts/*`。
- 輸入：樣稿 `#edPanel` 全部（搜 `class="cgrid"`、`id="menu"`、`function renderDtp`、`function renderParts`、`function renderPset`、`function renderAuto`、`function tagEditor`）；現有 `Editor.tsx` 狀態（:58–83）與存檔分支（:170–200）；`model.ts:32` `FORMATS`（加 Reel；LinkedIn 文件輪播先不送，只畫按鈕＋說明「上傳 PDF 後一頁一張」）。
- 輸出：(a) 版面 `var(--chan-w) 1fr var(--pv-w)`，只有中欄捲；(b) 主按鈕字＝▾ 選的動作，預設「設定行程」，品牌要審核且身分編輯→「送審」；立即發佈二次確認保留（`assertCanPublishNow` `postiz.ts:423`）；(c) 自製日期時間選擇：左月曆、右 15 分鐘時間清單（選中捲到中間）、下時區；週期性安排時上方多「多久一次／哪幾天／什麼時候停」；(d) 留言：每則自己的框、圖、表情、延遲（立刻／1／5／60 分）、上下移、刪；預覽縮排在貼文下，所有平台同一句「貼文發出後，用你的帳號在下面留言」；**查證點**：Postiz `values[]` 是否接受每則 delay（原始碼 `libraries/nestjs-libraries/src/integrations/social/*.provider.ts` comment()），不接受就只存我們的庫、送出時依序留、畫面標「延遲先存著，之後版本生效」；(e) 要發成哪一種：共用分頁列每個 IG／FB 頻道一列 `.seg`；(f) 標籤鈕＋面板（勾、改名、換色、刪、新增）；(g) 這則的自動回覆（收合）：不用／照品牌規則（列開著的）／這則另外設（同一張規則表單，存成 `post_id` 非空的 `social_auto_rules`）；(h) 撰寫頁 ▾「存到素材庫」寫 `social_saved_texts`（0096:179）＋圖（C31 前只存文字＋媒體 id）。
- 驗收：`npx tsc --noEmit`；vitest：`compose.test.ts` N 則留言 values、`limits` 留言超限、`store.test.ts` repeat／tags／comments 寫讀；`render-views.mjs` 加 `02-compose`、`03-compose-menu`、`04-compose-picker`；e2e：建立→兩則留言→設定行程→回日曆看到卡。
- 邊界：不做 mention 自動完成、hashtag 建議（V2）；AI 鈕只開面板＋標費用，呼叫走既有 `lib/ai/cost-model.ts`（有就接，沒有就只畫）；不做影片（C31）。

### C22 日曆、卡片、清單、已刪除、篩選（Sonnet 5.5；C19、C20 之後；與 C21 不同檔）
- 目標：定案 4 的日曆內容：每天一欄、卡片照時間疊、縮圖、標籤色條、🔁／🤖、現在線、今天欄深色、最佳發布時間、篩選面板（平台／狀態／標籤）、貼文清單＋批次動作鈕、已刪除貼文分頁（誰刪的）、月檢視可換月。
- 範圍：`Calendar.tsx`（整檔：`WeekView` 小時格 :13–57 → 疊放；`MonthView` 加換月＋格內 2 則＋「還有 N 則」）、`social.css` 日曆區（:41–60）、新 `Trash.tsx`（已刪除分頁；`social_audit_log` 的 actor＝誰刪的，`GET /api/social/posts?trash=1` 已有）、`SocialManager.tsx` 篩選面板與批次選單（C19 留的鈕）、`api.ts`／`app/api/social/posts/route.ts`（`tags` 篩選參數）。
- 輸入：樣稿 `function cardHtml`、`function renderWeek`、`function renderMonth`、`function renderList`、`function renderTrash`、`function renderFilterPop`、`BEST`／`bestFor`；`model.ts:47–55` 狀態名與色 token。
- 輸出：卡片＝`cthumb`（第一張圖或「文字」）＋左上平台標記＋時間＋頻道名＋兩行文字＋左色條＝狀態＋頂色條＝第一個標籤＋hover 預覽／複製／刪除；過去日斜紋、今天欄頭深色、「現在 HH:MM」線；未來日欄底「＋ 新增」→ `compose/new?date=`；最佳發布時間：鈕按下出平台 `.seg`，每天顯示該平台 2 個時段（來源 `social_metrics_daily` 有資料前用 `BEST` 常數，標「參考值」），點時間→ `compose/new?date=&time=&accounts=`；篩選面板三欄（平台／狀態／標籤）＋「清除」；清單：表格＋「批次動作 · N」（沒勾灰掉）；已刪除分頁：排定時間／內容／發到／刪除前／刪除時間／誰刪的／還原；月檢視 ‹ › 換月、「本月」在本月時灰掉。
- 驗收：`model.test.ts` 加 `occurrences`（週期性展開）與最佳時段；`render-views.mjs` 加 `05-best`、`06-filter`、`07-trash`、`08-month`；e2e：勾兩則→批次送審→狀態變。
- 邊界：不碰 `Editor`／`compose/`；不做拖拉改分鐘（卡片疊放後拖到別天即可，時間不變）。

### C23 自動發布清單方格（Opus 5.5；C20、C21 之後）
- 目標：F21：清單時段＝星期 × 時間方格；「＋ 加一個時間」加一列；每列可拿掉；發到＝頻道按鈕；分頁頂端一句例子。
- 範圍：`Lists.tsx`（`ListDetail` 的每週列 :142 附近 → 方格）、`lib/social/rotation.ts`（`listSlots` :26 讀 `social_list_slots`）、`lib/social/lists.ts`、`app/api/social/lists/*`、`api.ts:40–41` `ListRow`/`ListInput`（`slots: Array<{weekday, send_time}>`）。
- 輸入：樣稿 `function renderLists`（`.sgrid7`、`.slot`）；0101 具體化不變量（檔頭）。
- 輸出：方格、加時間（用 C21 的 `DateTimePicker` 只開時間）、清單卡顯示「每週 N 個時段」、下一則預告；具體化照新 slots。
- 驗收：`rotation.test.ts`：三個時段跨兩天的具體化順序；`render-views.mjs` `11-list-detail` 重截；e2e 既有清單流程仍過。
- 邊界：撰寫頁不再有「加入自動發布清單」選項（定案：清單只在自己分頁加）；不動 cursor 邏輯。

### C24 數據分析（Opus 5.5；C19、C20 之後；先過 G6）
- G6 查證（卡內第一步，寫 WORKLOG）：Postiz v2.25.1 公開 API 有沒有 analytics 端點（`GET /public/v1/...`；對 ks-aw-01 `127.0.0.1:4007` 實打）。有 → 每日任務抓進 `social_metrics_daily`；沒有 → 直接打各平台 API（Bluesky 公開、Meta 要審核）＝只先做 Bluesky＋Threads 能拿到的欄位，其餘欄位顯示「等平台審核」，不填假數字。
- 範圍：新 `analytics/page.tsx`＋`Analytics.tsx`、`lib/social/metrics.ts`（抓取＋快照）、Trigger 任務（照 `lib/social/rotation.ts` 的每日任務掛法）、`app/api/social/metrics/route.ts`。
- 輸入：樣稿 `function renderAnalytics`（左頻道清單含「全部頻道」、右上 7／28／90 天、6 張指標卡可點換圖、趨勢圖這期 vs 上期、已發佈貼文表）；`social_post_metrics` 連 `social_post_targets.release_url`。
- 輸出：頁面照樣稿；圖用 inline SVG（無圖表庫）；數字來源標在頁首（「資料來自 X，每天 03:30 更新」）。
- 驗收：`metrics.test.ts` 快照合併（同日重抓覆蓋）、期間加總；`render-views.mjs` `12-analytics`；真資料：Soulful Bluesky 一天快照寫進去（拋棄式 DB 不行就 staging，不碰正式）。
- 邊界：不做受眾年齡地區（V2）；不做匯出（C25）。

### C25 報表管理（Sonnet 5.5；C24 之後）
- 目標：F23：選頻道＋期間＋內容 → 報表；品牌 logo＋主色；做過的報表列表；每月 1 號自動寄。
- 範圍：新 `reporting/page.tsx`＋`Reporting.tsx`、`app/api/social/reports/*`、新 `reports/[id]/page.tsx`（列印版 HTML：`@media print` A4 橫式，瀏覽器「另存 PDF」；**不加 PDF／PPT 產生器依賴**，PPT 是 V2）、`lib/schedules/jobs.ts` 加 `social_monthly_report`（照 `cs_chatwoot_baseline` :52 的掛法）寄連結。
- 輸入：樣稿 `function renderReporting`（第一頁預覽、顏色 swatch＝token 鍵、內容勾選）；`social_metrics_daily`。
- 輸出：表單＋第一頁預覽＋做過的報表＋每月寄送開關；報表頁本身可列印。
- 驗收：`render-views.mjs` `13-reporting`＋`14-report-print`（Playwright `page.pdf()` 存一份看版面）；`jobs` 測試有新 key。
- 邊界：不接 PPT；不做跨品牌儀表板。

### C26 智慧連結（Opus 5.5；C19、C20 之後）
- 目標：一個放簡介的連結頁：標題、介紹、按鈕顏色、連結（顯示／文字／網址／排序／刪／加）、發布開關、複製連結、手機預覽；每個連結點擊數。
- 範圍：新 `smartlinks/page.tsx`＋`SmartLinks.tsx`、`app/api/social/smartlink/*`、公開頁 `app/l/[slug]/page.tsx`（走 `social.aware-wave.com/l/<slug>`；middleware 允許匿名；`noindex` 可選）、`app/l/[slug]/go/[item]/route.ts`（302＋`social_smart_link_clicks` +1）。
- 輸入：樣稿 `function renderSmart`（`.phone` 預覽）。
- 輸出：編輯頁＋公開頁同一份 `LinkPage` 元件（預覽＝公開頁縮小）；未發布的 slug 回「這頁還沒開放」。
- 驗收：`smartlink.test.ts`：slug 唯一、未發布 404 文案、點擊累加同日 upsert；e2e：加連結→公開頁看到→點→計數 +1。
- 邊界：不做自訂網域、不做 QR。

### C27 自動化流程（Opus 5.5；C20、C21 之後；執行端等 G3）
- 目標：定案 6：品牌通用規則＋單則另外設（單則優先）；分頁＝規則清單＋表單＋「N 則貼文有自己的規則」；撰寫頁那塊在 C21。
- 範圍：新 `flows/`（分頁內容 `Flows.tsx`）、`app/api/social/auto-rules/*`、`lib/social/auto-rules.ts`（規則 CRUD＋**比對函式** `matchRule(text, rules, postRule)`：單則規則存在就只用它，否則品牌規則；關鍵字逗號分隔、不分大小寫、含即中）。
- 執行端（**同卡第二段，G3 Meta 審核通過才開**）：`app/api/webhooks/meta/route.ts` 收留言／私訊 webhook → `matchRule` → 透過 Postiz 或 Meta Graph 回覆（查證 Postiz 有無「對別人留言回覆」API；沒有就 Graph API 直打）→ `hits+1`＋`social_audit_log`。審核沒過前分頁頂端一句「留言自動回覆要等 Meta 審核通過才會真的動作（Facebook、Instagram）」照樣稿。
- 輸入：樣稿 `function renderFlows`、`ruleForm`；TASKS.md:428 Meta app 狀態。
- 輸出：分頁＋API＋`matchRule`；執行端另開 WORKLOG 段落。
- 驗收：`auto-rules.test.ts`：單則優先、關鍵字比對、平台過濾、關掉的規則不中；`render-views.mjs` `15-flows`。
- 邊界：Bluesky／Threads 不做；不做多步流程（Metricool 的 chained sequences，V2）。

### C28 廣告管理（Sonnet 5.5；C19、C20 之後；G3 `ads_read` 通過才開，之前只有 C19 的殼）
- 目標：連接 Meta／Google 廣告帳號，看花費／曝光／點擊／轉換，活動暫停／繼續；不在這裡建廣告。
- 範圍：`ads/page.tsx`＋`Ads.tsx`、`lib/social/ads.ts`（Meta Marketing API `act_<id>/campaigns,insights`；Google Ads V2）、表 `social_ad_accounts`／`social_ad_campaigns_daily`（**本卡自己開 0106**，C20 不預開）。
- 輸入：樣稿 `function renderAds`。
- 輸出：殼先上（C19）：頁面寫「廣告管理要等 Meta 廣告權限審核通過」＋連接鈕灰；審核過後填內容。
- 驗收：`ads.test.ts` 期間換算；`render-views.mjs` `16-ads`。
- 邊界：不建、不改廣告；TikTok 不做。

### C29 訊息收件匣（Sonnet 5.5；C19、C20 之後）
- 目標：Chatwoot 入口＋各頻道未讀數（ADR 016 §6：收件匣＝Chatwoot）。
- 範圍：`inbox/page.tsx`＋`Inbox.tsx`、`app/api/social/inbox/route.ts`（用 `lib/cs/chatwoot-client.ts` 既有 token 流程 :61–78 查未讀；Chatwoot inbox ↔ `social_accounts` 的對應存 `social_accounts.chatwoot_inbox_id`，**C20 一併加欄**）。
- 輸出：每頻道一列＝圖＋名稱＋「N 則未讀／都讀了」；「打開收件匣」開 Chatwoot 新分頁；沒連 Chatwoot 的租戶顯示怎麼連。
- 驗收：`inbox.test.ts` 未讀合計；`render-views.mjs` `17-inbox`。
- 邊界：不在這裡回訊息。

### C30 手機（Sonnet 5.5；C19、C21、C22 之後）
- 目標：U10：≤640px 日檢視＋日期條、頻道清單全螢幕、撰寫頁全螢幕＋編輯｜預覽切換、浮動＋；每頁寬＝視窗寬。
- 範圍：`social.css`（:128 的 1100px 斷點拆成 1100／640 兩層，照樣稿 `@media (max-width:640px)` 區塊）、`Calendar.tsx` 日期條、`compose/` 的切換鈕；`render-views.mjs` 加 390 寬每頁 `scrollWidth===390` 斷言（照 `--mock` 分支 `sticksOut` 的做法）。
- 驗收：`render-views.mjs` 手機 6 張；斷言全過。
- 邊界：不做手機 app；不做觸控拖拉。

### C31 媒體與影片（Opus 5.5；原 C14；C21 之後）
- 目標：F1／F2／F8／U8：影片上傳與封面、多圖排序、裁切、素材庫分頁（存起來的貼文｜圖片和影片）。
- 範圍：`MediaView.tsx` → `library/`（`Library.tsx`：兩個 `.seg`、多選、「用這些寫新貼文」）、`Editor` 媒體列拖排、`lib/content/postiz.ts:188` `uploadVideo` 接上、`social_media.kind='video'`（0096:154 已允許）、裁切用 canvas（既有 `lib/tarot` 修圖積木可借，見 memory `project_pod_image_edit_feature`；不加新依賴）。
- 驗收：e2e 上傳一段 3 秒 mp4 → 預覽 → 排程；`render-views.mjs` `18-library`。
- 邊界：不接 Drive／Canva（V2）。

### 部署與閘（全批共用）
- 第一次上線順序：C20（migration）＋C19＋C21 同一晚（`DEPLOY_HOLD` 直到三者在 main 且 `npm test` 綠）；之後每卡獨立上線。
- 每卡完成：`/check-drift` → `/verify` → 03:00 自動部署 → `/playwright smoke` → WORKLOG「上線」一行。
- G3（Meta 審核）開 C27 執行端與 C28；G6（Postiz analytics）在 C24 內。

## 2. V2（開放訂閱前）
`social_audit_log` 保留期限或按月分割（每則貼文約 2 列，768 MB 主機）；WordPress 會員一鍵進入（ADR 015 §2）；方案與用量上限＋WooCommerce；Postiz analytics（審核後）；Chatwoot 入口與未讀數；最佳時段；重複貼文；find-slot 佇列；對外 API／MCP；服務條款、隱私政策、資料刪除；第二台 Postiz 的 instance 對應。

## 3. 順序與依賴
C1 → C2、C3（並行）→ C4 → C5、C6（並行；C6 可先用 C4 的 mock 資料）→ C7、C8、C9、C10、C11（並行，互不碰檔）→ C12。
V1.5：C20 → C19 → {C21｜C22｜C26｜C29（並行，互不碰檔：C21 `compose/`＋`Editor.tsx`＋`compose.ts`；C22 `Calendar.tsx`＋`Trash.tsx`；C26 `smartlinks/`＋`app/l/`；C29 `inbox/`）} → C23（用 C21 的 `DateTimePicker`）、C24 → C25；C27、C31 在 C21 後；C30 在 C21、C22 後；C28 等 G3。模型：想（卡內取捨）Fable 5.1；C19／C20／C21／C23／C24／C26／C27／C31 Opus 5.5；C22／C25／C28／C29／C30 Sonnet 5.5。狀態只在監工台 `agency-os/handoffs/2026-10-17-social-v15-supervisor/data.mjs`，本檔卡片標題不寫狀態。
寫程式的 session 一次一張卡、一組檔；兩個 session 不碰同一檔。
