# oracle.aware-wave.com 的 WordPress 門面：架構比較

- Mode: 直接決策，非 /decide 面板。**狀態：待操作者確認**（§6 兩題）。確認前 `briefs/WP-front-door-plan.md`、`briefs/SITE-FLOW-COMPLETION-PLAN.md` 一律不派卡。
- 日期：2026-11-21
- 路徑縮寫：FD = `agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/WP-front-door-plan.md`；REV = 同目錄 `PLAN-REVIEW.md`；ENG = `Projects/internal/ziwei-doushu/`；ADR = `agency-os/docs/architecture/decisions/`；STATUS = `agency-os/handoffs/2026-11-22-platform-membership-ux/WP-MEMBERSHIP-STATUS-20261121.md`。
- 未做：沒連主機、沒建任何測試站。§5 的驗證都還沒跑。

## 0. 操作者回答與定案方向（2026-11-22，優先於下文 §6 的建議）

- §6 第 1 題操作者答：「要能排版」→ 新增 R7：工具頁是 WordPress 頁面，工具上下可放區塊。乙出局（工具頁不在 WordPress）。
- 方向：**甲′ 同網域內嵌框**＝甲的頁面形式＋乙的網域安排。
  - WordPress 佔 `oracle.aware-wave.com` 的頁面；引擎不改名，同一網域下由 nginx 依路徑轉到引擎（同乙）；WordPress 頁面用 iframe 載入同網域的引擎頁。
  - 對 ADR 018 三個理由：cookie 與儲存是第一方（同源）；誘導點擊以 `frame-ancestors 'self'` 關閉（現有 `default.conf:415` 已送 `X-Frame-Options SAMEORIGIN`）；手機問題仍在，但同源時父頁可直接量框內高度、接手捲動，不需要跨網域訊息協定。
  - 相對甲省掉：引擎改名、新憑證、DNS、嵌入票、跨網域 origin 登記；會員存檔由框內頁直接呼叫同網域的外掛 REST。
  - 相對乙多出：搜尋收錄要處理（引擎工具頁與 WordPress 頁內容重複，canonical 指向 WordPress 頁）；手機浮層與捲動。
  - 保留乙的代價 2（引擎與 WordPress 同源）與代價 3（語言路徑不可相撞）。
  - 客戶自己主機上的 WordPress：跨網域內嵌框（P1 現有寫法），有第一個這種客戶時才做。
- 丙不選：18 個元件重做並永久維護兩份。
- §7 試驗照甲′ 調整，結果寫在 §8。

## 1. 操作者要的（需求，不是做法）

來源 `DISPATCH.md:133,136,141,143` 與 FD `:3-8`。

| # | 需求 |
|---|---|
| R1 | 站放在 WordPress，照客戶網站的方式管理，她要用我們的系統實際操作 |
| R2 | 會員帳號＝這個站自己的 WordPress 會員 |
| R3 | 訂閱後每天自動寄運勢信（FluentCRM） |
| R4 | 私人合盤：使用者自己輸入對方資料並存檔，不通知對方 |
| R5 | 全世界可用；付費先不做 |
| R6 | 同一支外掛之後能裝到任何客戶的 WordPress |

## 2. 兩份計畫沒驗證就採用的前提

| # | 前提 | 出處 | 實況 |
|---|---|---|---|
| P-1 | 工具用內嵌框放進 WordPress 頁面 | FD `:38` | ADR 018 `:70`、ADR 015 `:47` 已否決內嵌框。FD `:60` 用一段話反駁後就當成定案，沒有試做 |
| P-2 | 引擎必須搬到新網域 `oracle-engine` | FD `:35` | 只因為 P-1 才需要。連帶：新憑證（REV C3、M12）、舊網址轉向、已寫進 `ENG/deploy/DEPLOY.md:39` 的 MCP 網址失效（REV m10） |
| P-3 | FluentCRM 能用「貼標籤 → 自動化 → smartcode 讀佇列」每天對同一人寄信 | FD `:41`,`:108` | 三項行為文件沒寫（FD `:245-248`）。§4 有更短的路 |
| P-4 | 站台登記用引擎環境變數 `ORACLE_SITES` | FD `:111`；已實作 `ENG/lib/sites/registry.ts:4` | 與 `seller_sites`、`wp_sites` 重複（REV C2） |
| P-5 | 不能放進 aware-wave.com 的 WordPress，因為「會員會混在一起」 | FD `:43` | 這個理由與 ADR 015 `:43`、ADR 021 D1 相反（那兩份正是要單一會員）。能成立的理由只有 R2（她要單獨帳號）與記憶「aware-wave.com 與 app 的連結已切，不得自行重接」 |

## 3. ADR 018 否決內嵌框的三個理由，逐一對四種做法

ADR 018 `:70`：「第三方 cookie 會被瀏覽器擋、手機難用，也容易被誘導點擊」。ADR 015 `:47`：「登入狀態會被瀏覽器擋，手機也難用」。

| 理由 | 甲 內嵌框（FD 現案） | 乙 同網域分路 | 丙 WordPress 原生繪製 | 丁 WordPress 只當後台 |
|---|---|---|---|---|
| 第三方 cookie／登入狀態 | 沒消失，換成別的成本：引擎認不得會員，要靠嵌入票＋postMessage 協定 6 種訊息＋2 個新端點（FD `:115-133`）；框內 localStorage 依頂層網站分割（REV m12） | 不適用：同一個網域，WordPress 登入 cookie 是第一方 | 不適用 | 不適用 |
| 手機難用 | 高度自適應能解「框中捲動」。未解：框內固定浮層跑出畫面、結果出現時父頁不會捲過去（REV m7）；框內狀態不在網址，分享連結與上一頁失效 | 不適用 | 不適用 | 不適用 |
| 誘導點擊 | 可解：`frame-ancestors` 依登記表（FD `:60`） | 不適用 | 不適用 | 不適用 |
| ADR 沒寫但同樣成立 | 工具頁內容搜尋引擎收不到（REV M4）；兩套翻譯（TranslatePress＋引擎字典）；每頁載兩個前端 | 無 | 無 | 無 |

## 4. 四種做法

### 甲 內嵌框（FD 現案）
- WordPress 佔 `oracle.aware-wave.com`；引擎搬 `oracle-engine.aware-wave.com`；外掛輸出 iframe。
- 好處：工具在真的 WordPress 頁面裡，上下可放 Kadence 區塊；任何主機上的客戶 WordPress 都能裝（R6 完整）。
- 代價：§3 整欄；要改 ADR 015、017、018（FD `:62-69`）；新增 W2、W3、DNS、憑證、轉址；切換時現站會中斷（REV C3）。

### 乙 同網域分路（建議）
- WordPress 與引擎共用 `oracle.aware-wave.com`。`lobster-factory/infra/hetzner-phase1-core/nginx/default.conf:402-433` 的 oracle 區塊（現在整個 `location /` 都到 `oracle-web:3000`）改成依路徑分：`/zh-TW/*`、`/en/*`、`/api/*`、`/_next/*` 照舊到引擎；其餘（首頁、文章、會員、訂閱、`/wp-*`）到新的 WordPress 容器（容器加入 `lobster-net`；同檔 `:153` 起 aware-wave.com 的 `http://wordpress:80` 是同型轉送）。主機層 `system-sites/sg-stack.aware-wave.com.conf` 不用動。
- 引擎不改名、不改網址、不加嵌入版頁面。`ENG/proxy.ts:38-40` 已只處理無語言前綴的路徑；`ENG/next.config.ts` 不必設 basePath。
- 會員：瀏覽器在工具頁直接呼叫同網域的外掛 REST（WordPress cookie＋nonce）存取命盤與合盤對象。引擎仍不存個資。
- AI 額度依會員：外掛用站台金鑰簽一張短效身分票（只含假名、到期、key_id），引擎用已併入的 `ENG/lib/sites/verify.ts` 驗。等於 REV M11 的瘦身版。
- 上線＝改一個 nginx 檔的分路規則；回滾＝還原該檔。現站工具全程不中斷，舊網址不變，搜尋收錄不變，MCP 與 API 網址不變。
- 代價：
  1. 工具頁不是 WordPress 頁面：頁首頁尾要在引擎做一份同樣外觀（色票取自 WordPress 設定）；工具上下不能放 Kadence 區塊。介紹文可由引擎向 WordPress REST 取該頁純內容顯示。
  2. 引擎與 WordPress 同源：引擎頁若有 XSS，可用管理員的登入狀態操作 WordPress 後台。對策：引擎回應加嚴格 CSP（§7 V3）。這是真實的安全取捨：甲因為不同網域而沒有這個風險。
  3. WordPress 多語網址不能用 `/en/`、`/zh-TW/`（引擎佔用）；TranslatePress 語言代稱要另取。
  4. 只適用反向代理在我們手上的站（ks-aw-01 上的站，目前 Soulful 與 AwareWave 都是）。客戶自己主機上的 WordPress 用不了分路，到時才做顯示方式的第二種（內嵌框），外掛其餘部分不變。

### 丙 WordPress 原生繪製
- 外掛在伺服器端呼叫 X1（`POST /api/v1/systems/{id}`），用 PHP／JS 在 WordPress 頁面裡畫結果。
- 好處：搜尋最好；完全跟隨佈景；任何客戶 WordPress 都能裝；不需要分路也不需要內嵌框。
- 代價：18 個工具元件（`ENG/components/*.tsx`，紫微盤、星盤輪、塔羅翻牌）在 PHP／JS 重做一次，之後每次改版改兩份。違反零重工。

### 丁 WordPress 只當後台
- 引擎仍是門面；WordPress 放在另一個路徑或網域，只管會員、名單、寄信。
- 好處：改動最少。
- 代價：不滿足 R1（她要的是用 WordPress 經營這個站）；登入頁在 WordPress、工具在引擎，仍要解兩邊的登入交接。

### 比較

| 面向 | 甲 | 乙 | 丙 | 丁 |
|---|---|---|---|---|
| R1 站在 WordPress | 是 | 是（工具頁除外） | 是 | 否 |
| R2、R4 會員與存檔 | 要嵌入票＋協定 | 同網域 REST | 原生 | 要登入交接 |
| R6 任一客戶 WordPress | 是 | 我們代管的站；其餘之後補內嵌框 | 是 | 否 |
| 與 ADR 015／018 | 要改三份 ADR | 不用改 | 不用改 | 不用改 |
| 工具頁搜尋收錄 | 受損 | 不變 | 最好 | 不變 |
| 引擎新增程式 | W2、W3 全部 | 身分票驗證、頁首頁尾 | 無（外掛重做 UI） | 登入交接 |
| 主機改動 | DNS、憑證、3 個 nginx 檔、轉址 | 1 個 nginx 檔＋新 WordPress 容器 | 新 WordPress 容器 | 新 WordPress 容器 |
| 切換時現站 | 會中斷（REV C3） | 不中斷 | 整站換頁面 | 不中斷 |
| 已併入的 W1（`8d60735c2`） | 用 | 用（批次、身分票） | 用（批次） | 用 |
| 已併入的 P1（`e082fbd04`） | 全用 | 設定與金鑰用；iframe 部分擱置 | 設定與金鑰用；iframe 刪 | 大半不用 |

## 5. 每日信（與甲乙丙丁無關，三種寄法）

查證來源（2026-11-21 讀官方文件）：
- 自訂 smartcode：`FluentCrmApi('extender')->addSmartCode`，callback 收到 `$subscriber`。https://developers.fluentcrm.com/modules/smart-code.html
- 對單一聯絡人寄自訂信：`POST /subscribers/{id}/emails/send`，「immediately queues it for sending」，聯絡人須為 `subscribed` 或 `transactional`。https://developers.fluentcrm.com/rest-api/operations/contacts/send-contact-custom-email
- 週期性活動：每日／每週／每月，15 分鐘為單位；動態內容只有「最新文章」。https://docs.fluentcrm.com/recurring-campaign
- 依訂閱者時區寄送：文件無此功能；聯絡人有 `timezone` 欄位但只是資料。https://developers.fluentcrm.com/global-functions/contact-api-function/
- 寄送要主機 cron，不靠 WP-Cron。https://docs.fluentcrm.com/fluentcrm-cron-on-a-vps（Soulful 已有先例：`lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf:133` 的 `wp-cron-runner.sh`）
- 內建退信回報的寄信商：Amazon SES、Brevo、Mailgun、Postmark、SendGrid 等 11 家；**沒有 Resend**。https://docs.fluentcrm.com/bounce-handling-overview
- 一鍵退訂（RFC 8058）：設定 → Compliance。https://fluentcrm.com/list-unsubscribe-header/
- aware-wave.com 已啟用 `fluent-crm` 與 `fluentcampaign-pro` 3.1.8、`fluent-smtp` 2.4.1（STATUS `:108-110`）。Pro 授權能用幾個站、價格：未查到官方數字。

| 寄法 | 內容 | 未驗證 |
|---|---|---|
| 一（FD 現案） | 每小時排程 → 批次算 → 寫佇列 → 貼標籤觸發自動化 → 信中 smartcode 讀佇列 → 移除標籤 | 標籤能否每天對同一人重複觸發；smartcode 何時計算；需 Pro 的觸發器 |
| 二（建議） | 每小時排程 → 批次算（W1 `/api/v1/batch`）→ 對每個到時間的人呼叫 FluentCRM「寄自訂信給此聯絡人」。名單、雙重確認、退訂、退信仍由 FluentCRM 管 | 站內用 PHP 呼叫這個端點的寫法；自訂信是否自動帶頁尾退訂與一鍵退訂標頭；是否只需免費版；每人每天一筆活動紀錄的資料量與清理 |
| 三 | 每日週期性活動＋smartcode callback 讀預先算好的佇列 | 只能照網站時區寄，不能「當地 7 點」；需 Pro |

- 寄法二比一少三個元件（標籤、自動化、smartcode），「同人同日只寄一次」仍由佇列表唯一鍵保證。
- 寄信商：要自動處理退信就選 FluentCRM 有回報支援的（SES 或 Brevo）；用 Resend 就得自己接退信。此題留到寄信卡再問，不擋架構。

## 6. 建議與待操作者回答

- 建議：**乙**（同網域分路）＋每日信**寄法二**。
- 理由：
  1. 不變量「引擎與網站是不同網域」正是 ADR 018 三個否決理由的來源。乙把這個前提拿掉，三個理由整類不適用；甲是逐項補救，留下未解的手機與搜尋問題。
  2. 乙不需要新網域、新憑證、轉址、嵌入協定，現站不中斷，回滾是一個檔。
  3. 已併入的 W1 在乙完整沿用；P1 只有 iframe 那一半擱置，不用刪（客戶自己主機的站之後會用到）。
- 乙放棄的：工具頁不能在 WordPress 編輯器裡排版；引擎與 WordPress 同源的安全取捨（§4 乙 代價 2）。
- 待回答：
  1. 工具頁（紫微、八字、塔羅…）要不要能在 WordPress 編輯器裡排版，例如在工具上下放自己的文字與圖片區塊？要 → 只有甲、丙做得到；不要 → 乙。
  2. 同意先用乙、之後有「客戶自己主機」的站再補內嵌框嗎？

## 7. 動工前要先試的（都在拋棄式本機 docker，產物放 `$env:TEMP`）

| # | 試什麼 | 過關條件 | 推翻什麼 |
|---|---|---|---|
| V1 | nginx 分路：WordPress＋引擎＋nginx 三個容器，同一個主機名 | `/zh-TW/ziwei` 是引擎頁、`/` 與 `/wp-admin` 是 WordPress、WordPress 的固定網址與 canonical 轉向不搶引擎路徑 | 乙 |
| V2 | 引擎頁以 WordPress 登入 cookie＋nonce 呼叫外掛 REST 存一筆、讀回 | 登入者成功、未登入 401 | 乙的會員存檔 |
| V3 | 引擎頁加 CSP 後所有工具仍可用 | 12 頁無 CSP 違規 | 乙的安全對策 |
| V4 | FluentCRM 免費版：對同一聯絡人連兩次「寄自訂信」 | 兩封都進佇列並寄出（MailHog）、有退訂連結與 `List-Unsubscribe` 標頭 | 寄法二 |
| V5 | V4 失敗時：標籤每日重複觸發、smartcode 計算時點 | — | 寄法一 |

V1–V4 過關後，才把 FD 與 SITE-FLOW 兩份計畫改寫合併（REV §3 的分工仍適用），再給操作者確認後派卡。

## 8. 試驗結果（2026-11-22，照 §0 的甲′；本機拋棄式環境，已拆除）

環境：`%TEMP%/oracle-spike`（compose：`mariadb:11.4`、`wordpress:php8.3-apache`、`wordpress:cli-php8.3`、`nginx:alpine`，對外 `127.0.0.1:8188`）；引擎＝`oracle-int` 工作樹 `next dev -p 3911`；WordPress 6.x 預設佈景（不是 Kadence）；一支拋棄式 mu-plugin 提供同網域 iframe 短碼、`aworacle/v1/charts` REST、`pre_wp_mail` 記錄。

| # | 結果 | 證據 |
|---|---|---|
| V1 分路 | **過** | nginx `location ~ ^/(zh-TW\|en)(/\|$)`、`/api/`、`/_next/` → 引擎，其餘 → WordPress。`curl`：`/` 200（WordPress）、`/ziwei/` 200（WordPress 頁，含上方段落＋iframe＋下方段落）、`/zh-TW/ziwei` 200（引擎）、`/api/health` 200、`/wp-login.php` 200、`/nonexistent-page` 404（WordPress，沒被引擎的語言轉址接走） |
| V1b 同網域內嵌框 | **過，附兩項要做的事** | 瀏覽器：父頁可直接讀 `iframe.contentDocument`（同源），不用訊息協定就能量高度；段落在工具上下正常顯示；375px 寬無橫向捲動。要做：(a) 引擎 `body` 是 `min-height:100%` 的 flex，量 `documentElement.scrollHeight` 會只增不減（桌面量到 4157px，實際內容到 902px）→ 嵌入時要量內容本身，或給嵌入版不撐滿視窗的版面；(b) 引擎自己的工具列與語言鈕會出現在框內 → 嵌入版要隱藏 |
| V2 會員存檔 | **過** | 從框內頁（引擎頁的 window）呼叫：未登入 GET 401；登入測試會員後取 `admin-ajax.php?action=rest-nonce` → POST 存一筆 200 `{"saved":1}` → GET 讀回同一筆 200；有 cookie 沒 nonce 的 POST 401 |
| V3 內容安全政策 | **未跑** | 要先在引擎加回應標頭才能測；列為引擎嵌入版那張卡的驗收 |
| V4 每日信寄法二 | **過（FluentCRM 免費版 3.3.5，不需 Pro）** | 站內 `rest_do_request('POST /fluent-crm/v2/subscribers/{id}/emails/send')` 對同一聯絡人連叫兩次，皆 200；`wp_fc_campaign_emails` 兩筆 `sent`；交給 `wp_mail` 的兩封信內文都有退訂連結，標頭有 `List-Unsubscribe` 與 `List-Unsubscribe-Post: List-Unsubscribe=One-Click`；聯絡人改 `unsubscribed` 後第三次回 422「status needs to be Subscribed」且沒有寄出。代價確認：每封信在 `wp_fc_campaigns` 多一列 `custom_email_campaign`，要定期清 |
| V5 | 不需要 | V4 過 |

未涵蓋：Kadence 佈景與 Kadence 區塊；真手機瀏覽器（只做 375px 模擬；`loading="lazy"` 的 iframe 在模擬視窗第一次沒載入，改 eager 後正常，原因未查）；實際寄出與退信回報（只攔在 `wp_mail`）；TranslatePress 語言路徑；正式 nginx（兩層）上的分路。

下一步：照甲′ 把兩份計畫改寫合併成一份（產品：引擎嵌入版＋外掛；平台：建站流程；上線：GO-1–GO-3），再給操作者確認後派卡。
