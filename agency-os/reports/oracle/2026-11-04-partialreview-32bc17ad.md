# codex-oracle review -- 2026-11-04 15:51:16 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: CARD-03 export/project union by an SDK worker: file name, PNG/WebP/SVG/PDF on both editors (canvas adds jspdf+svg2pdf.js via dynamic import), 存入 My Designs from the vector iframe (same-origin POST with role header), one awarewave-design/1 project format read+write with old-shape fallback, transparent export honoured everywhere, zoom row on canvas
- exit: 0 | elapsed: 198552ms | answer: 1596B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 高解析度設計無法存入 My Designs  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:825  
  confidence  -> CONFIRMED  
  scenario    -> 向量編輯器中的全尺寸 PNG 資料網址超過 12,000,000 字元時，新增的存入功能直接送出原圖；API 在 `app/api/tools/designs/route.ts:164` 回傳 413，設計未儲存。  
  why missed  -> 編輯器改動之外的 API 大小上限沒有出現在 diff。

FINDING 2: 修改設計後，「已存入」按鈕仍可能鎖住  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:872  
  confidence  -> CONFIRMED  
  scenario    -> 儲存成功後改畫布底色（同檔 `:1064`）或透明底勾選值，不會觸發這裡監聽的物件事件；按鈕維持「已存入」且停用，修改無法再次儲存。儲存請求進行中修改物件也有同樣結果：同步時狀態仍是 `saving`，回應後被設為 `saved`。  
  why missed  -> 作者只把物件事件視為設計變更，漏了畫布設定及請求期間的變更。

FINDING 3: WebP 超過 200 KB 仍會宣告匯出成功  
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html:800  
  confidence  -> CONFIRMED  
  scenario    -> 複雜的大尺寸照片在品質降至 0.2 後仍超過 200 KB；迴圈停止，隨後照常下載並顯示成功，但按鈕標示承諾「≤200KB」。  
  why missed  -> 壓縮迴圈有品質下限，迴圈後沒有檢查最終檔案大小。

TOTAL: 3 findings
