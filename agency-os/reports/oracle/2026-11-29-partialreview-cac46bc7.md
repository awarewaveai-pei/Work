# codex-oracle review -- 2026-11-29 02:04:31 +08:00

- mode: `review`
- scope: whole repo
- target: `HEAD~1..HEAD`
- context: Adaptive speech threshold in the energy VAD of meeting-service (lib/live/vad.py Level, used by Segmenter for local live recognition and by speech_regions for Gemini re-anchoring and post-meeting alignment). Threshold = geometric mean of p20 and p90 frame RMS over the last 10 s, capped at the old fixed 0.008, floored at 0.003. Focus: behaviour on clean recordings must not change; silence-only input; very long meetings (memory/CPU per frame); the pause-detection (700 ms) and utterance-start logic with a moving threshold; whether the threshold can drift up during long speech and cut words. Report in Traditional Chinese, each finding with file:line.
- exit: 0 | elapsed: 125806ms | answer: 1116B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py, lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/tests/test_live_vad.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 穩定背景噪音會被自適應門檻判成語音
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py:71
  confidence  -> CONFIRMED
  scenario    -> 30 秒、RMS 約 0.004 的純背景噪音，門檻收斂到約 0.004；實測產生兩個近 12 秒的 `END`，本機辨識器會將其送往 Whisper（`lib/live/stt_local.py:185`）。舊門檻 0.008 不會觸發。背景音也會使 700 ms 停頓難以成立。
  why missed  -> 新測試只使用 RMS 0.002 的背景音，沒有測試介於 0.003 與 0.008 的穩定噪音。

FINDING 2: 開頭一秒內的輕聲短句仍會完全漏掉
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/meeting-service/lib/live/vad.py:68
  confidence  -> CONFIRMED
  scenario    -> 錄音一開始就是 0.8 秒、RMS 約 0.0045 的語音，之後接兩秒靜音；前一秒仍使用 0.008，實測沒有任何 `START` 或 `END`，整句不會進入辨識。
  why missed  -> 新測試在第一句前先放了三秒背景音（`tests/test_live_vad.py:72`），讓門檻預先完成調整。

TOTAL: 2 findings