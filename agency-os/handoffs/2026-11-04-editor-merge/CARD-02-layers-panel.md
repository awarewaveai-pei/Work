# CARD-02 圖層面板聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, shipped on both. Read both implementations in full before writing. CARD-01 (text) is already merged and committed; follow the same patterns (`nextText`/`setText` on vector, `SidebarPanel` + `btn-secondary` on canvas).

## Files (read whole)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — layers panel `id="layers"` (~L1961–1980), `refreshLayers` L622, `selectLayer` L689, `toggleLayerVisible` L695, `moveLayer` L704, `duplicateLayer` L716, `deleteLayer` L731, `renameLayer` L740, `toggleLock` L1130 (lives in 更多工具 panel), `groupSelection` L1185, `ungroupSelection` L1211, the `name` custom property (customProperties, ~L227).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — section `6. 圖層` (L325–327), `renderLayers` (L627–~660, rows `.lyr` with `.ic` buttons), toolbar handlers L602–L620 (`btn-front`/`btn-back`/`btn-del`/`btn-dup`/`btn-group`/`btn-ungroup`), `snapshot()`/`undo` (~L380–395). Fabric 5.3 (CDN) vs fabric v7 (npm) on canvas: `bringToFront/sendToBack` are v5 methods; v7 uses `canvas.bringObjectToFront(o)` etc. — read what canvas already calls in `moveLayer`.

## Union to deliver (both sides end with ALL of these)
1. Layer list, top layer first, one row per object: 👁 show/hide, 🔒 lock/unlock (lockMovementX/Y + lockScaling + lockRotation + `selectable`, as canvas `toggleLock` does), name (click = select, double-click = rename; vector gets rename via `name` custom prop persisted in `toJSON` — Fabric 5: `toObject` override or `canvas.toJSON(['name'])` at every save/snapshot call site), ↑ ↓ (one step), ⤒ ⤓ (to front / to back), ⧉ duplicate, 🗑 delete.
2. Row label = `name` if set, else type label (canvas `layerLabel`; vector: same scheme: 文字→first 12 chars, 圖片→圖片, 群組→群組(N), shape type in Chinese).
3. Selected object(s) highlighted in the list; selecting on the canvas scrolls/highlights the row; multi-select shows every selected row highlighted.
4. 群組 / 解散 buttons at the top of the layers panel on both sides (canvas currently shows them only in 更多工具 when multi-selected: keep that AND add them here; vector keeps toolbar buttons AND adds them here). 解散 enabled only when a group is selected.
5. Hidden objects stay in the list dimmed (opacity .45) and are skipped by 全選 / export as they are now.
6. Every list action that changes the document records an undo step (`snapshot()` on vector; canvas fires object events already — verify delete/visible/lock/rename each produce an undo entry; add `snapshot()` where they don't).

## Constraints
- No new npm deps; no new CDN tags (T23 SRI test). Keep panel look (canvas `SidebarPanel`; vector `<details>`, `.ghost`, `.lyr` rows).
- Do not touch text / 畫布尺寸 panels. Do not re-layout anything else.
- `npx tsc --noEmit` green in `apps/next-admin`; `npx vitest run lib/security/__tests__/public-html-sri.test.ts` green after editing the html.
- Real test like CARD-01: dev server `node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904`, Playwright script at `lobster-factory/infra/hetzner-phase1-core/tests/e2e/editor-merge/card-02-layers-panel.mjs` (copy the CARD-01 script's harness), add 3 objects on each side, exercise every control in 1–6 and read the real object props / stack order after each action (canvas: exported .design.json or `window` probe you add behind `process.env.NODE_ENV!=="production"`; vector: the `canvas` global via `page.evaluate`). Screenshots to `agency-os/reports/e2e/2026-11-04/editor-merge/card-02-{canvas,vector}.png`. Kill the server when done.
- Commit nothing. Leave the working tree edited; the main session reviews the diff, runs Codex, commits.
- 回報操作者一律繁體中文（the main session relays）; the report block stays terse English.

## Acceptance
- Both panels show every control in 1–6; every action verified by reading object props / stack order, not screenshots alone. tsc 0, SRI green, no page errors (dev-only supabase/503 noise excluded).

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
TESTS: tsc <exit> | sri <exit> | e2e <script path> <exit> (<n>/<n> checks) | screenshots <paths>
UNION_CHECK: <control> canvas=<ok|NA reason> vector=<ok|NA reason> … (one per item 1–6)
RISKS: <one line>|none
