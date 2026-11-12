# codex-oracle review -- 2026-11-12 23:38:51 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.4 third pass on assets.js. Round a6fadddd found (1) silent video split into an audio asset that fails export -> now edAssetsHasSound reads probe (record or /media/<sha>/probe.json) and refuses false/unknown; (2) load pruning a session id added during the fetch -> now only ids present before the fetch are pruned. Verify those two fixes; report only CONFIRMED new defects.
- exit: 0 | elapsed: 152993ms | answer: 712B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 有聲透明影片拆出的音軌在編輯器預覽時會靜音
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:240
  confidence  -> CONFIRMED
  scenario    -> 上傳一支有音訊、需要透明 WebM 代理檔的影片。原檔的 probe 顯示有聲，因此允許拆出；新音訊素材卻繼承影片的 `previewUrl`。該代理檔在 `backend/media-store.cjs:51-54` 以 `-an` 移除音訊，而時間軸在 `scripts/tools-editor.js:1695-1698` 優先播放 `previewUrl`，結果預覽靜音。
  why missed  -> 有聲判斷讀的是原檔 probe；測試只涵蓋一般 MP4，沒有檢查透明代理檔的音訊。

TOTAL: 1 findings
