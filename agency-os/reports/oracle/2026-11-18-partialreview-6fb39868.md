# codex-oracle review -- 2026-11-18 15:53:21 +08:00

- mode: `review`
- scope: whole repo
- target: `70a814a36~1..70a814a36`
- context: video-service bookend join truncated (HLG stock scene among bt709 scenes made concat main change colorspace mid-stream; ffmpeg rebuilt xfade/acrossfade graph and ended early, exit 0). Fix: every concatenated segment encoded bt709/tv (HLG gamut-mapped, PQ tonemapped, other matrices/range converted); main audio rebuilt exactly via atrim+PCM; template bookends padded; post-join check raises if video or audio length != intro+main+outro-transitions +-0.15s. Also verify: does this change depend on something NOT visible in this diff -- a config value, timeout, upstream default (ffmpeg 7.1 zscale/setparams/tpad availability in python:3.12-slim Debian ffmpeg), or other caller of _join_bookends? If it contradicts the change, report it. If you cannot support a real finding, return no findings; do not invent weak findings.
- exit: 0 | elapsed: 166956ms | answer: 1505B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py, lobster-factory/infra/hetzner-phase1-core/apps/video-service/tests/test_bookends.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 無轉場的合法多場景影片會被長度檢查誤判失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py:667
  confidence  -> CONFIRMED
  scenario    -> API 允許最多 30 個場景（server.py:66,203）。若 10 個場景各計畫 2.51 秒、以 24 fps 編碼，每段畫面須佔 61 幀，約 2.542 秒；[concat demuxer 依各檔實際時長排列時間戳](https://ffmpeg.org/ffmpeg-formats.html)。成片約 25.42 秒，與計畫的 25.10 秒相差逾 0.15 秒，`_check_joined_length` 使成功的渲染變成錯誤。
  why missed  -> 新測試的無轉場案例只有兩個、各 2.5 秒的場景，沒有覆蓋逐段累積的幀時長誤差。

FINDING 2: 非 HDR 的 BT.2020 素材被錯誤標記為 BT.709
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-service/pipeline.py:403
  confidence  -> CONFIRMED
  scenario    -> 輸入為 `color_primaries=bt2020`、`color_transfer=bt709` 的 SDR 影片時，此分支只用 `scale` 轉換 YCbCr 矩陣，隨後以 `setparams` 標成 BT.709 primaries；它沒有轉換色域。[FFmpeg 文件](https://ffmpeg.org/ffmpeg-filters.html)區分矩陣與色域轉換，[`setparams` 也不修改像素](https://www.ffmpeg.org/doxygen/8.1/vf__setparams_8c.html)。輸出通過時長檢查，但飽和色顯示錯誤。
  why missed  -> 測試涵蓋 BT.2020 的 HLG／PQ，未涵蓋 BT.2020 primaries 的 SDR；HDR 分支才使用 `zscale` 轉換 primaries。

TOTAL: 2 findings