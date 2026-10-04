# Card 70 — the ten process indicators (presence facts, never a score)

## Decision
Required reading: `STEP34_SHARED_RULES.md` §14; `COLLAB.card.txt` lines on 「公共決策怎麼量」 (blueprint appendix A8) and blueprint §12 (what may never be a single success metric). The platform measures the PROCESS of judging, not anyone's belief: for each case or group it says which of ten things are present, with pointers to the records that show it.

## Constraints
- `COS/ai_lego/platform/indicators.py`: ten pure functions over records read through the caller's allowed paths, each `(records) -> {"present": bool, "evidence": [{"kind", "doc_id", "owner"}]}`: dissent_kept, reopen_condition_written, review_held_after_decision, positions_restated_correctly (a `collab.restatement` the subject confirmed), claims_with_source_share (a count of claims that have a source over claims: return both numbers as facts `{with_source, claims}`, no percentage), facts_law_values_separate (the claim ledger has all three sentence kinds), assumptions_stated, evidence_conditions_stated, ai_trust_calibrated (an AI proposal accepted or overridden with a reason recorded), modules_chosen_adjusted_or_off_with_reason. Each states in its docstring which records it reads and why that proves presence.
- Forbidden (tests): any numeric field named score/rank/rating/index; any comparison across people (no function takes two identities); any aggregate "overall" value; any use of belief content or agreement with a conclusion.
- Where it is used: GOVERN's research export may include the indicator facts of consented items (card 31 calls these functions on the consented records only); the group and case pages may show a case's own present/absent list to the people in it (a read route `GET /projects/{id}/indicators`, `GET /groups/{id}/indicators`; members only; group indicators computed from group records members can see through R1).
- Never show an indicator as a grade: the page text for each is a sentence about the case (「異議有保留下來」/「還沒寫什麼條件下重開」).

## Files
`ai_lego/platform/indicators.py`, `ai_lego/apps/api/blocks/govern_group.py` (the two read routes), `tests/unit/test_indicators.py`, `docs/platform/STEP34_CHECKLIST.md`, `agency-os/reports/review-debt.md`.

## Acceptance
`tests/unit/test_indicators.py`: for each indicator a present case and an absent case built from real kinds; the evidence pointers resolve to existing records; the forbidden-shape scans (source scan of `indicators.py` and a runtime scan of every returned dict); the routes return only what the caller may see (a non-member 404; group indicators computed without records of blind rounds the caller has not unlocked); claims-with-source returns two integers. Mutations: add a `score` key -> red; compute from content text -> red; let a non-member read -> red.
