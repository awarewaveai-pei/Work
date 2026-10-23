# codex-oracle review -- 2026-10-23 16:33:13 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot prompt data: every protagonist becomes a swappable {hero} (THE MOON duo dog/wolf -> tame/wild subject via new duo field; Aces hand and Wheel sphinx get pose+{hero}, Aces airborne); protagonist clothing moved from scene into default hero so animal subjects drop it; THE LOVERS text left-to-right with figure A = woman (coupleHeroes man-woman now [woman, man]); RWS fixes from the 78 original card images (7 of Pentacles 6+1, Knight of Swords white horse, 8 of Swords red dress + white bands, Devil goat-horned, Tower red cloak/crowned). Also verify: does this change depend on something NOT visible in this diff (config, caller relying on coupleHeroes order, UI/batch code that assumes figure-less cards lack {hero})? If it contradicts the change report it. If you cannot support a real finding, return no findings; do not invent weak or speculative findings.
- exit: 0 | elapsed: 254731ms | answer: 802B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The clothing migration is incomplete; swapped animals still inherit protagonist costumes.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:90,138,141 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:394,409,413
  confidence  -> CONFIRMED
  scenario    -> subject `"a blue cat"` on EIGHT OF CUPS, FIVE OF CUPS, or THE TOWER -> generated prompt contains `"blue cat in a red cloak"`, `"blue cat in a black cloak"`, or `"blue cat in a red cloak"` / `"crowned blue cat"`, so the animal remains clothed.
  why missed  -> the new regression test only checks that `"blue cat"` appears in the prompt at cards.test.ts:27-32; it never asserts that protagonist clothing disappears.

TOTAL: 1 finding
