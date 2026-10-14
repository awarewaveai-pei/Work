# codex-oracle review -- 2026-10-04 14:03:30 +08:00

- mode: `review`
- scope: whole repo
- target: `a12c697bb..943758013`
- context: COMPUTE block of the cognitive engine (Python FastAPI + Next.js page), written by Claude workers over four commits, three critic rounds already. Rules it must hold: the system runs every calculation through existing modules (break-even, IRR, expected value, Monte Carlo...), each number names its source (a checked claim/card or the person's own input), a bad number is refused in plain words, the AI never writes a number in any spelling (digits, CJK numerals, English words, ordinals, fractions) and never claims what will happen (closed class of future/certainty markers with an allow list of non-future words), the result is always a range (樂觀/悲觀 variation on an input that feeds the result; comparison lines are not ranges), 模擬不是預測 is shown beside every explanation, IRR solves past 53 periods. Find correctness bugs (math, ranges, rounding, period counts), ways round the number and forecast guards, cases where a number shows without its source, and tests that pass with the guard removed. Every finding with file:line.
- exit: 0 | elapsed: 786838ms | answer: 4090B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/compute.py, Projects/internal/cognitive-engineering-os/ai_lego/core/domain/kinds/compute.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/feasibility/irr.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/evidence.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/rulesets/compute.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/[id]/compute/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/lib/errors.ts, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/unit/test_block_compute.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: Falsey malformed scenarios are silently treated as absent.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py:187
  confidence  -> CONFIRMED
  scenario    -> `scenarios={"悲觀": 0}` passes validation as `{}`, so the pessimistic case silently reuses the base value and produces an incorrect range.
  why missed  -> `or {}` runs before the mapping type check, collapsing invalid falsey values into valid empty scenarios.

FINDING 2: The result page does not name the source card for externally sourced numbers.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py:488 -> Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.tsx:127
  confidence  -> CONFIRMED
  scenario    -> A number backed by a checked card titled “銀行定存公告” is displayed only as “有 2 個獨立出處”; the user cannot see which card supplied it.
  why missed  -> The backend retains card IDs, but `sourcing()` reduces them to counts and the UI renders only the resulting words.

FINDING 3: Simplified Chinese numerals bypass the AI number guard.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:32 -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:97
  confidence  -> CONFIRMED
  scenario    -> The AI returns “結果大約是两万元”; `两` and `万` are absent from `NUMERAL`, so the answer is accepted and saved despite containing a number.
  why missed  -> The guard lists traditional CJK numerals but does not cover their simplified equivalents.

FINDING 4: Bare likelihood language is accepted as an outcome claim.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:55 -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:103
  confidence  -> CONFIRMED
  scenario    -> The AI returns “這個結果可能發生。”; `可能` is not in the likelihood markers, so the explanation is saved even though it states likelihood about the outcome.
  why missed  -> The allow/deny logic enumerates compound likelihood phrases but omits the standalone modal.

FINDING 5: A user-provided input name can neutralize a certainty guard.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:95 -> Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:211
  confidence  -> CONFIRMED
  scenario    -> A Monte Carlo item is named `保證`; the AI writes “保證成功”. Because the item name is added to `known` and removed before scanning, the explicit guarantee marker is accepted.
  why missed  -> Known-word removal is global and does not distinguish quoting an input name from using that word as a new certainty claim.

FINDING 6: Rounding mislabels a real flip as exactly on the line.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py:414 -> Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.tsx:103
  confidence  -> CONFIRMED
  scenario    -> A true flip 0.4% below the base stores `change=-0.004`; the UI rounds it to zero and says “結果就在線上”, falsely implying an infinitesimal change.
  why missed  -> The backend rounds the relative change to four decimals, then the frontend rounds percentage points to an integer and uses zero as the on-line condition.

FINDING 7: IRR’s zero-investment negative-income answer gives a false explanation.
  file:line   -> Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py:59
  confidence  -> CONFIRMED
  scenario    -> With initial investment `0` and yearly income `-5000`, the same-sign IRR refusal is stored as “投入的拿不回來”, although nothing was invested.
  why missed  -> The answer branch checks only whether yearly income is nonpositive and ignores the separate zero-initial-investment case.

TOTAL: 7 findings
