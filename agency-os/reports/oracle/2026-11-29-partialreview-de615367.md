# codex-oracle review -- 2026-11-29 00:39:15 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Not a fix. Feature: a video run may carry more than one reference picture, limited per model by the vendor's own limit (Veo 3.1 = 3 as reference_images, 8 s only, sent instead of the first frame; Gemini Omni = 6 with task reference_to_video; Runway, Veo 3.1 Fast, Luma = 1). Second round after two findings: (1) generation-policy referenceList is now the one list validate counts and api.cjs sends, and a reference with no url is refused; (2) checkVideoImages refuses a second picture when referenceMode is first, in validate and in the run.
- exit: 0 | elapsed: 146473ms | answer: 647B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/__tests__/video-motion-models.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/replicate-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Veo 3.1 的多圖參考允許送出供應商不支援的 9:16 比例
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs:106
  confidence  -> CONFIRMED
  scenario    -> 選 Veo 3.1、兩張參考圖、8 秒、9:16；張數與時長檢查通過，比例也通過，但 [Replicate 的 Veo 3.1 說明](https://replicate.com/google/veo-3.1) 限制參考圖模式使用 16:9，任務因此送往供應商後才失敗。
  why missed  -> 新檢查只納入供應商的張數與時長限制；共用的 `vm.ratios` 仍列出兩種比例，沒有區分多圖模式。

TOTAL: 1 findings