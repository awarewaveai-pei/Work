# codex-oracle review -- 2026-11-27 15:31:01 +08:00

- mode: `review`
- scope: whole repo
- target: `32d376b6b..ce19c86a1`
- context: meeting-service cards C12 (one caption line model id/start/end/seg/who/speaker/lang/text/tr/final; times = recording sample position; session.json sidecar written with transcript.md; lib/live/langs.py; tools/feed.py) and C13 (one settings file lib/settings.py with schema, masked keys, key() precedence settings>env except Anthropic; GET/PUT /api/settings; one same-origin write-guard middleware in app.py; shared templates/_settings.html; localStorage prefs migrated to server). Plan: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/docs/WORKSPACE_PAGE_CARDS.md section 段 4. Focus: secrets never leave server or logs; write guard bypasses; concurrent settings writes losing keys; transcript.md unchanged for same input; sidecar/transcript consistency on crash; old saved sessions and old .settings.json still work. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 216523ms | answer: 1977B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/.gitignore, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/diarize.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/hub.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/langs.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_gemini.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/summary.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/ownvoice.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/_settings.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/workspace.html, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_archive.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_langs.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_reply.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_session.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_stt_gemini.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_stt_local.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_summary.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_ownvoice.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_settings.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tools/feed.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 舊偏好搬移可能覆蓋使用者剛改的設定
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/_settings.html:73
  confidence  -> CONFIRMED
  scenario    -> 舊值的 PUT 已送出但尚未完成；使用者按鈕送出新值的 PUT 並先寫入；舊 PUT 隨後寫入，伺服器最後留下舊值。第 83 行刪除本機舊值，無法取消已送出的請求。
  why missed  -> 註解只考慮搬移尚未送出時的交錯，未涵蓋請求已在途的順序。

FINDING 2: 逐字稿與旁檔無法保證同一版本
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/archive.py:388
  confidence  -> CONFIRMED
  scenario    -> 新 `transcript.md` 已替換，程序在第 389 行替換 `session.json` 前崩潰；重新啟動後兩檔記錄不同句子或譯文。
  why missed  -> 每個檔案各自原子寫入，但兩次替換合起來不是原子操作。

FINDING 3: 同一份設定回應可能混合不同版本
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py:178
  confidence  -> CONFIRMED
  scenario    -> GET 讀完部分偏好後，另一請求一次更新 `stt` 與 `save`；GET 接著逐欄重讀，回傳舊 `stt` 配新 `save`，而檔案從未存在這個組合。
  why missed  -> 寫入有鎖；`public()` 雖先讀一次檔案，偏好卻透過 `pref()` 各自重讀。

FINDING 4: 無限大字級使設定 API 回 500
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py:35
  confidence  -> CONFIRMED
  scenario    -> PUT `{"caption_size": Infinity}`；Python JSON 解碼接受該值，`int(inf)` 拋出 `OverflowError`，未被欄位驗證或 API 的 `ValueError` 處理接住，因此回 500，違反無效欄位回 400 的契約。
  why missed  -> 測試涵蓋一般錯誤型別與小數，未涵蓋 JSON 解碼器接受的非有限數值。

TOTAL: 4 findings