# PG-1 算命站頁面（Kadence）

1. 套用（站內 wp-cli，兩支都可重跑）：`wp eval-file apply.php` → `wp eval-file translations.php`。改的只有：首頁（`page_on_front`）、`/tools/`、十二個 `/tools/<slug>/`、`/my-charts/`、`/daily-letter/`（以 slug 找）、Kadence 色盤、`apply.php` 裡 `$pg1_mods` 列的佈景設定、頁首／手機選單位置（改掛「東西方命理主選單」三個平連結）。
2. 第一次執行把原狀存進 option `aworacle_pg1_backup`（之後重跑不覆蓋）；每頁寫入前先存一筆修訂版本。
3. 退回：`wp eval-file apply.php rollback`（頁面內容、四個頁面 meta、色盤、佈景設定、選單位置全回原狀，再刪備份 option）。翻譯列留著無害；要刪就在 TranslatePress「字串翻譯」刪。
4. 換訂閱表單：改 `apply.php` 頂端 `AWORACLE_PG1_DAILY_FORM`（例：`[fluentform id="3"]`）後重跑 `apply.php`。
5. 改版面：在區塊編輯器改頁面即可；要改腳本本身，區塊標記必須由 Kadence 編輯器產生（`createBlock`＋`serialize`，並讓編輯器元件補上 `kbVersion`），不要手寫。
6. 存檔後若發現內容被存檔過濾改寫，`apply.php` 會停下並提示跑 rollback。
