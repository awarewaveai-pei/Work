# Card 42 — TEACH: the page

## Decision
Required reading: `BLOCK_BUILD_GUIDE.md` (UI rules: design-system.css classes only, no inline style, no colour literals, no `<select>`, plain short Chinese, every AI text tagged with its author, works at 400px with no horizontal scroll); look at an existing block page for shape (`apps/cognitive-web/components/blocks/ComputePage.tsx` + its route + test). One screen shows the lesson on one side and the practice on the other at 1280 wide, stacked at 400.

## Constraints
- `COS/apps/cognitive-web/components/blocks/TeachPage.tsx` + route `app/(shell)/projects/[id]/teach/page.tsx`? TEACH is not tied to a case: use the same route family the shell uses for case-free blocks (read how SENSE/LEARN/the assembler pages without a case are routed in `lib/blocks.ts` and `BlockShell.tsx`; `lib/blocks.ts` is S's file: if a registry entry is needed, add ONLY the TEACH entry and say so in the commit message).
- The page: pick a subject (visible buttons or chips, never a dropdown); the 5-minute lesson (title, minutes, text, example; a 草稿 mark when `state` is draft); pick a practice case (its source and the date it was checked are shown); pick a role among the five by buttons; write notes; ask the AI opponent / feedback (every AI text tagged AI); finish with an after-action review form (predicted / happened / missed context / change next time); my completions list. Always shown: 你可以跳過、重來、換案例。 The AI feedback is shown beside the person's own words, never replacing them.
- No score, rank, progress percentage or streak anywhere (a vitest scan over the rendered page text for those words fails the build).
- Errors in plain Chinese through `lib/errors.ts` (union rule: no duplicate keys).

## Files
`apps/cognitive-web/components/blocks/TeachPage.tsx`, `apps/cognitive-web/components/blocks/TeachPage.test.tsx`, the route file, `apps/cognitive-web/lib/errors.ts`, `lib/blocks.ts` (TEACH entry only), `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`npx tsc --noEmit` exit 0; `npx vitest run components/blocks/TeachPage.test.tsx` green: draft mark shown for draft lessons, not for reviewed; five role buttons and no `<select>`; the forbidden-words scan; the source and check date of a case are visible; the skip/redo text is present; an AI sentence carries the AI tag. Mutations to report: remove the draft mark -> red; render a `<select>` -> red; add the word 進度 -> red. A page walk is part of card 80, not this card.
