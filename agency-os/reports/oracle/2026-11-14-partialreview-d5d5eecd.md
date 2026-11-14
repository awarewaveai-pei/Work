# codex-oracle review -- 2026-11-14 08:58:53 +08:00

- mode: `review`
- scope: whole repo
- target: `6a660b575..05dde7d4d`
- context: 破框 lock mask as a validated per-job input: full PNG check at submit (signature, chunk CRCs, IHDR 8-bit non-interlaced, inflated IDAT size), 1 MB cap, width x height must equal the first frame, 400 before any vendor call; mask stored at job-inputs/<id>/lock-mask.png (not served, not a library asset); every persist deletes job-inputs folders of jobs that are not queued/running; video size != frame size -> no lock, raw video + note. Focus: path traversal / job id in the folder path, deletion racing with a running finisher, restart, retry behaviour, decompression bomb within 1 MB.
- exit: 0 | elapsed: 221805ms | answer: 1777B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 面積限制留在付費生成之後，會接受注定無法鎖定的遮罩
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:108
  confidence  -> CONFIRMED
  scenario    -> 提交與第一格同尺寸、幾乎全白的有效 PNG；`readMask` 接受它，影片生成並計費後，`lockPixels` 才因鎖定面積超過 60% 拒絕，結果只交付帶失敗註記的原始影片。
  why missed  -> 新增的提交驗證檢查了 PNG 與尺寸，但既有的遮罩面積限制藏在後續畫格處理流程。

FINDING 2: 重試破框任務會默默失去文字鎖定
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:1013
  confidence  -> CONFIRMED
  scenario    -> 帶遮罩的破框任務失敗後，使用歷史紀錄的重試；保存的輸入只有 `lock: { stored: true }`，原遮罩資料夾已清除。重試建立新任務時讀不到遮罩，仍會送出付費生成，最後產出沒有文字鎖定的影片。
  why missed  -> 儲存任務時移除遮罩資料，與既有「用保存的 input 重試」流程互相衝突。

FINDING 3: PNG 驗證接受 ffmpeg 無法解碼的壓縮方法
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs:76
  confidence  -> CONFIRMED
  scenario    -> 將 IHDR 壓縮方法設為 `1`，重算 CRC，並保留可正常 inflate 的 IDAT；實測 `pngInfo` 接受該檔並回傳尺寸，但專案的 ffmpeg 解碼回報 `Invalid compression method 1`。遮罩因此能通過提交驗證，直到付費生成後才在鎖定階段失敗。
  why missed  -> 驗證只檢查 IHDR 的位元深度、色彩類型及交錯欄位，未檢查壓縮方法欄位。

TOTAL: 3 findings
