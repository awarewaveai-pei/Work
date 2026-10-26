# codex-oracle review -- 2026-10-26 22:20:09 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/qa/reports/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-findings-summary.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-findings-summary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/QaStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/pexels.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/pexels-exclude.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Second round after fixing round-1 findings (shared uploaded asset no longer deleted via deleteOld:false; caption violations summarized). Video tool fixes: QA reports API returns failed reports with summarized findings and QaStep shows reasons; Pexels regenerate excludes the old asset and regenerates/uploads every draft format; ScriptForge preview modal scrolls and has a reachable close; video-service blackdetect uses pic_th/pix_th correctly; compose passes MEDIA_TRANSCRIBE_* to next-admin.
- exit: 0 | elapsed: 392686ms | answer: 1189B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/QaStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/qa/reports/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/pexels.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/pexels-exclude.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-findings-summary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-findings-summary.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 正常部署不會讓 next-admin 取得新增的 Whisper 環境變數
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:512
  confidence  -> CONFIRMED
  scenario    -> 主機 `.env` 已有三個值，但只執行 `sg-deploy.sh next-admin`；該腳本只同步 `apps/` 原始碼（scripts/sg-deploy.sh:286-307），仍使用主機本地 Compose。若本地 Compose 未另行套用此變更，容器收不到變數，字幕派工仍回 503。
  why missed  -> diff 中的 Compose 已接線，但實際部署使用另一份本地檔。

FINDING 2: 硬性失敗的技術 QA 不會產生可供新 API 顯示的報告
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/qa/reports/route.ts:25
  confidence  -> CONFIRMED
  scenario    -> 成片音量超過標準時，`quality.py:83-85` 判為 failed；`server.py:263-265` 隨即拋錯，工作變成 error。`finalize.ts:68-108` 只在 done 時寫入技術 QA，因此沒有 failed 報告列；QA 步驟無法顯示失敗原因。
  why missed  -> 新測試驗證報告摘要與查詢，未涵蓋工作服務產生並持久化失敗報告的路徑。

TOTAL: 2 findings
