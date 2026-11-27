# aware-wave-oracle（WordPress 外掛）

版本：0.5.3（與外掛檔頭 `Version:`、常數 `AWORACLE_VERSION` 同一個數字；`scripts/release-wp-bridge.sh --plugin oracle` 發佈前檢查三處一致）

把 AwareWave 算命引擎的工具嵌進任何 WordPress 網站的頁面。oracle.aware-wave.com 只是第一個安裝的站；外掛內沒有任何網站專屬的網址或設定。設計正本：`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/ORACLE-WP-SPEC.md`（§1、§2-1～§2-10、§2-13；本外掛卡 P1′、P2′、P3′）。

## 安裝

1. 用發佈的 zip `aware-wave-oracle-v<版本>.zip`（`awarewaveai-pei/aware-wave-oracle` 的 Release；建站流程第 3 步勾選時自動裝）安裝；或把 `bash bin/build-zip.sh <輸出資料夾>` 打出的同一份 zip 上傳。不要直接複製整個 Work 資料夾（會帶進 tests、composer 設定）。不需 composer；外掛自帶載入器。需求：WordPress 6.5+、PHP 7.4+（簽章用 WordPress 內建的 sodium_compat，不必裝 ext-sodium）。
2. 外掛 → 啟用。
3. 設定 → AwareWave Oracle：選嵌入方式、填金鑰名稱、按「Generate key」，把顯示的公鑰登記到引擎的 `ORACLE_SITES`（格式見引擎 `deploy/DEPLOY.md`）。
4. 頁面裡加「AwareWave Oracle」區塊（按鈕選工具）或短碼 `[aw_oracle tool="ziwei"]`。
5. 會員存檔：在 `wp-config.php` 加 `define( 'AWORACLE_DATA_KEY', '<base64 的 32 位元組>' );`（設定頁「Member data」會產生一行可直接貼上），**另存一份在主機以外**；再建兩個頁面放 `[aw_oracle_my_charts]`、`[aw_oracle_persons]`。

## 設定（`aworacle_settings`）

| 欄位 | 說明 |
|---|---|
| 嵌入方式 `embed` | 只能存 `same-origin`；`cross-origin` 在設定頁顯示「尚未支援」且不可選，送來也會被改回 same-origin 並提示（見下節） |
| 引擎網址（瀏覽器用） | 只有 cross-origin 用：訪客瀏覽器載入工具的位址，須 https（本機位址除外） |
| 引擎網址（伺服器用） | 本站伺服器呼叫引擎的位址，可為內部 `http://`。空白＝same-origin 用本站自己的位址，cross-origin 用瀏覽器用網址 |
| 金鑰名稱 `key_id` | 引擎登記表的名稱，格式同引擎 `SITE_KEY_ID`：2–24 個小寫英數或 `-` |
| 預設引擎語言、語言對照 | 引擎只有 `zh-TW`、`en`。語言＝`determine_locale()` 依序對：對照表（完整、再語言部分）→ 同名引擎語言（`zh_TW`→`zh-TW`、`en_US`→`en`）→ 預設 → `en` |
| 工具頁對照 | `工具=頁面 ID`：框內連到另一個工具時，改開該 WordPress 頁 |
| 每日運勢信 `mailer` | `none`（預設：不顯示訂閱表單、不寄）或 `fluentcrm`（見「每日運勢信」） |
| Turnstile 網站金鑰 `turnstile_site_key` | 選填：訂閱表單的 Cloudflare 人機驗證（見「人機驗證」）。密鑰不在這個選項裡 |

- 存檔時（same-origin）檢查：有頁面網址或 TranslatePress 語言代稱落在引擎前綴 `/embed`、`/api`、`/_next`、`/tarot`、`/zh-TW`、`/en`，顯示警告並列出（不擋存檔；這些網址到不了 WordPress）。
- 工具清單快取（transient `aworacle_tools_v2`；0.4 以前的 `aworacle_tools` 不再讀，成功 1 天、失敗 10 分鐘）記著它是向哪個引擎網址要的；讀取時與目前的 `Options::serverEngineUrl()` 不同就重新要。所以任何會改變伺服器用引擎網址的變更（伺服器用／瀏覽器用網址、嵌入方式、站台網址、建站流程用 `wp option patch` 直接寫的值）下一次讀清單都會重抓，不靠「存檔時記得清快取」。
- 私鑰可改放 `wp-config.php`：`define( 'AWORACLE_SITE_KEYPAIR', '<base64 金鑰對>' );`，有設定時優先、設定頁不再提供產生／更換。
- `wp-config.php` 常數：`AWORACLE_SITE_KEYPAIR`（選填，私鑰）、`AWORACLE_DATA_KEY`（會員存檔與每日信的出生資料加密）、`AWORACLE_RESEND_WEBHOOK_SECRET`（Resend webhook 簽章密鑰 `whsec_…`）、`AWORACLE_TURNSTILE_SECRET`（選填，Turnstile 密鑰；有設定時優先於設定頁存的那一份）。
- 選項：`aworacle_settings`（自動載入，無機密）、`aworacle_site_keypair`、`aworacle_member_salt`、`aworacle_turnstile_secret`（皆不自動載入；鹽第一次用到時自動建立）、`aworacle_db_version`（資料表版本）。移除外掛會刪掉這些選項、工具清單快取、兩張會員表、三張每日信表與排程、會員取票計數（multisite 每個站）；FluentCRM 的聯絡人與活動留著（屬 FluentCRM）。

## 兩種嵌入方式

- **same-origin（預設）**：反向代理把引擎前綴送到引擎，其餘送到 WordPress（ORACLE-WP-SPEC §1）。區塊／短碼輸出 `<iframe src="/embed/<語言>/<工具>" title loading="lazy">`（相對路徑）。`assets/embed-same-origin.js` 直接讀框內 `#aw-oracle-root` 的高度（框內視窗的 `ResizeObserver`，內容變矮框也變矮）；讀不到時框維持 600px。訪客在框內送出或按按鈕（不含結果區內的按鈕）後 30 秒內，框內出現或重繪帶 `[data-aw-result]` 的元素（引擎卡 E5 加在每個工具的結果容器）時，父頁捲到它；沒有這個屬性的舊引擎不捲，不用高度猜。
  安全取捨：同源框內的引擎頁可以直接存取父頁（WordPress 的 DOM、REST nonce、登入狀態），`sandbox` 擋不住。引擎的一個 XSS 等同裝了外掛的每個 WordPress 的 XSS；引擎的 CSP 與依賴審查要比照 WordPress 後台的等級（ORACLE-WP-SPEC §2-14）。
- **cross-origin（尚未支援，設定不可選）**：引擎在另一個網域（客戶自己的主機、反向代理不在我們手上）。輸出 `<iframe src="<瀏覽器用引擎網址>/embed/…">` 與 `assets/embed.js`（postMessage 協定 v1：父頁只收引擎 origin、且來源是本頁嵌入框的訊息）。**引擎端尚未實作此協定，且嵌入頁送 `frame-ancestors 'self'`**：有第一個這種客戶時另開卡。

## 翻譯站的標題與描述（P5，0.5.1）

裝了 TranslatePress（免費版只翻內文）時，非預設語言的前台頁面把 `<title>`、meta description、og／twitter 的標題與描述過 `trp_translate()`（`includes/Seo/TranslatedTitles.php`）。翻譯來源是站上字典；沒有翻譯的字串原樣輸出。組合標題在組合前翻各段（`document_title_parts`；Rank Math 的 `%title%`、`%sitename%` 等變數值）。後台、REST、feed、sitemap、翻譯編輯器預覽框不動；已是譯文（加標點）的字串不再送回 TranslatePress。沒裝 TranslatePress 不掛任何 filter。

- 字典沒有的字串，TranslatePress 會登記成「未翻譯」（含部分翻到的整句標題），可在它的編輯器補翻。
- 要翻的頁名、站名、站台說明必須逐字等於字典裡的原文；由內文自動截出的摘要通常對不到，要英文描述請填該頁摘要或 Rank Math 描述後在字典補翻。

## 會員存檔（P2′）

- 兩張表：`{prefix}aworacle_charts`（自己的命盤，每人上限 50）、`{prefix}aworacle_persons`（我存的對象，上限 200；不連任何帳號、不通知任何人）。明文欄位只有 `id`、`user_id`、時間；名字與出生資料（引擎共用出生欄位，`Members\Record`）整包以 `Crypto\Vault`（libsodium secretbox）加密，綁定「種類:會員 ID」，搬到別人列或另一張表就打不開。
- 金鑰：`wp-config.php` 常數 `AWORACLE_DATA_KEY`，不進資料庫，資料庫備份只有密文。沒設或格式錯：存檔整個停用（REST 503、短碼顯示「本站目前還不能存檔」、儀表板與外掛頁提示原因），不退回明文。換金鑰會讓舊資料打不開（列表顯示「無法開啟，可刪除」）；目前沒有換鑰工具。
- 建表：啟用時，以及任何請求發現 `aworacle_db_version` 不符時（原地升級、多站網路啟用）。
- REST `aworacle/v1`：`GET|POST /{charts|persons}`、`GET|PUT|DELETE /{kind}/{id}`。需登入＋`wp_rest` nonce（`X-WP-Nonce`），外掛自己驗，兩者缺一 401；別人的 id 一律 404（每條 SQL 都帶 `AND user_id = 本人`）；欄位錯 400 附 `data.fields`。
- 短碼 `[aw_oracle_my_charts]`、`[aw_oracle_persons]`：頁面只輸出空容器，`assets/members.js` 從 REST 取資料（出生資料不進頁面快取）；未登入顯示「登入以儲存」。
- 隱私：工具 → 匯出個人資料含兩組（已存的命盤、已存的對象）；清除個人資料刪兩表該人全部列；刪除會員（含多站網路移除）連動刪除。

## 出生地（P6，0.5.2）

訂閱表單與會員表單共用 `assets/birthplace.js`（`includes/Places/Birthplace.php`）：用引擎自己的城市資料搜尋（`GET /api/v1/places`，GeoNames CC BY 4.0），結果是按鈕；沒有緯度、經度、時區輸入。沒選時的預設＝瀏覽器時區的代表城市（同一個搜尋查），查不到就台北（座標同引擎 `components/PlaceField.tsx`），都顯示在畫面上、可改。已存的命盤打開時保留原座標，除非另選城市。資料層（`Members\Record`）仍要求完整座標。訂閱被拒時，按鈕旁寫明「尚未訂閱成功」與要改的欄位。

## 用 Fluent Forms 當訂閱表單（P7，0.5.3）

內建表單 `[aw_oracle_daily]` 照舊（沒有 Fluent Forms 的站用它）。要用 Fluent Forms：

1. 每日運勢信照「設定步驟」開好後，執行 `wp aworacle daily-form`：從 `includes/Daily/FluentFormsDefinition.php` 建表單（重跑只更新同一張、不重複建）、發佈、把 ID 記到設定 `fluentform_id`。
2. 訂閱頁放指令回報的 `[fluentform id="N"]`。

- 送出走與內建表單同一條 `Daily\Rest::accept`（`includes/Daily/FluentFormsEntry.php`）。
- Fluent Forms 不存任何送出內容：`fluentform/insert_response_data` 清空；`fluentform/before_insert_submission` 處理後直接回應並結束（同它自己的 honeypot），不寫 entry、明細、log，不寄通知、不跑整合。因此 Fluent Forms 後台看不到訂閱紀錄、它的整合與通知對這張表單無效。這張表單也不跑 Akismet／CleanTalk。
- 認定訂閱表單＝設定的 ID，或任何含 `aw_place_lat` 欄位的複本。
- 人機驗證用外掛自己的 Turnstile（金鑰只在本外掛設定）；開著時 Fluent Forms 的驗證碼對這張表單停用。不要在表單上加它的 Turnstile 欄位。
- 停用本外掛時，訂閱表單和它的複本都改為未發佈（否則 Fluent Forms 會自己收件存明文），啟用時恢復。停用期間不要手動把它發佈回去。
- 欄名、選項、按鈕文字顯示時換成頁面語言；版面可在 Fluent Forms 改，重跑指令會蓋回程式內的欄位。不要刪欄位或改欄位名稱。

## 每日運勢信（P3′）

訂閱並確認後，每天在訂閱者當地 07:00 之後第一次排程寄一封，內容只用引擎 `daily` 系統算出的結果（分數、幸運色／數字／方位、宜忌；不含 AI 文字）。

不變量（各自的守衛）：
1. 沒確認的人收不到：只挑 `daily_profiles.status=confirmed` 且 FluentCRM 狀態 `subscribed`（`Daily\Schedule::pick`）。每一次申請都要用寄給那一次申請的一次性連結、按下按鈕（POST）才生效（`Daily\Store::confirm` 以 token 雜湊做 compare-and-set）；FluentCRM 自己的雙重確認不會啟用任何申請（它確認的是聯絡人，不是這次申請）。別人用你的 email 送表單，改不到也停不了你的信。
2. 同一人同一當地日期最多一封：寄前先 `INSERT IGNORE` `daily_sent`（唯一鍵 訂閱者＋當地日期，`Store::claim`），搶到的才寄；兩個排程同時跑、夏令時間切換日都只一封。排程停擺不補寄舊日期（只看「今天」）。
3. 退訂、退信、投訴不再被挑：FluentCRM 狀態轉成 unsubscribed／bounced／complained／spammed → 刪每日資料（寄送紀錄留著，同一天重新訂閱也不會收第二封；聯絡人被刪或隱私清除才連紀錄一起刪）（`Daily\Hooks`）；挑選時也再查一次狀態。
4. 算不出內容不寄：引擎整批失敗、該筆 `ok:false`、結果缺欄位或日期不符（`Daily\Letter::build` 回 null）→ 不寄並釋放紀錄，下個小時可再試當天。FluentCRM 4xx（沒寄出）也釋放；其他錯誤標 `failed` 不重寄（寧可少一封，不寄兩封）。

### 設定步驟
1. 裝 FluentCRM（免費版即可）、FluentSMTP。FluentSMTP 2.4.5 沒有 Resend 專用連線：選「SMTP Server」，主機 `smtp.resend.com`、埠 465（SSL）或 587（TLS）、帳號 `resend`、密碼＝Resend API key；寄件人 `…@oracle.aware-wave.com`（已驗證的子網域）。
2. `wp-config.php` 已有 `AWORACLE_DATA_KEY`（見會員存檔）；沒有時表單顯示「本站目前還不能訂閱」。確認信經 `wp_mail` 寄出（即 FluentSMTP → Resend），寄件人用 FluentSMTP 設定的寄件地址。
   反向代理必須把訪客真實 IP 交給 PHP 的 `REMOTE_ADDR`（nginx `real_ip`）；否則每來源每小時 5 次的上限會變成全站共用。
3. 設定 → AwareWave Oracle →「每日運勢信」選 FluentCRM，存檔。頁面放短碼 `[aw_oracle_daily]` 或區塊「AwareWave daily fortune signup」。
4. Resend → Webhooks：網址 `https://<站>/wp-json/aworacle/v1/daily/resend-webhook`（設定頁會顯示），事件勾 `email.bounced`、`email.complained`；把 Signing secret 寫進 `wp-config.php`：`define( 'AWORACLE_RESEND_WEBHOOK_SECRET', 'whsec_…' );`。
5. 排程由主機 cron 觸發，不靠訪客：`wp-config.php` 設 `define( 'DISABLE_WP_CRON', true );`，主機 crontab 每 5 分鐘 `wp cron event run --due-now --path=<WordPress 路徑>`（`aworacle_daily_run` 每小時；FluentCRM 的每分鐘佇列也靠它把信送出）。
6. 每日信的信尾（取消訂閱字樣）用 FluentCRM 自己的設定與語言；要中文時在 FluentCRM → Settings 改。設定頁顯示上次每小時排程的數字（交給 FluentCRM／留待下小時／失敗）；「留待下小時」連續不降＝引擎或資料金鑰出問題。

### 人機驗證（Cloudflare Turnstile，選用）
- 兩把金鑰都設才啟用：網站金鑰填設定頁「Turnstile 網站金鑰」；密鑰在設定頁「人機驗證」區塊另外存（只寫不讀，存成不自動載入的選項），或寫進 `wp-config.php`：`define( 'AWORACLE_TURNSTILE_SECRET', '…' );`。
- 啟用後：表單在按鈕上方顯示 Cloudflare 的驗證框；`subscribe` 在欄位檢查之後、建立任何資料之前，向 Cloudflare 固定網址 `https://challenges.cloudflare.com/turnstile/v0/siteverify` 驗 token（5 秒逾時、不跟隨轉址）。回答不是 `success:true`（含逾時、連不上、非 200）一律 403「人機驗證沒有通過」：不建申請、不寄確認信。
- 沒設或只設一把：表單照舊靠下面的限流、陷阱欄位與每日確認信上限運作；設定頁、儀表板與外掛頁（每日信開啟時）提示「尚未設定人機驗證」。
- 測試用 Cloudflare 公開的測試金鑰：網站金鑰 `1x00000000000000000000AA`；密鑰 `1x0000000000000000000000000000000AA`（一律通過）、`2x0000000000000000000000000000000AA`（一律失敗）。

### 資料流
1. 訂閱表單 → `POST aworacle/v1/daily/subscribe`（公開；有設定 Turnstile 時先過人機驗證；同一來源位址每小時 5 次、同一聯絡人 10 分鐘 1 次、全站每天最多 30 封確認信（`Confirm::DAILY_CAP`，可用 filter `aworacle_daily_confirm_cap` 改；免費方案每天 100 封要留給每日信）；蜜罐欄位；不論 email 狀態都回同一句 202，不洩漏誰訂過）。
2. 新地址：FluentCRM 建成 `pending`（既有聯絡人狀態不被降級或解除封鎖）。不論聯絡人原本狀態，外掛都存一份「待確認申請」（密文）並用 `wp_mail` 寄一次性連結 `/?aworacle_daily_confirm=<id>.<token>`（不經 FluentCRM，token 不會留在 `fc_campaigns`）。打開（GET）顯示要確認的出生日期時間、出生地與時區和一個按鈕，什麼都不改，信件掃描器不會替人訂閱；按下（POST）才生效，並把 FluentCRM 聯絡人設成 subscribed。新的申請會換掉舊的連結；token 只存 sha256，7 天過期，用一次。
   bounced／complained／spammed 的地址：什麼都不做（仍回 202）。
3. 每小時 `Daily\Runner::run`：挑人 → 依語言分批（每批 ≤200），每批送出前才搶該批的紀錄（中途被終止最多影響一批）→`POST /api/v1/batch`（站台簽章 `aud:"v1"`，`system:"daily"`，每筆＝出生資料＋訂閱者當地日期）→ `Daily\Letter` → FluentCRM `POST /fluent-crm/v2/subscribers/{id}/emails/send`（`rest_do_request`，以站上第一位管理員身分呼叫、呼叫完立即還原；FluentCRM 自動加 `List-Unsubscribe` One-Click）。FluentCRM 每個 PHP 請求只立即寄一封，其餘排進它每分鐘的佇列寄出。活動 slug `oracle-daily-<聯絡人>-<日期>`，標題改成 `oracle-daily <日期>`（FluentCRM 強制標題「Custom email to …」，以 slug 找回後改名）。
4. 信的文字用外掛翻譯（繁中／英文，依訂閱時的頁面語言），不依賴站台裝了哪些 WordPress 語言包（`Daily\Lang`）。
5. 資料表：`{prefix}aworacle_daily_profiles`（每聯絡人一列；明文只有 id、狀態、時區、語言、時間；出生資料是 Vault 密文，生效版綁 `daily:<id>`、待確認版綁 `daily-pending:<id>`）、`{prefix}aworacle_daily_sent`、`{prefix}aworacle_daily_events`（處理過的 webhook id）。
6. 清理：每天刪 7 天未確認的申請、60 天前的寄送紀錄、30 天前的 webhook id、會員或聯絡人已不存在的資料；每 30 天刪本外掛 30 天前的 FluentCRM 一次性活動（只刪 slug `oracle-daily-` 開頭的，不動其他人寄的；每批 200 筆刪到完，超過 20 秒就 10 分鐘後接著刪）。
7. 隱私：匯出含「每日運勢信」一組（狀態、時區、語言、出生資料）；清除刪該 email 聯絡人與會員連結的每日資料；刪會員連動刪除。

### 退信與投訴
Resend 不在 FluentCRM 內建的退信回報名單內，所以外掛自己收 webhook：驗 Svix 簽章（`svix-id`、`svix-timestamp` ±5 分鐘、`svix-signature`；`Daily\Svix`）→ 錯或未設密鑰一律 401、不改任何資料 → `email.bounced` 只有 `data.bounce.type` 為 `Permanent` 才處理（`Transient`／`Undetermined`，例如信箱滿了，回 200 不動）→ 資料表不在或 FluentCRM 未啟用回 503、不記下 id（Resend 會重送）→ 同一個 `svix-id` 只處理一次（重送回 200 `duplicate`）→ 把 `data.to` 的聯絡人在 FluentCRM 標成 bounced／complained → FluentCRM 的狀態事件刪掉每日資料。處理中出錯回 500 並忘記這個 id，讓 Resend 重試。

### Resend 標籤 `product=oracle`
經 FluentSMTP 帶不了：FluentSMTP 2.4.5 沒有 Resend 驅動（`app/Services/Mailer/Providers/` 無 Resend），只能走 Resend SMTP；Resend 文件只寫 SMTP 可帶自訂標頭（例 `X-Entity-Ref-ID`），沒有 SMTP 帶標籤的方法（https://resend.com/docs/send-with-smtp 、https://resend.com/docs/dashboard/emails/tags ）。依卡片不繞過 FluentSMTP 直打 Resend；改以寄件子網域 `oracle.aware-wave.com` 區分。

## 會員票（AI 解讀額度，§2-7）
- `POST aworacle/v1/ticket`：登入＋`wp_rest` nonce（缺一 401）；每位會員 10 分鐘 30 張（429）；沒設站台金鑰 503。回 `{ticket, signature, expires_in:60}`，`Cache-Control: no-store`。
- 票＝`SiteKey::signedRequest({member}, aud "ticket")` 的原文 base64url；`member`＝`HMAC-SHA256(站台鹽, 會員 ID)`（64 個十六進位字），同一會員每次相同、看不出 ID 或 email。一次性、60 秒（引擎 `lib/sites/ticket.ts`）。
- 交給框內頁：同網域父頁腳本（`assets/embed-same-origin.js`）在會員登入時定義 `window.awOracleTicket()`，回傳 `Promise<{ticket, signature} | null>`；框內引擎頁在要呼叫 `/api/interpret` 前呼叫 `window.parent.awOracleTicket()`，把兩個值放進標頭 `X-AwareWave-Oracle-Ticket`、`X-AwareWave-Oracle-Signature`。票不進網址。未登入時不定義＝匿名。**引擎端呼叫這個函式的程式尚未做（另卡）。**

## 簽章（站台 → 引擎）

一律經 `Crypto\SiteKey::signedRequest( $payload, $aud, $keyId, $keypair )` 組＋簽，呼叫端不自己拼驗證欄位（帶了會被拒）：

- body：JSON，先 `key_id`、`ts`（unix 秒，±60 秒）、`nonce`（32 字 base64url，每站只能用一次）、`aud`，再接請求欄位。
- `aud`：`v1`＝`/api/v1`（含 batch）；`ticket`＝會員票。一份簽過的原文只對一個用途有效（引擎回 `401 wrong_audience`）。
- 標頭：`X-AwareWave-Oracle-Signature: base64(Ed25519(原始 body 位元組))`。
- 引擎合約：`Projects/internal/ziwei-doushu/lib/sites/verify.ts`；兩邊一起改。
- 會員代號：`HMAC-SHA256(鹽, 使用者 ID)`（`Options::memberPseudonym`），會員票用（見上節）。

## 結構

| 部分 | 檔案 |
|---|---|
| 入口、自動載入、掛鉤 | `aware-wave-oracle.php` |
| 設定頁 | `includes/Admin/SettingsPage.php`（金鑰／鹽／工具清單動作走 `admin-post.php` 後轉回，重新整理不會重做） |
| 設定驗證（不依賴 WordPress） | `includes/Settings/Normalize.php`；儲存 `includes/Settings/Options.php` |
| 金鑰與簽章 | `includes/Crypto/SiteKey.php` |
| 嵌入 | `includes/Embed/{Renderer,EmbedUrl,LocaleMap,Shortcode,Block}.php`、`assets/{embed-same-origin,embed,block}.js` |
| 會員存檔 | `includes/Members/{Store,Rest,Shortcodes,Privacy,Record}.php`、`includes/Crypto/Vault.php`、`assets/members.js` |
| 會員票 | `includes/Members/Ticket.php` |
| 每日運勢信 | `includes/Daily/{Schedule,Letter,Svix}.php`（不依賴 WordPress）、`includes/Daily/{Store,Crm,Runner,Rest,Confirm,Signup,Hooks,Lang}.php`、`assets/daily.js` |
| 引擎讀取 | `includes/Engine/EngineClient.php`（工具清單 `GET /api/v1/systems`，快取 1 天；每日批次 `POST /api/v1/batch`；不跟隨轉址、回應上限 1 MB／批次 8 MB） |
| 人機驗證 | `includes/Daily/Turnstile.php` |
| 翻譯站的標題與描述 | `includes/Seo/TranslatedTitles.php` |
| 出生地城市搜尋 | `includes/Places/Birthplace.php`、`assets/birthplace.js` |
| Fluent Forms 訂閱表單 | `includes/Daily/{FluentFormsEntry,FluentFormsDefinition}.php`、`assets/ff-daily.js` |
| 翻譯 | `languages/`：改字串後 `wp i18n make-pot . languages/aware-wave-oracle.pot --exclude=tests,bin,vendor`、`wp i18n update-po languages/aware-wave-oracle.pot languages`，補完 `.po` 的 `msgstr` 後 `wp i18n make-mo languages`、`wp i18n make-php languages` |
| 打包與發佈 | `bin/build-zip.sh`（依 `.distignore`）；發佈 repo 的 CI／Release 在 `.github/workflows/`（由 `scripts/release-wp-bridge.sh --plugin oracle` 鏡像過去） |

## 發佈

- 發佈 repo：`awarewaveai-pei/aware-wave-oracle`（公開）。Release 資產 `aware-wave-oracle-v<版本>.zip`＝next-admin `lib/wp-plugin-stack-catalog.ts` 的 `releaseRepo`／`releaseVersion` 與主機閘門要求的檔名。
- 先升版（檔頭、`AWORACLE_VERSION`、本檔第一行三處同一個數字），再 `bash scripts/release-wp-bridge.sh --plugin oracle --dry-run`（列出鏡像的檔、zip 名稱與檔數），再不帶 `--dry-run` 真發（推 main → 等 CI：PHP 7.4 與 8.3 的 `php -l`＋PHPUnit → 打 tag → `release.yml` 用 `bin/build-zip.sh` 出 zip）。發佈 repo 不存在時腳本只在 dry-run 說明，真發會停下：repo 由人建（`gh repo create awarewaveai-pei/aware-wave-oracle --public`）。
- 發佈後：catalog 的 `releaseVersion` 改成新版（新網站裝這一版）；已裝的網站 `powershell -File scripts/rollout-wp-bridge.ps1 -Plugin oracle -DryRun`，再不帶 `-DryRun`（High）。

## 驗證

- 單元測試（不需 WordPress）：`composer install` 後 `vendor/bin/phpunit`（需 sodium；本機沒有 composer 時用 `docker run --rm -v <外掛資料夾複本>:/app -w /app composer:2 sh -c "composer install && vendor/bin/phpunit"`，複本放暫存目錄，`vendor/` 不進 repo）。
- 語法：`composer lint`，或對每個 `.php` 跑 `php -l`（7.4 與 8.x 各一次）。
- 實際安裝：docker WordPress＋本機 nginx（引擎前綴轉到本機引擎，其餘到 WordPress）；12 個工具各開一次、看框高與捲動。
- 會員存檔驗收（真 WordPress，外掛啟用、已設 `AWORACLE_DATA_KEY`）：`wp eval-file tests/wp/members-check.php seed` → `wp db export` 的檔裡 grep 不到 `Zed-Canary`、`Canaryville`、`1873` → `wp eval-file tests/wp/members-check.php finish`。任一 FAIL 時 exit 1。
- 每日信與會員票驗收（真 WordPress＋FluentCRM＋FluentSMTP 指向假收信匣 Mailpit，**不可對外寄信**；本機引擎的 `ORACLE_SITES` 登記本站公鑰）：`wp eval-file tests/wp/daily-check.php`（四時區、夏令時間、不重寄、不補寄、引擎錯不寄、退訂、webhook 驗簽、確認流程、限流、隱私、票）；並發：`tests/wp/daily-parallel.php seed`，兩個 `run` 同時跑，再 `verify`。
