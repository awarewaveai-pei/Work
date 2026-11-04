# CARD-04 物件外觀／效果聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, shipped on both. Read both implementations in full before writing. CARD-01..03 are committed (2afcc6113, 844bd73b8, 923dd507a); follow their patterns (canvas `SidebarPanel` + `btn-secondary`; vector `<details>`, `.ghost`/`.act`, `snapshot()` per change, `markDirty()` for save state, `isLocked()` for programmatic moves).

## Files (read whole; line numbers are approximate, re-locate by name)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — panel `id="effects"` (~L2232–2282): 透明度, 混合模式, ↔/↕ 翻轉, 陰影 (`toggleShadow`, `objShadow`), 描邊 (`objStrokeColor`/`objStrokeWidth`), 🌈 漸層填色 (`applyGradient` ~L1190), 遮罩 ⬤/▢/無 (`applyClip` ~L657); helpers `setActiveProp` ~L616, `flipActive` ~L625; selection sync in `syncFromSelection` / selection:created handler (opacity/blend/shadow/stroke read-back).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — `3. 外觀（選中物件）` (~L207–240): 填色, 描邊色, 描邊寬度, 圓角, 不透明度, ⊘ 無填色, 💧 吸色, 虛線＋間距, 漸層 2/3 色＋線性/放射＋角度, 色票 swatches; block `obj-fx` 物件效果 (~L1276: 混合模式, 效果類型 shadow/glow…, 顏色, 模糊, 位移); `nextStyle` default-for-next semantics; `syncProps`.

## Union to deliver (both sides end with ALL of these, in ONE panel named「🎨 外觀 / 物件效果」)
1. 填色 colour + ⊘ 無填色 + 💧 吸色 (EyeDropper API where available; hide the button when `!("EyeDropper" in window)`) + 色票 (vector's swatch list).
2. 描邊色 + 描邊寬度 0–40 + 虛線 on/off + 虛線長度.
3. 圓角（矩形 rx/ry）.
4. 不透明度 0–100 + 混合模式 (same option list on both: union of both lists).
5. 漸層填色: 2 or 3 stops, 線性/放射, angle → / ↓ / ↘ / ↙, 套用 + 清除 (canvas's one-click 🌈 becomes this full control).
6. 效果: none / 陰影 / 外光暈 (whatever vector `obj-fx` offers) with colour, 模糊, 位移 (canvas's 陰影 checkbox becomes this).
7. 翻轉 ↔ ↕ (both already have flip somewhere; put it in this panel too, keep toolbar buttons).
8. 遮罩 圓形 / 圓角 / 無 (canvas `applyClip`) → vector gets it (Fabric 5 `clipPath` with `absolutePositioned:false`).
9. Default-for-next: with nothing selected, controls set the style of the next new shape (vector `nextStyle`; canvas: add the same — `addShape` reads it).
10. Selection sync: selecting an object fills every control with its values on both sides.
- Vector's `obj-fx` block and canvas's old effects panel are replaced by the merged panel (remove the duplicates; don't leave two panels doing the same thing). Vector block registry entry for `obj-fx` is removed; check `lib/content/blocks/registry.ts` and any block count text (「14 積木」 etc.) and update them.

## Constraints
- No new npm deps; no new CDN tags (T23 SRI test). Do not touch text / layers / 畫布尺寸 / 匯出 panels.
- Every control change on a selected object: one undo step (debounce sliders like CanvasEditor `applyTextStyle`), save state resets (canvas `setSaveState("idle")`, vector `markDirty()`), locked objects (`lockMovementX`) still get style changes (style ≠ move).
- `npx tsc --noEmit` green; `npx vitest run lib/security/__tests__/public-html-sri.test.ts` green; if `registry.ts` changes run its tests (`npx vitest run lib/content/blocks`).
- Real test: `node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904`; script `tests/e2e/editor-merge/card-04-object-effects.mjs` (reuse the card-03 harness); on each side add rect + circle + text, exercise every item 1–10 and read the real object props after each (fill, stroke, strokeDashArray, rx, opacity, globalCompositeOperation, fill gradient colorStops/type, shadow, flipX/Y, clipPath); one undo per change; screenshots `agency-os/reports/e2e/2026-11-04/editor-merge/card-04-{canvas,vector}.png`. Kill the server. Then rerun card-01/02/03 e2e to prove no regression.
- Commit nothing. 回報操作者一律繁體中文（the main session relays）; report block terse English.

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
TESTS: tsc <exit> | sri <exit> | e2e card-04 <exit> (<n>/<n>) | regression card-01/02/03 <exits> | screenshots <paths>
UNION_CHECK: <item 1–10> canvas=<ok|NA reason> vector=<ok|NA reason> …
REMOVED: <duplicate panels/blocks removed>
RISKS: <one line>|none
