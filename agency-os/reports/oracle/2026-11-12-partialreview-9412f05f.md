# codex-oracle review -- 2026-11-12 23:45:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/editor-model.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/preview-parity.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.5.3/7.3/10.4: preview draws transitions curves, text animations, text box and 8 subtitle styles from shared EditorModel rules the export also uses; export output must stay byte-identical (golden passes)
- exit: 0 | elapsed: 217254ms | answer: 557B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/editor-export.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/editor-model.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/preview-parity.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 靠左／靠右文字的預覽位置與匯出位置不一致
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js:1651
  confidence  -> CONFIRMED
  scenario    -> 文字設為「靠左」、x=50 時，匯出的 ASS 以 x=50% 作為文字左緣；預覽固定用 `translate(-50%,-50%)`，把文字中心放在 x=50%，整行向左偏移半個字寬。靠右時方向相反。
  why missed  -> 新增的預覽一致性測試只建立置中文字，沒有覆蓋靠左或靠右。

TOTAL: 1 findings
