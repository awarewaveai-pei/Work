# WordPress 登入防護與稽核

適用：`aware-wave.com`，現役 `ks-aw-01`，容器 `lobster-wordpress`。SSH 參數取 `scripts/lib/prod-host.ps1`。不得套用到其他網站。

## 防護不變量

- 管理員須完成密碼與第二步驗證；舊 TOTP、復原碼不得因重裝外掛而重設。
- 設定殘留不等於防護生效：同查外掛 active、`wp_login` challenge callback 與管理員方法。
- LLAR 保留失敗鎖定；不以國家或操作者固定 IP 限制登入。
- Simple History 的成功登入必須在第二步通過後才記錄。
- MainWP 同步須成功；MainWP 一鍵登入是另一個受信任管理入口，不以它驗證一般密碼登入的 2FA。
- 登入名稱不得出現在任何公開頁面：管理員的 `user_nicename`（作者網址、REST slug、使用者 sitemap）與 `display_name`（REST name、RSS 作者）都必須不同於 `user_login`。
- `/wp-login.php` 在 Cloudflare 前先過 Managed Challenge（不看國家）；每 IP 計次的 LLAR 與 nginx 擋不住分散式暴力破解。

## 分散式暴力破解與 LLAR 通知信（2026-10-29）

症狀：LLAR 每天寄「登入嘗試已失敗」信。實查 14 天：903 個 IP 對 wp-login 送密碼，每天 150–740 次；最常猜的是真正的管理員登入名稱，因為它從作者頁、`?rest_route=/wp/v2/users`、`wp-sitemap-users-1.xml`、RSS 公開漏出。nginx 只擋了 `/wp-json/wp/v2/users` 一條路。

處置：
- Cloudflare 自訂規則 `cedbaa68b28a486392e789753094f86c`：路徑含 `/wp-login.php` → Managed Challenge。真人瀏覽器過一次檢查就能登入；腳本與機器人拿到 403。
- 管理員 `user_nicename=aware-wave-team`、`display_name`／`nickname`=`AwareWave`；登入名稱與密碼不變。原值三者皆為登入名稱。
- 不關 LLAR 通知：機器人被擋在 CF 後，仍收到的信才代表需要看。

驗證：
```bash
curl -s -o /dev/null -w '%{http_code}
' -d 'log=x&pwd=y' https://aware-wave.com/wp-login.php   # 預期 403（cf-mitigated: challenge）
curl -s 'https://aware-wave.com/?rest_route=/wp/v2/users' | grep -c '<登入名稱>'                    # 預期 0；另查 /?author=1、/wp-sitemap-users-1.xml、/feed/
```
`scripts/check-cloudflare-security.ps1` 每次檢查這條規則，缺了就 WARN。

回復：Dashboard 停用該 rule；公開名稱用 `wp user update 1 --user_nicename=... --display_name=...` 改回（舊作者網址目前 404，屬預期）。

## 已查證狀態（2026-10-27）

2026-04-27 日記曾記載 WP 2FA 已設定。此次實查外掛目錄不存在，但管理員 `wp_2fa_*` 設定仍在，沒有 challenge callback。何時、由誰移除，尚無證據；不得歸因於 PHP 修復或攻擊者。

此次使用 WordPress.org 的 WP 2FA 4.2.1 與 Simple History 5.36.0，須以 `wp plugin verify-checksums wp-2fa simple-history` 驗來源。前者沿用既有 TOTP 與復原碼。不得把它的設定值、cookie、備份碼或 DB dump 寫進報告。

## 稽核串接

來源：`lobster-factory/infra/hetzner-phase1-core/apps/wordpress/mu-plugins/aw-login-audit.php`。

Simple History 在 `wp_login` priority 1 記錄；WP 2FA priority 20 才清除密碼階段 cookie 並顯示 challenge。未串接時，只知道密碼就可能先被記為登入成功。

MU 外掛使用 Simple History 的 `login_pending_second_factor` filter 延後已啟用 WP 2FA 者的成功紀錄；只在 WP 2FA 的 `wp_2fa_user_authenticated` action 寫入完成登入。未啟用 WP 2FA 的使用者維持原有紀錄流程。不得改兩個官方外掛的原始碼。

本機驗證：

```powershell
php -l lobster-factory/infra/hetzner-phase1-core/apps/wordpress/mu-plugins/aw-login-audit.php
php lobster-factory/infra/hetzner-phase1-core/tests/host-scripts/wp-login-audit.test.php
```

正式套用只更新該 MU 檔，先 PHP lint、同目錄 atomic rename；失敗移出 MU 載入目錄。Dockerfile 與 entrypoint 收錄檔案，供下次核准的映像建置沿用；不為這個 MU 變更重建尚待核准的 PHP 映像。

## 維護與驗收

1. 確認同日 DB 備份與最近完整站檔備份；高風險變更前另做權限 600 的 DB dump，存於 webroot 外。
2. 操作者先確認手機仍有原驗證器；保留現存登入分頁，不先撤銷全部 sessions。
3. 啟用外掛，驗證 TOTP／復原碼設定的雜湊未改，不輸出其值。
4. 檢查首頁、`/shop/`、`/wp-login.php`，以及 MainWP 對該站 sync 結果。
5. 操作者另開無痕視窗，確認先要求第二步、原驗證碼可登入；查 Simple History 有完成登入紀錄。未做此步不得宣稱真人登入驗收完成。
6. 在 WordPress「控制台 → Simple History」查成功／失敗登入、外掛啟停／刪除及帳號異動；設定不在不代表有人入侵。

Simple History 預設只保留有限期間。歷史未安裝時的事件無法補回；備份完整性通過也不等於已完成還原演練。

## 回復

- MU 串接異常：將 `aw-login-audit.php` 移至 webroot 外的備份目錄，保留 WP 2FA；稽核恢復外掛預設行為，但先暫停解讀其成功登入結論。
- 若 WP 2FA 使操作者無法登入：經已授權 SSH 暫時 `wp plugin deactivate wp-2fa`，確認恢復後釐清原因；不刪 TOTP／復原碼，不直接還原整個 DB 而覆寫新訂單。
- Simple History 可單獨停用，不執行 uninstall；保留已有紀錄。
- 緊急停用後需立刻列出 2FA 尚未生效，不能只留下舊設定讓報告誤判已保護。
