# codex-oracle review -- 2026-11-14 09:06:14 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/deck-key.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/packages/db/migrations/0162_tarot_batch_deck_key.sql, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/batch-store-durable.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot: background batch stores deck_key (sha256 of model/aspect/seed/all card prompts, migration 0162); deck panel lists only jobs with the locked deck's key; returned deck card no longer swaps art before its frame is drawn. Invariant: a batch from another deck is never offered for this deck.
- exit: 0 | elapsed: 130981ms | answer: 756B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/batch/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/batch-store-durable.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/deck-key.ts, lobster-factory/packages/db/migrations/0162_tarot_batch_deck_key.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 重新鎖定不同風格後，舊批次仍可被提供並載入新牌組
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx:1469
  confidence  -> CONFIRMED
  scenario    -> A 牌組的完成批次已列在 `recentJobs`；使用者解鎖並鎖定 B 風格時，畫面仍顯示 A 的載入按鈕，直到新查詢完成。此時點擊會將舊工作標記為目前牌組（:1094–1099），載入檢查因而通過，A 的圖片進入 B 的格位（:1108、:1153–1157）。若新查詢失敗，舊按鈕會一直保留。
  why missed  -> 測試只驗證 API 的 `?deck` 篩選；沒有驗證重新鎖定期間，畫面上既有的工作清單與載入路徑。

TOTAL: 1 findings
