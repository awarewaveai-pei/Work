# codex-oracle review -- 2026-11-05 22:35:42 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/workspaces.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/workspaces.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: P6.13: video-workbench finished videos must pass next-admin release QA. (1) VW sends title/script/on-screen caption timeline from the job record to a new internal route release-text, which stores metadata.title/script and runs editorial+rights and caption QA. (2) uploads carry the uploader's rightsConfirmed; an existing unconfirmed upload row (same org+checksum+origin) may only be upgraded to confirmed, never downgraded. (3) caption QA source = the render's own text timeline. Renders without words must stay unreleasable (nothing invented).
- exit: 0 | elapsed: 172199ms | answer: 3039B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tool-processing.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-3d.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/workspaces.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/assets-ui.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/workspaces.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: QA 持久化關閉時，路由仍回報成功並阻止日後重送
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:481；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:68；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:78
  confidence  -> CONFIRMED
  scenario    -> 新環境沿用 compose 預設 `false`，影片送審文字時不產生任何 QA 報告，路由仍回傳 `ok: true`；VW 記下 `releaseTextSent`。之後啟用持久化，該 job 也不會重送，影片缺少放行所需報告。
  why missed  -> 測試把此設定固定為 `true`，而 compose 預設值在 diff 外。

FINDING 2: QA 寫入失敗會被當成送審成功
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:71；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/caption-qa-persistence.ts:30；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:78
  confidence  -> CONFIRMED
  scenario    -> `media_qa_reports` 寫入失敗時，caption helper 回傳 `null`；editorial/rights helper 的失敗也只放進回應的 `qa` 欄位。路由仍回傳 `ok: true`，VW 標記已送達，後續 GET 不再補寫缺失的 QA。
  why missed  -> 新路由測試將兩個 QA helper 都 mock 成成功，沒有涵蓋其實際失敗回傳值。

FINDING 3: 完全透明的文字仍可讓無字影片取得通過的文字 QA
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs:29；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs:575
  confidence  -> CONFIRMED
  scenario    -> 編輯專案只有 `opacity: 0` 的文字片段、沒有文字背景，輸出畫面看不到字；送審流程仍把該片段寫入 script 與 captions。若標題、來源權利及技術 QA 合格，文字 QA 也可通過，使這支無可見文字的影片可放行。
  why missed  -> 時間軸只排除 `hidden`，未對照渲染器允許的透明度。

FINDING 4: 合法編輯專案可產生超過路由上限的字幕，永久重試 400
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs:52；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/release-text.cjs:11；lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:28
  confidence  -> CONFIRMED
  scenario    -> 專案使用允許的 2,000 個文字片段，令片段交錯起止；時間軸可切出超過 3,000 個不同區間。影片成功輸出後，release-text 一律以 `invalid_body` 拒收，VW 每次 GET 都重試同一份資料，影片無法取得 caption QA。
  why missed  -> 測試只有少量片段，沒有比對編輯器允許的片段數與新 API 的輸出上限。

TOTAL: 4 findings
