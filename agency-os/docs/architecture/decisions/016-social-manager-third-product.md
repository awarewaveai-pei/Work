# ADR 016: 社群管理是 AwareWave 第三個產品 — 排程資料放我們的資料庫，Postiz 只負責送出；先自己管多品牌，再開放訂閱

- **狀態**：提案。產品方向由操作者 2026-10-14 口頭定下（「我可能管理多個客戶，或是像 Metricool 給人訂閱使用」「我要功能完善的平台」「css style 都直接先掛 app.aware-wave.com 的，要統一管理」）；工程做法由 Claude 決定。樣稿（`lobster-factory/docs/social/mockups/social-manager-mock.html`）定案後改「已接受」。
- **日期**：2026-10-14
- **承接**：[ADR 012](012-shared-platform-layer.md)（產品登記表、共用帳本）、[ADR 015](015-awarewave-account-and-shared-wallet.md)（一個帳號、一個錢包、每產品一個子網域）。
- **部分取代**：`agency-os/docs/operations/POSTIZ_SOCIAL_PUBLISHING_PLAN.md` 的「社群發文放在內容工作室底部面板」做法（Task 3–6，2026-06-22 上線）。那批程式碼（`lib/content/postiz.ts`、`/api/content/social-*`、`social_postiz_connections`）保留並擴充，面板本身退場。
- **功能範圍**：`lobster-factory/docs/social/SOCIAL_MANAGER_FEATURE_MATRIX.md`（70 項，對照 Metricool／Buffer／Postiz，分 V1／V2／V3）。

## 脈絡

- 現況發文介面的缺陷（2026-10-14 讀碼）：社群發文藏在內容工作室最底下的摺疊區，要先生成文章才能用（`ContentStudio.tsx:3681`）；只有「建草稿／立即發佈」，不能選時間（`:3838`）；內容行事曆只讀 WordPress 文章（`calendar/ContentCalendar.tsx:261`）；編輯只有一個文字框，看不到各平台成品（`:3820`）。
- Postiz（自架 v2.11.3，`postiz.aware-wave.com`）的限制：公開 API 沒有「改發文時間」（[Create Post](https://docs.postiz.com/public-api/posts/create.md) 只有建立；change-status 明寫「keeps its stored date」）；每小時 30 次呼叫（`runbooks/POSTIZ-OPS-RUNBOOK.md:89`，官方文件說可用 `API_LIMIT` 調）；整個 instance 一把 API key，沒有每客戶的 key（[groups](https://docs.postiz.com/public-api/integrations/groups.md) 只是分類）；連接帳號的 API 回授權網址，但不回報新 integration 屬於哪個客戶（[connect](https://docs.postiz.com/public-api/integrations/connect.md)）。
- 已連上的帳號：Facebook 粉專「Aware Wave」、Bluesky `soulfulexpression.bsky.social`（2026-10-14 `GET /integrations` 實測）。IG／Threads／LinkedIn／TikTok／YouTube／Pinterest 等待各平台開發者審核（`agency-os/TASKS.md:371`）。X 的發文 API 要月費，操作者決定不付。
- 收件匣已有：Chatwoot 2026-09-11 端到端跑通，決策「Chatwoot 擁有對話」（`agency-os/TASKS.md:469`、`:966`）。
- `morluto/rea`（逆向工程 MCP）評估：拆得到前端，拆不到平台 API 權限、歷史數據和競品數據；逆向商業服務再照做有 ToS 與著作權風險。不採用。

## 決策

### 1. 第三個產品，跑在 next-admin 裡

- `product_key = "social"`，對外網域 `social.aware-wave.com`（ADR 015：每產品一個子網域），登記進 `lib/portal/products.ts`（ADR 012 §5 的機械閘）。
- 程式碼放 next-admin 的路由群組（`app/(shell)/tools/social/`＋`app/api/social/*`），不另開 app。理由：Postiz client、`social-org.ts`、行事曆 route、`syndicate`、主題系統、Supabase Auth 與 `ops_role` 都在這裡，另開一個 app 就是第二套登入、第二套主題。子網域由 nginx vhost（`safe-infra-patch.sh host-nginx`）＋ middleware 以 host 判斷產品；子網域上線前，內部用 `app.aware-wave.com/tools/social` 同一份程式。

### 2. 排程資料的真相在我們的資料庫，Postiz 是送信員

- 新表（都用 0094 的 default-deny RLS；表名以 migration 為準）：`social_accounts`（品牌 ↔ Postiz integration id、狀態 connected／review／expired、instance id）、`social_posts`（共用文字、各平台另寫的文字、媒體、第一則留言、連結＋UTM、替代文字、格式、狀態、排定時間、Postiz post ids、發佈後連結、錯誤訊息）、`social_lists`＋`social_list_items`（輪播清單）、`social_media`（媒體庫）、`social_audit_log`（誰、何時、做了什麼、結果）、品牌設定（時區、成員角色）掛在既有 `organizations`。既有 `social_postiz_connections` 的列搬進 `social_accounts`，舊表退場。
- 貼文只在「排定且到了送出窗口」才進 Postiz：Trigger.dev 任務每 5 分鐘把 `scheduled_at` 落在窗口內的貼文建進 Postiz（批次、照 rate limit 退讓），記下 Postiz id；改時間 = 若已進 Postiz 就刪掉重建；狀態回寫用 `GET /posts?startDate&endDate` 對帳（`PUBLISHED`／`ERROR`＋`releaseURL`＋`error`）。這樣拖拉改時間、審核、備註、輪播都不依賴 Postiz 沒有的 API，30 次／小時也只在送出時才消耗。
- 狀態機：`draft → review → scheduled → queued（已進 Postiz）→ published | error`；`deleted`（軟刪，可還原）；`rotation`（在輪播清單裡，沒有固定時間）。已發佈的不可改，只能複製。

### 3. 多客戶隔離

- 所有品牌共用一台 Postiz、一把 key；key 只在伺服器端；每個 API 請求在我們這層以「品牌成員資格」授權，客戶永遠看不到 Postiz 介面。Postiz 的 `customer` 分組鏡射品牌 id，只為對帳。
- `social_accounts.instance` 第一天就有：品牌多到一台 Postiz 吃不下時，加第二台，品牌對應到 instance，程式不改。
- 角色：擁有者／編輯／審核人／客戶唯讀，掛在品牌層。內部先用既有 `ops_role`；對外客戶用 WordPress 會員一鍵進入（ADR 015 §2），V2。

### 4. 帳號連接

- 我們的設定頁 → `GET /social/{platform}`（Postiz connect API）拿授權網址 → 使用者跳去授權 → 回到 Postiz → 我們輪詢 `GET /integrations` 把新出現的 integration 歸到發起連接的品牌（Postiz 不回報歸屬，所以由我們記「誰在幾分幾秒按了連接哪個平台」來配對；同一品牌同時只允許一個連接進行中）。重新連接走 `?refresh=`。
- 帳號狀態每天對帳一次（`disabled:true` → `expired`）＋發 Telegram（runbook §3 的 v2 項目在此落地）。

### 5. 介面

- 樣稿 = 規格：`lobster-factory/docs/social/mockups/social-manager-mock.html`。一個畫面：左邊行事曆（週／月／清單／輪播／媒體／紀錄／設定），右邊編輯＋預覽；沒有下拉選單；文字不小於 14px。
- 樣式只有一個來源：next-admin `app/globals.css`（`mockups/sync-app-theme.py` 同步、`check-social-mocks.py` 比對）。產品實作直接用同一組 token 與 `.btn-primary`／`.btn-secondary`；狀態色對應 `--status-ignored`／`--yellow`／`--green`／`--red`／`--severity-low`／`--accent`。
- 輪播清單（Metricool autolists）在 V1；CSV 匯入以「從 WordPress 文章清單批次做貼文」取代。

### 6. 不在本產品裡重做的

- 收件匣 = Chatwoot（既有決策）；Meta 審核過後在 Chatwoot 接 FB／IG，本產品只放入口與未讀數。
- 數據分析走 Postiz analytics API（原始碼 11 個 provider 有 `analytics`），審核時一併申請分析權限；V2。
- 不做：廣告管理、手機 app、X。

### 7. 收費與 AGPL

- 收費：ADR 015 的點數錢包或 Metricool 式訂閱（品牌數、每月貼文數），做到 V2 再定；`organizations` 預留方案與上限欄位。
- Postiz 是 AGPL-3.0：不改它的程式，只走公開 API；新功能全在 next-admin。

## 不採用

- **在內容工作室面板上改**：開放訂閱時整個重做。
- **Postiz 當資料真相**：沒有改時間 API、每小時 30 次、單一 key、介面不是我們的。
- **用 rea 逆向 Metricool**：拆不到有價值的部分，且有法律風險。
- **另開一個 app**：第二套登入、主題、客戶資料。

## 後果

- 正面：拖拉、審核、輪播、紀錄全在我們這層，不受 Postiz API 限制；加 Postiz instance 不改程式；開放訂閱時只加登入與收費。
- 代價：我們多維護一套排程與對帳（Trigger.dev 任務＋狀態回寫）；Postiz 與我們之間的狀態會有最多 5 分鐘延遲；連接帳號的歸屬靠時間配對，要有「同品牌一次一個連接」的鎖。
- 需跟進：`lib/portal/products.ts`、`lobster-factory/packages/db/migrations/`、`middleware.ts`（host 判斷）、nginx vhost、`lobster-factory/packages/workflows/`（Trigger.dev 任務）、`runbooks/POSTIZ-OPS-RUNBOOK.md`（§9 v2 監控改為已落地）、`agency-os/TASKS.md`。執行計畫：`lobster-factory/docs/social/SOCIAL_MANAGER_PLAN.md`。

## 待查（動工前的 gate）

- 我們這台 Postiz v2.11.3 實際有哪些端點：`GET /posts`（2026-10-14 已驗 200）、`PUT /posts/{id}/status`、`GET /social/{platform}`、`GET /groups`、`GET /integrations/find-slot`、analytics。文件寫的是最新版，動工前逐一 curl。
- `API_LIMIT` 目前值（`/root/postiz/.env`）。
- Meta app 審核狀態（Facebook 已連上但 IG 未連，是否同一個 app）。
- Postiz 的 customer 分組要怎麼指定到 integration（文件沒寫，可能只能在 UI 做）。
