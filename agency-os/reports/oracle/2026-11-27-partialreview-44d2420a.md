# codex-oracle review -- 2026-11-27 19:18:05 +08:00

- mode: `review`
- scope: whole repo
- target: `3adbcd81b..7f95690ff`
- context: meeting-service cards C18 (live speaker separation on the them channel: lib/live/speakers.py pyannote embeddings, cosine clustering threshold 0.75, regroup at stop, rename, saved voices in %LOCALAPPDATA%/meeting-service/voices.json = biometric data, delete must stop matching; GPU claim extended in lib/live/hub.py) and C19 (old home page retired: templates/index.html is an entry page only, POST /api/settings removed, old-page-only features moved into the 會後整理 panel of templates/workspace.html). Plan: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/docs/WORKSPACE_PAGE_CARDS.md 段 4. Focus: voiceprints leaving the machine or the voices file (repo, synced folders, logs, API responses, session.json); a deleted voice still matched or still on disk; voice vectors kept after the session without the operator pressing 記住; GPU claim leaked or double-released when speakers are on; speaker names (operator text) rendered as HTML; renames lost or applied to the wrong session; old jobs still resumable after the old page went away; any endpoint still used by the workspace or /mindmap removed. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 229415ms | answer: 3376B
- files-reviewed: agency-os/docs/operations/RUNNABLE_DEMOS.md, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/NETWORK_VERSION_INSTALL_RUNBOOK.md, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/README.md, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/paths.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/start_server.ps1, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/_settings.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/workspace.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_home_retired.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_speakers.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tools/feed.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: WSL2 與 Windows 使用不同聲紋檔，切換執行環境後會認不出已記住的人
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py:160
  confidence  -> CONFIRMED
  scenario    -> 在 Windows 原生模式按「記住這個聲音」後，服務改由 WSL2 啟動；啟動器的 `WSLENV` 未傳入 `LOCALAPPDATA`（`start_server.ps1:67`），WSL2 因而讀取 `~/.local/share/meeting-service/voices.json`，找不到 Windows 的聲紋。反向切換也一樣，與 C18 指定的跨環境路徑不符。
  why missed  -> 分群與刪除測試只在單一行程使用同一路徑，沒有覆蓋啟動器的環境切換。

FINDING 2: 停止聆聽的五秒逾時會讓模型執行緒仍在使用 GPU 時釋放佔用宣告
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py:499
  confidence  -> CONFIRMED
  scenario    -> 開始後不久就按停止，而聲紋模型仍在背景執行緒載入（`speakers.py:280`）；五秒後 `_listen` 被取消。`finish()` 的卸載工作以 `shield(to_thread(...))` 啟動（`speakers.py:305`），但取消可使等待立即結束，接著 `_listen` 在 `hub.py:402` 釋放 GPU 宣告。此時批次工作可取得宣告，與尚未結束的模型執行緒同時使用 GPU。
  why missed  -> 正常停止路徑會等模型完成；問題只出現在載入超過停止逾時的時序。

FINDING 3: 未按「記住」的聲紋向量在場次結束後仍留在服務記憶體
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py:424
  confidence  -> CONFIRMED
  scenario    -> 使用者開啟即時分講者、關閉存檔、從未按「記住」，然後停止聆聽；收尾只清除 archive，沒有清除 `self.tracker`。其 `clusters.lines` 仍持有全場向量（`speakers.py:89`），直到下一場聆聽覆寫 tracker 或服務退出。
  why missed  -> 檢查著重聲紋檔與 `session.json`，沒有檢查場次結束後的物件生命週期。

FINDING 4: 模型首次載入超過 60 秒時，佇列中的早期句子會用靜音計算聲紋
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/speakers.py:280
  confidence  -> CONFIRMED
  scenario    -> 首次下載或載入模型耗時超過 60 秒，期間字幕持續進入講者佇列；工作開始取早期句子的音訊時，ring buffer 已丟掉該區段（`echo.py:20,54`），`slice()` 以零值補齊（`echo.py:59`）。該句遂以靜音向量分群，停止時也只重分群既有向量，無法恢復正確講者。
  why missed  -> 測試直接餵假向量，沒有涵蓋模型載入期間持續收音的情境。

FINDING 5: 聲紋路徑被拒絕後，純 Gemini 聆聽仍佔住 GPU 宣告
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py:367
  confidence  -> CONFIRMED
  scenario    -> `LOCALAPPDATA` 指向同步資料夾，使用者選 Gemini 並開即時分講者；程式先取得 GPU 宣告，接著 `Voices()` 因禁止位置而失敗，tracker 被關閉，但傳給 `_listen` 的 `gpu` 仍為 `True`（`hub.py:374`）。整場純 Gemini 聆聽期間，會後整理因此無法取得 GPU。
  why missed  -> 例外處理只關閉 tracker，沒有同步更新先前取得的資源宣告。

TOTAL: 5 findings