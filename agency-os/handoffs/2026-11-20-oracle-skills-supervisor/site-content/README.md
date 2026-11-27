# PG-1 算命站頁面（Kadence）

1. 套用（站內 wp-cli，都可重跑，帶管理員 `--user=<admin>` 免得存檔過濾改內容）：`wp eval-file apply.php` → `wp eval-file translations.php`。改的只有：首頁（`show_on_front=page` 的 `page_on_front`）、`/tools/`、十二個 `/tools/<slug>/`、`/my-charts/`、`/daily-letter/`（以 slug 找）、Kadence 色盤、`apply.php` 的 `$pg1_mods`、自建選單「東西方命理主選單」與頁首／手機選單位置。
2. 原狀存在 option `aworacle_pg1_backup`（翻譯原值在 `aworacle_pg1_trp_backup`）；已存的不會被重跑覆蓋，之後才碰到的頁面／設定會補進去。每頁寫入前先存一筆修訂版本。
3. 退回：`wp eval-file apply.php rollback`、`wp eval-file translations.php rollback`。任何一頁沒還原成功就停下、保留備份。
4. 換訂閱表單：改 `apply.php` 頂端 `AWORACLE_PG1_DAILY_FORM`（區塊標記；現為外掛區塊 `aware-wave/oracle-daily`，Fluent Forms 例：`<!-- wp:shortcode -->[fluentform id="3"]<!-- /wp:shortcode -->`）後重跑 `apply.php`。
5. 色盤＝引擎 `globals.css` 的顏色，語意寫在 `apply.php` 色盤上方註解；頁面只引用 palette1–9，在 Kadence 改色盤整站跟著變。
6. 改版面：在區塊編輯器改頁面即可；要改腳本，區塊標記必須由 Kadence 編輯器產生（`createBlock`、讓元件掛載補 `kbVersion`、`serialize`），不要手寫。
