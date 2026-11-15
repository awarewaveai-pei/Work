# codex-oracle review -- 2026-11-15 12:19:01 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.10 round 3. Round-2 fixes (dfb2c2d0): the release page's SRT/VTT links go through the same-origin download route (bucketDownloadHref -> /api/tools/designs/download, allowed for the video bucket by isPublicBucketAsset) so they download in one click. F2 (subtitle files left after a video delete) belongs to the existing video delete flow (lib/storage/r2.ts:344 lists video/workbench/<org>/ as one video's folder -- a pre-existing data-loss bug already reported to the supervisor); its fix will cover video/subtitles/<org>/<sha>.* too, not changed here.
- exit: 0 | elapsed: 125830ms | answer: 539B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 影片字幕下載仍受 POD 功能開關阻擋
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/download/route.ts:69
  confidence  -> CONFIRMED
  scenario    -> `POD_DESIGNS_ENABLED=false`（docker-compose.yml:509 的預設值）時，影片已產生 SRT/VTT，使用者點下載連結仍收到 503 `pod_designs_disabled`，無法下載。
  why missed  -> 這次檢查了下載路由的影片 bucket 白名單，卻漏看同一路由更前面的 POD 開關。

TOTAL: 1 findings
