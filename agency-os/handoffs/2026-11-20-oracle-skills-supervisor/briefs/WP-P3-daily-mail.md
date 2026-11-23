# P3 每日運勢信、Resend 退信通知、會員票 REST

先讀：`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §0（D3）、§2-7、§2-8、§2-9、§2-10、§3 P3′ 列（`:82`）、§7。外掛 `lobster-factory/packages/oracle-wp-plugin/`（整個讀完再動手；P2 已在 main `39b51d9cc`，版本 0.3.0）。引擎端只讀：`Projects/internal/ziwei-doushu/lib/sites/{verify,ticket}.ts`、`app/api/v1/batch/route.ts`、`deploy/DEPLOY.md`。模型 Opus 5.5（寄信與個資：完成後 `critic` Deep，並做突變）。

## 目的
訪客訂閱並確認後，每天在他當地早上 7 點之後收到一封運勢信。不變量：(1) 沒有確認訂閱的人永遠不會收到信；(2) 同一個人同一個當地日期最多一封；(3) 退訂、退信、投訴的人不再被挑中；(4) 算不出內容就不寄，不寄空信或錯信。

## 已知事實
- 寄信：站內呼叫 FluentCRM 免費版 `POST /fluent-crm/v2/subscribers/{id}/emails/send`（用 `rest_do_request`，不走 HTTP）；經 FluentSMTP → Resend。試驗 V4 用 FluentCRM 3.3.5 驗過：對同一人連寄兩封可行、信含 `List-Unsubscribe` One-Click、退訂者回 422。
- Resend 寄件網域 `oracle.aware-wave.com` 已驗證可寄（2026-11-23 查：DKIM、SPF 四筆皆 verified）。免費方案每日 100 封、每月 3,000 封。
- 引擎批次接口 `POST /api/v1/batch`：站台簽章必填，簽過的原文要含 `aud:"v1"`；外掛已有唯一的組簽函式 `SiteKey::signedRequest()`（`includes/Crypto/SiteKey.php:55`）。一次最多 200 筆。
- 會員票：引擎 `lib/sites/ticket.ts`：原文 JSON 只准五個欄位 `key_id`、`ts`、`nonce`、`aud:"ticket"`、`member`（16–64 個 `[A-Za-z0-9_-]` 的假名）；標頭 `X-AwareWave-Oracle-Ticket`＝base64url(原文)，`X-AwareWave-Oracle-Signature`＝簽章；一張票只能用一次、60 秒內有效。
- 出生資料加密：沿用 P2 的 `includes/Crypto/Vault.php` 與金鑰常數 `AWORACLE_DATA_KEY`；沒有金鑰時訂閱功能停用並顯示原因，不存明文。
- 表升級：沿用 P2 `includes/Members/Store.php` 的「表版本不符就建表」做法，新表 `{prefix}aworacle_daily_profiles`、`{prefix}aworacle_daily_sent`。
- §7 已定：固定當地 7 點、信裡不放 AI 寫的段落、內容只用引擎算好的結果。

## 要做
照 SPEC `:82` 與 §2-7～§2-10，一項不少。補充要求：
1. 訂閱區塊（短碼＋區塊）：email、出生資料、時區（由瀏覽器帶入，可改；用看得到的清單或搜尋框，不用一長串下拉）。送出 → FluentCRM 聯絡人 `pending` → 雙重確認信 → 確認後才進每日名單。`mailer=none` 或沒裝 FluentCRM 時不顯示區塊。
2. 排程：每小時一次。挑「已確認、未退訂、未退信、未投訴、當地時間已過 07:00、今天的當地日期還沒有寄送紀錄」的人。先寫 `daily_sent`（唯一鍵：訂閱者＋當地日期）搶到才寄，兩個排程同時跑也只寄一封。排程停擺超過一天不補寄舊日期。夏令時間切換日也只寄一封。
3. 內容：對引擎 `/api/v1/batch` 一次送出當批的人；引擎回錯或該筆沒有結果 → 該筆不寄並釋放寄送紀錄（下個小時可再試當天的）。信的主旨與內文用外掛既有的翻譯機制出繁中與英文；每封信的 FluentCRM 活動名稱帶 `oracle-daily`。
4. Resend 標籤 `product=oracle`：先查清楚經 FluentSMTP 的 Resend 連線能不能帶自訂標頭或標籤（讀 FluentSMTP 原始碼或文件，附出處）。能就帶；不能就在回報寫明，不自己繞過 FluentSMTP 直打 Resend。
5. Resend webhook：REST 端點收 `email.bounced`、`email.complained`；用 Resend 的簽章機制（Svix 標頭）驗證，密鑰放 `wp-config.php` 常數；驗不過一律 401 且不改任何資料；通過後把該 email 的 FluentCRM 聯絡人標成 bounced 或 complained，並從每日名單排除。重送的同一則通知不重複處理。
6. 會員票 REST：`aworacle/v1` 下一個端點，登入＋nonce 才發票；假名＝對「站台鹽＋會員 ID」做不可逆雜湊後的固定字串（鹽在 `includes/Settings/Options.php:107` `salt()`），同一會員每次相同、看不出會員 ID；用 `SiteKey::signedRequest()` 以 `aud:"ticket"` 組簽。同網域父頁腳本在框內頁要用 AI 解讀時取票並交給框內頁（做法自定，寫進 README；不把票放進網址）。每位會員取票要有頻率上限。
7. 清理：每月刪 30 天前的 FluentCRM `custom_email_campaign` 列；退訂或刪會員時刪他的每日資料；隱私匯出與刪除涵蓋 `daily_profiles`（接 P2 的 `includes/Members/Privacy.php`）。
8. `README.md`：設定步驟（FluentCRM、FluentSMTP 接 Resend、webhook 網址與密鑰、排程）、每日信的資料流、退信處理。

## 驗收
- SPEC `:82` 每一條都有測試：四個時區（Asia/Taipei、Europe/London 跨夏令時間當日、America/Los_Angeles、Asia/Kolkata）各在當地 07:00 後第一次排程被挑中且只一次；同日重跑不重寄；退訂者不被挑；引擎回錯不寄；`mailer=none` 無區塊；收到驗過簽章的退信或投訴通知後該聯絡人不再被挑。
- 加：未確認者不被挑；兩個排程並發只寄一封；webhook 簽章錯 → 401 且資料不變；票：未登入 401、無 nonce 401、同一會員兩次取得的假名相同、不同會員不同、票打本機引擎 `/api/interpret` 被接受（本機 `ORACLE_SITES` 登記測試公鑰）、同一張票用第二次被拒。
- 突變四次（各一個守衛）：拿掉「已確認」條件、拿掉寄送紀錄的唯一鍵搶占、拿掉 webhook 驗簽、拿掉票端點的登入檢查，指名測試變紅，還原變綠。
- 乾淨 WordPress（docker，一個 compose project，資料放 `$env:TEMP`，用完 `down -v`）加 FluentCRM 免費版與 FluentSMTP：寄信用本機的假收信匣，**不對外寄出任何真信、不呼叫真的 Resend**。實看一封繁中、一封英文的信件內容與 `List-Unsubscribe` 標頭。
- `php -l`；PHPUnit 綠。

## 邊界
不改引擎；不做付費深度報告（規格 §8，另案）；不做外掛發佈（P4）；不 push、不部署。發現引擎要配合的事寫進 RISKS。
