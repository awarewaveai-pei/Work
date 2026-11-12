# codex-oracle review -- 2026-11-13 00:15:20 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/assets/audio-library.json  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.6.5: the built-in audio list adds 70 CC0 music items from OpenGameArt (file mus-mNNN.mp3, source = track page, license = page wording 'CC0', sec/lufs measured by scripts/import-audio-library.cjs, genre keys must exist in the list's genres map), and swaps s013/s016/a012 to alternates (source/author updated) plus a note on a006/a007/a008. Uploader-may-not-be-author tracks were excluded on purpose; China Town removed; Mystery Go Brrrr 404 removed. Check the list for data defects the pane (scripts/editor-panes/audio.js reads items[].usage/genre/bpm/sec/vocal/use/file/title/added) or backend/library.cjs NAME whitelist would trip on: unknown genre keys, duplicate ids/files, names failing the whitelist, null sec, wrong usage, source not the page url.
- exit: 0 | elapsed: 97631ms | answer: 597B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/assets/audio-library.json
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 更換來源後重新執行匯入，仍會保留舊音檔
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/assets/audio-library.json:224`
  confidence  -> CONFIRMED
  scenario    -> 曲庫已有 `sfx-s013.mp3`，並提供新來源的 `s013.mp3` 重新匯入；`scripts/import-audio-library.cjs:32` 遇到既有目標檔就跳過複製。面板仍播放舊音效，但清單顯示新來源與作者；s016、a012 同樣受影響。
  why missed  -> 清單更新了來源欄位，匯入器卻以檔案是否存在判斷要不要替換。

TOTAL: 1 findings
