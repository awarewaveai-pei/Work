# codex-oracle review -- 2026-11-10 15:52:13 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-assets.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.4 card: rewrite of the editor left pane 素材 (scripts/editor-panes/assets.js) to match seedstar editor: 3 tabs, search, kind filter, used/unused groups, cards, favourites in preferences, split-audio, track-plus banner (edAssetsPickTrack). Globals ed*, edAdd, edProbe come from scripts/tools-editor.js. Look for correctness bugs, stale-state bugs, XSS, races.
- exit: 0 | elapsed: 178458ms | answer: 2353B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/editor-pane-assets.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The track ＋ button never opens the new asset pane picker.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:59
  confidence  -> CONFIRMED
  scenario    -> Click ＋ on A2 → `tools-editor.js:2243-2264` opens the existing modal directly; `edAssetsPickTrack` is never called, so the new banner and pane selection flow are unreachable through the UI.
  why missed  -> The new test invokes `edAssetsPickTrack` directly at `tests/ed4-assets.cjs:132`.

FINDING 2: Shared audio and sticker actions lose their requested media kind.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:158
  confidence  -> CONFIRMED
  scenario    -> Click 音訊 → 選擇音訊 (`audio.js:23`) → the picker shows all media; choosing an image adds it to the video track. Likewise, 貼圖 → 上傳透明 PNG (`stickers.js:110`) now accepts video and audio because the `upload:image` suffix is ignored at `assets.js:162-166`.
  why missed  -> The rewritten actions were checked from the 素材 pane, while their callers live in other panes.

FINDING 3: Pane uploads silently record owned assets as lacking rights confirmation.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:154
  confidence  -> CONFIRMED
  scenario    -> On a fresh page, upload an owned file from 素材 → this pane provides no rights checkbox, so `uploadAsset` sends `rightsConfirmed: false` (`shared/assets-ui.js:113`); the server stores that false value in the asset origin (`backend/api.cjs:79`).
  why missed  -> The former shared picker supplies the checkbox; the direct upload button bypasses it.

FINDING 4: The new test claims to check that upload leaves the timeline empty, but verifies the opposite.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs:42
  confidence  -> CONFIRMED
  scenario    -> Upload three files → `assets.js:129` adds all three clips; the test waits for `clips.length === 3` at line 48, then deletes them at line 49, so the advertised “not added to the timeline” check passes while that behavior is violated.
  why missed  -> Clearing the clips lets later card tests run, masking the upload behavior.

TOTAL: 4 findings
