# codex-oracle review -- 2026-11-26 00:35:56 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: not a fix. Operator disliked the horizontally scrolling system x layer table on /ops/systems/blocks. Page re-laid out as three link tabs (?view=systems default | blocks | diagram): systems = one card per system (name, status, completion, wrapping per-layer chips linking to the filtered list, expandable full block list); blocks = numbered list unchanged; diagram = stack diagram. usageMatrix and LAYER_NAME removed as unused.
- exit: 0 | elapsed: 72044ms | answer: 631B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/__tests__/blocks.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/systems/blocks.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 既有的積木清單連結會開到錯誤分頁
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/systems/blocks/page.tsx:224`
  confidence  -> CONFIRMED
  scenario    -> 系統詳情頁仍以 `?sys=<slug>#list` 連到積木目錄（`[slug]/page.tsx:42`）。新頁面在沒有 `view` 時選擇 `systems`，而清單只在 `view=blocks` 時顯示（`page.tsx:272`）；使用者點「在積木目錄看詳細」後，看不到該系統篩選後的清單。
  why missed  -> 改動只更新了本頁產生的連結，沒有檢查其他頁面既有的入口。

TOTAL: 1 findings