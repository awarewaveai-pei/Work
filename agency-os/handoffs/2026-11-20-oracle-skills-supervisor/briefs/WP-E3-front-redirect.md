# E3 既有工具網址轉到 WordPress 頁；sitemap／robots 讓位

先讀：`COMMON.md`、`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §2-3、§2-12。E1 已併入後才做（同一個工人）。模型 Opus 5.5。

## 目的
站前面有 WordPress 時，`/zh-TW/<工具>` 這些舊網址要轉到對應的 WordPress 頁，引擎不再自己出 sitemap 與 robots。沒有 WordPress 時（現在的線上狀態、買斷安裝）行為完全不變。

## 已知事實
- `proxy.ts:26-36`：有語言前綴就放行；`lib/site.ts:16` `PAGE_SLUGS`；`app/sitemap.ts`、`app/robots.ts` 現行輸出。
- 開關是執行期環境變數 `ORACLE_FRONT_PAGES`（JSON）。未設定＝沒有 WordPress。格式：`{"pages":{"zh-TW":"/{slug}/","en":"/english/{slug}/"},"home":{"zh-TW":"/","en":"/english/"}}`；`home` 選填。

## 要做
1. 新 `lib/frontPages.ts`：解析 `ORACLE_FRONT_PAGES`。只收 `locales` 內的鍵；`pages` 的樣式必須以 `/` 開頭、含 `{slug}`、不含 `//`、`:`、反斜線；`home` 的路徑同規則但不含 `{slug}`。任何一處不合法＝整個視為未設定並記一行警告（不印值）。匯出 `frontPageFor(locale, slug)`、`frontHomeFor(locale)`，回路徑或 `null`。純函式＋測試。
2. `proxy.ts`：路徑是 `/<語言>/<PAGE_SLUGS 之一>`（可帶結尾斜線）且 `frontPageFor` 有值 → 308 到該路徑；路徑是 `/<語言>` 且 `frontHomeFor` 有值 → 308。都是同網域相對轉向。`/embed/*`、`/api/*` 不受影響。
3. `app/sitemap.ts`、`app/robots.ts`：有設定時不輸出（404）；未設定時輸出與現在逐字相同。
4. `deploy/DEPLOY.md` 加一節說明這個變數。

## 檔案
新：`lib/frontPages.ts`、`lib/frontPages.test.ts`。改：`proxy.ts`、`app/sitemap.ts`、`app/robots.ts`、`deploy/DEPLOY.md`。

## 驗收
- 測試：合法設定下 12 個 slug × 2 語言都得到樣式路徑；不合法設定（`https://evil.example/{slug}`、`//x/{slug}`、缺 `{slug}`）＝ `null`；未設定＝ `null`。
- 預覽以環境變數啟動一次：`curl -sI /zh-TW/ziwei` 308 且 `Location` 是相對路徑；`/embed/zh-TW/ziwei` 200；`/sitemap.xml` 404。不設變數再啟動：三者與改前相同。
- `npx tsc --noEmit` exit 0。

## 邊界
不寫死任何網域或 WordPress 網址；不改 `lib/site.ts` 的 `SITE_URL`。
