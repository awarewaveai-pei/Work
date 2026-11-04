# CARD-01 文字面板聯集（Canvas Editor ⇄ Vector Editor）

Decision (operator 2026-11-04): every panel BOTH editors have becomes ONE complete union, and both editors ship that union. Read the code of both sides in full before writing; do not judge from screenshots.

## Files (read whole)
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/CanvasEditor.tsx` — text panel `id="text-style"` (~L1944–1985), `FONT_OPTIONS` (L65), `applyTextStyle` (L478), `toggleText` (L489), `applyTextArc` (L572), "更多字型（Google Fonts / 上傳）" block (~L1972).
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/vector-editor.html` — section `4. 文字` (L243–277), handlers L486 (`addText`), L479–480 (`syncProps` letter/line), L729 `GFONTS` list + `buildFontList` (L729–776), L891–893 (`data-talign`, `letterSp`, `lineH`). Standalone HTML + Fabric 5.3 via CDN; next-admin uses fabric v7 (npm). Same Fabric API family; v7 `charSpacing`/`lineHeight`/`textAlign` identical.
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/components/tools/SidebarPanel.tsx` — panel shell used by canvas.
- Theme/style contract: vector-editor.html `<style>` already mirrors globals.css tokens (`.act` = btn-primary, `.ghost` = btn-secondary). Keep it.

## Union to deliver (both sides must end with ALL of these)
1. 加文字 input + 按鈕（vector has; canvas has `addText` button only → add a text input beside it, default text 「你的文字」）。
2. 字型：canvas `FONT_OPTIONS` select + Google Fonts/upload；vector 搜尋列＋中文/英文/全部 filter＋每列「名稱小字＋樣式預覽大字」清單＋上傳字型檔。Union = the searchable preview list (vector's) on both sides, with canvas's current `FONT_OPTIONS` entries included at the top of the list. Upload `.ttf/.otf/.woff/.woff2` on both (FontFace API, as vector does).
3. 顏色 color（canvas）→ vector gets it inside the text panel too（vector currently uses the global fill picker; add a text-colour picker that sets `fill` on text objects only）。
4. 字級：number input（vector）＋ range 8–200（canvas）→ both: range + number side by side.
5. B / I / U（both）；對齊 靠左/置中/靠右（vector）→ canvas；字距 charSpacing range −100…800（vector）→ canvas；行距 lineHeight 0.8–3（vector）→ canvas；弧形文字 on/off（canvas `applyTextArc`）→ vector（Fabric 5: implement the same way canvas does it — read `applyTextArc` first; if it relies on v7-only API, implement an equivalent with `fabric.Path` + `path` text or document NA in RISKS）。
6. 「套用到選取文字 / 新文字預設」semantics (canvas): both sides: with a text selected → apply; nothing selected → set the default for the next text (vector already has `nextStyle` for fill/stroke; extend it for font/size/align/spacing).
7. Sync on selection: selecting a text object fills every control with its current values on both sides (vector `syncProps` already does part; canvas `applyTextStyle` path — check what it syncs).

## Constraints
- No new npm deps in next-admin. No new CDN tags in vector-editor.html (T23 SRI test `lib/security/__tests__/public-html-sri.test.ts` blocks unpinned/un-hashed tags).
- Keep panel look: canvas `SidebarPanel` + `btn-secondary`/`btn-primary` + `.form-input` classes; vector `<details>`/`summary`, `.ghost`/`.act`, `label` 12px.
- Do not re-layout anything outside the text panel. Do not touch 畫布尺寸 (already merged).
- `.ts/.tsx` touched → `npx tsc --noEmit` must be green (run in `apps/next-admin`). Run `npx vitest run lib/security/__tests__/public-html-sri.test.ts` after editing the html.
- Real test: start `node lobster-factory/infra/hetzner-phase1-core/tests/e2e/social/dev-server-no-supabase.mjs 3904` (port 3904; no Supabase needed), open http://localhost:3904/tools/canvas and /tools/vector-editor with Playwright (`npx playwright` is installed under lobster-factory/infra/hetzner-phase1-core/tests/e2e) or a headless Chromium script, add a text on each side, exercise every control in the union list, screenshot both panels to `agency-os/reports/e2e/2026-11-04/editor-merge/card-01-{canvas,vector}.png`. Kill the server when done.
- Commit nothing. Leave the working tree edited; the main session reviews the diff, runs Codex, commits.
- 回報操作者一律繁體中文（the main session relays）; the report block below stays terse English.

## Acceptance
- Both panels show the full union list above; every control changes the selected text object on its side (verified by reading the object's props after the action, not by screenshot alone).
- tsc exit 0; SRI test green; no console errors on either page during the test.

## Output (last message, nothing else)
FILES: <path> <+/- lines> …
TESTS: tsc <exit> | sri <exit> | e2e <script path> <exit> | screenshots <paths>
UNION_CHECK: <control> canvas=<ok|NA reason> vector=<ok|NA reason> … (one per control 1–7)
RISKS: <one line>|none
