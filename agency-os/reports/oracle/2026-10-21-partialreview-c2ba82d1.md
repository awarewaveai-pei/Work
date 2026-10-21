# codex-oracle review -- 2026-10-21 16:49:53 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/translate.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/translate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/translate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/translate/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot: any-language subject/style translated to English once per deck via new /api/tools/tarot/translate (Haiku, role guard + tarot.prompt grant); buildCardPrompt grounding sentence + airborne flag + scene verb rewrites so figures do not float
- exit: 0 | elapsed: 228761ms | answer: 2355B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/TarotStudio.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/image-gen.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/translate/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/translate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/translate.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/translate.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Latin-script non-English text is treated as English and never translated.
  file:line   -> lobster-factory/.../lib/tarot/translate.ts:9-12 -> lobster-factory/.../app/api/tools/tarot/translate/route.ts:34-35
  confidence  -> CONFIRMED
  scenario    -> User enters Spanish “gato naranja” -> `needsEnglish` returns false, the API returns it unchanged, and the image model receives non-English text.
  why missed  -> Tests cover English and CJK only.

FINDING 2: Automatic style translation permanently pins the old style, so later style-chip changes silently do nothing.
  file:line   -> lobster-factory/.../TarotStudio.tsx:285,486-499 -> lobster-factory/.../TarotStudio.tsx:1737-1743
  confidence  -> CONFIRMED
  scenario    -> User translates “水彩”, then selects an oil-painting chip -> `styleEnglishEdited` remains true, `effectiveEnglish` remains the watercolor translation, and preview regeneration still uses watercolor.
  why missed  -> Manual style editing already used this pinning path; automatic translation was added to it without invalidating it when `stylePrompt` changes.

FINDING 3: Editing subject/style while translation is pending can generate and save an image for stale input.
  file:line   -> lobster-factory/.../TarotStudio.tsx:510-525 -> lobster-factory/.../TarotStudio.tsx:1494-1496
  confidence  -> CONFIRMED
  scenario    -> User starts preview generation with a Chinese subject, edits the subject while translation is pending -> the continuation uses the old closure’s `en.subject`, generates the old character, and saves that image despite the current form value.
  why missed  -> The stale guard checks only `deckGenRef`, which changes on lock/unlock, not ordinary form edits.

FINDING 4: `THE LOVERS` suppresses grounding for its standing subjects because its airborne flag applies to the whole card.
  file:line   -> lobster-factory/.../tools/tarot/cards.ts:37-39,49 -> lobster-factory/.../tools/tarot/cards.ts:309-310
  confidence  -> CONFIRMED
  scenario    -> Generate THE LOVERS with a custom cat -> the scene says the two cats are standing, but `GROUNDING` is omitted because the card is marked airborne for the angel, leaving the grounded subjects without the anti-floating instruction.
  why missed  -> The added test checks only THE FOOL and JUDGEMENT (`cards.test.ts:6-11`).

TOTAL: 4 findings
