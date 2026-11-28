# codex-oracle review -- 2026-11-29 01:23:16 +08:00

- mode: `review`
- scope: whole repo
- target: `7f95690ff..6f9b9505b`
- context: Fixes for 12 review findings on meeting-service C18 live speakers (lib/live/speakers.py, lib/live/hub.py, lib/live/echo.py, lib/diarize.py, start_server.ps1, templates/workspace.html): uncancellable teardown that waits for a loading model and releases the GPU claim only after both unloads; claim released on any exception after acquire; tracker cleared after a listening; one voices.json for Windows and WSL (LOCALAPPDATA through WSLENV); no vector when a line's audio left the 60 s ring; rename box not rebuilt while typing; rename to an existing name merges speakers and survives regroup; regroup off the event loop and efficient; wrong-length saved vectors dropped; deleted voice stops naming; OS file lock + unique temp for voices.json; corrupt voices.json never overwritten; pyannote telemetry off. Plus 6f9b9505b: last save waits for the recognizer and speakers closing before translations and summary. Voiceprints are biometric: focus on vectors leaving the machine or surviving deletion, GPU claim leaks, deadlocks or hangs in teardown, data races on voices.json, and whether each listed fix is real. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 134252ms | answer: 2780B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/diarize.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/echo.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/start_server.ps1, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/workspace.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_speakers.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 收尾超過 300 秒時，存檔會先完成，之後產生的講者標籤無法寫回該場紀錄。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py:487
  confidence  -> CONFIRMED
  scenario    -> 模型載入加上排隊辨識超過 300 秒 → `_finalize` 繼續執行 `archive.end()` 並清除 `self.archive`；稍後 `closing` 才完成的標籤只更新畫面，不再寫入存檔。
  why missed  -> 收尾 task 本身沒有取消，容易忽略「最後存檔」另有等待上限。

FINDING 2: 重新分群會把每句沒有向量的開頭短句拆成不同講者。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py:189
  confidence  -> CONFIRMED
  scenario    -> 一場聆聽只有三句各不到一秒的話 → 即時標籤同為「講者 1」；停止後 `regroup()` 對三句各呼叫一次 `_new()`，存檔變成三名講者。
  why missed  -> 測試涵蓋有向量的分群，沒有涵蓋全是猜測標籤的聆聽。

FINDING 3: 刪除聲紋未與背景重新分群同步，已刪名稱可能被寫回標籤。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py:615
  confidence  -> CONFIRMED
  scenario    -> 停止聆聽後，`regroup()` 正在執行緒中建立新講者；此時使用者刪除該聲紋 → 刪除命令仍會執行，但分群可能已讀取舊的名稱與 voice ID，隨後將它們寫回畫面及存檔。`regrouping` 檢查只擋改名與儲存。
  why missed  -> 分群移到執行緒後，刪除命令仍沿用原本的同步資料操作假設。

FINDING 4: 長度正確但內容無效的聲紋向量會使開始聆聽的 WebSocket 中斷。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py:294
  confidence  -> CONFIRMED
  scenario    -> `voices.json` 有一筆 256 個字串的 `vector` → `load()` 接受它；`Clusters.__init__()` 在轉成 `float32` 時拋錯，開始聆聽命令未轉為可顯示的「檔案讀不懂」狀態。
  why missed  -> 驗證只檢查向量長度與 JSON 語法，未檢查元素能否作為數值使用。

FINDING 5: 寫入失敗留下的暫存檔會讓聲紋在日後成功刪除後仍留在磁碟。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py:318
  confidence  -> CONFIRMED
  scenario    -> 儲存時已寫好含聲紋的唯一暫存檔，但 `os.replace()` 因檔案暫時被佔用而失敗 → 暫存檔未清理；使用者稍後成功刪除 `voices.json` 中的聲紋，舊暫存檔仍保有其向量。
  why missed  -> 唯一暫存檔解決了檔名碰撞，卻沒有處理替換失敗後的清理。

TOTAL: 5 findings