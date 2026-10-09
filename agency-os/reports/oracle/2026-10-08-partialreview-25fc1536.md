# codex-oracle review -- 2026-10-08 15:48:03 +08:00

- mode: `review`
- scope: whole repo
- target: `5dbff71c0..ece032656`
- context: COLLAB cards 20-22 (group positions blind by round, stances blind by option, dissent records, authority shares, close/reopen, agreement view, AI restatements in groups, /groups pages). Report ONLY: (1) privacy/visibility/erasure/consent/ownership guard failures (seeing others' positions before saving your own, majority shown before everyone wrote, another member's identity or counts leaking, editing another member's record, AI reading unfenced member text, restatement shown before the person confirms), (2) data loss (e.g. objection saved without its dissent record), (3) CI or main-path breaks. file:line for each. No style, polish or test-rigor findings.
- exit: 0 | elapsed: 555899ms | answer: 2597B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/collab.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/doc_kinds.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/collab.py, Projects/internal/cognitive-engineering-os/ai_lego/data/repositories/case_docs.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/collab.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_gate.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/collab.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/collab_agreement.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/integrity.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/collab.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/visibility.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/groups/[id]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/groups/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/CollabPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/CollabPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GroupsPage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/GroupsPage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/groups.ts, Projects/internal/cognitive-engineering-os/docs/platform/STEP34_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_collab.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collab_agreement.py, Projects/internal/cognitive-engineering-os/tests/unit/test_collab_ai.py, Projects/internal/cognitive-engineering-os/tests/unit/test_visibility.py, agency-os/reports/review-debt.md
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Partial interface answers unlock the whole round’s blind records
  file:line   -> `platform/block_hooks/collab.py:62` -> `core/domain/kinds/collab.py:52`
  confidence  -> CONFIRMED
  scenario    -> A member saves one of five interface answers; validation accepts it, but `blind="round"` then lets them read every other member’s answers for that round before answering the remaining four.
  why missed  -> The check validates non-empty, valid entries but never requires all questions.

FINDING 2: An objection can commit without its dissent record
  file:line   -> `apps/api/blocks/collab.py:114` -> `platform/block_hooks/collab.py:137`
  confidence  -> CONFIRMED
  scenario    -> The stance transaction commits, then the process crashes before `after_group_save`’s separate `docs.save`; the objection remains but `view/dissent` is permanently missing it.
  why missed  -> The derived-record write happens after the main save rather than in the same transaction.

FINDING 3: Duplicate authority grants make revocation incomplete
  file:line   -> `platform/block_hooks/collab.py:46` -> `apps/api/blocks/collab.py:152`
  confidence  -> CONFIRMED
  scenario    -> A member grants the same scope twice, then revokes the returned share ID; the second live share remains, so the representative still represents that member.
  why missed  -> Authority is omitted from the one-per-member duplicate guard, while the view exposes only the first share as `my_share`.

FINDING 4: Handoff pointers remain visible after group access is gone
  file:line   -> `apps/api/blocks/collab.py:291` -> `apps/api/blocks/collab.py:293`
  confidence  -> CONFIRMED
  scenario    -> A convener hands off a closing, then leaves or the group is erased; `/projects/{id}/collab/handoffs` still returns the pointer’s group ID, closing ID, and destination with only the resolved closing set to `null`.
  why missed  -> The code conditionally suppresses only the dereferenced closing content but appends the pointer unconditionally.

FINDING 5: An old “說錯了” confirmation blocks unrelated future restatements
  file:line   -> `platform/ai_actions/collab.py:83` -> `platform/ai_actions/collab.py:84`
  confidence  -> CONFIRMED
  scenario    -> A member marked an earlier restatement wrong; when another member later asks AI to restate that person’s new position, the latest confirmation by that person is “說錯了,” so the new request is refused without calling AI.
  why missed  -> The lookup filters confirmations by confirmer identity, not by the current restatement/position.

TOTAL: 5 findings
