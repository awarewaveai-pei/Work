# codex-oracle review -- 2026-10-21 16:16:54 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `94c4b7c01`
- context: Tarot studio: deckGenRef + bgJobRef identity; every async continuation (generateOne live(), FileReader save, bg poll isCurrentJob, loadBatchResults isCurrent) re-checks deck/job and Stop before each state write/request; stale bg job dropped not merged; CJK regex covers kana/Hangul. Check: any remaining write/request from a stale deck/job or after stop; any stuck busy/pending state.
- exit: 0 | elapsed: 445262ms | answer: 3170B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Background launch completion can resurrect a job from a replaced deck
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx:826` -> `:589`
  confidence  -> CONFIRMED
  scenario    -> Background POST is pending; user unlocks/relocks, incrementing `deckGenRef`; old POST succeeds and unconditionally sets the old job as running, so the new deck displays and polls stale-job progress.
  why missed  -> The deck is captured before the await, but never revalidated after the response.

FINDING 2: A slow/retrying background run can remain permanently “running”
  file:line   -> `packages/workflows/src/trigger/tarot-batch-generate.ts:41` -> `:84`, `:100`; `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts:84`
  confidence  -> CONFIRMED
  scenario    -> 42 cards each consume two 65-second attempts; the 5,400-second task limit is exceeded before all cards finish. Trigger terminates the task, no final status is written, and the client’s `running` poll continues indefinitely.
  why missed  -> The 90-minute limit was compared with one attempt per card, despite the per-card retry.

FINDING 3: Retried card callbacks can mark a batch done before all cards finish
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts:76` -> `packages/workflows/src/trigger/tarot-batch-generate.ts:84`; `.../app/api/internal/tarot/batch/[jobId]/card/route.ts:89`
  confidence  -> CONFIRMED
  scenario    -> The callback records a card, but its response is lost; the worker retries the same card. The store increments completion and appends the result again without deduplicating `cardIndex`, so the total reaches 78 early and the UI reports done while later cards are missing.
  why missed  -> Retry logic is present in the worker, but the in-memory store treats every callback as a new card.

FINDING 4: Background results disappear after a next-admin restart
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/batch-store.ts:3` -> `:30`, `:58`; `.../app/api/internal/tarot/batch/[jobId]/card/route.ts:34`
  confidence  -> CONFIRMED
  scenario    -> A 20–90 minute job continues while next-admin deploys/restarts. The in-memory map is empty; subsequent callbacks receive `job_not_found`, and the completed Trigger run has no persisted results for the client to load.
  why missed  -> The store comment acknowledges restart loss, but no Trigger rehydration path exists.

FINDING 5: A stale preview response can overwrite a newer edit after deck invalidation
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx:459` -> `:479`; `:1821` -> `:1827`
  confidence  -> CONFIRMED
  scenario    -> Preview A is in flight; the user edits the existing preview, whose handler calls `unlockStyle()` and increments the deck. Preview A then resolves and unconditionally writes its old image/seed over the edited image.
  why missed  -> `deckGenRef` guards card generation, but preview generation has no matching identity check.

TOTAL: 5 findings
