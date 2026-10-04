# Card 52 — EXPRESS: the page, and the proposal link into a group

## Decision
Required reading: `BLOCK_BUILD_GUIDE.md` UI rules; `apps/cognitive-web/components/blocks/ComputePage.tsx` (+ test) as the shape; cards 50-51. Part A is the page. Part B (the proposal link) is built only if `collab.proposal` exists on this worktree's tree (`grep -rn "collab.proposal" ai_lego`); otherwise do part A, list B in `STEP34_CHECKLIST.md` as waiting for card 20, and say so in the final message.

## Constraints (part A)
- `ExpressPage.tsx` + route under the case (`app/(shell)/projects/[id]/express/page.tsx`) + a registry entry in `lib/blocks.ts` (EXPRESS only). Flow in one screen: pick who it is for and the format (visible buttons, no `<select>`); write the few points you want to say; pick which judgments and evidence to bring (a list of the case's records with checkboxes: this is `express.selection`); see the outline; ask the AI to draft; read and rewrite the draft sentence by sentence; every sentence shows its sources (click: the record it came from), an 「還沒查證」 mark where `unchecked`, an AI tag where `author: "ai"`; the person's confidence and uncertainties stay visible; export buttons per format; a single send button that shows the unchecked warning and requires the confirm click.
- Plain short Chinese, design-system.css only, 400px with no horizontal scroll, errors through `lib/errors.ts`.
## Constraints (part B)
- A button 「交給大家當提案」 visible only when the person is in an open group: it writes a `collab.proposal` (card 20's kind) `{express_draft, text}` into the group through the group route, with the draft's text at that version; no other part of the case is shared. It never sends outside the group.

## Files
`apps/cognitive-web/components/blocks/ExpressPage.tsx`, `ExpressPage.test.tsx`, the route file, `lib/errors.ts`, `lib/blocks.ts` (EXPRESS entry), `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`npx tsc --noEmit` exit 0; `npx vitest run components/blocks/ExpressPage.test.tsx`: the unchecked mark and AI tag render; the send button needs the confirm click when unchecked sentences exist; the selection list sends only checked records; no `<select>`; the confidence text is rendered; (part B) the proposal button is absent outside a group. Mutations: remove the unchecked mark -> red; make the send button submit without confirm -> red; render a select -> red.
