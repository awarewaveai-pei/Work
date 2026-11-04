# codex-oracle review -- 2026-11-04 14:19:36 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/vector-editor/page.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: vector-editor restyled to match /tools/canvas: public/vector-editor.html theme tokens + layout + theme bridge from parent html; page.tsx drops topbar
- exit: 0 | elapsed: 142283ms | answer: 1207B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/vector-editor/page.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 儲存的 Source Serif 4 主題字體在向量編輯器中會退回替代字體  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:98  
  confidence  -> CONFIRMED  
  scenario    -> 將全站字體設為 Source Serif 4 → bridge 只複製字體名稱；父頁載入的字體樣式不會跨 iframe 生效，而編輯器自己的字體清單也未載入 Source Serif 4 → 編輯器顯示 Georgia，與 `/tools/canvas` 不同。  
  why missed  -> 複製 CSS token 看似完成主題同步，但字體檔的載入屬於另一份文件的依賴。

FINDING 2: 畫布移到左側後，在 1280px 視窗會伸入右側工具欄  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:38  
  confidence  -> CONFIRMED  
  scenario    -> 1280px 視窗、預設 9 × 5.4cm 畫布 → 扣除 248px 主側欄、頁面留白及 300px 工具欄後，工作區約 688px；畫布預覽仍固定為 720px，且未隨工作區縮小 → 畫布右緣伸入工具欄約 20px。  
  why missed  -> 版面順序改了，但既有畫布縮放只依設計尺寸計算，未依工作區寬度計算。

TOTAL: 2 findings
