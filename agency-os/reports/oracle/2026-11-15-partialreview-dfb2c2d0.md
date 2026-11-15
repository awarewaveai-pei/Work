# codex-oracle review -- 2026-11-15 12:16:08 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: VD.10 round 2. Round-1 fixes (122e58d8): subtitle files live under their own prefix video/subtitles/<org>/<video sha>.srt|.vtt, outside the workbench orphan sweep (lib/content/video/workbench-sweep.ts deletes unreferenced objects only under video/workbench/), with a guard refusing any key that would not land there; SRT and VTT are put in parallel with 20 s each so the workbench's 60 s request limit covers them plus the DB/QA work.
- exit: 0 | elapsed: 159308ms | answer: 1331B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 「下載 SRT／VTT」連結不會觸發一鍵下載
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx:197
  confidence  -> CONFIRMED
  scenario    -> 操作者在 app 頁面點字幕連結 → 連結直指跨來源的 R2 網址；瀏覽器忽略 `download` 屬性，開啟文字檔而非下載。既有 `lib/storage/download-href.ts:1-4` 與同源下載路由 `app/api/tools/designs/download/route.ts:11-15` 已明確處理此情況。
  why missed  -> 測試只驗證 metadata 中的網址，沒有驗證瀏覽器下載行為。

FINDING 2: 刪除影片後，公開字幕檔永久留在 R2
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/video/workbench/assets/release-text/route.ts:84
  confidence  -> CONFIRMED
  scenario    -> 已產生字幕的影片經 `app/api/video/[id]/route.ts:59-69` 刪除 → 刪除器 `lib/storage/r2.ts:354` 只清 `video/workbench/<org>/` 等影片前綴，字幕位於 `video/subtitles/<org>/`；孤兒清理也只掃 `video/workbench/`（`lib/content/video/workbench-sweep.ts:12`）。SRT／VTT 留在公開 bucket，且 DB 連結已消失。
  why missed  -> 修正聚焦於避免孤兒清理誤刪字幕，沒有追查影片正常刪除流程。

TOTAL: 2 findings
