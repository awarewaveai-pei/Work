# Card 62 — FACILITATE: the AI practice partner, the deviation pointer, and the page

## Decision
Required reading: `FACILITATE.card.txt` lines 「AI 能做什麼 / 不准做什麼」, `BLOCK_BUILD_GUIDE.md` UI rules, cards 60-61. The AI plays a practice participant so the leader can rehearse, and while the leader writes the log it points at places that may deviate from the principles. It never scores a leader, never leads participants, never reads what a participant did not consent to show.

## Constraints
- `ai_actions/facilitate.py`: `play_participant` (reads the reviewed script and the practice case; answers as a participant would, in character; no real participant data), `point_at_deviations` (reads the facilitator's own log draft and the script version; returns possible deviations from the don't-list with the line of the log and the don't it touches; never a score, never a ranking, never a verdict that something IS wrong: wording is 「這裡可能偏離」). Both: no score/rank key; the handback line from the card: whether to change the way of leading is for the facilitator and the supervisor; the AI only points (a fixed system sentence appended to every output of `point_at_deviations`).
- `AiAction.reads` exactly the card's 「讀什麼」; nothing that is a participant's record is in `reads` of either action (a gate test over `ai_actions/facilitate.py`).
- Page `FacilitatePage.tsx` + routes in the group area (`app/(shell)/groups/[id]/lead/page.tsx`) and a train/supervise area (`app/(shell)/lead/page.tsx`): the leader's course (card 40/60 lessons), practise with the AI participant, the script step by step with the don't-list ALWAYS visible and the stop signals highlighted when a participant says they want to stop (a button 「參與者要停」 which stops the step and shows the escalation and GOVERN's resources for that participant's place without naming anything private), the consented items of participants (only those: the list shows who consented to what), write the log (followed / deviated + why), supervision (list supervisees' logs and masked appeals, write feedback), the group unit-assigned supervisor note. Plain short Chinese; design-system.css only; no `<select>`; 400px; AI text tagged.
- No score, ranking or leaderboard wording anywhere; a vitest scan over the rendered text.

## Files
`ai_lego/platform/ai_actions/facilitate.py`, `apps/cognitive-web/components/blocks/FacilitatePage.tsx` (+ test), the route files, `lib/errors.ts`, `lib/blocks.ts` (FACILITATE entry), `tests/unit/test_facilitate_ai.py`, `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
Engine: `tests/unit/test_facilitate_ai.py` (no participant record in reads; no score key; the fixed handback sentence present on every deviation output; the AI never writes a log). Web: `npx tsc --noEmit`; vitest: don't-list always rendered; the stop button shows escalation and resources; only consented items listed; the forbidden-words scan; supervisee logs listed and appeals masked. Mutations: add a participant kind to `reads` -> red; drop the handback sentence -> red; hide the don't-list -> red; render a rank word -> red.
