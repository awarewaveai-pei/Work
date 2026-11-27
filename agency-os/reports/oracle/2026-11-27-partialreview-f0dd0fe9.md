# codex-oracle review -- 2026-11-27 18:40:28 +08:00

- mode: `review`
- scope: whole repo
- target: `0a904b2c6..0b453e23d`
- context: meeting-service cards C16 (recording folder + N output destinations in lib/settings.py, one path normaliser lib/paths.py incl. WSL /mnt mapping and cloud-folder detection, recording folder refused inside a cloud-synced folder (privacy: recordings carry voices and never leave the machine), ownvoice.sessions over all known roots, archive.sync_to per destination continuing after a failed file, status.json destination snapshot, MEETING_DRIVE_BASE migrated once) and C17 (me/them: two AudioWorklets, proto 2 binary frames with a source byte, one Channel per source in lib/live/hub.py sharing one Session, GPU acquire_live held once by the Hub, shared local Recognizer that queues utterances while the model loads, echo guard lib/live/echo.py, stereo WAV left me right them, diarize them-channel only). Plan: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/docs/WORKSPACE_PAGE_CARDS.md 段 4. Focus: recordings ever written into a cloud-synced folder through any path (settings, OwnVoice default under OneDrive, history roots); path traversal through destination or recording-folder values or session ids across roots; GPU claim leaked or double-released on every start/stop/error path; audio lost or misaligned between channels; one-channel behaviour identical to before; old jobs/sessions/settings still work; secrets in responses. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 177025ms | answer: 2317B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/diarize.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/echo.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_gemini.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/ownvoice.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/paths.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/postmeeting.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/_settings.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/workspace.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/conftest.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_destinations.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_channels.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_stt_gemini.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_summary.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_ownvoice.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_postmeeting.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tools/feed.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 雲端資料夾的連結路徑可繞過錄音隱私檢查
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/paths.py:76
  confidence  -> CONFIRMED
  scenario    -> `C:\Recordings` 是指向 OneDrive 資料夾的 junction／符號連結；檢查只比對輸入路徑的字串，`recording_dir()` 隨後使用原路徑，錄音實際寫進 OneDrive 並同步出去。
  why missed  -> 測試只涵蓋路徑名稱直接包含 `OneDrive`，沒有檢查連結解析後的目的地。

FINDING 2: 一般上傳的雙聲道 WAV 被誤認為「我／對方」錄音
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:230
  confidence  -> CONFIRMED
  scenario    -> 使用者上傳左聲道為講者 A、右聲道為講者 B 的普通立體聲 WAV 並啟用分講者；轉錄包含兩邊聲音，但 pyannote 只分析右聲道，A 的話因此無法正確歸屬。
  why missed  -> `_channels()` 只看 WAV 聲道數，沒有確認檔案是 C17 產生的錄音。

FINDING 3: 雙聲道分段時，尚未配對的舊音訊會寫進新段
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/archive.py:366
  confidence  -> CONFIRMED
  scenario    -> 麥克風比電腦聲音先送出一秒音訊，操作者此時按「下一段」；這一秒仍留在 `pending`，之後電腦聲音到達才被寫入新 WAV，但新段起點已設為麥克風當時的位置。接合各段後，音訊位置與段落時間不一致。
  why missed  -> 分段邏輯沿用單聲道的「收到即已寫入」假設；雙聲道新增了待配對緩衝。

FINDING 4: 兩路逐字稿重新對齊後仍按辨識到達順序合併
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:147
  confidence  -> CONFIRMED
  scenario    -> 本機「我」聲道先開一行，Gemini「對方」聲道稍後開一行；對方的文字到達時間經此處往前校正後，實際發聲時間可能早於「我」。`merge_segments.merge()` 仍依原清單順序處理，會把倒序或重疊的兩人話語合成同一段，產生錯誤時間與文字順序。
  why missed  -> 對齊只改時間欄位，沒有重新排序；舊單聲道流程的行序通常等於時間序。

TOTAL: 4 findings