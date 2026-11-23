# aware-wave-oracle（WordPress 外掛）

把 AwareWave 算命引擎的工具嵌進任何 WordPress 網站的頁面。oracle.aware-wave.com 只是第一個安裝的站；外掛內沒有任何網站專屬的網址或設定。設計正本：`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/ORACLE-WP-SPEC.md`（§1、§2-1～§2-6、§2-13；本外掛卡 P1′、P2′）。

## 安裝

1. 把 `lobster-factory/packages/oracle-wp-plugin/` 整個資料夾放到 `wp-content/plugins/aware-wave-oracle/`（不需 composer；外掛自帶載入器）。需求：WordPress 6.5+、PHP 7.4+（簽章用 WordPress 內建的 sodium_compat，不必裝 ext-sodium）。
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

- 存檔時（same-origin）檢查：有頁面網址或 TranslatePress 語言代稱落在引擎前綴 `/embed`、`/api`、`/_next`、`/tarot`、`/zh-TW`、`/en`，顯示警告並列出（不擋存檔；這些網址到不了 WordPress）。
- 私鑰可改放 `wp-config.php`：`define( 'AWORACLE_SITE_KEYPAIR', '<base64 金鑰對>' );`，有設定時優先、設定頁不再提供產生／更換。
- 選項：`aworacle_settings`（自動載入，無機密）、`aworacle_site_keypair`、`aworacle_member_salt`（皆不自動載入；鹽第一次用到時自動建立）、`aworacle_db_version`（資料表版本）。移除外掛會刪掉這些選項、工具清單快取與兩張會員表（multisite 每個站）。

## 兩種嵌入方式

- **same-origin（預設）**：反向代理把引擎前綴送到引擎，其餘送到 WordPress（ORACLE-WP-SPEC §1）。區塊／短碼輸出 `<iframe src="/embed/<語言>/<工具>" title loading="lazy">`（相對路徑）。`assets/embed-same-origin.js` 直接讀框內 `#aw-oracle-root` 的高度（框內視窗的 `ResizeObserver`，內容變矮框也變矮）；讀不到時框維持 600px。訪客在框內送出或按按鈕（不含結果區內的按鈕）後 30 秒內，框內出現或重繪帶 `[data-aw-result]` 的元素（引擎卡 E5 加在每個工具的結果容器）時，父頁捲到它；沒有這個屬性的舊引擎不捲，不用高度猜。
  安全取捨：同源框內的引擎頁可以直接存取父頁（WordPress 的 DOM、REST nonce、登入狀態），`sandbox` 擋不住。引擎的一個 XSS 等同裝了外掛的每個 WordPress 的 XSS；引擎的 CSP 與依賴審查要比照 WordPress 後台的等級（ORACLE-WP-SPEC §2-14）。
- **cross-origin（尚未支援，設定不可選）**：引擎在另一個網域（客戶自己的主機、反向代理不在我們手上）。輸出 `<iframe src="<瀏覽器用引擎網址>/embed/…">` 與 `assets/embed.js`（postMessage 協定 v1：父頁只收引擎 origin、且來源是本頁嵌入框的訊息）。**引擎端尚未實作此協定，且嵌入頁送 `frame-ancestors 'self'`**：有第一個這種客戶時另開卡。

## 會員存檔（P2′）

- 兩張表：`{prefix}aworacle_charts`（自己的命盤，每人上限 50）、`{prefix}aworacle_persons`（我存的對象，上限 200；不連任何帳號、不通知任何人）。明文欄位只有 `id`、`user_id`、時間；名字與出生資料（引擎共用出生欄位，`Members\Record`）整包以 `Crypto\Vault`（libsodium secretbox）加密，綁定「種類:會員 ID」，搬到別人列或另一張表就打不開。
- 金鑰：`wp-config.php` 常數 `AWORACLE_DATA_KEY`，不進資料庫，資料庫備份只有密文。沒設或格式錯：存檔整個停用（REST 503、短碼顯示「本站目前還不能存檔」、儀表板與外掛頁提示原因），不退回明文。換金鑰會讓舊資料打不開（列表顯示「無法開啟，可刪除」）；目前沒有換鑰工具。
- 建表：啟用時，以及任何請求發現 `aworacle_db_version` 不符時（原地升級、多站網路啟用）。
- REST `aworacle/v1`：`GET|POST /{charts|persons}`、`GET|PUT|DELETE /{kind}/{id}`。需登入＋`wp_rest` nonce（`X-WP-Nonce`），外掛自己驗，兩者缺一 401；別人的 id 一律 404（每條 SQL 都帶 `AND user_id = 本人`）；欄位錯 400 附 `data.fields`。
- 短碼 `[aw_oracle_my_charts]`、`[aw_oracle_persons]`：頁面只輸出空容器，`assets/members.js` 從 REST 取資料（出生資料不進頁面快取）；未登入顯示「登入以儲存」。
- 隱私：工具 → 匯出個人資料含兩組（已存的命盤、已存的對象）；清除個人資料刪兩表該人全部列；刪除會員（含多站網路移除）連動刪除。

## 簽章（站台 → 引擎）

一律經 `Crypto\SiteKey::signedRequest( $payload, $aud, $keyId, $keypair )` 組＋簽，呼叫端不自己拼驗證欄位（帶了會被拒）：

- body：JSON，先 `key_id`、`ts`（unix 秒，±60 秒）、`nonce`（32 字 base64url，每站只能用一次）、`aud`，再接請求欄位。
- `aud`：`v1`＝`/api/v1`（含 batch）；`ticket`＝會員票。一份簽過的原文只對一個用途有效（引擎回 `401 wrong_audience`）。
- 標頭：`X-AwareWave-Oracle-Signature: base64(Ed25519(原始 body 位元組))`。
- 引擎合約：`Projects/internal/ziwei-doushu/lib/sites/verify.ts`；兩邊一起改。
- 會員代號：`HMAC-SHA256(鹽, 使用者 ID)`（`Options::memberPseudonym`），會員票用（P3′）。

## 結構

| 部分 | 檔案 |
|---|---|
| 入口、自動載入、掛鉤 | `aware-wave-oracle.php` |
| 設定頁 | `includes/Admin/SettingsPage.php`（金鑰／鹽／工具清單動作走 `admin-post.php` 後轉回，重新整理不會重做） |
| 設定驗證（不依賴 WordPress） | `includes/Settings/Normalize.php`；儲存 `includes/Settings/Options.php` |
| 金鑰與簽章 | `includes/Crypto/SiteKey.php` |
| 嵌入 | `includes/Embed/{Renderer,EmbedUrl,LocaleMap,Shortcode,Block}.php`、`assets/{embed-same-origin,embed,block}.js` |
| 會員存檔 | `includes/Members/{Store,Rest,Shortcodes,Privacy,Record}.php`、`includes/Crypto/Vault.php`、`assets/members.js` |
| 引擎讀取 | `includes/Engine/EngineClient.php`（工具清單 `GET /api/v1/systems`，快取 1 天；不跟隨轉址、回應上限 1 MB） |
| 翻譯 | `languages/`：改 `.po` 後 `wp i18n make-mo languages`、`wp i18n make-php languages` |

## 驗證

- 單元測試（不需 WordPress）：`composer install` 後 `vendor/bin/phpunit`（需 sodium；本機沒有 composer 時用 `docker run --rm -v <外掛資料夾複本>:/app -w /app composer:2 sh -c "composer install && vendor/bin/phpunit"`，複本放暫存目錄，`vendor/` 不進 repo）。
- 語法：`composer lint`，或對每個 `.php` 跑 `php -l`（7.4 與 8.x 各一次）。
- 實際安裝：docker WordPress＋本機 nginx（引擎前綴轉到本機引擎，其餘到 WordPress）；12 個工具各開一次、看框高與捲動。
- 會員存檔驗收（真 WordPress，外掛啟用、已設 `AWORACLE_DATA_KEY`）：`wp eval-file tests/wp/members-check.php seed` → `wp db export` 的檔裡 grep 不到 `Zed-Canary`、`Canaryville`、`1873` → `wp eval-file tests/wp/members-check.php finish`。任一 FAIL 時 exit 1。
