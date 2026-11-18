# codex-oracle review -- 2026-11-18 22:24:58 +08:00

- mode: `review`
- scope: whole repo
- target: `5d06e212a~1..5d06e212a`
- context: video-service technical QA warned picture.freeze (and black_frames) on every video with a title-card bookend, because freezedetect/blackdetect ran over the whole output. Fix: the step that creates intended stills (bookend join, legacy intro_title concat) writes their spans into the mp4 comment tag; QA reads the tag from the file it measures and skips freezes wholly inside a span and black time inside spans; freezes in the main or running past a span still count; untagged videos unchanged. Also verify: does this depend on something NOT visible in this diff (ffmpeg keeping global metadata through burn_script_captions / export_all_formats / reburn of old clean videos, ffprobe tag key case, freezedetect log format, next-admin consuming signal_qa measurements, a user-supplied template asset carrying its own comment tag)? If it contradicts the change, report it. If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 168562ms | answer: 852B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/server.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_still_windows.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 上傳素材可偽造「預期靜止」標記，讓 QA 漏報主片凍結與黑畫面
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py:1133
  confidence  -> CONFIRMED
  scenario    -> 使用者上傳的影片帶有 `comment=awarewave:stills=0.000-999999.000`。實拍剪輯路徑在轉碼、串接及混音時均未清除來源的全域 metadata（見同檔第 1250–1257 行）；[FFmpeg 預設會從第一個輸入複製全域 metadata](https://ffmpeg.org/ffmpeg.html)。`still_windows()` 因而把整支輸出當成預期靜止區間，`_signal_probe()` 對實際凍結與黑畫面回報零事件（server.py:679、server.py:275–286）。
  why missed  -> 測試只驗證服務自行寫入的標記及一般無標記影片，沒有覆蓋帶同名 `comment` 的輸入素材。

TOTAL: 1 findings