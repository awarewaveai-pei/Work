# codex-oracle review -- 2026-11-13 20:40:19 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media-store.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/backfill-alpha-proxy-audio.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/alpha-proxy-audio-backfill.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Invariant: a preview file's sound = the original's sound. Alpha sources play proxy.webm / preview720.webm made by media-store.cjs transcode, which used -an (added in P3 40c7b8ebd with no stated reason), so 拆出音軌 was blocked (assets.js) and a detached clip previewed silent. Change: the alpha branch now maps 0:a:0? and encodes Opus 128k (VP9 alpha + Opus in WebM); assets.js block removed (edDetachAudio unchanged). Old silent alpha previews: store.backfillAlphaAudio (re-make proxy.webm/preview720.webm when probe says alpha+audio and the preview has no audio stream; renamed over the old file; re-runnable) run by scripts/backfill-alpha-proxy-audio.cjs over the local data dir and every orgs/<org>. Exports read the original (unaffected). Look for: breakage of alpha preview playback or export, race with derive/preview queue writing the same file, rename-over on Windows/Linux, org folder coverage, test validity. Only media-store hunks for transcode/backfillAlphaAudio are this change.
- exit: 0 | elapsed: 181334ms | answer: 1128B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/media-store.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/backfill-alpha-proxy-audio.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/alpha-proxy-audio-backfill.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 上線後、補檔腳本執行前，舊透明影片仍可拆出無聲音軌
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js:257
  confidence  -> CONFIRMED
  scenario    -> 舊素材的 `probe.json` 記錄有音訊，但 `proxy.webm` 是舊版產生的無聲檔；新版移除阻擋後，使用者在手動執行補檔腳本前按「拆出音軌」，會建立音訊素材，而編輯器播放該素材時使用的仍是無聲預覽檔。
  why missed  -> 作者把補檔腳本視為遷移的一部分，但程式沒有要求補檔完成才開放拆出。

FINDING 2: 新增的補檔回歸測試沒有進入 CI 或部署閘
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/gate.cjs:6
  confidence  -> CONFIRMED
  scenario    -> 若之後的修改讓透明影片轉檔再次漏掉音訊，`alpha-proxy-audio-backfill.cjs` 會失敗；但 CI 與部署都只執行此處列出的測試，因此仍可通過。
  why missed  -> 作者新增了測試檔，卻沒有將它加入明列測試名稱的閘。

TOTAL: 2 findings
