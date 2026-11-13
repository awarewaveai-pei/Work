# codex-oracle review -- 2026-11-13 22:32:13 +08:00

- mode: `review`
- scope: whole repo
- target: `da795e6ff..187e1ddb1`
- context: 破框貼文動畫 aligned with the reference: floating layout = sharp full-frame picture + text-only card in the middle, compact counts (12.4K) from number inputs, coloured hashtags, generic app bar on 9:16, per-layout notes, help dialog. Invariants that must hold: a 1:1 first frame is the square preview's own pixels centred in 9:16 (no second layout path); the prompt sent equals breakout-rules.js prompt (post UI stays still); NT$ price shown = charge. Also check text drawing (truncation by whole characters, no half emoji) and that number inputs cannot inject markup.
- exit: 0 | elapsed: 184282ms | answer: 1004B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-0.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/breakout-rules.js
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 截斷會拆開組合 emoji。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js:164
  confidence  -> CONFIRMED
  scenario    -> 貼文文字含 `👩‍💻` 且末行需要加省略號時，`Array.from` 會把這個 emoji 分成三個碼位；逐一刪除後可能畫成 `👩…`，不符合「不截半個 emoji」。
  why missed  -> 作者以碼位當作完整顯示字元，沒有處理由多個碼位組成的 emoji。

FINDING 2: 過長的 hashtag 換行後失去標籤顏色。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-breakout.js:149
  confidence  -> CONFIRMED
  scenario    -> 單一 hashtag 寬於貼文一行時，程式把它拆成單字元；下一行不再以 `#` 開頭，`toolBreakoutRich` 便用一般文字顏色繪製其餘部分。
  why missed  -> 作者保留了短 hashtag 的整體換行，卻沒有追蹤被迫拆行後的標籤身分。

TOTAL: 2 findings
