# codex-oracle review -- 2026-11-12 23:51:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-agent.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/editor-agent-plan.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/tools.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-agent.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed13-agent.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.13 phase 1 (video-workbench 剪輯 Agent): new paid route POST /api/vw/editor/agent in PAID_ROUTES (video.script). One call to the existing text() entry (JSON mode) per message; answer = { reply, ops } checked by the shared validator shared/editor-agent-plan.js (whitelist of 22 tools, arg types/ranges, <=50 ops, unknown tool/field voids the plan); invalid = 502 so not charged (usage only on 2xx). Structure-only project summary. Browser floating window: send button priced by data-paid=video.script, one request at a time; plan runs on a copy first (any failing step = project unchanged), destructive threshold confirm (>3 clips or >30% length), then one edCheckpoint + edCommit so one Ctrl+Z undoes the round; propose_paid only opens the pane whose own priced button runs it. Phase 2 adds edAgentTools and the top-bar button in tools-editor.js; until then the window has no entry point. Design: docs/ed13-edit-agent-design-20261110.md
- exit: 0 | elapsed: 185247ms | answer: 1012B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/pages/tools.html, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-agent.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/editor-agent-plan.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-agent.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed13-agent.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新增的計費與驗證測試沒有進入部署閘。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs:6
  confidence  -> CONFIRMED
  scenario    -> `ed13-agent.cjs` 的扣點或無效清單測試失敗時，CI 與部署仍只執行第 6 行列出的測試，閘可顯示通過。
  why missed  -> 測試檔已新增，但部署閘使用手寫清單，沒有自動收錄新檔。

FINDING 2: 刪除確認框開啟期間的手動編輯會被 Agent 覆蓋。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-agent.js:99
  confidence  -> CONFIRMED
  scenario    -> Agent 的刪除清單觸發確認框；使用者在確認前修改同一專案。確認後第 99 行只檢查專案物件是否相同，第 101 行便用確認前建立的副本取代專案，手動修改消失。
  why missed  -> 程式處理了「切換專案」，但沒有處理同一專案在等待確認期間被修改。

TOTAL: 2 findings
