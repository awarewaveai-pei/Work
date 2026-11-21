# aware-wave-oracle（WordPress 外掛）

把 AwareWave 算命引擎嵌進任何 WordPress 網站的頁面。oracle.aware-wave.com 只是第一個安裝的站；外掛內沒有任何網站專屬的網址或設定。設計依據：`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/WP-front-door-plan.md`（§1 決定 2–4、9；§3 P1）。

## 內容（P1）

| 部分 | 檔案 |
|---|---|
| 入口、自動載入、掛鉤 | `aware-wave-oracle.php`（結構同 `wp-bridge-plugin/aware-wave-wp-bridge.php`） |
| 設定頁（設定 → AwareWave 命理） | `includes/Admin/SettingsPage.php`：瀏覽器用／伺服器用引擎網址、金鑰名稱、預設語言、語言對照、工具→頁面對照、站台金鑰建立／更換、會員代號鹽更換、工具清單重抓 |
| 設定儲存 | `includes/Settings/Options.php`：`aworacle_settings`（自動載入，無機密）、`aworacle_site_keypair`、`aworacle_member_salt`（皆不自動載入） |
| 站台金鑰 | `includes/Crypto/SiteKey.php`：Ed25519，格式同 `aware-wave-store-plugin/includes/Signature.php`（`signWithKeypair`、`publicKeyPem`） |
| 嵌入 | `[aw_oracle tool="ziwei"]` 短碼與 `aware-wave/oracle` 區塊，同一個 `includes/Embed/Renderer.php` 輸出 iframe；父頁腳本 `assets/embed.js` |
| 翻譯 | `languages/`：`.pot`、`zh_TW` 的 `.po`／`.mo`／`.l10n.php`（WordPress 6.5+）。改 `.po` 後用 `wp i18n make-mo languages` 與 `wp i18n make-php languages` 重產 |

## 假設的引擎介面（W1／W2 完成後對接；改動時兩邊一起改）

- 嵌入頁：`<瀏覽器用引擎網址>/embed/<引擎語言>/<工具>`（`EmbedUrl::PATH_FORMAT`）。
- 工具清單：`GET <伺服器用引擎網址>/api/v1/systems`；優先讀回應的 `pages: string[]`（計畫 §2「可嵌入頁面清單」，W 端待加），沒有就用 `systems[].id`。快取 1 天，失敗快取 10 分鐘。
- postMessage 協定 v1（`EmbedUrl::PROTOCOL_VERSION`）：
  - 引擎→父頁：`{type:'oracle:ready', v}`、`{type:'oracle:resize', height}`、`{type:'oracle:need-login'}`、`{type:'oracle:navigate', slug}`、`{type:'oracle:save-chart', system, input}`（P1 只轉發成 DOM 事件 `aworacle:save-chart`，儲存屬 P2）。
  - 父頁→引擎：`{type:'oracle:init', v, locale, theme, member}`；`theme` 是 Kadence 色票 `--global-palette1..9`，沒有就送 `{}`。
  - 父頁只收 `event.origin` 等於瀏覽器用引擎網址的 origin、且 `event.source` 是本頁嵌入框的訊息；回覆只送到該 origin。
- 站台簽章（P1 只建金鑰，尚未送請求）：標頭 `X-AwareWave-Site: <金鑰名稱>`、`X-AwareWave-Site-Signature: base64(Ed25519(原始內容))`；時間戳與 nonce 欄位依 W1 定案。
- 會員代號：`HMAC-SHA256(鹽, 使用者 ID)`（`Options::memberPseudonym`），P2 起送給引擎。

## 驗證

- 單元測試（不需 WordPress）：`php -d extension=sodium vendor/bin/phpunit`（需先 `composer install`）。
- 語法：`composer lint`。
- 實際安裝測試要在有 WordPress 的環境做（計畫 P1 驗收：乾淨 WP 裝外掛 → 建金鑰 → 區塊嵌入工具可用）。
