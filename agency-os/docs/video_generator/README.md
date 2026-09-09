# Media Production LEGO Platform

**正式程式來源：** `origin/main`；最新影片 LEGO 交付為 `cde2f007c`（tenant release/asset boundary）。
**文件入口：** 本目錄；現有 Quick Engine 路徑保持相容，新功能以旗標與 additive migration 接入。

## 現行文件

- `CURRENT_BASELINE_AND_GAP_AUDIT.md`：已驗證的既有能力與缺口。
- `MEDIA_PRODUCTION_LEGO_PLATFORM_PLAN.md`：四個領域、Capability 契約與長期架構。
- `MEDIA_CAPABILITY_ADOPTION_AND_PROMOTION_CATALOG.md`：正式 LEGO ID 映射、別名隔離與 ACTIVE promotion packet。
- `MEDIA_PRODUCTION_LEGO_PHASED_DELIVERY_PLAN.md`：分期交付與驗收。
- `VIDEO_SYSTEM_GAP_AUDIT_2026-09-09.md`：逐項剩餘 runtime 缺口、file evidence 與啟用門檻。
- `PHASE_0_ISOLATION_AND_CHANGE_CONTROL.md`：隔離、備份與變更管制。
- `PHASE_2_ASSET_RELEASE_REFERENCE_CONTRACT.md`：既有素材、Timeline、Release 與安全刪除的資料契約及 migration gate。
- `PHASE_4_WHISPER_TRANSCRIPT_AND_CAPTION_CONTRACT.md`：本機 Whisper 轉錄、可校對字幕、審片與 Release 接線契約；目前仍需 worker 接線。
- `PHASE_4_MEDIA_QA_AND_RELEASE_GATE_CONTRACT.md`：技術／字幕／編輯／權利 QA 的證據、waiver 與 Release gate 契約；尚未執行媒體分析或阻擋發布。
- `PHASE_5_SHORT_DRAMA_AND_FOOTAGE_EDIT_CONTRACT.md`：短劇 Bible 與實拍 Edit Decision Plan 契約；VideoStudio 已有實拍 EDP 草稿 UI，renderer convergence 仍待完成。
- `PHASE_6_DELIVERY_OUTCOMES_AND_COMMERCIAL_CONTRACT.md`：WordPress、Postiz、成效回饋、自用／SaaS／企業 BYO API 的交付與治理契約；receipt/billing/outcome API 已在 code，啟用仍需 migration rehearsal。
- `LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md`：正式環境盤點與 staging 建置條件。
- `PHASE_1A_IMPLEMENTATION_RECEIPT.md`、`PHASE_1B_1_LIFECYCLE_CONTRACT_RECEIPT.md`、`PHASE_3A_TIMELINE_V1_CONTRACT_RECEIPT.md`：已整合至 `main`、尚未部署的程式交付。
- `PHASE_3B_TIMELINE_TO_REMOTION_COMPILER_RECEIPT.md`：Timeline→dynamic-slideshow 的 fail-closed 編譯器與 renderer 語意保留；已整合至 `main`，尚未接到出片路徑。
- PHASE_1B_2_DURABLE_JOB_SCHEMA_PACKAGE.md：把既有 video_jobs 演進為可恢復執行紀錄的 additive schema、驗收與 rollback 包；尚未建立 migration。
- PHASE_1B_4_RENDERER_ATTEMPT_PROTOCOL.md：renderer idempotency、private R2 receipt、restart reconciliation 與 no-double-render 驗收；尚未實作。
- `PHASE_1B_RENDERER_STAGING_REHEARSAL_RUNBOOK.md`：正式 renderer 的 staging canary、驗收與 rollback gate；尚未執行。
- `_handoff_2026-09-07/README.md`：歷史 Git bundle、雜湊與整合證據；原隔離分支已整合至 `2fb93f9dc`，本機 worktree 已退休，未部署。
- `LEGACY_REFERENCE_ADOPTION_MATRIX.md`：舊 P7 參考碼的採用與禁止清單。

## 封存文件

`_archive_legacy_p7_2026-09-06/` 儲存不再作為現行操作、設計或部署依據的 P7 單機原型文件。不得依據其中內容執行 Python、SQL、cron、直接 WordPress 發佈或直接社群發佈。

現行發布路徑是：WordPress 經 wp-bridge；社群經 Postiz；影片產物需經既有 VideoStudio 與後續 Release/QA 流程。
