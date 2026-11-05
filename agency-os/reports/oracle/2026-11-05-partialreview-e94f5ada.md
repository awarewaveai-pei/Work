# codex-oracle review -- 2026-11-05 08:35:55 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/fabric-filters.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/legacy-fabric-filters-hue.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Legacy buildFabricImageFilters (Tarot print, Studio GradedPreview) passed HueRotation rotation in radians; Fabric 7 multiplies rotation by PI itself (index.mjs:22012) so 30deg rendered ~94deg. Fix: rotation = hue/180 (same as editors' shared module), plus value test and repo-wide no-radians guard
- exit: 0 | elapsed: 107778ms | answer: 577B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/canvas/fabric-filters.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/legacy-fabric-filters-hue.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 「全程式碼無 radians」guard 會漏掉跨行的 `HueRotation` 建構式。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/__tests__/legacy-fabric-filters-hue.test.ts:38
  confidence  -> CONFIRMED
  scenario    -> 日後有人寫入 `new F.HueRotation({`、換行、`rotation: (p.hue * Math.PI) / 180 })` → Fabric 再乘 π，顯示錯誤色相；guard 仍通過。已以相同正規表示式驗證：單行命中，跨行未命中。
  why missed  -> 第 44 行只用單行的舊寫法驗證 guard。

TOTAL: 1 findings
