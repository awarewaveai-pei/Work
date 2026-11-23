# P4 外掛發佈管道與收尾

先讀：`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §3 P4 列（`:83`）。整檔讀：`scripts/release-wp-bridge.sh`、`scripts/rollout-wp-bridge.ps1`（現有兩支自有外掛的發佈與鋪到網站的腳本；照它們的做法加第三支，不另寫一套）、`agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md`、`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts`（自有外掛列與 `<repo>-v<版本>.zip` 的檔名規則）、外掛 `lobster-factory/packages/oracle-wp-plugin/`（0.4.0，含 `.distignore`）。模型 Opus 5.5（含公開表單的防濫用：完成後 `critic` 一輪）。

## A. 發佈管道
照 SPEC `:83`：兩支腳本加 `oracle` 這個外掛；`WP_CLIENT_PLUGIN_STACK.md` 加「產品外掛」類別；catalog 的 oracle 外掛列指向發佈位置與版本。
- 發佈 repo 是新的公開 GitHub repo：**你不建 repo、不推任何東西到 GitHub**。腳本做到 dry-run 正確為止；真的建 repo 與第一次發佈由監工在操作者同意後做。
- 打包內容照 `.distignore`（不含 tests）；zip 檔名符合閘門要求的 `<repo>-v<版本>.zip`；打包後的 zip 在乾淨 WordPress 裝得起來、啟用無錯。
- 發佈前檢查：`php -l` 在 PHP 7.4 與 8.x 都過（P2 回報 7.4 沒實測；用 docker 的 `php:7.4-cli`）；版本號在外掛檔頭、常數、README 三處一致。

## B. 第二、三批 RISKS 留給這張卡的四件
1. 翻譯：`languages/*.po` 補齊所有新字串（P1、P2、P3 新增的），繁中後台不得中英混雜；`.mo` 一併產生。
2. 「引擎網址（伺服器用）」變更時，清掉外掛快取的工具清單（SF-H 回報：改網址後快取不清）。不變量：設定值一變，依賴它的快取就失效；用同一個機制涵蓋所有會影響工具清單的設定，不只這一欄。
3. 訂閱表單加 Cloudflare Turnstile：站台金鑰與密鑰放外掛設定（密鑰可改放 `wp-config.php` 常數）；沒設定金鑰時表單照現在的限流、陷阱欄位與每日確認信上限運作並在後台提示「尚未設定人機驗證」；設定後，伺服器端驗證不過就不建立申請、不寄確認信。驗證請求打 Cloudflare 的固定網址，逾時當作不過。
4. 設定頁：`embed: cross-origin` 仍標「尚未支援」（P2 已做，確認打包後仍是）。

## 驗收
- 兩支腳本對 `oracle` 的 dry-run 輸出正確（列出會做的每一步、目標 repo、版本、zip 名稱），且對既有 `bridge`、`store` 的 dry-run 輸出與改前逐行相同（改前先存一份，`diff` 驗）。
- 打包的 zip：乾淨 WordPress（docker，一個 compose project，資料放 `$env:TEMP`，用完 `down -v`）安裝啟用；P2、P3 的 `tests/wp/*-check.php` 在這個安裝上仍全過（測試檔另外掛進去，不在 zip 裡）。
- Turnstile：用 Cloudflare 公開的測試金鑰（一律通過與一律失敗各一組）驗兩種結果；失敗時資料表沒有新申請、假收信匣沒有新信。
- 快取：改設定後下一次讀工具清單會重新向引擎要（測試計呼叫次數）。
- 繁中後台截圖一張，設定頁無英文殘留。
- PHPUnit 綠；`php -l` 7.4 與 8.x。

## 邊界
不建 GitHub repo、不發佈、不對外寄信、不呼叫真的 Resend；不改引擎；不改 next-admin 除了 catalog 那一列（改了就跑 next-admin 全套 `npx vitest run`）。不 push。
