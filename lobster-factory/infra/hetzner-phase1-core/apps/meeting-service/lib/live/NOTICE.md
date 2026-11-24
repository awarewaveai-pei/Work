# Notice: code in `lib/live/` ported from OwnVoice Meet

Based on OwnVoice Meet by Zaious, ChronicleCore Studio.

- Source: https://github.com/Zaious/ownvoice-meet
- Commit: `08e3ab3` (v0.2.3+1)
- Licence: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)
- Copyright 2026 ChronicleCore Studio (編年史記工作室). Created by Zaious. https://studio.chroniclecore.com
- The name "OwnVoice Meet" is not licensed for other works (licence section 6).
- Logic was reimplemented in Python; changes: time is passed in by the caller, cancel flags are `threading.Event`.

| File here | Ported from (OwnVoice Meet) |
|---|---|
| `lib/live/captions.py` | `src-tauri/src/captions.rs` (`Line`, `reads_as_subtitle`, constants) |
| `lib/live/prompts.py` | `src-tauri/src/prompts.rs` |
| `lib/live/respace.py` | `src-tauri/src/gemini.rs` (`Respace`) |
| `lib/live/session.py` | `src-tauri/src/session.rs`, `src-tauri/src/captions.rs` (`open`, `interim`, `finish`, `drop_line`, `fail`, `spawn_translate`, `show`) |
| `lib/live/translate.py` | `src-tauri/src/llm.rs` (wire formats, SSE parsing, `translate`) |
| `lib/live/usage.py` | `src-tauri/src/usage.rs`, `src-tauri/src/catalog.rs` (prices, `cost`) |
| `lib/live/zh.py` | `src-tauri/src/zh.rs` |
| `lib/live/stt_gemini.py` | `src-tauri/src/gemini.rs` (connect, session loop, `Live`), `src-tauri/src/audio.rs` (`chunk_len`) |
| `lib/live/vad.py` | `src-tauri/src/vad.rs` |
| `lib/live/stt_local.py` | `src-tauri/src/stt_chunk.rs`, `src-tauri/src/captions.rs` (`iso639`) |

## Third-party notice carried over (from OwnVoice Meet `THIRD_PARTY_NOTICES.md`)

`captions.rs` follows the cancel-older-requests rule of LiveCaptions-Translator.

### LiveCaptions-Translator

- Source: https://github.com/SakiRinn/LiveCaptions-Translator (read at commit `a6fee12757b15edbeef7c60f8895e0be694801e1`)
- Author: SakiRinn and contributors
- Licence: Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)

| Their file | Ideas taken | Here |
|---|---|---|
| `src/models/TranslationTaskQueue.cs` | A translation that finishes cancels the older ones still running, and older results never replace newer ones | `lib/live/captions.py` (early translation of long sentences) |

Change from the original: early translations are throttled by time (after 4 s of a growing sentence, at most every 2 s) rather than by the number of text changes.
