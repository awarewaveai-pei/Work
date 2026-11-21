# W4 監工台頁（Sonnet 5.5）

先讀 `COMMON.md`、PLAN 全文、`DISPATCH.md`。

做：在 `agency-os/handoffs/2026-11-21-systems-control-center/` 建 `data.mjs`＋`build.mjs`＋`check.mjs`→產 `supervisor.html`。照 `agency-os/handoffs/2026-10-31-outbound-os/` 的三檔結構與寫法（整份讀它的 build.mjs／check.mjs 照抄骨架，不另發明）。
- 內容：一句話說這系統做什麼；批次與卡（W1–W4，狀態：未開始／進行中／待驗收／已併入，含模型與 commit）；PLAN 的 6 條隔離保證（白話）；待操作者決定（套 0174＝High、裝排程）；RISKS 表（每批一張：卡／風險／處置）。
- 頁面規則：繁中白話、側欄＋單欄、不用「我們」、不用下拉、主題 token 零 hex；check.mjs 擋：每張卡有狀態與模型、RISKS 每列有處置、無 hex 色碼。
- 產出後 `node build.mjs && node check.mjs` 綠。**不發布 artifact**（監工發布，需 HTML DOCTYPE 包裝照 outbound 頁做法）。

檔案：只有上述資料夾內的 `data.mjs`、`build.mjs`、`check.mjs`、`supervisor.html`。
