# CARD-03 匯出／專案存讀面板聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, shipped on both. Read both implementations in full before writing. CARD-01 (text) and CARD-02 (layers) patterns apply.

## Files (read whole)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — export panel `id="export"` (~L1818–1840), `editName`/`nameRef` L143, `exportPng` (~L1570: full-DPI render + 匯出透明底), `download` L1600, `saveToDesigns` L1616 (POST `/api/tools/designs` with `roleHeader("operator")` — read `lib/` for `roleHeader`), `downloadWebP` L1712 (≤200KB auto-quality), `exportDesign` L1373 / `importDesign` L1388 (`.design.json` = `{json, meta?}` — read the exact shape).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — `7. 匯出` (L329–334) and `8. 檢視 / 專案存讀` (L336–349); `withRealCoords` L703, `withTransparent` (~L700), `exportSvg` L707, `exportPng` L712, `exportPdf` L716 (jsPDF 2.5.1 + svg2pdf.js 2.2.3 from pinned CDN tags in `<head>`), `saveProj` L1010 / `loadProj` L1014 (project json shape — read it), zoom controls L994–995.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/designs/route.ts` — what 存入 My Designs accepts (image dataURL, prompt, modelName, source).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/package.json` — current deps.

## Union to deliver (both sides end with ALL of these)
1. 檔名 input (canvas has `editName`; vector gets one, default `design-<yyyymmdd-hhmm>`), used by every download below.
2. PNG（真實 DPI）；WebP（≤200KB 自動壓）；SVG（向量，真實 cm viewBox as vector does）；PDF（向量·印刷·真實 cm）.
   - Canvas side PDF/SVG: `canvas.toSVG` exists on fabric v7; PDF needs `jspdf` + `svg2pdf.js` → ADD them as npm deps in `apps/next-admin` pinned to the same versions the html already uses from CDN (`jspdf@2.5.1`, `svg2pdf.js@2.2.3`), loaded with dynamic `import()` on click only (no bundle growth for other pages). This is the one allowed new dependency in this card.
   - Vector side WebP: port canvas's `downloadWebP` quality loop (canvas.toBlob loop until ≤200KB).
3. 存入 My Designs on both: vector-editor.html runs same-origin inside the logged-in app, so `fetch("/api/tools/designs", {method:"POST", credentials:"same-origin", headers:{...roleHeader}})` works — read how `roleHeader("operator")` builds its header and replicate the header literally (no import possible in the html). Show 已存入 / 儲存失敗 state like canvas.
4. 專案存讀: canvas `.design.json` export/import and vector `儲存專案 (.json)` / `讀取專案` become ONE format: `{ "format": "awarewave-design/1", "json": <fabric toJSON incl. name + background>, "meta": { wv,hv,unit,dpi,bgColor,transparent } }`. Both sides write this and read BOTH this and their own old shape (backward compatible; keep loading the old files).
5. 匯出透明底 is already in 畫布尺寸 on both sides — every export above must honour it (canvas `exportPng` does; make SVG/PDF/WebP honour it too; vector already wraps with `withTransparent`).
6. 檢視 zoom controls (vector 8.: −／符合／＋／100%) → canvas gets the same four buttons in its export panel header or a small row above the panels (read how canvas zooms: `relayoutCanvas`, `dispScale`; 100% = zoom 1 with real px). Vector keeps them.

## Constraints
- Only `jspdf` + `svg2pdf.js` may be added to package.json (exact versions above). No new CDN tags in the html (T23 SRI).
- Keep panel look. Do not touch text / layers / 畫布尺寸 panels beyond reading `exportTransparent`/`bgColor`.
- `npx tsc --noEmit` green; `npx vitest run lib/security/__tests__/public-html-sri.test.ts` green; `npm test` in `apps/next-admin` must stay green (sg-deploy runs it as the deploy gate) — run the designs route tests at least: `npx vitest run app/api/tools/designs`.
- Real test: dev server 3904 as before; Playwright script `tests/e2e/editor-merge/card-03-export-panel.mjs`: on each side add a text + a rect, download PNG/WebP/SVG/PDF (assert file size > 0 and PDF starts with `%PDF`, SVG contains `<svg`), save project json, reload page, load it back, assert object count and `meta` restored; screenshots `card-03-{canvas,vector}.png`. 存入 My Designs: assert the POST body shape against the route's validation (the dev server has no DB — a 503/500 from the route is acceptable for that step; assert the request was sent with the role header). Kill the server when done.
- Commit nothing. 回報操作者一律繁體中文（the main session relays）; report block terse English.

## Acceptance
- Both panels show 1–6; downloads verified by file content; project round-trip verified; tsc/SRI/route tests green.

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
DEPS: <added npm packages with versions>|none
TESTS: tsc <exit> | sri <exit> | vitest designs <exit> | e2e <script path> <exit> (<n>/<n>) | screenshots <paths>
UNION_CHECK: <control> canvas=<ok|NA reason> vector=<ok|NA reason> … (one per item 1–6)
RISKS: <one line>|none
