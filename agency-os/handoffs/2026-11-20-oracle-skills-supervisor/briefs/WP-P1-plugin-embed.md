# P1 外掛修正與同網域嵌入

先讀：`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §2-1～§2-4、§2-13、§3 P1′ 列、§5（P1 `e082fbd04` 列）。外掛 `lobster-factory/packages/oracle-wp-plugin/`（整個讀完再動手）。模型 Opus 5.5。

## 目的
外掛要能裝在任何 WordPress（oracle 只是第一個）。現況有審查留下的 1 個主要問題與 6 個小問題，嵌入方式還是跨網域寫法，簽章格式也落後引擎一版。

## 已知事實（第一批定下的）
- 待修清單：`agency-os/WORKLOG.md` 的「2026-11-21（續21）」條目內「未修，裝到任何 WordPress 前必修」那一段（1M/6n）。每一條都要修，逐條在回報對照。
- 嵌入版網址：`/embed/<語言>/<工具代稱>`，語言只有 `zh-TW`、`en`；工具代稱＝引擎 `lib/site.ts` 的 `PAGE_SLUGS`（12 個）。被嵌頁的根元素 `id="aw-oracle-root"`，高度等於內容高度（`app/embed/[lang]/[slug]/page.tsx`）。引擎已送 `frame-ancestors 'self'`。
- 簽章：引擎 `lib/sites/verify.ts` 現在要求簽過的 JSON 原文含 `key_id`、`ts`、`nonce`、`aud`；`aud` 對 `/api/v1`（含 batch）＝`"v1"`，會員票＝`"ticket"`。標頭 `X-AwareWave-Oracle-Signature`。外掛目前只有說明還寫三欄位：`includes/Crypto/SiteKey.php:17`、`README.md:24`。
- 語言對應：以 `determine_locale()` 對到引擎語言，對不到用 `en`（SPEC §2-13）。
- WordPress 頁面網址不得落在引擎前綴 `/embed`、`/api`、`/_next`、`/tarot`、`/zh-TW`、`/en`（SPEC §2-1）。

## 要做
1. 修 1M/6n 全部。
2. 嵌入輸出：設定 `embed: same-origin | cross-origin`，預設 `same-origin`。
   - same-origin：區塊／短碼輸出 `<iframe src="/embed/<語言>/<工具>">`（相對路徑，不寫死網域），加 `title`、`loading="lazy"`；父頁腳本直接讀框內 `#aw-oracle-root` 的高度來設定框高（同源，可用 `ResizeObserver` 觀察框內元素，不用訊息協定）；內容變矮時框也要變矮；結果出現時把父頁捲到框的頂端附近。框內元素找不到時框高維持一個合理的最小值，不留空白無限長。
   - cross-origin：現有 `assets/embed.js` 的訊息協定留在原檔，由設定切換，行為不變。
3. 設定頁存檔時檢查：站上有沒有頁面的網址落在引擎前綴；有就顯示警告並列出那些頁（不擋存檔）。
4. 簽章組 body 的地方一律帶 `aud`；提供一個組＋簽的單一函式，呼叫端傳用途（`v1`｜`ticket`），不讓呼叫端自己拼欄位。`SiteKey.php` 與 `README.md` 的格式說明同步。會員票的 REST 端點不在本卡（P3）。
5. `README.md`：安裝、設定、兩種嵌入方式、簽章格式。

## 檔案
只動 `lobster-factory/packages/oracle-wp-plugin/**`。

## 驗收
- `php -l` 全部通過；外掛現有 PHPUnit 綠（跑法見外掛 README；沒有就照現有 wp-bridge 外掛的做法，並在回報說明）。
- 乾淨 WordPress（docker，compose 與資料放 `$env:TEMP`，用完 `down -v`；一次調查只開一個 compose project）：裝外掛 → 第一次儲存設定 → 對照表仍在（1M 的重現步驟）→ 建一頁放區塊 → 前端頁面看得到工具。
- 同網域實測：在該 WordPress 前面放一個本機 nginx，把 `/embed/`、`/api/`、`/_next/`、`/tarot/` 轉到本機引擎（`next dev` 用 `.claude/launch.json` 預覽起，或 `next build && next start`），其餘到 WordPress。12 個工具各開一次：框內無引擎工具列、框高等於內容、送出後結果出現且父頁有捲到、375px 無橫向捲動。合婚要實際送出一次並看到結果（E1 沒驗到這項）。
- 簽章：用外掛的組簽函式產生一個 `aud:"v1"` 的請求打本機引擎 `/api/v1/systems/<任一>`（本機 `ORACLE_SITES` 登記測試公鑰）→ 200；把 `aud` 改成 `ticket` 再打 → 401 `wrong_audience`。
- `critic` 一輪。

## 邊界
不做會員、存檔、每日信、票的 REST（P2、P3）；不做發佈管道（P4）；不改引擎。發現引擎端要配合的事寫進 RISKS，不自己改。
