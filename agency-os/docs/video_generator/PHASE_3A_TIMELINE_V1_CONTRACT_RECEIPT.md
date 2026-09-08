# Phase 3A — Timeline v1 契約收據

**現況（2026-09-08）：** 原交付已由 `2fb93f9dc` 整合至 `main`；原隔離 branch/worktree 已退休。預檢 API 未部署、未接 renderer、未寫入資料庫或外部服務。
**安全補強：** 結構有效後仍以 `tenant-guard` 驗證 Timeline 的 `organizationId`；client 跨租戶預檢回 403。
**Middleware gate：** `/api/video/timeline/validate` 在 `middleware.ts` matcher 內，且不在 `PUBLIC_API_PATHS`；middleware 會剝除來自 client 的 identity headers，再注入受驗證身分。
**草稿 UI（2026-09-08）：** VideoStudio 的「Timeline 驗證」tab 只提交原始 JSON 至預檢 API，顯示 `structural_only` 收據或錯誤；沒有 render、DB、storage 或發布控制。
**原始交付日期：** 2026-09-06；原始 commits：`4f6b574a7`、`a53021d85`、`6fa054f20`、`0cf46d201`。

## 交付內容

新增 renderer-neutral 的 Timeline v1 純函式契約與測試：

- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/timeline-v1.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/timeline-v1.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/timeline/validate/route.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/timeline/validate/route.test.ts`

程式證據：契約型別與限制見 `timeline-v1.ts:1-39`；完整的 deterministic validator 見 `timeline-v1.ts:73-142`；接受、負向與 frame-limit 測試見 `timeline-v1.test.ts:4-75`。

正式 schema 版本為 `1.0.0`。它遵循平台設計基線：`timelineId`、`organizationId`、製作 purpose、frame rate、多輸出 profile、video/audio/caption tracks、`styleRef` 及 provenance。所有媒體均為既有 `media_assets.id` 的 UUID reference，沒有 public URL 或 Remotion composition props；`media_assets` 的 canonical UUID 主鍵、組織歸屬與版本欄位見 `lobster-factory/packages/db/migrations/0011_ops_console_control_plane.sql:35-54`。

驗證器拒絕未知欄位、錯誤 artifact reference、重複 ID、無效 purpose/profile/frame rate、非整數時間、非 frame-aligned 時間、同 track overlap、錯誤 caption 時序或閱讀速度，以及換算後超過 Remotion 既有 `18,000` frame 上限的請求。錯誤包含 JSON path、機械代碼與訊息；不做隱性型別轉換。

此版本沒有 renderer adapter。未來 Remotion adapter 必須先經 artifact resolver 將 tenant-scoped immutable reference 解析為被允許的 rendition，並在 durable job 建立後才產生 renderer-specific props；不得讓 Timeline 直接含 URL。

`POST /api/video/timeline/validate` 現可提供安全的結構預檢。成功回應固定為 `stage: structural_only` 與 `readyForRender: false`，並列出尚未完成的 artifact ownership、rights、source bounds、safe-area 及 renderer feasibility 檢查；它沒有 renderer、R2、Supabase 或外部網路副作用。

## 刻意未做的事

沒有把 Timeline 直接接到 `app/api/video/remotion-render/route.ts`。該 route 目前仍直接產生 renderer 工作 ID，尚未經過 Phase 1B 的 durable job、artifact、reconcile、release 與 rollback 邊界。直接加一個 Timeline 分支會製造第二條同樣不可恢復的出片路徑，違反平台計畫的核心不變量。

因此本收據**不代表** AI Director 已上線、Remotion 已取得 durable linkage、Timeline 可由 UI 提交，或有效 Timeline 已做過真實渲染。既有 VideoStudio 的 Quick Engine 與手動 Remotion template 路徑均未改動。

## LEGO 編號對齊

Timeline provenance 的 capability ID 現依既有 LEGO grammar `^[a-z_]+(\.[a-z_]+)?$` 驗證，例如 `media.timeline_plan`。來源是 `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\architecture\search-content\SEARCH_CONTENT_METHOD_AND_CAPABILITY_REGISTRY.md:32-50`；其 capability resolution 的「存在、ID 相符、ACTIVE 才可執行」不變量見 `D:\Work\agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\docs\adr\ADR-023-capability-resolution-fail-closed.md:19-35`。

目前尚未為 media capabilities 建立 Active registry record；因此 Timeline 只接受 ID 的語法，沒有宣稱已完成 capability resolution。正式啟用 `media.timeline_plan`、`media.timeline_validate`、`media.render_remotion`、`media.transcribe_local`、`media.qa_technical` 等能力前，必須先建立各自 contract、registry record、版本、測試與 rollback entry，並由 resolver fail-closed 執行。

## 驗證

在 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin` 實際執行：

```powershell
npm test -- timeline-v1 renderer-client-auth job-lifecycle
npm run typecheck
```

先以契約與預檢 API 測試驗證 8 個情境通過；其後完整 `npm test` 驗證 64 個測試檔、709 個測試全數通過；`tsc --noEmit` 通過。

在 worktree 根目錄執行：

```powershell
git diff --check
```

結果：通過。

## 後續硬閘

正式接線前必須依序完成：

1. Phase 1B durable `video_jobs` migration、idempotency、claim／reconcile worker 與中斷復原驗證。
2. 媒體資產版本與引用關係，讓 Timeline 使用 tenant-scoped immutable artifact reference，而不是長期以 URL 作為唯一真相。
3. Remotion adapter 將 render attempt、輸出、QA 與 release 記錄到同一條 durable lifecycle，並通過 restart-resume 測試。
4. 具備上述資料與權限邊界後，才新增 Timeline review/submit UI 與實際 staging render canary。

## rollback

此交付未部署且未接 renderer。若未來接線失敗，停用新 capability 或以審核過的 `main` revert 回退程式；既有 Quick Engine 與手動 Remotion template 不受影響。
