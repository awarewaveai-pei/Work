# codex-oracle review -- 2026-11-14 08:48:24 +08:00

- mode: `review`
- scope: whole repo
- target: `2b3bd0596..HEAD`
- context: 破框: (1) text lock opens a cell only when its changed pixels touch an entry edge (photo / post outside / open cell), iterated per frame; (2) prompt rewritten after the operator's reference (locked camera screen recording, photo is the only live 3D scene, UI frozen flat layer, PROMPT_MAX 1000 UTF-16, subject cut by grapheme); (3) the page draws a lock mask with the same drawing code as the post (text rows white, rounded-card clip, centred like frame 1) and sends it as a data URL stored as the job's own file; the server locks only fully-white pixels with a 2px white margin, 32px grid, each border pixel counted once. Focus: mask validation (size, type, area <=0.6), path/storage of the mask file and cleanup, old pages without a mask, per-frame cost, any pixel restored outside the mask.
- exit: 0 | elapsed: 178860ms | answer: 1767B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/breakout-rules.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 無效遮罩要到影片生成並計費後才被發現
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:37；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:187
  confidence  -> CONFIRMED
  scenario    -> 提交 `data:image/png;base64,AAAA` 會通過字串檢查；模型完成並計費後，FFmpeg 才發現內容不是圖片。工作最後交付未鎖定的原始影片與失敗註記。
  why missed  -> 測試驗了 URL 格式與正常 PNG，沒有追到遮罩解碼發生在付費模型呼叫之後。

FINDING 2: 遮罩尺寸不符會被縮放成有效遮罩
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:187
  confidence  -> CONFIRMED
  scenario    -> 第一格是直式畫面、遮罩卻是橫式 PNG 時，程式仍把遮罩強制縮放到影片尺寸；下一行的長度檢查會通過，並依錯位的白色區域還原影片像素。
  why missed  -> 長度檢查量到的是縮放後的 rawvideo，無法驗出原始遮罩尺寸。

FINDING 3: 每次提交的遮罩檔沒有清理路徑
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:273；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:996
  confidence  -> CONFIRMED
  scenario    -> 每次提交都把遮罩寫入持久化的 `generated` 目錄；成功、失敗或取消後均沒有刪除此檔。重複提交會持續增加磁碟用量，且格式檢查允許請求上限內的大量非 PNG 位元組。
  why missed  -> 遮罩沿用通用圖片儲存流程，但它只是收尾用的暫存輸入；測試只確認檔案能送達收尾程序。

TOTAL: 3 findings
