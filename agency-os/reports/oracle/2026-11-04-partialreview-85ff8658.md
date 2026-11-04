# codex-oracle review -- 2026-11-04 15:17:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/FontLibrary.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CARD-01 text panel union written by an SDK worker: Canvas Editor and Vector Editor both get text input+add, searchable Google Fonts preview list with presets + upload, text colour, size range+number, B/I/U, align, charSpacing, lineHeight, arc on/off, apply-to-selected vs default-for-next, sync on selection
- exit: 0 | elapsed: 145694ms | answer: 1167B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/FontLibrary.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 視窗縮放會覆蓋使用者設定的下一個文字字級
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:392
  confidence  -> CONFIRMED
  scenario    -> 未選取物件時將字級設為 24，接著縮放視窗；resize 會呼叫 `applyCanvas()`，把 `nextText.size` 改成畫布高度的 8%，下一次加字不再是 24。
  why missed  -> 改動把畫布重排時更新顯示值的舊邏輯，擴大成更新文字預設值；依賴的 resize 呼叫位於別處。

FINDING 2: Canvas Editor 新增的文字排版修改無法單獨復原
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx:2013
  confidence  -> CONFIRMED
  scenario    -> 加入文字後調整字距，再按「復原」；字距變更沒有建立快照，復原會移除整個文字物件，而非還原字距。行距與對齊也走相同的未記錄路徑。
  why missed  -> 控制項會立即重繪，看起來已套用；既有快照只由物件新增、移除或 `object:modified` 事件建立，這些 `set()` 呼叫不觸發該事件。

TOTAL: 2 findings
