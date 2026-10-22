# codex-oracle review -- 2026-10-23 00:07:36 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/model-specs.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Tarot prompt rework. (1) ??餉??(animal-natural) contradicted itself: the opening said four legs but the scene said 'holding a white rose in the left hand', so FLUX drew the cat standing. Now every upright card (62) has a full four-legged 
atural action keeping posture, gaze, direction and the meaning gesture; held props/hand gestures live only in pose/natural; scenes of upright cards contain no hand words (test). PROP_PLACEMENT/holds/naturalPlacement/NATURAL_SENTENCE removed. Natural mode inserts 'an ordinary real four-legged animal' after the subject (groups: prefix, and '{hero} figures' -> '{hero} animals'). (2) content-first (FLUX schnell, 255 T5 tokens measured with the real T5 v1.1 sentencepiece model: old prompts were 306-356 tokens and the Van Gogh swirls/palette were cut): style detail after the scene is reordered technique-rest, palette, forms, composition, mood (catalog prompts are all 5 sentences), the closing filler is dropped, GROUNDING shortened. Check RWS meaning kept per card, person-mode prompts still carry the held props, and anything that depends on the removed exports. If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 233287ms | answer: 1795B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/tarot/cards.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tarot/__tests__/model-specs.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The hand-word regression test matches backspace characters, not word boundaries.
  file:line   -> lobster-factory/.../tools/tarot/cards.test.ts:56
  confidence  -> CONFIRMED
  scenario    -> An upright scene regresses to “holding a wand” -> `HANDS.test("holding")` is false, so the test passes.
  why missed  -> The escaped `\b` was written as U+0008 in the source.

FINDING 2: Content-first style reordering silently fails when users select multiple style presets.
  file:line   -> lobster-factory/.../tools/tarot/cards.ts:467; TarotStudio.tsx:1855
  confidence  -> CONFIRMED
  scenario    -> Two catalog styles are selected -> the combined prompt has 10 sentences, bypasses the `sentences.length === 5` reorder, and leaves composition/forms before palette.
  why missed  -> The test exercises only one five-sentence style.

FINDING 3: The shortened grounding sentence contradicts cards whose person pose is kneeling.
  file:line   -> lobster-factory/.../tools/tarot/cards.ts:82; cards.ts:293
  confidence  -> CONFIRMED
  scenario    -> Default THE STAR prompt -> it says “kneeling” and then says every figure “stands, sits or lies,” allowing the model to render the subject non-kneeling.
  why missed  -> The grounding change was reviewed as token reduction without checking all existing pose verbs.

FINDING 4: FOUR OF WANDS natural mode contains an impossible posture.
  file:line   -> lobster-factory/.../tools/tarot/cards.ts:112; cards.ts:407
  confidence  -> CONFIRMED
  scenario    -> Natural animal FOUR OF WANDS -> prompt says “two ... animals sitting side by side on all four paws,” forcing the model to choose between sitting and standing.
  why missed  -> Tests validate token presence and forbidden hand words, not posture consistency.

TOTAL: 4 findings
