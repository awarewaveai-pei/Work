# ADR 016: 社群管理是 AwareWave 第三個產品 — 排程資料放我們的資料庫，Postiz 只負責送出；先自己管多品牌，再開放訂閱

- **狀態**：已接受（操作者 2026-10-14「同意」，看過樣稿第 13 版）。產品方向由操作者定（「我可能管理多個客戶，或是像 Metricool 給人訂閱使用」「我要功能完善的平台」「css style 都直接先掛 app.aware-wave.com 的，要統一管理」）；工程做法由 Claude 決定。
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

- 新表：`lobster-factory/packages/db/migrations/0096_social_manager.sql`（10 張 `social_*` 表與它守住的不變量寫在檔頭，該檔為準）。帳號狀態 connected／expired／disabled；「平台還在審核」是平台層的事實，不存在帳號列上。輪播項目就是 `state='rotation'` 的貼文。時區用 `organizations.default_timezone`；外部成員角色 `social_brand_members`。既有 `social_postiz_connections` 的列複製進 `social_accounts`，舊表在 C4 換完程式後退場。
- 貼文只在「排定且到了送出窗口」才進 Postiz：Trigger.dev 任務每 5 分鐘把 `scheduled_at` 落在窗口內的貼文建進 Postiz（批次、照 rate limit 退讓），記下 Postiz id；改時間 = 若已進 Postiz 就刪掉重建；狀態回寫用 `GET /posts?startDate&endDate` 對帳（`PUBLISHED`／`ERROR`＋`releaseURL`＋`error`）。這樣拖拉改時間、審核、備註、輪播都不依賴 Postiz 沒有的 API，30 次／小時也只在送出時才消耗。
- 狀態機：`draft → review → scheduled → queued（已進 Postiz）→ published | error`；`deleted`（軟刪，可還原）；`rotation`（在輪播清單裡，沒有固定時間）。已發佈的不可改，只能複製。

### 3. 多客戶隔離

- 所有品牌共用一台 Postiz、一把 key；key 只在伺服器端；每個 API 請求在我們這層以「品牌成員資格」授權，客戶永遠看不到 Postiz 介面。Postiz 的 `customer` 分組鏡射品牌 id，只為對帳。
- `social_accounts.instance` 第一天就有：品牌多到一台 Postiz 吃不下時，加第二台，品牌對應到 instance，程式不改。
- 角色：擁有者／編輯／審核人／客戶唯讀，掛在品牌層。內部先用既有 `ops_role`；對外客戶用 WordPress 會員一鍵進入（ADR 015 §2），V2。每品牌成員表與 social.aware-wave.com 這扇門照 [ADR 018](018-product-doors-and-buyout-delivery.md) §1–3。

### 4. 帳號連接

- 我們的設定頁 → `GET /social/{platform}`（Postiz connect API）拿授權網址 → 使用者跳去授權 → 回到 Postiz → 我們輪詢 `GET /integrations` 把新出現的 integration 歸到發起連接的品牌（Postiz 不回報歸屬，所以由我們記「誰在幾分幾秒按了連接哪個平台」來配對；同一品牌同時只允許一個連接進行中）。重新連接走 `?refresh=`。
- 配對規則（2026-10-15 審查後，`0098_social_writes.sql` 檔頭為準）：所有品牌共用一個 Postiz workspace，所以「新頻道」的連接整台 Postiz 同時只能一個（兩個同時進行分不出誰是誰）；已屬於任何品牌的 integration 不參與配對。連接進行中時，如果有人直接在 Postiz 介面加同平台的頻道，也會被配給發起的品牌，所以頻道一律從我們的畫面連（runbook §8）。
- 重新連接：Postiz 公開 API 只給 `disabled`，看不出授權有沒有真的換新；帳號狀態以 C5 的發送結果為準。
- 帳號狀態每天對帳一次（`disabled:true` → `expired`）＋發 Telegram（runbook §3 的 v2 項目在此落地）。

### 5. 介面

- 樣稿 = 規格：`lobster-factory/docs/social/mockups/social-manager-mock.html`。沒有下拉選單；文字不小於 14px（標籤 12px）。
  - 第 16 版（2026-10-17，照下面「操作者定案」1–5 重畫骨架；**等操作者看圖**）：頂部六區；貼文排程六分頁；日曆頁＝左側頻道清單（帳號為單位、可捲、⋮ 選單）＋一列工具列＋日曆，沒有右欄；建立貼文／點卡片開獨立撰寫頁（左選頻道、中撰寫、右預覽）；數據分析、報表管理是完整頁；收件匣＝Chatwoot 入口＋未讀；智慧連結（連結頁編輯＋手機預覽）、廣告管理（連帳號、活動成效、暫停／繼續）、自動化流程（關鍵字自動回覆規則）在樣稿裡都能操作（操作者 2026-10-17「你要確認每個功能有作用」）。撰寫頁底部照 Metricool：「設定發佈時間」鈕（月曆＋時間清單）＋主按鈕，▾ 選做法（存草稿／存到素材庫／送審／設定行程／週期性安排／立即發佈）；標籤（分類）可在撰寫頁、篩選、設定管理。第 15 版的卡片、串文、方格時段、已刪除、空狀態照搬。`check-social-mocks.py` 加 `[one-screen]`（每頁 1280×660 不捲）與 `[dead-button]`（每頁每顆看得到的按鈕按了都要有變化）。
  - 第 14 版（2026-10-16，C13，`SOCIAL_MANAGER_GAP_REPORT.md` U1–U6、U12、U13；**等操作者看圖同意**，產品程式仍是第 13 版）：行事曆（週／月／清單）在左、編輯＋各平台預覽在右；輪播／媒體／紀錄／設定改全寬、不帶編輯器。控制只有三種（主要動作、分段切換、一顆篩選鈕＋面板），一屏 pill ≤ 20；週檢視每天一欄、卡片照時間疊、有縮圖。手機（≤640px）日檢視＋全螢幕編輯。`check-social-mocks.py` 以瀏覽器實量把關（`[chips]`、`[card-thumb]`）。
  - 第 13 版（2026-10-14 同意）：一個畫面，左邊行事曆（週／月／清單／輪播／媒體／紀錄／設定），右邊永遠是編輯＋預覽。
- **操作者定案（2026-10-17，看過 Metricool／自架 Postiz 電腦版後；取代第 13／14／15 版的版面骨架，功能不變）**：
  1. **頻道不放上面**：頻道（連接的社群帳號）放左側可捲動清單（Postiz 式），每列頭像＋名稱＋「⋮」；要撐到一個品牌或代操 100 個帳號，不能是一排頭像。
  2. **頂部功能列六區**（Metricool 式，中文名定案）：數據分析 Analytics／報表管理 Reporting／訊息收件匣 Inbox／貼文排程 Planning／智慧連結 SmartLinks／廣告管理 Ads。**數據分析與報表管理是重點，V1 就要在設計裡**（§6 原本「分析 V2」只指資料來源要等平台審核，不是畫面）。
  3. **貼文排程底下六個分頁**：排程日曆 Calendar／貼文清單 List／貼文素材庫 Posts library／自動發布清單 Autolists（＝輪播）／已刪除貼文 Deleted posts／自動化流程 Flows。
  4. **日曆上方一列**：搜尋／本週＋左右切換／篩選／各社群最佳發布時間（可切平台）／建立貼文。
  5. **建立貼文開獨立整頁**（按「建立貼文」或日曆格的「＋」），不是右欄；右欄太小不好操作。
  6. **自動化流程兩層**（2026-10-17）：品牌通用規則＋單則貼文另外設，單則的優先（「自動化流程照兩層畫：品牌通用規則＋單則貼文另外設，單則的優先。」）。
  這五項是版面骨架；第 14／15 版做出來的卡片、三種控制、串文、方格時段、空狀態照搬進新骨架。
- 樣式只有一個來源：next-admin `app/globals.css`（`mockups/sync-app-theme.py` 同步、`check-social-mocks.py` 比對）。產品實作直接用同一組 token 與 `.btn-primary`／`.btn-secondary`；狀態色對應 `--status-ignored`／`--yellow`／`--green`／`--red`／`--severity-low`／`--accent`。
- 輪播清單（Metricool autolists）在 V1；CSV 匯入以「從 WordPress 文章清單批次做貼文」取代。

### 6. 不在本產品裡重做的

- 收件匣 = Chatwoot（既有決策）；Meta 審核過後在 Chatwoot 接 FB／IG，本產品只放入口與未讀數。
- 數據分析走 Postiz analytics API（原始碼 11 個 provider 有 `analytics`），審核時一併申請分析權限。**畫面在 V1（§5 定案 2）**；真資料等各平台分析權限審核通過才接。
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

## 實測（2026-10-14，ks-aw-01 `127.0.0.1:4007/api/public/v1`，v2.11.3）

| 端點 | 結果 | 對本 ADR 的影響 |
|---|---|---|
| `GET integrations`、`GET posts?startDate&endDate`、`GET find-slot/{id}`、`GET is-connected`、`POST upload-from-url` | 有 | §2 送出與對帳可做 |
| `DELETE posts/{id}` | 有（不存在的 id 回 500，不是 404） | §2「改時間＝刪掉重建」可做；client 要把 500 當「可能已不存在」處理 |
| `GET social/{platform}`（連接帳號） | **404** | §4 從我們的畫面連帳號做不到 |
| `PUT posts/{id}/status`、`DELETE posts/group/{g}`、`GET groups`、`GET notifications`、`GET media`、`GET analytics/*` | **404** | 狀態切換、分組、通知、媒體清單、數據分析都沒有 |
| `GET posts` 也扣 rate limit | `x-ratelimit-remaining: 29`；`API_LIMIT` 未設（預設 30／小時） | 對帳輪詢會吃掉發文額度 |

**結論**：V1 前必須把 Postiz 升到 v2.25.1（2026-10-11，最新）。升級前，§4 的帳號連接只能由操作者在 Postiz 介面做，再在我們這邊把 integration 指給品牌（現行 runbook §8 做法）。升級時一併設 `API_LIMIT`。計畫 G5。

## 待查

- ~~升級到 v2.25.1 之後重跑同一組 curl，確認上表 404 都消失（計畫 G5 驗收）。~~ 2026-10-15 升級後重跑：連接帳號、改狀態、刪整組、分組、通知、媒體、分析等 12 條全在；`GET posts` 不再扣額度（v2.25.1 只限 `POST /public/v1/posts`）（WORKLOG 2026-10-15 續9）。
- Meta app 審核狀態（Facebook 已連上但 IG 未連，是否同一個 app）（G3，操作者）。
- Postiz 的 customer 分組要怎麼指定到 integration（文件沒寫，可能只能在 UI 做）。
