# codex-oracle review -- 2026-11-06 08:20:44 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/photo-pro-dock/dock.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/public-asset-cache.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06-photo-pro.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `e58938751`
- context: Photo Pro C4.2/C4.4: dock + ctx adapter driving PhotoCraft (iframe window.photocraft + postMessage photocraft:open/save) for shared editor panels; saves matched by extension, scratch docs named awarewave-tmp-* closed by name; unit test with mock + e2e against the real build
- exit: 0 | elapsed: 170145ms | answer: 1042B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/staff-tools.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/public-asset-cache.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/photo-pro-dock.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-contract.md, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/photo-pro-dock/dock.js, lobster-factory/infra/hetzner-phase1-core/tests/e2e/smoke/06-photo-pro.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 暫用文件關閉失敗仍回報操作成功
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js:210
  confidence  -> CONFIRMED
  scenario    -> `layer.copyToDocument` 成功、`file.close` 拒絕 → `withTemp` 只記錄警告並回傳成功；暫用文件仍開著，後續操作可能落在暫用文件。
  why missed  -> mock 測了操作途中失敗後的清理，沒有測清理本身失敗。

FINDING 2: 關閉其他分頁後，暫用文件清理會啟用錯誤文件
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/public/editor-shared/ctx-photocraft.js:206
  confidence  -> CONFIRMED
  scenario    -> 目標文件 B 原在 index 1；操作期間使用者關閉前面的文件 A，B 移到 index 0 → 清理仍用舊 `target=1`，轉而啟用另一份文件，或因 index 無效而失敗。
  why missed  -> 測試只涵蓋暫用文件插到最前面，沒有涵蓋使用者在操作期間關閉其他分頁。

TOTAL: 2 findings
