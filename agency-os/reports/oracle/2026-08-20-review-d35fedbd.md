# codex-oracle review -- 2026-08-20 15:59:59 +08:00

- mode: `review`
- target: `working tree (staged + unstaged + untracked)`
- context: meeting-service 新增選填 API 自動處理路徑：lib/settings.py 存本機 API key、lib/summarize.py 新增 summarize_via_api()（呼叫真實 Anthropic API，失敗重試一次再放棄）、pipeline.py 新增 use_api 分支（成功走完整流程，失敗退回既有人工回路 awaiting_summary，並抽出共用的 _finalize_from_minutes helper 給兩條路共用）、app.py 新增 /api/settings GET/POST + upload 的 use_api 參數與守門、templates/index.html 新增設定卡片與勾選框。目的：這支工具之後要給客戶用，客戶碰不到操作者的 Claude Code 對話視窗，人工回路對客戶不成立。請重點檢查：API 失敗時是否真的不會讓已完成的轉錄/講者分離工作跟著報廢、_finalize_from_minutes 抽出後兩條路徑是否真的等價、有沒有 race condition 或 stale status.json 讀寫問題、settings.py 的 key 遮罩/儲存邏輯是否有洩漏明文的路徑。
- exit: 0 | elapsed: 264621ms | answer: 5009B

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `use_api` jobs are not bound to the key that existed at upload time, so later settings edits can bill the wrong account or silently disable auto-processing.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py:55; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py:81; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:126; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/settings.py:14
  confidence  -> CONFIRMED
  scenario    -> A user starts a long upload with `use_api=true` while key A is saved, then clears the setting or replaces it with key B before transcription finishes. When phase 1 reaches summary, it re-reads the global `.settings.json`, so the already-started job either falls back to manual with no API attempt at all or charges key B instead of key A.
  why missed  -> Happy-path testing keeps settings unchanged; this only shows up because transcription is long and the key is stored as mutable global state instead of per-job state.

FINDING 2: The UI tells users their API key ?on? be uploaded anywhere?? but API mode necessarily sends it off-machine to Anthropic.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html:100; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py:152; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py:167
  confidence  -> CONFIRMED
  scenario    -> A privacy-sensitive client relies on the settings card text, enters a key believing it stays only on the laptop, then runs API mode. `anthropic.Anthropic(api_key=api_key)` plus `client.messages.create(...)` transmits that credential to Anthropic, so the consent/security claim shown to the user is false.
  why missed  -> The author appears to have checked only local storage paths (`.settings.json`, gitignore, masking) and missed that the authentication header itself is also credential egress.

FINDING 3: Transient Anthropic/API failures are not retried, even though this change is supposed to ?etry once then give up??
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py:136; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/summarize.py:171
  confidence  -> CONFIRMED
  scenario    -> Anthropic returns a transient 529/500 or network-level API error on the first request. The code immediately raises `RuntimeError` from the `except anthropic.APIStatusError/APIError` blocks, so the second attempt is never made and the job falls back to manual unnecessarily.
  why missed  -> The retry loop exists, but only parse/validation failures go through the `continue` path; real HTTP/API failures exit from inside the `except` block.

FINDING 4: Any failure after the API has already produced valid `minutes` is misreported as an ?PI auto-summary failure??and routed to manual summary, which cannot fix the problem.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:128; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:135; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:141; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:145; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:175
  confidence  -> CONFIRMED
  scenario    -> Anthropic returns valid JSON, `_finalize_from_minutes()` starts building artifacts, then `deck.build()` or `speaker_notes.attach_notes()` fails because the disk is full or the PPT file is locked. The broad `except` treats that as `api_error` and sends the user back to ?aste summary manually?? but re-pasting the same summary will just hit the same build/storage failure again.
  why missed  -> The API call and the post-summary build pipeline were wrapped in one `try`, so a real downstream artifact failure gets mislabeled as a summary failure.

FINDING 5: `status.json` is rewritten in place while the frontend polls it without any read-side guard, so a poll during a write can return 500/invalid JSON.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/pipeline.py:44; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/app.py:137; lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/templates/index.html:300
  confidence  -> CONFIRMED
  scenario    -> While the background thread is truncating and rewriting `jobs/<id>/status.json` for a stage transition, the browser? 1.5s poll hits `/api/status/<id>`. `json.load(...)` reads partial JSON and throws, so the endpoint returns 500/non-JSON and the poll callback rejects before updating progress or switching to the summary/result state.
  why missed  -> Local happy-path runs rarely hit the tiny truncate/write window, and there is no atomic rename or retry logic on either side to expose the race deterministically.

TOTAL: 5 findings
