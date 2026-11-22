# E2 引擎全站內容安全政策（CSP）

先讀：`COMMON.md`、`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §2-14、決策紀錄 `agency-os/reports/decisions/2026-11-21-oracle-wp-front-door-architecture.md` §4 乙 代價 2。專案 `Projects/internal/ziwei-doushu/`。模型 Opus 5.5（安全：完成後 `critic` Deep）。

## 目的
GO-2 之後引擎與 WordPress 同一個網域。引擎頁只要有一個 XSS，攻擊者的腳本就能帶著管理員的登入狀態操作 WordPress 後台。不變量：引擎送出的每一個 HTML 回應都帶 CSP，且該政策不讓未經引擎核可的腳本執行。

## 已知事實
- E1 已在 `next.config.ts` 的 `headers()` 對 `/embed/:path*` 送 `Content-Security-Policy: frame-ancestors 'self'` 與 `X-Robots-Tag`（main `d11320883`）。同一個回應出現兩個 CSP 標頭時兩者都生效，所以政策只能有一個來源。
- `proxy.ts` 的 matcher 排除 `_next`、`api`、`embed/` 與帶副檔名的路徑；`/<語言>/<工具>` 與 `/embed/<語言>/<工具>` 都是 build 時預先產生的靜態頁（`generateStaticParams`）。
- 字型走 `next/font`（自架）；引擎自己沒有登入、沒有 cookie。
- 試驗 V3（CSP）當時沒跑，本卡就是補這一項。

## 要做
1. 盤點引擎實際載入的來源：腳本（含行內腳本、Next 的 hydration 腳本）、樣式（含行內 style 屬性）、圖片（塔羅牌圖 `/tarot/*`、data:／blob:）、字型、`fetch`／XHR 目的地、wasm（`@xalen/wasm`，是否需要 `'wasm-unsafe-eval'`）、worker。每項附 `file:line` 或實測輸出。
2. 定出政策並說明選擇。必守：
   - `script-src` 不含 `'unsafe-inline'`、不含 `'unsafe-eval'`（wasm 需要時只加 `'wasm-unsafe-eval'`）。行內腳本用 nonce 或雜湊。
   - `default-src 'self'`；`object-src 'none'`；`base-uri 'self'`；`form-action 'self'`。
   - `frame-ancestors 'self'` 套用到所有頁（含非嵌入版），取代 E1 那一條；`X-Robots-Tag` 保持只在 `/embed/*`。
   - `style-src` 若非得 `'unsafe-inline'`（行內 style 屬性），寫明是哪幾處與為何不改。
3. nonce 需要逐請求產生，會讓靜態頁變成動態渲染。先量：現況與改後各一次 `next build` 的路由表（靜態／動態）與首頁回應時間。兩種做法擇一並在回報寫明代價：(a) nonce＋動態渲染；(b) 保持靜態、行內腳本用雜湊（Next 的 `experimental.sri` 或 build 後算雜湊）。不接受為了保持靜態而放寬 `script-src`。
4. 政策只在一處定義（一個常數或一個函式），`/embed/*` 與其餘頁共用同一份，差異只有 `X-Robots-Tag`。
5. API 回應（`/api/*`，JSON）送 `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`。
6. 順手：`lib/frontPages.ts` 檔頭註解的設定範例是會被拒收的 `/{slug}/`，改成 `/tools/{slug}/`（與 `deploy/DEPLOY.md` 一致）。
7. `deploy/DEPLOY.md` 加一節：政策內容、加新外部來源時改哪裡。

## 檔案
改：`next.config.ts`、`proxy.ts`（若走 nonce）、`app/[lang]/layout.tsx` 與 `app/embed/[lang]/layout.tsx`（只在 nonce 需要時）、`lib/frontPages.ts`（只改註解）、`deploy/DEPLOY.md`。新：政策定義檔與其測試（位置自定，跟現有 `lib/` 慣例）。

## 驗收
- `next build` 後 `next start`（production，不是 dev；dev 模式需要 eval，量不準）：12 工具 × 2 語言 × 獨立版與嵌入版共 48 頁，每頁載入並操作一次主要動作（排盤／抽牌／送出），瀏覽器主控台 CSP 違規 0 筆。用 `.claude/launch.json` 的預覽加一個 production 設定，或以腳本驅動；回報列出每頁的違規數。
- curl：`/zh-TW/ziwei`、`/embed/zh-TW/ziwei`、`/api/v1/systems` 各回一個且只有一個 CSP 標頭；嵌入版另有 `X-Robots-Tag`。
- 對抗實測一次：在本機用瀏覽器主控台 `document.body.appendChild` 一個行內 script（或找得到注入點就走注入點），確認被政策擋下。
- 測試：政策字串的單元測試（必含與必不含的指令）。`npx tsc --noEmit` exit 0；`npx vitest run <受影響路徑>` 綠。

## 邊界
不改工具元件的功能；不加與 CSP 無關的標頭；不動 WordPress 端；不部署。靜態變動態若使首頁回應時間超過改前 2 倍，停下回報兩種做法的數字，不自己選。
