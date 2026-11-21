# WP 門面計畫：oracle.aware-wave.com 改 WordPress，引擎留作後端，一支外掛連接

> **操作者修訂（2026-11-21，優先於下文）**
> - **決定 6 合盤改為私人合盤**：「不用雙方都是會員…我如果暗戀誰、或想知道我跟某人有無可能成為好婚姻對象，我不會希望他知道。」→ 使用者自己輸入對方的出生資料即可合盤；**不邀請、不通知、不需對方同意或成為會員**。對方資料只存在該使用者自己的帳號下（暱稱自由填、可隨時刪除、匯出與刪除帳號時一併處理），不與任何其他帳號關聯。下文的邀請連結、對方同意、撤回、對好友遮蔽出生資料的「嵌入票」用途全部取消；P2 卡相應縮小（命盤與「我存的對象」兩類資料）。未登入訪客也可直接合盤（不儲存）。
> - 舊網址不做 SEO 保全（幾無搜尋量）；站照客戶流程管理；外掛以裝在任一客戶 WordPress 為預設。

狀態：規劃（2026-11-21）；只產計畫，未改任何檔。實作中屬 High 的步驟逐項等操作者明示同意（`agency-os/AGENTS.md` §3）。
操作者決定（2026-11-21）：網址放 WordPress；用該站自己的 WP 會員；FluentCRM 每日寄運勢；做好友合盤；付費先不做；全球使用；外掛之後裝到客戶 WordPress；舊網址只要簡單轉址；**這個站以「客戶網站」的方式管理**（走客戶上線、架站、MainWP、備份、發佈管道，不走捷徑）。
建立在 X1（`briefs/X1-public-api.md`）之上；X2 不是前置。

---

## §0 框架

- 算命引擎＝一個**產品**，它的客戶是**網站**（組織），不是個人。網站的訪客與會員屬於網站本身。
- oracle.aware-wave.com＝第一個裝外掛的**客戶網站**（client zero）。外掛不可有只對它成立的設定：網址、金鑰、時區、語言、轉址規則全在該站的設定或資料裡。
- 引擎維持**無資料庫、無個資留存**；個資（命盤、好友、訂閱者出生資料）存在各網站自己的 WordPress 資料庫。

### oracle 這個「客戶」的三軸（ADR 017 §0，`017-entitlements-and-self-hosted-modules.md:22-38`）

| 軸 | 值 | 理由 |
|---|---|---|
| A 部署 | `hosted`（ks-aw-01 上的容器） | 與 soulful 同型（`lobster-factory/infra/soulful/docker-compose.yml:1-15`） |
| B 商業 | `comp`（自用、贈送；`organization_entitlements.source`，`0110_plans_entitlements.sql:25`） | 操作者自有；付費先不做 |
| C 操作 | `actor = staff:<uid>`，`on_behalf_of = <oracle 站的組織>` | 「代操」列（`017…:35`）；我們替這個站操作 |

- 組織紀錄：新建獨立組織（例 slug `aware-wave-oracle`），`organizations.kind = customer`（`0110…:36-37` 只有 internal／customer）。不掛在 `awarewave-ops`（internal，`0110…:38-39`），否則就不是「當客戶管」。代價：計費報表多一個 NT$0 客戶列，PROFILE 註明「操作者自有」。

---

## §1 決定表（9 項）

| # | 項目 | 建議方案 | 一句理由 | 否決的替代與原因 |
|---|---|---|---|---|
| 1 | 網址與路由 | WP 佔 `oracle.aware-wave.com`；引擎搬到第一層子網域 `oracle-engine.aware-wave.com`（訪客只在嵌入框內接觸） | 客戶網站嵌入的引擎本來就必須是獨立網域，oracle 用同一形狀＝一種模式 | `engine.oracle.aware-wave.com`：第二層子網域不在 Cloudflare Universal SSL 涵蓋（待查憑證方案）；路徑反代 `oracle.aware-wave.com/engine/*`：只對 oracle 成立，客戶站用不到，且要改 Next basePath |
| 1a | 舊網址（簡化） | 一條 301 規則放在該站的 Redirection 外掛（站的資料，不是外掛程式碼）：`/(zh-TW 或 en)/<slug>` → 該語言同名 WP 頁；`/(zh-TW 或 en)/…` 其餘 → 該語言首頁；`/sitemap.xml` 交給 Rank Math（是否自帶轉向待查） | 現站幾乎無搜尋量，只防死連結 | 逐頁對應／並行期：操作者已排除；nginx 寫轉址：要走 safe-infra-patch，客戶站也無法沿用 |
| 1b | Cloudflare／nginx（只列不做） | ①DNS 新增 `oracle-engine` A 記錄（proxied → ks-aw-01）②host nginx `sg-stack.aware-wave.com.conf:15-27` 的 `server_name` 加 `oracle-engine`、移除 `oracle` ③LE 憑證（`sg-stack…:30-31`）擴 SAN 含 `oracle-engine`（現 SAN 待查）④`nginx/default.conf:401-433` oracle 區塊 `server_name` 改 `oracle-engine`，移除 `X-Frame-Options SAMEORIGIN`（`:415`，改由引擎送 CSP `frame-ancestors`）⑤新 host vhost `oracle.aware-wave.com.conf` → oracle-wp 容器（soulful 同型，`infra/soulful/nginx/soulfulexpression.org.conf:10-30`）⑥`sg-deploy.sh:786` 煙霧網址改 `oracle-engine` | 全部經 `safe-infra-patch.sh`（host-nginx／compose） | 手動 SSH 編輯：AGENTS §0、§6 禁止 |
| 2 | 嵌入方式 | **iframe 嵌入版頁面＋postMessage 協定**（比較見下） | 不重做畫面、不依賴跨網域 cookie、客戶站裝了就能用 | Web Component：要把 Next 伺服器元件與 server-only 字典（`lib/i18n/config.ts:8-9`）拆成獨立前端包＝重做，Tailwind 全域樣式與 Kadence 互相汙染；WP 呼叫 API 自繪：PHP 重做 12 個工具畫面，已排除 |
| 3 | 外掛歸屬 | 新開獨立外掛 `aware-wave-oracle`（`lobster-factory/packages/oracle-wp-plugin/`），**不硬依賴** wp-bridge；發佈走既有 `release-wp-bridge.sh` 加 `--plugin oracle` | wp-bridge 是「每站都裝的 AI 控制面」（`aware-wave-wp-bridge.php:5`），算命是「有買才裝的產品」；合併則每次算命改版都要動全部客戶站 | 擴充 wp-bridge：爆炸半徑＝全部客戶站；硬依賴 wp-bridge：客戶只要算命時多裝一個控制面 |
| 4 | 身分 | 引擎只認**網站**（每站一對 Ed25519 金鑰，私鑰留站上）與站內會員假名（`HMAC(站台鹽, wp_user_id)`），不認個人；命盤、好友存 **WP 自訂資料表**；簽章格式沿用既有換手（raw body 簽章、±60 秒、nonce 一次）；未登入訪客照現在一樣匿名使用全部工具，結果不存，看到「登入以儲存」 | 個資留在網站＝保管者（controller）是站主（oracle＝操作者的組織；客戶站＝客戶），引擎只是瞬時處理者；合 ADR 005（`005-…:13-14`）與 ADR 017「客戶資料不在我們手上」（`017…:236`） | 引擎端資料庫：我們成為所有客戶站會員個資的保管者（DPA、跨境、刪除流程），引擎由無狀態變有狀態；重用 GoTrue 一次性登入連結（`awarewave-wp.ts:84-90`）：那是登入我們系統用，這裡會員不登入我們系統 |
| 5 | FluentCRM 每日信 | 外掛自帶訂閱區塊 → FluentCRM 聯絡人（pending）＋FluentCRM 內建雙重確認；出生資料存外掛自訂表（鍵＝FluentCRM subscriber id），**不存 FluentCRM 自訂欄位**；外掛每小時排程挑「當地時間到了」的人 → 批次向引擎預算 → 寫當日佇列表 → 貼標籤觸發 FluentCRM 自動化寄信，信中 smartcode 讀佇列表；同人同日唯一鍵保證只寄一次；退訂／退信由 FluentCRM＋FluentSMTP＋寄信服務回報處理 | FluentCRM 不支援依訂閱者時區寄信（官方支援回覆，§5）；寄信當下逐人呼叫引擎太慢，引擎一掛整批失敗 | smartcode 寄信時即時呼叫引擎：千人＝千次 HTTP 在寄信程序內；FluentCRM 自訂欄位：CRM 操作員全看得到、匯出即外流、只有文字型；24 個 recurring campaign：條件是「近期文章」型（能否無條件待查），DST 每年要改兩次 |
| 6 | 好友合盤 | 雙方都須是該站會員；邀請連結（隨機 token、只存雜湊、7 天、一次性）→ 對方登入後看見「會分享什麼」→ 同意 → 建立關係列；合盤由 **WP 伺服器**帶雙方資料向引擎取票，畫面**遮蔽對方出生日期時間地點**；任一方可撤回，撤回即刪快取結果且之後拒算；刪帳號連動刪除 | 對方出生資料永遠不進邀請者的瀏覽器 | 對方資料經 postMessage 進 iframe：邀請者開發者工具看得到；免登入「填好友資料」：好友本人沒同意也撤不回 |
| 7 | WordPress 站本身 | 照客戶流程：一鍵架站先開 staging（`aware-wave.com/staging/<slug>/`，`provision-staging/route.ts:33-34`）→ 正式站為**獨立容器組** `oracle-wp`／`oracle-db`（soulful 同型）。佈景 Kadence＋Kadence Blocks；外掛照 `WP_CLIENT_PLUGIN_STACK.md:44-73`（mainwp-child、wp-bridge、Wordfence、WPvivid、Rank Math、Redirection、FluentForms、FluentSMTP、FluentCRM Pro）＋TranslatePress＋本外掛；備份＝主機每日（`backup-ks-aw-01.sh`）＋WPvivid 遠端（`MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md` §7）；更新＝`/wp-maintenance safe-update`（`profile: ks-aw-01-docker`，`update-client-wp-plugins.ps1:111-122`） | 獨立容器＝站掛不影響 aware-wave.com；會員表與 aware-wave.com 會員完全分開 | 放進 aware-wave.com 的 WP：會員與 AwareWave 帳號混在同一使用者表；WP Multisite：現有站都非 multisite，MainWP／WPvivid／更新腳本以單站為單位 |
| 7a | 多語 | TranslatePress（站台 SSOT 已選，`WP_CLIENT_PLUGIN_STACK.md:129,202`）；免費版 2 語（繁中＋英文），第 3 語起付費（價格待查）；外掛以 `determine_locale()` 取語言，對應引擎 `locales`（`lib/i18n/config.ts:13`），對不到用 `en` | 外掛不綁特定翻譯外掛，客戶站用 Polylang／WPML 也能動 | Polylang：與既有 SSOT 不一致 |
| 8 | 上線與回滾 | 不設長並行期：①引擎先同時回應 `oracle` 與 `oracle-engine` ②WP 正式站在內部埠完成，以 Host 標頭驗收 ③一次切換 `oracle` vhost 到 WP ④驗證後把 `oracle` 從引擎 server_name 移除。回滾見 §3 S5 | 切換只動 host nginx 一個檔，safe-infra-patch 失敗自動還原 | 改 DNS 切換：兩者同主機同 IP，只多傳播延遲 |
| 9 | 客戶網站（代操、買斷） | 現在就留好：①引擎站台登記表（key_id、公鑰、允許嵌入網域、每日額度）是資料不是程式 ②外掛設定分「瀏覽器用引擎網址」與「伺服器用引擎網址」③每站金鑰可輪替 ④站名、語言、時區、寄信時刻、轉址都在站上設定 ⑤用量依 key_id 記錄（之後接 `can()`）⑥買斷（客戶自架引擎）時外掛只改兩個網址＋換金鑰 | 「客戶用原來的網站，我們接入」＝裝外掛＋登記一列 | 每客戶一個引擎實例：引擎無狀態，沒必要 |

### 嵌入方式比較（#2 依據）

| 面向 | iframe 嵌入版（選） | Web Component | WP 呼叫 API 自繪 |
|---|---|---|---|
| 高度自適應 | postMessage `resize`（ResizeObserver） | 天生 | 天生 |
| SEO | 工具結果不收錄（本是個人化結果）；介紹文、FAQ 寫在 WP 頁面本體，可收錄 | 需 SSR，做不到 | 最好，但要重做 |
| 跟隨佈景 | 父頁讀 Kadence 色票 CSS 變數 `--global-palette*`，以 `oracle:init` 送入 | 吃父頁 CSS，也被父頁 CSS 汙染 | 完全跟隨 |
| 跨網域 cookie／儲存 | 不用 cookie，身分由嵌入票帶入，不受第三方 cookie 封鎖影響 | 呼叫引擎要 CORS；AI 端點開 CORS＝任何網站可盜刷 | 伺服器端呼叫，無此問題 |
| 效能 | 每個嵌入載一次引擎前端；`loading="lazy"` | 一次載入 | 最輕 |
| 裝到客戶站 | 外掛＋登記允許網域即可 | 與客戶佈景 CSS／JS 衝突風險高 | 外掛含全部畫面，維護 12 套 PHP |
| 改動量 | 引擎加嵌入版路由＋協定 | 重構前端打包 | 重寫 |

- ADR 018 不採用 iframe（`018-product-doors-and-buyout-delivery.md:70`）三個理由的處置：第三方 cookie → 不用 cookie；手機難用 → 高度自適應、無外框；誘導點擊 → 引擎依登記表送 `frame-ancestors <該站網域>`。需修 ADR（下表）。

### ADR 修訂（只限縮範圍，不動其他產品）

| ADR | 條文 | 修訂寫法 |
|---|---|---|
| 018 | §1 三扇門（`:17-23`） | 加第四種交付形式「**嵌入件**」：產品以 WP 外掛嵌進網站頁面，使用者是網站的會員，不登入我們任何網址；引擎只認網站金鑰。三扇門不變 |
| 018 | 不採用 iframe（`:70`） | 改為「**有登入狀態的產品門**不以 iframe 嵌入」；嵌入件可用 iframe，條件：不用 cookie、`frame-ancestors` 依登記表、高度協定 |
| 015 | §2 帳號＝aware-wave.com 會員（`:43-46`） | 加範圍句：適用「個人向 AwareWave 購買的產品」；客戶網站（含操作者自有、當客戶管理者）的會員屬該站，不是 AwareWave 帳號 |
| 017 | §0b-1（`:48`）、§0b-6（`:53`「會員主檔在 Supabase」） | 補：嵌入件的主體是網站所屬組織，`can(組織, feature_key, actor=site:<key_id>)`；終端會員不進 Supabase。§0b-6 對嵌入件寫成明確範圍，不是豁免 |

### 之後要賣時如何接回 can() 與 products.ts

- 現在以 `scripts/new-product.mjs` 登記 `oracle`：`door: { app: "external" }`、`subdomain: "oracle-engine"`、`loginSources: ["local"]`（測試要求含 local，`018…:57`；員工用）、`status: "coming_soon"`。`accessChannels` 型別只有 ui／api（`products.ts:31`）；嵌入件先記 api，是否加 embed 隨 ADR 修訂定案。
- 要賣時才做：新 migration 改三個 CHECK（`0110_plans_entitlements.sql:9,22,55-56`）加 oracle（附 down migration）；引擎收費動作前問控制面 `can(網站組織, "oracle.<feature>", site:<key_id>)`；站台登記表由引擎環境變數搬進控制面。組織已存在（§0），資料形狀不變。

---

## §2 架構圖（文字）

```
訪客瀏覽器
 ├─ GET https://oracle.aware-wave.com/<頁> ─► host nginx 新 vhost [新增，soulful 同型]
 │                                          └► oracle-wp 容器 [新增，infra/oracle-wp/，soulful compose 同型]
 │                                               ├ Kadence 佈景＋WP 頁面（介紹文、FAQ、SEO）[沿用站台 SSOT]
 │                                               └ aware-wave-oracle 外掛 [新增]
 │                                                   ├ 短碼／區塊 → <iframe src=引擎/embed/...>＋父頁 JS
 │                                                   ├ WP REST（cookie＋wp_rest nonce，同源）：存命盤、好友、訂閱
 │                                                   ├ 自訂表：charts / friend_links / daily_profiles / daily_queue
 │                                                   ├ 伺服器→引擎 Ed25519 站台簽章 [簽法沿用 aware-wave-store Signature.php:27-33]
 │                                                   └ FluentCRM：smartcode 群組、標籤、雙重確認 [沿用 FluentCRM Pro]
 │
 ├─ iframe https://oracle-engine.aware-wave.com/embed/<lang>/<slug>#t=<嵌入票>
 │      ─► host nginx sg-stack [改 server_name] ─► lobster-nginx default.conf [改 server_name、移 XFO]
 │      ─► oracle-web 容器（Next 16）[沿用；新增 /embed 路由、協定、CSP]
 │             ├ 確定性引擎 lib/** [沿用]；每日運勢 lib/daily.ts:108,174 [沿用]
 │             ├ /api/interpret（AI）[沿用；新增依嵌入票的站台／假名限額]
 │             └ /api/v1/places（CORS）[新增，轉呼叫既有 lib/places/server]
 │
 └─ postMessage（父頁 ⇄ iframe，雙向檢查 origin）[新增協定 v1]

oracle-wp 伺服器 ─(本機：lobster-net 內 http://oracle-web:3000；客戶站：公開網址)─► 引擎
   POST /api/v1/batch          批次計算（站台簽章）[新增]
   POST /api/v1/embed-tickets  封存輸入 → 嵌入票（站台簽章）[新增]
   POST /api/v1/systems/{id}   單次計算 [X1]

外掛每小時排程（主機 cron 觸發 wp cron，不靠訪客流量）
   → 挑當地 07:00 的訂閱者 → /api/v1/batch → 寫 daily_queue（訂閱者 × 當地日期 唯一）
   → 貼標籤 oracle-daily-due → FluentCRM 自動化（可重複進入）→ 寄信（smartcode 讀 daily_queue）
   → 移除標籤 → FluentSMTP → 寄信服務（待選）→ 退信／投訴回報 → FluentCRM 狀態 → 排程自動排除

引擎站台登記表 ORACLE_SITES（.env.production 內 JSON：key_id、公鑰、允許嵌入網域、每日額度）
   [新增；sg-deploy rsync 排除 .env*，sg-deploy.sh:363，部署不會蓋掉]
```

### postMessage 協定 v1（引擎與外掛共用合約；寫進引擎 `deploy/DEPLOY.md` 與外掛 README）

| 方向 | 訊息 | 內容 |
|---|---|---|
| 引擎→父 | `oracle:ready` | `{v:1}` |
| 父→引擎 | `oracle:init` | `{v, locale, theme:{css 變數}, member:boolean}`；嵌入票不走訊息，走 URL fragment（不進伺服器日誌與 Referer） |
| 引擎→父 | `oracle:resize` | `{height}` |
| 引擎→父 | `oracle:save-chart` | `{system, input}`（僅 member=true 時出現「儲存」鈕） |
| 引擎→父 | `oracle:need-login` | `{}` → 父頁導向 WP 登入 |
| 引擎→父 | `oracle:navigate` | `{slug}` → 父頁轉到對應 WP 頁（slug→頁面對應是站上設定） |

- 父頁只收 `event.origin` 等於設定的引擎網址；引擎只收登記表中該站允許的 origin。

### 嵌入票（「引擎認得 WP 會員」與「好友資料不外流」的同一個機制）

- WP 伺服器以站台金鑰簽 `POST /api/v1/embed-tickets {system, inputs[], redact[], member_pseudonym, locale}` → 引擎以自己的密鑰 AES-GCM 加密回票（10 分鐘有效）。
- iframe 讀 fragment 的票 → `POST /api/embed/resolve` → 引擎伺服器端解票、計算，回**已遮蔽**的結果；被遮蔽的原始輸入不回瀏覽器。
- 用途：會員自己的命盤預填、好友合盤、AI 解讀依 key_id＋假名限額。無票＝匿名，維持現行行為與 X1 的依 IP 限流。
- 引擎與 AI：外掛不呼叫 AI；AI 只在 iframe 內經 `/api/interpret`，費用由我們的 OpenAI 金鑰支付，故每站每日上限寫在登記表。

### X1 還缺的（W1、W2 補）

- 伺服器對伺服器金鑰（站台 Ed25519）與依 key_id 的限流（X1 只依來源 IP，`X1-public-api.md:14`；WP 伺服器一個 IP 代表全站，且 lobster-nginx `limit_req burst=60`，`default.conf:422`）。
- 批次端點（X1 只有單次 `POST /api/v1/systems/{id}`，`X1-public-api.md:11`）。
- `/api/places` 開 CORS 版（X1 只對 `/api/v1/*` 開 CORS，`X1-public-api.md:16`；現行 `/api/places` 在 v1 外，`app/api/places/route.ts:16`）。
- 嵌入用清單：頁面 slug（`lib/site.ts:16`，含 daily、astrology）與系統 ID（`SYSTEM_IDS`）不是同一份，`GET /api/v1/systems` 要多回「可嵌入頁面」清單。
- 嵌入版頁面、協定、嵌入票、`frame-ancestors`、依票的 AI 限額。

---

## §3 卡片

等級依 AGENTS §3；「需同意」＝該步實作或上線前操作者明示 go。所有給 worker 的 brief 照抄：「回報操作者一律繁體中文」與 AGENTS §1 的「不做無效益測試」句。

### 引擎（`Projects/internal/ziwei-doushu/`，X1 併入後）

| 代號 | 目的 | 檔案／系統 | 驗收 | 依賴 | 等級 | 需同意 |
|---|---|---|---|---|---|---|
| W1 | 站台簽章、批次、places CORS | 新 `lib/sites/registry.ts`（讀 `ORACLE_SITES`）、`lib/sites/verify.ts`（Ed25519、±60 秒、nonce 一次；格式照 `awarewave-wp.ts:30-41,62-82`）、`app/api/v1/batch/route.ts`（`{system, items[≤200]}`，逐筆成功／失敗）、`app/api/v1/places/route.ts`；X1 限流加「依 key_id 計數」；`deploy/DEPLOY.md` | 錯簽／過期／重送 401、未知 key 404、超額 429；200 筆每日運勢批次本機 < 5 秒；日誌不含出生欄位（測試斷言）；`npx tsc --noEmit`、vitest 綠 | X1 | Medium（auth） | 否（部署另計） |
| W2 | 嵌入版、協定、嵌入票 | 新 `app/embed/[lang]/[slug]/page.tsx`（無外框，重用現有工具元件）、`lib/embed/protocol.ts`（訊息型別唯一來源）、`lib/embed/ticket.ts`（AES-GCM，密鑰 `ORACLE_EMBED_SECRET`）、`app/api/v1/embed-tickets/route.ts`、`app/api/embed/resolve/route.ts`；CSP `frame-ancestors` 依登記表；嵌入頁 `noindex` 且不經語言轉址（`proxy.ts:38-40` matcher 要排除 `/embed`）；`/api/interpret` 加依票限額；工具元件加「初始輸入」與「儲存」事件 | Playwright：另一 origin 測試頁嵌入 → resize 生效；未登記 origin 被 CSP 擋；偽造 origin 訊息被忽略；好友模式回應 JSON 不含對方出生欄位；`grep -rn postMessage` 只出現在 `lib/embed/**` 與嵌入頁 | W1 | Medium | 否 |
| W3 | 引擎改名的建置設定 | build arg `NEXT_PUBLIC_SITE_URL=https://oracle-engine.aware-wave.com`（`lib/site.ts:7-8` build 時內嵌）；以環境變數表示「被嵌入模式」時 `robots.ts` 全擋、`sitemap.ts` 不輸出（不寫死網域）；刪除過期範本 `deploy/nginx/oracle.aware-wave.com.conf`（§5） | build 後 `/robots.txt` = Disallow: /；`/sitemap.xml` 404；`lib/site.test.ts` 綠 | X1 | Low | 否 |

### 外掛（新 `lobster-factory/packages/oracle-wp-plugin/`，slug `aware-wave-oracle`；預設情境＝任一客戶 WP，oracle 只是第一站）

| 代號 | 目的 | 檔案／系統 | 驗收 | 依賴 | 等級 | 需同意 |
|---|---|---|---|---|---|---|
| P1 | 骨架、設定、金鑰、嵌入 | 入口 `aware-wave-oracle.php`（`AWORACLE_VERSION`，結構照 `aware-wave-wp-bridge.php:25-45`）；設定頁：瀏覽器用引擎網址、伺服器用引擎網址、key_id、產生／輪替 Ed25519 金鑰（照 `Signature.php:27-33`）、語言對應、slug→頁面對應、會員假名鹽；短碼 `[aw_oracle tool=""]`＋Gutenberg 區塊（工具清單取自引擎 `GET /api/v1/systems`，快取 1 天）；父頁 JS（協定 v1、origin 檢查、Kadence 色票轉送，無 Kadence 時用預設）；PHPUnit | 乾淨 WP（docker，產物放 `$env:TEMP`）裝外掛 → 產生金鑰 → 區塊嵌入工具可用；外掛內 `grep -rn "oracle.aware-wave.com"` = 0；PHP 7.4 與 8.2 lint 綠 | W2 合約（依本文件 §2 協定可先平行開發） | Medium | 否 |
| P2 | 會員命盤與好友合盤 | 啟用時 dbDelta 建 `{prefix}aworacle_charts`、`{prefix}aworacle_friend_links`（`invite_hash`、`expires_at`、`accepted_at`、`revoked_at`）；WP REST（登入＋nonce）；短碼 `[aw_oracle_my_charts]`、`[aw_oracle_friends]`；WP 隱私工具 exporter／eraser；刪會員連動刪除 | 邀請 token 只存雜湊；過期與重用皆拒；撤回後合盤 403 且快取刪除；匯出含命盤與好友關係；刪除後兩表無該人資料；好友結果頁 HTML 不含對方出生欄位 | P1、W2 | High（身分、個資） | **是**（上線前） |
| P3 | 每日運勢訂閱＋FluentCRM | 區塊 `[aw_oracle_daily_subscribe]`（欄位見下）；`{prefix}aworacle_daily_profiles`、`{prefix}aworacle_daily_queue`（unique(subscriber_id, local_date)）；每小時排程；批次呼叫 W1；smartcode 群組 `aworacle`（`FluentCrmApi('extender')->addSmartCode`，掛 `fluent_crm/after_init`）；標籤與自動化範本 JSON 隨外掛附；聯絡人變 unsubscribed／bounced／complained 即停寄，保存期滿刪出生資料；**不重用** `Crm/ContactUpserter.php`（`:5-6` 直接建 subscribed，跳過雙重確認） | 三時區（Asia/Taipei、Europe/London 跨 DST 當日、America/Los_Angeles）各在當地 07:00 被挑中且只一次；同日重跑不重寄；退訂者不被挑；引擎回錯不貼標籤（不寄空信） | P1、W1 | High（寄信、個資） | **是**（首次對真實名單寄信前） |
| P4 | 發佈管道 | `scripts/release-wp-bridge.sh:4-7,38-41` 加 `oracle`；`scripts/rollout-wp-bridge.ps1:33` ValidateSet 加 `oracle`（`-Install -Site <容器>`）；新發佈 repo `awarewaveai-pei/aware-wave-oracle`（release.yml 照 bridge）；`WP_CLIENT_PLUGIN_STACK.md` 加「產品外掛」類別與本外掛列（installSource release-url）；非 ks-aw-01 的客戶站寫明經 MainWP 以 release zip URL 安裝 | `release-wp-bridge.sh --plugin oracle --dry-run` 正確；`rollout-wp-bridge.ps1 -Plugin oracle -Install -Site <staging 容器> -DryRun` 正確 | P1 | Medium（新公開 repo） | 是（建 repo） |

訂閱表單欄位（P3）：電子郵件（必）、出生日期與時間（可選「不知道時間」）、曆法、出生地（`/api/v1/places` 搜尋，存 `BirthPlace {label,lat,lon,zone}`，`lib/timezone.ts:12-17`）、**目前所在時區**（預設瀏覽器 Intl 時區，與出生地分開；寄信時刻以它計算）、語言（預設當前頁語言）、同意勾選（版本號＋時間＋IP 雜湊存 profile 表）。已登入會員可一鍵帶入自己的命盤。

### 開站（照客戶流程逐步走；每步對應既有文件）

| 代號 | 目的 | 依據（既有流程） | 驗收 | 依賴 | 等級 | 需同意 |
|---|---|---|---|---|---|---|
| S1 | 建 tenant 資料夾 | `agency-os/tenants/NEW_TENANT_ONBOARDING_SOP.md:11-64`（Step 1–4）：`tenants/company-aware-wave-oracle/` 由 `templates/tenant-template/`、`templates/core/` 複製；填 `PROFILE.md`（操作者自有、代操、comp）、`core/ENVIRONMENT_REGISTRY.md`（staging、production）、`SITES_INDEX.md`、`ACCESS_REGISTER.md`、`core/CROSS_BORDER_GOVERNANCE.md`（全球訪客；資料保管者＝該組織；引擎為處理者）；第一個專案 `projects/2026-NNN-oracle-wp-front-door/` | SOP Go/No-Go（`:93-107`）逐項打勾或註明 N/A | — | Low | 否 |
| S2 | 建組織紀錄 | `.claude/agents/client-onboarding.md:33-88` §CORE＋§SSH：`organizations` 一列（kind、三軸見 §0）＋`client_config`（platform wordpress、site_url、wp_slug、tenant_folder） | `/client-status <slug>` 列出（站上線後探測 200） | S1 | High（prod 資料寫入、計費帳戶） | **是** |
| S3 | 一鍵架 staging | `/ops/onboarding` → trigger-build → `provision-staging`（`APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md:84-85` 已驗證路徑）；套 manifest（`lobster-factory/packages/manifests/wp-business.json`，內容開工時讀）＋TranslatePress、FluentCRM Pro、本外掛（P4 `-Install`）；建頁面（每個工具一頁，slug 與引擎 `PAGE_SLUGS` 對應，`lib/site.ts:16`） | staging 200；外掛清單與 §1-7 一致；嵌入可用（staging 用另一 key_id，允許網域 aware-wave.com） | S2、P1、P4 | Medium | 否 |
| S4 | 正式站容器與備份 | 新 `lobster-factory/infra/oracle-wp/`（照 `infra/soulful/docker-compose.yml`：容器名＝備份合約、具名 volume、DB 不開埠、自有網路；wordpress 容器另外加入 lobster-net，前例 `default.conf:701`）；host vhost 檔；`backup-ks-aw-01.sh` 改讀站台清單（G2）；tenant `core/wp-update-config.json`（`profile: ks-aw-01-docker`）；staging 內容搬到正式站（WPvivid 遷移或 wp-cli export/import＋search-replace） | `docker compose config` 綠；備份 dry-run 列出 oracle 兩項；內部埠以 Host 標頭驗收全部頁面 | S3 | High（compose、備份腳本） | **是** |
| S5 | 切換 | ①W1–W3 部署（`sg-deploy.sh oracle-web`），nginx 同時回應 oracle 與 oracle-engine ②DNS＋憑證 SAN（§1-1b ①③）③切 `oracle` vhost → oracle-wp ④Redirection 規則（§1-1a）⑤移除引擎的 `oracle` 名稱，`sg-deploy.sh:786` 改網址 | 每步後：`curl -sI https://oracle.aware-wave.com/`（WP 200）；`curl -sI https://oracle.aware-wave.com/zh-TW/ziwei`（301 → WP 頁）；`curl -s https://oracle-engine.aware-wave.com/api/health`（200）；WP 頁內 iframe 正常；`/playwright client <slug>` 無異常 | S4、W1–W3、P1 | High（DNS、nginx、prod deploy） | **是**（每個子步） |
| S6 | 接入維運 | MainWP 加站（`MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md` §5）；WPvivid 遠端（§7 表加一列）；Uptime Kuma（`runbooks/UPTIME-KUMA-MONITOR-FIX.md`）；FluentSMTP＋寄信服務；寄信網域 SPF／DKIM／DMARC | `/client-status <slug>` 健康；`/wp-maintenance backup-status <slug>` 有當日備份；mail-tester ≥ 9；ENVIRONMENT_REGISTRY 填實測值 | S5 | High（DNS、寄信帳號） | **是** |

S5 回滾：
- ① 引擎部署失敗：`sg-deploy.sh` 自動還原；手動 `rollback-phase1.sh restore oracle-web`（`deploy/DEPLOY.md:12`）。
- ②③⑤ nginx：`safe-infra-patch.sh host-nginx` 失敗自動還原；成功後要退回＝用 patch 前備份檔再跑同一指令（單檔、秒級）。
- ③ 後 WP 出問題：把 `oracle` 加回引擎 server_name、移除 WP vhost＝回原狀；WP 容器保留不動。
- DNS：刪除新增的 `oracle-engine` 記錄即回；`oracle` 記錄全程不動。
- P3 寄錯信：停用 FluentCRM 自動化（一個開關），佇列表保留供查。

### 治理與流程缺口

| 代號 | 目的 | 檔案 | 驗收 | 依賴 | 等級 | 需同意 |
|---|---|---|---|---|---|---|
| G-ADR | ADR 015／017／018 修訂（§1 表）＋`products.ts` 以 `new-product.mjs` 登記 oracle | `agency-os/docs/architecture/decisions/015-…`、`017-…`、`018-…`、`ADR_INDEX.md`；next-admin `lib/portal/products.ts` | `node scripts/verify-governance-pointers.mjs` 綠；`products.test.ts`、`registry-code.test.ts` 綠；`npx tsc --noEmit` 綠 | — | Medium | 是（產品方向） |
| G-GAP | 補客戶流程缺口 G1–G8（下列） | 各列所指檔案 | 每項有檔案改動，或延伸既有 TASKS 條目一行（不新開段） | S1–S6 實走 | Low–Medium | 否 |

客戶流程缺口（拿自己的站走一遍會撞到的）：
- G1 一鍵架站只開 `aware-wave.com/staging/<slug>/` 子目錄（`provision-staging/route.ts:5,33-34`）；沒有「正式站＝獨立網域＋獨立容器」步驟，也沒有「staging → 正式」手冊（soulful 的 `SITE_MIGRATION_RUNBOOK.md` 是外部主機搬入，情境不同）。S4 實走後寫進 `lobster-factory/docs/hosting/` 一份 promote 手冊；自動化另議。
- G2 主機每日備份逐站寫死（`backup-ks-aw-01.sh:94-123` 只認 soulful、chatwoot）；新站要改腳本。改成讀站台清單（容器名＋volume），soulful 合約名不變（`infra/soulful/docker-compose.yml:6-12`）。
- G3 `client-onboarding` 的 `hosting_type` 只有 hostinger／hetzner／cloudflare（`.claude/agents/client-onboarding.md:19,59`），沒有「ks-aw-01 容器」；更新腳本已有 `ks-aw-01-docker`（`update-client-wp-plugins.ps1:111-122`、soulful `core/wp-update-config.json:10`）。兩處列舉對齊。
- G4 `NEW_TENANT_ONBOARDING_SOP.md:42` 說客戶排程已退役，Go/No-Go `:105` 仍要求「排程已啟用」，自相矛盾。
- G5 `rollout-wp-bridge.ps1` 只找 ks-aw-01 上的容器（`:13-16`）；客戶自己主機上的 WP 沒有外掛交付路徑（P4 寫明 MainWP 以 URL 安裝）。
- G6 客戶上線流程沒有「操作者自有站以客戶身分管理」的商業紀錄寫法（kind、comp）；S2 實走後補進 client-onboarding §CORE。
- G7 站台外掛目錄（`WP_CLIENT_PLUGIN_STACK.md:37-45`）只有維運層與通用外掛，沒有「產品外掛」類別（P4 補）。
- G8 寄信建議（`WP_CLIENT_PLUGIN_STACK.md:223-227`）沒有「每日、全球、大量」情境與退信回報設定步驟（S6 補）。

### 執行順序

- 現在可平行：W3、S1、G-ADR、P1（依本文件 §2 協定先做）。
- X1 → W1 → W2 → P2、P3（P2、P3 可平行）。
- P1 → P4 → S3（S2 先）→ S4 → S5 → S6。
- 關鍵路徑：X1 → W1 → W2 → P3 → S5。
- 建議模型：W1／W2／P1–P3 照卡做＝Opus 5.5 或 `fullstack-engineer`；S2／S4／S5 含 High 步驟＝主 session 親自做；G-ADR＝Fable 5.1 或 Opus 5.5。

---

## §4 需要操作者決定（5 題）

1. **每日信要不要附 AI 寫的一小段話？** 建議先不要：只寄引擎算好的分數、幸運色、宜忌，不花錢。要附的話，每封信都要付 AI 費用，金額要先估。
2. **寄信服務用哪一家？** 建議 Amazon SES（量大最便宜；需要您開帳號並驗證寄信網域）。替代：Brevo 免費方案（站台文件寫每天 3,000 封以下適用，`WP_CLIENT_PLUGIN_STACK.md:226`）。
3. **每天幾點寄？** 建議固定在訂閱者「當地時間早上 7 點」，先不讓訂閱者自己選（少一個欄位、少一種出錯）。
4. **好友合盤：對方一定要是本站會員嗎？** 建議要。對方登入按「同意」才算數，之後也能自己撤回；對方的生日、出生時間、出生地不會顯示給邀請的人。
5. **這個站在系統裡登記成一個「客戶」**：名稱建議「AwareWave 算命站」，費用記「自用（0 元）」，由我們代操。可以嗎？

---

## §5 查證紀錄

### 抽驗過的 `路徑:行號`
- 引擎：`lib/daily.ts:108`（computeDailyAlmanac）、`:174`（computeDailyFortune，目標日期由參數給）；`lib/today.ts:9`；`lib/timezone.ts:12-17`；`lib/dates.ts:85`（resolveBirth）；`lib/i18n/config.ts:8-9,13,17`；`lib/site.ts:7-8,16`；`app/sitemap.ts:8-25`；`app/robots.ts`（disallow `/api/`）；`proxy.ts:26-40`；`next.config.ts:11-16`；`app/api/places/route.ts:16-27`（無 CORS）；`app/api/interpret/route.ts:17-25,121`；`deploy/DEPLOY.md:12,17-18,29`；元件與 app 內 `postMessage`、`localStorage` 皆 0 筆。
- 部署：`lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:962-995`；`nginx/default.conf:401-433`（`:415` XFO、`:417` trusted source、`:422` limit_req）、`:701`；`nginx/system-sites/sg-stack.aware-wave.com.conf:15-31`；`scripts/sg-deploy.sh:363,784-786`。
- 身分：next-admin `lib/auth/sources/awarewave-wp.ts:30-41,55-91`；`app/api/auth/wp-handoff/route.ts:15-29`；`lib/payments/sites.ts:12-14,49,56-85,135`；`aware-wave-store-plugin/includes/Signature.php:22-33`、`MyAccountDoors.php:1-30`。
- wp-bridge：`aware-wave-wp-bridge.php:5,25-45`；`includes/Crm/ContactUpserter.php:1-40`；`scripts/release-wp-bridge.sh:4-7,38-41`；`scripts/rollout-wp-bridge.ps1:13-16,33`。
- 規定：ADR 015 `:43-46`；ADR 017 `:22-38,48-53,186-190,236`；ADR 018 `:17-23,41-47,57,70`；ADR 005 `:13-14`；`0110_plans_entitlements.sql:9,22,25,36-39,55-56`；`products.ts:3-4,14,22-37`。
- 客戶流程：`tenants/NEW_TENANT_ONBOARDING_SOP.md:11-107`；`.claude/agents/client-onboarding.md:12-139`；`.claude/commands/wp-maintenance.md`、`client-status.md`；`APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md:34-94`；`provision-staging/route.ts:5,33-34`；`infra/soulful/docker-compose.yml:1-60`；`infra/ks-aw-01-backup/backup-ks-aw-01.sh:73-123`；soulful `core/ENVIRONMENT_REGISTRY.md`、`core/wp-update-config.json:10`；`update-client-wp-plugins.ps1:111-144`；`WP_CLIENT_PLUGIN_STACK.md:29,37-73,129,198-227`；`MAINWP_WPVIVID_CLIENT_BACKUP_RUNBOOK.md:110-132`；`reports/status/capacity-LATEST.md`（ks-aw-01 記憶體用 13.4%，容得下新 WP 容器組）。

### 查過的官方文件
- FluentCRM 自訂 smartcode：https://developers.fluentcrm.com/modules/smart-code（`FluentCrmApi('extender')->addSmartCode($key,$title,$shortCodes,$callback)`，掛 `fluent_crm/after_init`，callback 逐聯絡人；是否只在寄信時執行、有無快取：文件未寫）
- FluentCRM 觸發器：https://docs.fluentcrm.com/fluentcrm-automation-triggers（List Applied 有 Restart，可對同一聯絡人重複進入；CRM 觸發器需 FluentCRM Pro）
- FluentCRM 依時區寄信：https://wordpress.org/support/topic/user-controls-send-time/（官方支援回覆：依網站時區或自動化設定寄送，不支援訂閱者時區）
- FluentCRM recurring campaign：https://fluentcrm.com/docs/recurring-campaign/（每日／每週／每月，15 分鐘單位；條件為近期文章型）

### 與「已知事實」不符
- `awarewave-wp.ts:87-123`：檔案只有 91 行；換手邏輯在 `:55-91`，nonce 與時窗在 `:30-41`。
- 登入換手的 WP 端在 **aware-wave-store 外掛**（`MyAccountDoors.php`、`Signature.php`），不在 wp-bridge。
- `deploy/DEPLOY.md:18` 寫 host nginx → `127.0.0.1:3010`；實際是 sg-stack → `127.0.0.1:8083` lobster-nginx → `oracle-web:3000`（`sg-stack…:17,26`、`default.conf:405,423`）；`deploy/nginx/oracle.aware-wave.com.conf:17` 是過期範本（W3 處理）。
- 一鍵架站只開 staging 子目錄，不開正式網域站（G1）。

### 待查
- LE 憑證 `aware-wave.com` 目前 SAN 清單與 Cloudflare SSL 模式（決定 `oracle-engine` 擴 SAN 或另簽）。
- FluentCRM「Tag Applied」是否也有 Restart（文件只寫 List Applied）；不行就改用 List Applied（每日加入／移出一個 list）。
- FluentCRM 以 PHP 觸發雙重確認信的方法名與 pending 行為；刪除聯絡人、狀態改變的 action hook 名稱（P3 用）。
- Rank Math 是否自動把 `/sitemap.xml` 轉到 `/sitemap_index.xml`。
- TranslatePress 第 3 語起付費版價格、寄信服務價格（以 NT$ 報）。
- `manifests/wp-business.json` 是否含 FluentCRM、TranslatePress（S3 開工時讀）。
- ks-aw-01 對外 SMTP 埠是否開放（寄信服務走 API 則不需要）。
