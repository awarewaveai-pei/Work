# codex-oracle review -- 2026-10-26 22:10:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/qa/reports/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-findings-summary.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-findings-summary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/QaStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/pexels.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/pexels-exclude.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Video tool fixes: QA reports API returns failed reports with summarized findings and QaStep shows reasons; Pexels regenerate excludes the old asset and regenerates/uploads every draft format; ScriptForge preview modal scrolls and has a reachable close; video-service blackdetect uses pic_th/pix_th correctly; compose passes MEDIA_TRANSCRIBE_* to next-admin.
- exit: 0 | elapsed: 304052ms | answer: 2439B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/QaStep.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ReleaseDeliveryPanel.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/ScriptForge.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/video/VideoStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/qa/reports/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/video-pipeline.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/pexels.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_output_meta_qa.py, lobster-factory/infra/hetzner-phase1-core/docker-compose.yml, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/pexels-exclude.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/__tests__/qa-findings-summary.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-findings-summary.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 部分比例重生失敗時，仍在使用的上傳素材會被刪除  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/video/regenerate-image/route.ts:80  
  confidence  -> CONFIRMED  
  scenario    -> 使用者上傳一張圖後，`VideoStudio.tsx:589` 讓所有比例共用同一個 R2 URL。接著同時重生各比例；一個請求成功便刪除該舊圖，另一個請求失敗則依 `VideoStudio.tsx:554` 保留舊 URL。失敗比例因此指向已刪除的素材，預覽與渲染會失敗。  
  why missed  -> 重生請求各自處理清理，沒有檢查其他比例是否仍引用同一物件。

FINDING 2: 一般 next-admin 部署不會套用新增的字幕環境變數映射  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:512  
  confidence  -> CONFIRMED  
  scenario    -> 只透過正常的 `sg-deploy.sh` 部署此變更時，腳本在 `scripts/sg-deploy.sh:286-307` 只同步 `apps/<APP>`，主機的 compose 不會更新。即使主機 `.env` 有三個值，next-admin 容器仍收不到它們，字幕 dispatch 繼續回 `transcription_worker_not_configured` 503。  
  why missed  -> repo 的 compose 已改好，但部署腳本使用主機本地的 compose。

FINDING 3: 技術 QA 硬失敗不會進入新的 failed-report 顯示路徑  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py:263  
  confidence  -> CONFIRMED  
  scenario    -> 成片音量為 −35 LUFS 時，`quality.py:83-84` 產生 failed finding；worker 隨即在此處拋錯。`finalize.ts:101-108` 只在渲染成功後寫入技術 QA，因此沒有候選資產與 failed report 可供 QA 頁顯示具體原因。  
  why missed  -> API 已納入 `failed` 狀態，但上游在寫入報告前就中止了這類失敗。

FINDING 4: 字幕 QA 失敗仍不顯示原因  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/video/qa-findings-summary.ts:28  
  confidence  -> CONFIRMED  
  scenario    -> 字幕缺少片段時，`caption-qa-persistence.ts:22-29` 把 `segments_missing` 存在 `report_json.violations` 並標為 failed。摘要器只讀 `findings` 與格式內的 findings，回傳空陣列；QaStep 只顯示「未通過」，沒有原因。  
  why missed  -> 摘要器按編輯、版權與技術報告的形狀實作，漏了字幕報告的 `violations`。

TOTAL: 4 findings
