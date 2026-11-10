# codex-oracle review -- 2026-11-10 22:23:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/server.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/import-audio-library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/.gitignore  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Card ED.6 follow-up: built-in audio library shared by every org. backend/library.cjs resolves /library/<name> (whitelist regex, VW_LIBRARY_DIR or git-ignored library/). server.cjs serves it (GET/HEAD, signed identity required behind the proxy, else 404); api.cjs localFile resolves it so exports read it (editor-export.cjs non-/assets urls already go through file(url)=localFile, so it is unchanged). scripts/import-audio-library.cjs fills the folder from originals outside git, skips existing files, writes sec/lufs into assets/audio-library.json, exits 1 on missing files. audio.js loop logic was fixed after the previous review (pure edAudLoopClips, 64-clip cap before any change). Look for: path traversal or org data exposure via /library, auth bypass, server.cjs/api.cjs hunks: only the /library block and localFile lines are this change (other hunks in api.cjs/server.cjs if any belong to other sessions), import-script atomicity, loop fixes correctness.
- exit: 0 | elapsed: 264363ms | answer: 1983B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/.gitignore, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/import-audio-library.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/server.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed6-audio.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 正式站的 `/library/` 請求不會到達新增的伺服器路由
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf:623`
  confidence  -> CONFIRMED
  scenario    -> 部署這份改動後，已登入使用者試聽內建音訊；nginx 的身分驗證路由未包含 `library`，請求落到 next-admin，音訊無法播放。
  why missed  -> 測試直接呼叫 `createServer`，繞過正式站 nginx；部署手冊也把 nginx 修改列為後續步驟。

FINDING 2: 預設曲庫目錄在正式容器內沒有持久化來源
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/library.cjs:8`
  confidence  -> CONFIRMED
  scenario    -> 只部署這份改動並匯入音檔至既有 `/data` volume；compose 未設定 `VW_LIBRARY_DIR`，程式仍查 `/app/library`，所有清單音檔回傳 404。
  why missed  -> 測試明確注入暫存 `VW_LIBRARY_DIR`；正式 compose 只掛載 `/data`，所需環境變數留在部署手冊。

FINDING 3: 匯入中斷可毀損整份曲庫清單
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/import-audio-library.cjs:54`
  confidence  -> CONFIRMED
  scenario    -> 寫入 `audio-library.json` 途中磁碟用盡或程序被終止；`writeFileSync` 已截斷原檔，留下不完整 JSON，音訊面板無法讀取任何內建曲目。
  why missed  -> 音檔採暫存檔加 rename，清單卻直接覆寫。

FINDING 4: 加入失敗仍會永久保存內建素材
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/audio.js:204`
  confidence  -> CONFIRMED
  scenario    -> 開啟循環的專案已接近 64 段上限；使用者按內建曲目的「＋」，`edAudLoopClips` 拋錯且專案未變，但素材已由 `assets.save` 寫入「我的素材庫」。
  why missed  -> 上限測試只比較專案內容，沒有檢查持久化的素材清單。

TOTAL: 4 findings
