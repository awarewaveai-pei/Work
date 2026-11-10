# codex-oracle review -- 2026-11-10 10:56:48 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: Taken over from a session stopped by quota (b1be4b73). Operator asked three things for the engine tools (FilmCraft = 專業剪輯, EffectCraft = 專業特效) in the video workbench: (1) the GPU warning must not claim the laptop has no discrete GPU (it has an RTX 5060; browsers hand pages the Intel chip unless Windows is told) -> requestAdapter high-performance, warn 'integrated' vs 'none' with Windows steps; (2) FilmCraft UI in English, not Simplified Chinese, in a zh-TW browser -> app.language.english on ready; (3) the engine runs in its own full-page tab tools.html?full#<tool>; the workbench card opens/refocuses that tab and never mounts an engine. shared/runtime.js: VW_KEEP_PAGE_ON_CONFLICT makes the engine tab adopt the other tab's state on a 409 instead of reloading (unsaved engine work lives outside db), throwing .conflict so the engine save redoes once. engineTool() (committed 203bc3084) also used for the new tab button. Tests fc2-engine-host (incl. two-tab clash). UI rules: no dropdowns (details disclosure is fine), theme tokens only, zero hex colours.
- exit: 0 | elapsed: 223551ms | answer: 1198B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-engine-host.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/styles/tools.css, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/fc2-engine-host.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 從集數頁開啟 FilmCraft 專案，仍會把引擎嵌入工作台
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-engine-host.js:425
  confidence  -> CONFIRMED
  scenario    -> 集數已有 FilmCraft 剪輯檔 → 點「開啟剪輯」走 `acceptAsset()`，再呼叫 `engineOpenProject()` → `engineMount()` 在工作台 iframe 內建立引擎，違反「引擎只在獨立分頁執行」。
  why missed  -> 新測試只從工具卡片開分頁，沒有走集數頁的既有入口。

FINDING 2: 跨分頁衝突後，成片可能沒有進入工作台素材庫
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/shared/runtime.js:118
  confidence  -> CONFIRMED
  scenario    -> 工作台分頁先更新共享狀態 → 引擎分頁輸出成片，`showJob()` 隨後儲存素材時收到 409 → 此處採用另一分頁狀態並拒絕寫入；只有「專案存檔」會重試，成片素材寫入不會。成片雖已由後端接收，工作台素材庫仍缺這筆。
  why missed  -> 衝突測試只驗證 `tools.engine.projects` 的專案存檔重試，沒有在衝突後輸出成片。

TOTAL: 2 findings
