# Build step 2 — what is built, what is not yet (one line each; the card line it comes from in 「」)

Owners: S = supervisor session; 甲 GATHER; 乙 VERIFY; 丙 COMPUTE; 丁 collector wire. Rules: `STEP2_SHARED_RULES.md`.

## Shared (S) — 2026-10-04
- built: the words and the three states of a cell, once (`core/domain/evidence_words.py`); the counting rules once (`platform/evidence.py`: `origins`, `checked_claims`, `calc_results`)
- built: the records other blocks read (`gather.source`, `gather.origins`, `gather.split`, `gather.takeback`, `gather.mark`, `verify.claim`, `verify.stance`, `verify.search`, `verify.verdict`, `compute.run`, `compute.adopt`)
- built: 「首版 AI 可以引用外部資料，但只能引用 GATHER 找回來、有來源卡的；AI 自己記得的不算」 -- `AiAction.cites`: the gate gives only the case's cards not set aside, fenced; a citation outside them or a quote not in the cited text = nothing saved (`AI_ANSWER_UNCITED`); a source's words are added after the crisis check
- built: 「交還控制：…不到兩個時，系統停下來」 -- `AiAction.handback`: no model call, the reason goes back to the page
- built: 「名單和規則改版時，由 GOVERN 記錄」 -- `platform/rulesets`: a list changed without a new version is refused; GOVERN's versions page lists every ruleset
- built: sources arriving (every ingested batch, a run's end, a paste) run the blocks' `AFTER_SOURCES` hooks in one background pool, one case at a time, GATHER first; a failing hook is logged, stops the later ones for that arrival, never fails the paste or the collector's callback
- built (critic 2026-10-04, 1C/14M): the counted card is the cited source's card and every object that quotes or names a card cites; an output kind with citations is written only by a citing action; the crisis check comes before a hand-back; hand-backs count through `read.evidence`; a stance counts only for the claim version and page snapshot it was read from; one stored page or snapshot is one origin; a card not grouped yet is not counted; an origin's id is its cards, so a regroup never moves a mark; 查不到 only when every counted origin was read; the person can rewrite the AI's stance (joint); the person's classification is a record (`gather.override`); a ruleset stamp carries its fingerprint and a recorded version is never rewritten; one quote normaliser with a minimum length
- DECISION: the person's own words and the message being checked are never stored as a source (a message stored as a source would support itself); enforced by each block's page and tests, not by the sources route
- NOT YET (S, at integration): LEARN's 「你標錯的出處」 is free text today (`learn.calibration.wrong_sources[].source`); LearnPage must pick a card or origin so `origins()[].wrong_in_review` can match it
- KNOWN LIMIT: the hooks' per-case lock is in-process (the API runs one uvicorn worker: Dockerfile CMD); a second worker would need the file lock (`platform/workflow/run_lock.py`)

## GATHER (甲)

## VERIFY (乙)

## COMPUTE (丙)

## Collector wire (丁)
