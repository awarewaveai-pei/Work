# codex-oracle review -- 2026-10-22 13:35:05 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot deck fixes after a two-model RWS audit: 13 cards' scene/pose corrected to the Rider-Waite-Smith imagery (Fool sun + rose in left hand, Empress seated with orb scepter and pomegranate gown, Hierophant right hand blesses / left holds triple cross, Lovers only the second figure looks up + mountain between, Wheel winged creatures, Death fallen king/bishop/maiden/child, Sun right arm out + red feather, Two of Wands, Four of Wands castle, Two of Swords blindfold in scene, Eight of Swords open side, Six of Pentacles one beggar receives, Eight of Pentacles 8 coins); MINOR_THEMES gives the 56 minor cards their standard upright meanings; new 'couple' option (man-woman default / man-man / woman-woman) genders THE LOVERS' two figures (first {hero} = A, second = B), three buttons in TarotStudio passed to every buildCardPrompt. Check RWS facts in the changed text, that prompts contain no negation words (FLUX draws what 'no/not/without' names), the couple fill logic, and that the UI passes couple everywhere.
- exit: 0 | elapsed: 480878ms | answer: 640B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: THE TWO OF SWORDS generates a duplicated “blindfolded” descriptor.
  lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:159 -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts:410-417
  confidence  -> CONFIRMED
  scenario    -> Default generation uses hero `"blindfolded woman"` plus scene `"a blindfolded {hero}"`, producing `"a blindfolded blindfolded woman"` in the prompt.
  why missed  -> The test at cards.test.ts:20-24 checks generic placeholder presence but never asserts the TWO OF SWORDS prompt output.

Final line: TOTAL: 1 findings
