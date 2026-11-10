# codex-oracle review -- 2026-11-10 16:02:26 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/editor-panes/assets.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ED.4 follow-up: track-clip (non-text) in scripts/tools-editor.js now calls edAssetsPickTrack(track.id) from scripts/editor-panes/assets.js instead of the pickAssets dialog; the kind check (audio track only audio, video track only video/image) now lives in edAssetsAdd. Check for regressions, dead code, stale state.
- exit: 0 | elapsed: 131071ms | answer: 1450B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/scripts/tools-editor.js, lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/tests/ed4-assets.cjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 切換專案後，待選軌道仍指向舊專案的軌道 ID  
  file:line   -> `scripts/editor-panes/assets.js:60`  
  confidence  -> CONFIRMED  
  scenario    -> 在專案甲按 A2 的「＋」，返回專案列表並開啟專案乙；`edOpen` 沒有清除 `pickTrack`（`tools-editor.js:1689`）。兩個專案都有 A2 時，素材面板仍顯示待選提示，下一次點素材會加入專案乙的 A2。  
  why missed  -> 測試只在同一專案完成選取與取消，沒有跨專案操作。

FINDING 2: 從軌道「＋」上傳素材會加入預設軌道，並留下待選狀態  
  file:line   -> `scripts/editor-panes/assets.js:129`  
  confidence  -> CONFIRMED  
  scenario    -> 按 A2 的「＋」後在素材面板上傳音檔；上傳流程直接呼叫 `edAdd`，未使用 `pickTrack`，音檔因此加入預設音軌 A1（`tools-editor.js:1787`）。待選 A2 的提示仍在，之後再點素材卡片又會加入 A2。  
  why missed  -> 新測試只用已有素材卡片完成軌道選取，未走面板內的上傳入口。

FINDING 3: 新增的 V1 測試無法驗出指定軌道失效  
  file:line   -> `tests/ed4-assets.cjs:149`  
  confidence  -> CONFIRMED  
  scenario    -> 若 `edAssetsAdd` 忽略待選的 V1，影片仍會依 `edAdd` 的預設規則落在主軌 V1（`tools-editor.js:1789`），這項斷言照樣通過。  
  why missed  -> 測試選了與預設落點相同的軌道。

TOTAL: 3 findings
