# codex-oracle review -- 2026-11-10 14:12:50 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2 after fixes: (1) host transcription job limit now adds the audio seconds of host runs queued/running ahead (api.cjs hostTranscribeTimeout, transcribe.cjs timeoutMs/audioSeconds), computed once before the job is queued; (2) speech.cjs TO_OPENAI maps the persona voices Kore/Puck/Fenrir/Sulafat/Leda. Earlier finding not fixed on purpose: >1 h single files -- the subtitle and short tools already refuse > 20 min. Video workbench: OpenAI speech (gpt-4o-mini-tts, shuts down 2027-01-06) and whisper-1 (2027-02-26) retire. Speech and transcription become one vendor list each, user picks with visible buttons, prices from /capabilities.
- backend/speech.cjs MODELS: Gemini 3.8 Flash-Lite TTS (default, Interactions API, WAV -> MP3, charged from reply usage at the call-date price row, cost-model.ts GEMINI_TTS_RATES) and OpenAI gpt-4o-mini-tts. A row leaves the list on next-admin registry retireOn (MEDIA_MODELS) and a job naming it gets 400.
- backend/transcribe.cjs ENGINES: host = our faster-whisper worker (apps/video-whisper-worker app.py new sync POST /v1/transcribe, raw body, verbose_json shape, merges English token pieces; rate 0), gemini = Gemini 3.5 Transcribe (word annotations with UTF-8 byte offsets -> segments; usage-billed GEMINI_TRANSCRIBE_RATES; retries 503/429), openai = whisper-1. Default = env-named live row, else first configured row.
- Tool pages (subtitles, short analysis) transcribe one file as an async job (/editor/transcriptions + poll, scripts/tools-workflows.js wfTranscribe) because the host worker is ~1.5x real time and nginx closes requests at 300 s.
- shared/paid-price.js: usd 0 = ?祥; data-paid-model picks a row's price.
Report only what breaks, charges wrong money, leaks a secret, or turns a main path red (TTS job, subtitle tool, short analysis, editor transcription, capabilities).

- exit: 0 | elapsed: 179680ms | answer: 1399B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 設定的預設供應商缺少憑證時，仍會蓋過可用的供應商
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/speech.cjs:72；lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/transcribe.cjs:38
  confidence  -> CONFIRMED
  scenario    -> `VW_TTS_MODEL=gpt-4o-mini-tts`，OpenAI 金鑰已移除、Gemini 金鑰仍在；頁面預設選中已停用的 OpenAI 列，配音送出後得到 503。`VW_TRANSCRIBE_ENGINE=host` 且 worker token 缺失時，字幕辨識也會忽略可用的 OpenAI 列而得到 503。
  why missed  -> 預設值只檢查列是否仍有效；可用性檢查僅用於後面的備選列。

FINDING 2: 主機辨識期限漏算另一服務佔用同一 worker 的時間
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/api.cjs:724；lobster-factory/infra/hetzner-phase1-core/apps/video-whisper-worker/app.py:102
  confidence  -> CONFIRMED
  scenario    -> next-admin 先送出一段需處理約 40 分鐘的辨識工作，隨後工作台送出 5 分鐘音檔。worker 的單一工作槽讓工作台等待，但期限只統計工作台自己的任務；30 分鐘後工作台任務逾時，即使 worker 仍正常處理前一件工作。
  why missed  -> 排隊計算只讀工作台的 `jobs`，未納入共用 worker 的 next-admin 任務。

TOTAL: 2 findings
