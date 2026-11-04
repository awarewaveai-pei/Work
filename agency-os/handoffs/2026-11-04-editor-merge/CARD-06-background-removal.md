# CARD-06 去背面板聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, shipped on both. Read both implementations in full before writing. Follow CARD-01..05 patterns.

## Files (read whole; re-locate by name)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — panel `filters` 濾鏡 / 去背 / 效果 (~L2414–2454): read which buttons are 去背 (AI remove-bg call to `/api/tools/studio/remove-bg`, any colour-key removal) vs effects (`buildEffectFilters`) vs presets (presets moved to 調色 in CARD-05); `edge-mask` 邊緣遮罩 (~L2539) only if it is background-removal related (read it; if it is an edge style, leave it).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — blocks `bg-remove` 去白底 / 去背 (~L1302: 要去除的顏色, 容差, 去除此色 → 透明, 還原) and `ai-bg` AI 去背（雲端）(~L1416: POST `/api/tools/studio/remove-bg`, replaces the image, keeps transform).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.ts` — request/response shape, auth/role header it expects, size limit.

## Union to deliver (both sides, ONE panel「🪄 去背」)
1. 去除指定顏色 → 透明: colour picker + 💧 從圖片吸色 + 容差 slider (vector `bg-remove`, Fabric `RemoveColor` filter exists in v5 and v7) → canvas.
2. AI 去背（雲端）: same request on both (same headers incl. role header like CARD-03's save — read what remove-bg requires; vector's current call sends no role header: fix that if the route needs it), same busy/failed/succeeded messages, image replaced in place keeping left/top/scale/angle/flip/name/lock, one undo step.
3. 還原 (undo the last background removal on that image, without touching other edits — store the pre-removal source on the image like canvas `edgeOriginal` / vector `_originalElement`, carried through save/load via the CARD-02 `toObject` wrap if it is a data URL; if too large to persist, say so in RISKS).
4. Disabled with a hint when the selection is not an image.
- Size guard: images sent to remove-bg stay under the route's limit (reuse CARD-03's shrink approach if the route has a cap).
- Remove the duplicate blocks/buttons (vector `bg-remove` + `ai-bg` blocks; canvas 去背 buttons inside `filters`) — the merged panel is the only place. Remaining non-去背 content of canvas `filters` (effects) stays where it is. Update `lib/content/blocks/registry.ts` / block counts.

## Constraints
- No new npm deps; no new CDN tags. Do not touch other panels.
- `npx tsc --noEmit` green; SRI green; route tests `npx vitest run app/api/tools/studio` green.
- Real test: dev server 3904 (no Supabase → AI route may 401/503: stub `fetch` for `/api/tools/studio/remove-bg` in the page with a known PNG response and assert the request body/headers and the in-place replacement); `tests/e2e/editor-merge/card-06-background-removal.mjs`: colour-key removal on a generated white-background PNG on both sides → assert corner alpha 0 and centre alpha 255 in the exported PNG; 還原 restores alpha; undo/redo; save/load; screenshots `card-06-{canvas,vector}.png`. Rerun card-01..05 e2e for regression. Kill the server.
- Commit nothing. 回報操作者一律繁體中文（the main session relays）; report block terse English.

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
TESTS: tsc <exit> | sri <exit> | vitest studio <exit> | e2e card-06 <exit> (<n>/<n>) | regression card-01..05 <exits> | screenshots <paths>
UNION_CHECK: <item 1–4> canvas=<ok|NA reason> vector=<ok|NA reason> …
REMOVED: <duplicate panels/blocks removed>
RISKS: <one line>|none
