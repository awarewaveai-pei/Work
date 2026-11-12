# codex-oracle review -- 2026-11-12 21:06:47 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/replicate-run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2: fixes for two findings. Invariant: a credit hold must cover the most the call can be billed. F1: per-megapixel models (klein, flux-2-max) measure every reference from its bytes (data URL, or own My Designs URL via ownDesignUrlToBlob SSRF guard); an unmeasurable reference is refused before the hold. F2: remove-bg holds replicateRunUsd(bg-remove, DEFAULT_TIMEOUT_MS/1000) and charges the reported predict_time. Report only wrong charges, crashes, SSRF, or main-path breakage, with file:line.
- exit: 0 | elapsed: 266141ms | answer: 628B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/replicate-run.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/image-gen-cost-log.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/studio/remove-bg/route.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Klein 的輸出可能使實際扣點超過預扣點
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts:710
  confidence  -> CONFIRMED
  scenario    -> 參考圖為 4000×2350（9.4 MP）、輸出為 1024×1024 時，預扣按 1 MP 輸出計為 US$0.010400（1 點），實際按輸出尺寸計為 US$0.010449（2 點）。若錢包原有 1 點，生成會開始並交付，但結算短缺 1 點。
  why missed  -> 新測試使用 12 MP 參考圖；它驗證了美元金額，卻未檢查換算成整數點數後，預扣是否仍涵蓋實際扣點。

TOTAL: 1 findings
