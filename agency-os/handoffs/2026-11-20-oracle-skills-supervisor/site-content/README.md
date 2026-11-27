# PG-1 算命站頁面（wp-bridge 積木）

1. 頁面＝`pages.php`（資料：每頁用哪些積木、填什麼字）＋站上已裝的 wp-bridge `BlockLibrary`（積木）＋`KadenceValidator`（寫入前檢查）。本資料夾不放任何區塊標記；要改版面就改 `pages.php` 或 bridge 積木。
2. 前提：站上 wp-bridge 版本含 `BlockLibrary::composePage()`（本卡新增的積木；監工發佈時升版）。沒有就 `apply.php` 直接停、不改任何東西。
3. 套用（站內 wp-cli，三個檔放同一資料夾、在該資料夾執行，或加 `pages=<路徑>`；都可重跑）：`wp eval-file apply.php --user=<admin>` → `wp eval-file translations.php --user=<admin>`。先把 16 頁全部組好並驗證，任何一頁失敗就整批不寫。每跑一次每頁多一筆修訂版本（積木每次產生新的 uniqueID）。
4. 改的只有：首頁（`show_on_front=page` 的 `page_on_front`）、`/tools/`、十二個 `/tools/<slug>/`、`/my-charts/`、`/daily-letter/`（以 slug 找）、Kadence 色盤、`apply.php` 的 `$pg1_mods`、自建選單「東西方命理主選單」與頁首／手機選單位置。原狀存在 option `aworacle_pg1_backup`（翻譯原值在 `aworacle_pg1_trp_backup`）。
5. 退回：`wp eval-file apply.php rollback --user=<admin>`、`wp eval-file translations.php rollback --user=<admin>`。任何一頁沒還原成功就停下、保留備份。
6. 訂閱表單：`apply.php` 頂端 `AWORACLE_PG1_DAILY_FORM_ID`，0＝外掛區塊 `aware-wave/oracle-daily`；填 Fluent Forms 表單 id（例 3）＝bridge `form` 積木 `[fluentform id="3"]`，改完重跑 `apply.php`。
7. 為什麼不用 bridge 端點：`POST /post` 只建新文章、`/draft/update` 只改未上線文章，沒有改已上線頁面的端點；`apply.php` 用的是同一套積木與驗證器。
8. 色盤＝引擎 `globals.css` 的顏色，palette1–9 語意寫在 `apply.php` 色盤上方；頁面只引用 palette1–9，在 Kadence 改色盤整站跟著變（已實測）。
