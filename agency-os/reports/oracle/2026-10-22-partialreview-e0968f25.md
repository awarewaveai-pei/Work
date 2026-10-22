# codex-oracle review -- 2026-10-22 11:23:13 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: tarot: per-card pose sentence leads the prompt before the style lead; upright flag + explicit animal checkbox adds a stand-upright sentence for non-human subjects; Fool scene negation rephrased. NOTE: the index holds a stale staged hunk from another session reverting 9d29bb1d9; review the working tree vs HEAD.
- exit: 0 | elapsed: 138173ms | answer: 786B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/README.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The animal upright instruction is singular, so multi-figure cards do not explicitly constrain every animal.
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:279` -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:101`
  confidence  -> PLAUSIBLE
  scenario    -> Animal subject with the checkbox enabled on FOUR OF WANDS produces two figures raising bouquets, but only “The fox stands or sits upright…”; the model may render one upright fox and one quadruped unable to raise its bouquet.
  why missed  -> The test verifies only that the singular sentence exists, while the comment assumes the image model will generalize it to every figure.

Final: TOTAL: 1 findings
