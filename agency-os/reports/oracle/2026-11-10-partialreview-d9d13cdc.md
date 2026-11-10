# codex-oracle review -- 2026-11-10 17:22:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/index.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video-ui.cjs, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Video 聲音 setting now matches the model: each video model row carries audio (Omni true; Replicate models false via video-motion-models.ts) and a first-time-user note; choosing 靜音/有聲 switches to the first available model of that kind; picking a model sets the chip; server refuses 靜音 with a model that has sound (old 有聲 drafts with silent models still run as before).
- exit: 0 | elapsed: 172290ms | answer: 599B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/video-motion-models.ts, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/gemini-video.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/index.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/replicate-video-ui.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 已停用的模型仍會讓對應的聲音按鈕顯示可用
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js:104
  confidence  -> CONFIRMED
  scenario    -> 草稿選了 Gemini Omni，之後移除 Gemini 金鑰、保留 Replicate 金鑰；載入草稿後「有聲」仍可點。點擊不會換模型或提示沒有可用的有聲模型，送出時才因模型缺少金鑰失敗。
  why missed  -> 新增的切換測試同時提供兩種金鑰，未涵蓋已儲存模型變為 `available:false` 的情況。

TOTAL: 1 findings
