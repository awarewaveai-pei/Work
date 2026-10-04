# Card 22 — COLLAB: the page

## Decision
Required reading: `BLOCK_BUILD_GUIDE.md` UI rules; `apps/cognitive-web/components/blocks/ComputePage.tsx` + test for shape; cards 20-21 on this tree. The page is where five people hold one decision without anyone being talked over. One screen, one thing at a time per round.

## Constraints
- Routes: a group is not a case, so the page lives at the shell's group area (`app/(shell)/groups/[id]/page.tsx`) and the registry entry in `lib/blocks.ts` follows how case-free blocks are listed (S's file: add only the COLLAB entry; say so in the commit message). A list page `app/(shell)/groups/page.tsx` (my groups; create a group: name and purpose by buttons; invitations are created here too: show the link once with a copy button and the words 「這個連結只出現這一次」; revoke).
- The group page, in this order: the question (versions all shown); "寫自己的立場" (the person writes first; until saved the page shows only a plain line 「寫完，才看得到別人的」 and NO other member's text anywhere, including network responses: a vitest asserts the fetch for others' positions is not even issued before saving and that nothing renders from a mocked early response); after saving: others' positions side by side; "你想法有沒有變" (one sentence); the six interface questions (blind, same rule); options side by side (evidence, risks, values trade-off); stance per option with a reason (同意 / 異議 as two visible buttons); dissent kept section; authority (who granted what; each person revokes only their own share; the page shows the recomputed scope and 「範圍要重新談」 when it changed); closing (the four required fields); reopen button visible to every member at all times; "大家怎麼看" from card 21 with the plain sentence for `insufficient`; held members listed with why; AI help buttons (organise differences, restate positions, who has not been heard) with every AI text tagged AI, restatements shown to their subject first with a 「說錯了」 button.
- A badge on the page header: 「這是程序工具。它不保證公平，也不保證大家真的同意。」 (the contract's own line).
- No vote counts shown anywhere; no ranking; a vitest scans rendered text for `票`, `排名`, `分數`, `%` next to an option.
- Plain short Chinese, design-system.css only, no `<select>`, 400px no horizontal scroll, errors via `lib/errors.ts`.

## Files
`apps/cognitive-web/components/blocks/CollabPage.tsx`, `CollabPage.test.tsx`, `GroupsPage.tsx` + test, the two route files, `lib/errors.ts`, `lib/blocks.ts` (COLLAB entry), `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`npx tsc --noEmit` exit 0; vitest for both pages green: blind behaviour (no request and no render of others' positions before saving); the objection button never renders as a count; revoke affects only the revoker's share in the rendered text; the header badge present; the forbidden-words scan; held-member text; AI restatement tagged and the 「說錯了」 control present. Mutations: fetch others' positions before saving -> red; render a vote count -> red; remove the badge -> red.
