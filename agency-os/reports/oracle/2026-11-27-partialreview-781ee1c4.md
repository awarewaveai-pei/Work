# codex-oracle review -- 2026-11-27 16:34:18 +08:00

- mode: `review`
- scope: whole repo
- target: `4468e214c..c30f85f8c`
- context: meeting-service cards C14 (listen/target language buttons, one language table lib/live/langs.py from which transcribe.LANGUAGES, app._check_language, ownvoice.language derive; Simplified->Traditional only for Chinese; one translation rule: none or same language -> no model call; prompts from target language, zh-TW byte-identical) and C15 (post-meeting = one artifact chain in pipeline.run_pipeline_phase1: each step runs only when its product is missing; lib/postmeeting.py adapter from session.json lines to transcript segments; Gemini line times re-anchored to recording speech regions via lib/live/vad.py reanchor before pyannote; lib/jobs.py job list + jobs/sessions.json; /api/ownvoice/import with reuse/model/sync_drive; GPU batch claim only when transcribe or pyannote runs; dockable post panel in templates/workspace.html). Plan: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/docs/WORKSPACE_PAGE_CARDS.md 段 4. Focus: an uploaded file must still run the full old flow unchanged; a live session must never run transcription unless re-transcribe was chosen; GPU claim/release on every path (exceptions, early returns); old jobs and old sessions (no session.json) still work; path traversal via session/job ids; minutes prompt language; translation skipped only when correct. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 279289ms | answer: 1772B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/diarize.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/jobs.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/NOTICE.md, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/captions.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/langs.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/prompts.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/sentences.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_gemini.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/summary.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/translate.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/merge_segments.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/ownvoice.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/postmeeting.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/transcribe.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/_settings.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/workspace.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_captions.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_prompts.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_sentences.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_summary.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_postmeeting.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_vtt.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tools/feed.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Gemini 句子可能沒有完成時間對齊，卻被標成已對齊
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py:171
  confidence  -> CONFIRMED
  scenario    -> 一段連續發聲長達 20 秒，Gemini 的句子時間都比語音晚 4 秒，但仍落在同一發聲區段內。多個位移得到相同分數，`max` 選 0；附近也沒有可吸附的停頓邊界，句子時間維持原值。`pipeline.py:173-175` 仍把它標為 `speech`，後續 pyannote 便按錯誤時間配講者。
  why missed  -> 實測例子有停頓可供對齊；連續發聲時，VAD 分數無法辨別延遲。

FINDING 2: 只要一句有講者標籤，就會跳過其餘句子的講者分離
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/postmeeting.py:56
  confidence  -> CONFIRMED
  scenario    -> 場次有十句，僅第一句標了講者，其餘九句沒有。這裡仍產生 `speakers.json`；`pipeline.py:201-206` 因產物存在而跳過 pyannote，九句在分角色逐字稿中變成「?」。
  why missed  -> 測試只涵蓋全部有標籤或全部沒標籤，沒有混合場次。

FINDING 3: 自動辨識會把純漢字日文當中文處理
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/langs.py:84
  confidence  -> CONFIRMED
  scenario    -> Gemini 自動辨識輸出日文「会議」，句子沒有假名。`line_lang` 依漢字判成 `zh-TW`，`Session._language` 將它改成「會議」；若翻譯目標也是 `zh-TW`，還會因「同語言」跳過翻譯，日文原文與譯文都不正確。
  why missed  -> 日文測試句含假名；純漢字日文無法靠目前的文字系統判斷規則區分。

TOTAL: 3 findings