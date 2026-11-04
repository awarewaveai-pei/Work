# CARD-05 調色面板聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, shipped on both. Read both implementations in full before writing. Follow CARD-01..04 patterns.

## Files (read whole; re-locate by name)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — panels `grade` 調色/色階 Levels (~L2283), `adjust` 調整 Adjustments (~L2291: 自動對比/色彩/色調 + sliders), `cameraraw` Camera RAW 效果 (~L2316), `hslmixer` 色彩混合器 HSL (~L2336), the preset-filter part of `filters` (~L2414, `PRESET_FILTERS`); functions `autoContrast`/`autoColor`/`autoTone` (~L1796–1900), the effect that rebuilds image filters (`buildFabricImageFilters(ns, grade.params)` ~L526), `resetAdjToNeutral`, per-image `adj` custom property.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/fabric-filters.ts` (328 lines) — `buildFabricImageFilters`, `buildPresetFilters`, `buildEffectFilters`, `PRESET_FILTERS`, `buildHslMixerFilter`, `HSL_RANGES`.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/color-grade.ts` (332 lines) and `components/tools/ColorGradePanel.tsx` (143 lines) — Levels black/white/gamma, colour balance 青↔紅 / 洋紅↔綠 / 黃↔藍, 亮度/飽和/色相/銳利化.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — block `adjust` 調色 / 修圖（選圖片）(~L1232: 預設風格 row, 亮度, 對比, 飽和, 色相, 色溫, 銳利, 雜訊, 重設). Fabric 5.3 (`fabric.Image.filters.*`) vs canvas fabric v7 (`filters.*`): most filter classes exist in both; custom ones (HSL mixer etc.) need a Fabric 5 `fabric.util.createClass(fabric.Image.filters.BaseFilter, …)` port.

## Union to deliver (both sides, ONE panel「🎨 調色」with collapsible sub-sections)
1. 預設風格 presets: union of canvas `PRESET_FILTERS` and vector preset row (same names → one entry).
2. 自動對比 / 自動色彩 / 自動色調 (canvas) → vector.
3. Levels 黑點 / 白點 / 中間調 Gamma (canvas) → vector.
4. 色彩平衡 青↔紅 / 洋紅↔綠 / 黃↔藍 (canvas) → vector.
5. 亮度 / 對比 / 飽和 / 色相 / 色溫 / 銳利 / 雜訊 (union of both slider sets; same ranges both sides).
6. Camera RAW 效果 (canvas: read every control in that panel) → vector.
7. HSL 色彩混合器 per-range hue/sat/lightness (canvas) → vector.
8. 重設 (all to neutral) + per-image persistence: settings stored on the image (`adj` on canvas; vector: same key `adj`, carried by the CARD-02 `toObject` wrap — add `adj` to LAYER_PROPS) so undo/redo, project save/load and cross-editor load keep them; selecting an image fills the controls; non-image selection disables them with a hint (canvas `imageToolHint`).
- **Same numbers, same picture**: one source of truth for the math. Put the pure pixel/param math in ONE plain ES module under `public/editor-shared/color-grade.js` (no build step, no CDN; loaded by vector via `<script type="module">` same-origin, which the SRI test ignores because it is not external — confirm by reading `lib/security/public-html-sri.ts`), and make canvas import the same logic (either import that file via a TS wrapper with `// @ts-check`-style typing, or keep `lib/studio/color-grade.ts` as the SSOT and generate/copy — pick one, state it in RISKS, and add a vitest that fails if the two drift (e.g. same inputs → same filter matrices)).
- Remove the now-duplicate panels/blocks (vector `adjust` block; canvas `grade`/`adjust`/`cameraraw`/`hslmixer` become sub-sections of the one panel). Update `lib/content/blocks/registry.ts` / block counts if they list `adjust`.

## Constraints
- No new npm deps; no new external CDN tags. Do not touch text / layers / 畫布尺寸 / 匯出 / 外觀 panels.
- Slider changes: one debounced undo step; `setSaveState("idle")` / `markDirty()`.
- `npx tsc --noEmit` green; SRI test green; `npx vitest run lib/studio app/\(shell\)/tools/canvas lib/content/blocks` green; new drift test green.
- Real test: dev server 3904; `tests/e2e/editor-merge/card-05-color-grade.mjs`: put the same test image on both sides (generate a gradient PNG in the script), apply the same settings for each item 1–8, export PNG on each side, and assert the average RGB of the two exports is within ±3 per channel for every item (this proves both editors produce the same picture); undo restores; save/load keeps `adj`; screenshots `card-05-{canvas,vector}.png`. Rerun card-01..04 e2e for regression. Kill the server.
- Commit nothing. 回報操作者一律繁體中文（the main session relays）; report block terse English.

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
SSOT: <where the colour math lives and how the other side uses it>
TESTS: tsc <exit> | sri <exit> | vitest <exit> (<n>) | drift-test <path> <exit> | e2e card-05 <exit> (<n>/<n>) | regression card-01..04 <exits> | screenshots <paths>
UNION_CHECK: <item 1–8> canvas=<ok|NA reason> vector=<ok|NA reason> …
REMOVED: <duplicate panels/blocks removed>
RISKS: <one line>|none
