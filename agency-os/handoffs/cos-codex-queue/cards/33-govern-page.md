# Card 33 — GOVERN: the pages (consent, appeals, research choice, my data, the case's audit line)

## Decision
Required reading: `BLOCK_BUILD_GUIDE.md` UI rules; the existing GOVERN page (`apps/cognitive-web/components/blocks/GovernPage.tsx`) and its test; cards 13, 30-32 on this tree. The person sees and controls everything about their own data in one place, in plain Chinese.

## Constraints
- Sections added to the GOVERN page / a new route `app/(shell)/me/data/page.tsx` for what is not case-bound: **Consents** (list, per item: what is shared, with whom (group/facilitator/research), since when; withdraw button on each; creating a consent chooses items from my cases by visible checkboxes, never "share everything"); **Appeals** (write one about a facilitator I met in a group, anonymous by default with a visible switch to give my name; see, export, delete mine; handlers/supervisors see the masked list); **Research** (a plain explanation, the sentence that the file removes the account and three places but does not guarantee anonymity, the reminder to remove names from the text first, per-study opt-in and withdraw); **My data** (export, erase my account: existing routes; show what stays/leaves); **This case's audit line** (card 32's route, in words); **No record** switch shown when opening a case with the explanation (text from card 32).
- Everything a facilitator or another member reads is previewed to the person BEFORE they consent: a consent dialog shows the exact items and who will see them.
- Plain short Chinese, design-system.css only, no `<select>`, 400px without horizontal scroll, errors through `lib/errors.ts`; no score/rank wording; each AI-authored text tagged.

## Files
`apps/cognitive-web/components/blocks/GovernPage.tsx` (+ test), `app/(shell)/me/data/page.tsx` (+ component + test), `lib/errors.ts`, `lib/blocks.ts` (GOVERN entry changes only if needed), `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`npx tsc --noEmit` exit 0; vitest green: withdraw sends the request and the list updates; the consent creation lists items per case and has no "share all" control; appeal form defaults anonymous; the anonymity-not-guaranteed sentence is present on the research section; the no-record warning text is shown before the switch can be turned on; no `<select>`; forbidden-words scan. Mutations: add a "share all" button -> red; default `named` to true -> red; remove the warning -> red.
