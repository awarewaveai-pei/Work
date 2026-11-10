# codex-oracle review -- 2026-11-10 14:08:05 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/paid-price.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-voice-music.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-subtitles.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-short.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-results.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/app.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/probe-models.mjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Video workbench: OpenAI speech (gpt-4o-mini-tts, shuts down 2027-01-06) and whisper-1 (2027-02-26) retire. Speech and transcription become one vendor list each, user picks with visible buttons, prices from /capabilities.
- backend/speech.cjs MODELS: Gemini 3.8 Flash-Lite TTS (default, Interactions API, WAV -> MP3, charged from reply usage at the call-date price row, cost-model.ts GEMINI_TTS_RATES) and OpenAI gpt-4o-mini-tts. A row leaves the list on next-admin registry retireOn (MEDIA_MODELS) and a job naming it gets 400.
- backend/transcribe.cjs ENGINES: host = our faster-whisper worker (apps/video-whisper-worker app.py new sync POST /v1/transcribe, raw body, verbose_json shape, merges English token pieces; rate 0), gemini = Gemini 3.5 Transcribe (word annotations with UTF-8 byte offsets -> segments; usage-billed GEMINI_TRANSCRIBE_RATES; retries 503/429), openai = whisper-1. Default = env-named live row, else first configured row.
- Tool pages (subtitles, short analysis) transcribe one file as an async job (/editor/transcriptions + poll, scripts/tools-workflows.js wfTranscribe) because the host worker is ~1.5x real time and nginx closes requests at 300 s.
- shared/paid-price.js: usd 0 = ?祥; data-paid-model picks a row's price.
Report only what breaks, charges wrong money, leaks a secret, or turns a main path red (TTS job, subtitle tool, short analysis, editor transcription, capabilities).

- exit: 0 | elapsed: 229306ms | answer: 1635B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/cost-model.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/probe-models.mjs, lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/app.py, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/generation-policy.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/provider-cost.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-controls.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/generator-results.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/index-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-short.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-subtitles.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-voice-music.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/paid-price.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 主機辨識佇列會讓有效任務逾時
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs:343
  confidence  -> CONFIRMED
  scenario    -> 兩個 20 分鐘音檔同時送往 host；worker 一次只處理一件（`app.py:175`）。若各需約 30 分鐘，第二件須等待約 60 分鐘，但自身逾時設為 50 分鐘，字幕任務失敗。
  why missed  -> 逾時計算只包含該音檔的處理時間，沒有計入單工 worker 的排隊時間。

FINDING 2: 改走編輯器任務後，超過一小時的字幕來源被拒
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-workflows.js:165
  confidence  -> CONFIRMED
  scenario    -> 使用者上傳可接受大小的 70 分鐘音檔並按「辨識字幕」；新路徑把全長作為單一 segment，`transcribe.cjs:257` 對超過 3600 秒回 400。原本的單檔 `/transcriptions` 路徑沒有這項時長限制。
  why missed  -> 沿用了編輯器專用的時間軸上限，卻把單檔字幕工具也接進該路徑。

FINDING 3: 選 OpenAI 配音時，兩張角色卡會產生錯誤聲線
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs:20
  confidence  -> CONFIRMED
  scenario    -> 使用者選 OpenAI 模型及「專業主持」或「清亮男聲」；前端分別送出 `Kore`、`Fenrir`（`index-0.js:221`），但對照表沒有這兩個聲線，`speech.cjs:80` 便改用預設 `coral`。
  why missed  -> 角色卡的新 Gemini 聲線沒有逐一對照到 OpenAI 的七種聲線。

TOTAL: 3 findings
