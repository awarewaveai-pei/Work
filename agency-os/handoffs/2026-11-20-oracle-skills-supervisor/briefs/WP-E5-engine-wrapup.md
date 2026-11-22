# E5 引擎收尾（第二批 RISKS 的三件）

先讀：`COMMON.md`、`COMMON-WP.md`。專案 `Projects/internal/ziwei-doushu/`。模型 Sonnet 5.5。三件各自獨立，一個 commit。

## 1. CSP 範圍互補測試
- 事實：頁面 CSP 由 `proxy.ts` 送（matcher 在檔尾 `config.matcher`，排除 `api`、`_next/static`、`_next/image`）；`/api/*` 的 CSP 由 `next.config.ts` `headers()` 送（`lib/http/csp.ts` 的 `API_CSP`）。兩處各寫各的，沒有測試守「每個回應恰好被其中一邊涵蓋」。
- 做：一支 vitest，取一組代表路徑（`/`、`/zh-TW`、`/zh-TW/ziwei`、`/embed/en/tarot`、`/api/v1/systems`、`/api/interpret`、`/api/mcp`、`/_next/static/x.js`、`/sitemap.xml`、一個不存在的路徑），用 `proxy.ts` 匯出的 matcher 與 `next.config.ts` 的 `source` 樣式判斷歸屬：HTML 與 API 路徑恰好一邊命中；`_next/static` 兩邊都不命中。把 matcher 的 `api` 排除拿掉時測試要紅（突變一次）。

## 2. 工具結果區的固定標記
- 事實：外掛同網域腳本（`lobster-factory/packages/oracle-wp-plugin/assets/embed-same-origin.js`）用「30 秒內長高 80px 以上」猜結果出現，驗證訊息也會觸發。根因：引擎沒有標出結果區。
- 做：12 個工具元件（`components/toolRegistry.tsx` 的 `TOOL_COMPONENTS`）的結果容器加屬性 `data-aw-result`：結果出現時才在 DOM 內；驗證錯誤訊息不帶。先找有沒有共用的結果外框元件；有就加在那一處，沒有才逐一加。不改樣式、不改版面。
- 驗：一支測試確認 12 個工具都有這個屬性；預覽 `/embed/zh-TW/ziwei`、`/embed/zh-TW/hehun`、`/embed/en/tarot` 各操作一次：結果出現前 `document.querySelector('[data-aw-result]')` 為 null、出現後非 null；送出不合法輸入時仍為 null。
- 外掛端改認這個標記不在本卡（P2）。

## 3. 部署後自動檢查改打嵌入頁
- 事實：`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` 的 oracle smoke 打 `/zh-TW`（約 `:798`；`_smoke_check` 不跟隨轉向）。GO-3 設 `ORACLE_FRONT_PAGES.home` 後 `/zh-TW` 回 308，部署會被判失敗並自動退回。
- 做：oracle 的頁面探針改成 `/embed/zh-TW/ziwei`（不受轉向影響），並用 `_smoke_check` 第 6 參數要求回應含 `aw-oracle-root`。其他 app 的 smoke 不動。
- 驗：`bash -n`；`tests/host-scripts/sg-deploy-smoke-ports.test.sh` 原樣通過，並加一條覆蓋新探針。改這支腳本會觸發 auto-repair 閘：先讀 `agency-os/reports/audit/auto-repair-2026-05-23.md`、跑 `scripts/audit-tools/dogfood-auto-repair.ps1 -Mode HealthOnly`。

## 驗收
`npx tsc --noEmit` exit 0；`npx vitest run <受影響路徑>` 綠；`critic` 一輪。不 push、不部署。
