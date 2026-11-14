# codex-oracle review -- 2026-11-14 09:14:17 +08:00

- mode: `review`
- scope: whole repo
- target: `05dde7d4d..1eebf7035`
- context: 破框 lock mask, round 4 after an invariant analysis: (A) one function breakout.lockMaskPixels decides if a mask is usable (header size = frame, decoded by the project's ffmpeg without scaling, lock area <= 0.6), run at submit before permit/vendor call and at finish; hand-written PNG checks removed; readMask keeps only cheap checks (data URL, 1 MB, PNG signature, each side <= 4096). (B) the mask lives as long as the job record: job-inputs/<id>/, copied to a retry and re-checked by (A), deleted only where persist drops records past the history limit. Focus only on whether (A) and (B) hold on every path; do not re-raise earlier fixed findings.
- exit: 0 | elapsed: 206187ms | answer: 1270B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/breakout.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/breakout.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 超過歷史上限的工作仍可重試，但會悄悄失去鎖定遮罩
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:189
  confidence  -> CONFIRMED
  scenario    -> 失敗的破框工作被擠出保留清單後，`persist()` 刪除其遮罩資料夾，卻未從記憶體中的 `jobs` 移除工作；同一程序內的 `/retry` 仍找得到它。`breakoutLockMask()` 在遮罩檔不存在時回傳 `null`，新工作照常送出，卻沒有文字鎖定。
  why missed  -> 測試只檢查磁碟帳本與遮罩清理，沒有在程序重啟前重試已被裁掉的工作。

FINDING 2: 損壞的第一格 PNG 現在可通過送出前檢查
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:964
  confidence  -> CONFIRMED
  scenario    -> 第一格提供只有有效 PNG 標頭、但缺少影像資料的檔案，並搭配尺寸相符的有效遮罩；此處只讀標頭尺寸，遮罩則能成功解碼。工作因此建立並呼叫影片供應商，之後才因第一格無法解碼而失敗；改動前的完整 PNG 檢查會在供應商呼叫前拒絕它。
  why missed  -> 新測試涵蓋損壞的遮罩，沒有涵蓋損壞的第一格。

TOTAL: 2 findings
