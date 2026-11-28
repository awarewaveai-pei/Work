# codex-oracle review -- 2026-11-29 01:59:02 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/adapters.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/media-cache-browser.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/organization-context.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Two fixes found by using video.aware-wave.com. (A) every generated picture/video answered 503: media-cache-sw.js asks the requesting document for its organization with client.postMessage, which a browser delivers to navigator.serviceWorker, but shared/adapters.js listened on window, so no document ever answered and the worker gave up after 3 s; the listener now sits on navigator.serviceWorker. (B) a paid call intermittently failed with expired_or_future: main-system.cjs took now before asking the issuer and verified the permit with that older second, so a permit signed in the next second looked issued in the future; it is now verified with the time at verification.
- exit: 0 | elapsed: 132451ms | answer: 604B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/backend/main-system.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/adapters.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/media-cache-browser.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/organization-context.cjs, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/p6-main-system.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新增的瀏覽器測試可能在修正有效時仍錯誤失敗
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/media-cache-browser.cjs:152
  confidence  -> CONFIRMED
  scenario    -> 新分頁已受既有 worker 控制，但 `app-entry.js` 尚未載入 `shared/adapters.js` → 等待 `controller` 立即結束，隨後讀取媒體；文件尚未註冊訊息監聽器，worker 等待 3 秒後回傳 503，測試因此失敗。
  why missed  -> 測試把「worker 已控制分頁」當成「非同步載入的頁面腳本已就緒」。

TOTAL: 1 findings