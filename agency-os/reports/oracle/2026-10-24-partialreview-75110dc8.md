# codex-oracle review -- 2026-10-24 00:59:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Prompt data only. The Six..Ten pip cards' `objects` text (inserted once at {objects} in pose/natural) now states each count as small groups and follows the RWS reference images in agency-os/docs/tarot_cards/Tarot card Images/ (e.g. Nine of Cups: the man sits on a wooden bench in the foreground, nine cups in one row on a high blue-draped table behind; Nine of Swords: nine horizontal swords stacked in one column; Ten of Pentacles: ten coins floating in three columns). FLUX schnell drew 2-5 objects reliably but 6+ wrong; grouping raised exact counts from ~18% to ~32% on 20 cards x 2 seeds. Invariants kept and tested in cards.test.ts: each pip card names its suit noun exactly once in the whole prompt, the count word sits in the first sentence, upright cards' objects contain no hand words. Check: any objects text that names its suit noun twice, a count that no longer adds up to the card number, or a hand/holding word on an upright card. If you cannot support a real finding, return no findings; do not invent weak or speculative findings.
- exit: 0 | elapsed: 270691ms | answer: 542B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Nine of Pentacles specifies the wrong coin layout relative to the RWS reference.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:183
  confidence  -> CONFIRMED
  scenario    -> Generating Nine of Pentacles directs six coins into two left stacks and three on the right, producing a 6/3 layout instead of the reference image’s 5/4 distribution.
  why missed  -> Tests validate total count and suit-noun invariants, but not per-card spatial arrangement.

TOTAL: 1 findings
