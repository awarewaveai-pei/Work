# codex-oracle review -- 2026-10-04 14:54:00 +08:00

- mode: `review`
- scope: whole repo
- target: `7c21d3bb9`
- context: COMPUTE round 4 (Claude-written) answering your earlier review of the COMPUTE block. Check that each fix closes its WHOLE class and nothing regressed: (1) only an absent value is none (a sweep of the or-empty pattern; a gate test lists 113 reviewed harmless sites: look for a site that is NOT harmless), (2) each number names its source cards with titles and a link, (3) one list of numeral forms (traditional, simplified, financial, English words) for the AI number guard, (4) the likelihood-word family with an allow-list of non-likelihood uses, (5) a person's item name never unlocks a forecast word, (6) 就在線上 only when the stored change is exactly 0, otherwise one decimal, (7) IRR same-sign refusal says its true cause for each case. Also look for: a way the AI still writes a number or a forecast, a place a number shows without its source, rounding/period-count bugs in IRR/break-even, tests that pass with the guard removed. Every finding with file:line.
- exit: 0 | elapsed: 264745ms | answer: 1362B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/block_hooks/compute.py, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.test.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.tsx, Projects/internal/cognitive-engineering-os/docs/platform/STEP2_CHECKLIST.md, Projects/internal/cognitive-engineering-os/tests/unit/test_absent_is_none.py, Projects/internal/cognitive-engineering-os/tests/unit/test_block_compute.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: English likelihood modals still bypass the forecast guard  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:80`  
  confidence  -> CONFIRMED  
  scenario    -> The AI answers “The project might lose money.”; `might` matches none of the marker patterns, so the forecast is saved.  
  why missed  -> The new corpus tests likely/probably/perhaps, but not `might`, `may`, or `could`.

FINDING 2: ASCII Roman numerals bypass the number guard  
  file:line   -> `Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_actions/compute.py:35`  
  confidence  -> CONFIRMED  
  scenario    -> The AI answers “There are IV periods.”; `ROMAN` only matches Unicode Roman numeral characters, so `IV` is accepted as prose.  
  why missed  -> The added numeral tests cover CJK forms, not ASCII Roman forms.

FINDING 3: Non-zero integral percentage changes omit the required decimal  
  file:line   -> `Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/blocks/ComputePage.tsx:111`  
  confidence  -> CONFIRMED  
  scenario    -> A stored change of `0.01` renders “多 1%” instead of “多 1.0%”; `maximumFractionDigits` does not require one fractional digit.  
  why missed  -> Tests cover `43.3%`, `1.3%`, and `<1%`, but no exact integral percentage.

TOTAL: 3 findings
