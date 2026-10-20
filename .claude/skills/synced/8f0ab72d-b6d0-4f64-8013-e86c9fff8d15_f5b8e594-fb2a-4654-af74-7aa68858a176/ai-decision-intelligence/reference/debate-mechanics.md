# Debate Mechanics Reference

This document covers the operational rules for running debates: how rounds proceed, how to detect and handle problems, when to terminate.

---

## Round structure

### R1: Opening Statements

- Each advocate speaks ONCE
- 200-300 word opening statement
- No interruption, no cross-talk
- Advocates can preemptively acknowledge weakness

### R2: Cross-Examination

- Each advocate speaks ONCE in this round
- Each delivers: 2 attacks (against other candidates) + defenses (against attacks made on them)
- The order of speakers matters less than the content
- After R2, the debate is closed for advocate input

### Reviews

- Specialist reviews (Stage 8) happen after R2 advocates have spoken
- Reviewers see all R1 + R2 transcript
- Reviewers can challenge advocate claims explicitly
- Reviewers don't debate each other directly (each is independent)

### Skeptic

- Skeptic operates AFTER all reviewers
- Skeptic sees everything (R1, R2, all reviews)
- Skeptic finds what nobody else caught

### Judge

- Judge synthesizes ALL of the above
- Judge produces final ranking + recommendation

---

## Quality detection rules

The debate has gone wrong if any of these are true. Detect and correct:

### Detection: All advocates agreeing

**Signal:** R2 contains no real attacks, or attacks are watered down ("X is great but Y might be slightly better in some cases")

**Cause:** Agents not embodying their assigned candidate strongly enough

**Correction:** Re-do R2 with stronger prompt. Each advocate must produce 2 specific attacks with technical evidence. If they can't, the debate is genuinely close — note that in confidence calibration.

### Detection: Hedging defenses

**Signal:** Defenses include phrases like "could go either way," "depends on context," "we'd evaluate that"

**Cause:** Advocate punting rather than defending

**Correction:** Defenses must be one of: rebut (with evidence), mitigate (with specific action), reframe (with reasoning). If none works, the attack stands and goes into `concessions`.

### Detection: Generic Skeptic concerns

**Signal:** Every candidate has roughly the same fatal flaw description ("might not scale," "could have security issues")

**Cause:** Skeptic not doing the work

**Correction:** Each fatal flaw must cite specific mechanism, evidence, or reference. If not, set `fatal_flaw: null` for that candidate.

### Detection: Tradeoff matrix shows no differentiation

**Signal:** Every candidate scores 6-8 on every dimension

**Cause:** Reviewer scores not calibrated against each other

**Correction:** Re-examine reviewer outputs. Force a forced ranking exercise: for each dimension, which candidate is the best, and which is the worst? If you can't tell, scores need refinement.

### Detection: Judge picking the last-discussed candidate

**Signal:** Judge's #1 was the candidate most recently spoken about in cross-exam

**Cause:** Recency bias

**Correction:** Mentally re-order candidates. If Judge's pick changes, reconsider. State explicitly in `recency_bias_check`.

---

## Duplicate suppression

Across the debate, agents may surface similar concerns. Don't include them multiple times in the final document.

**Rule:** Each unique concern appears in **the most appropriate single section**:

- If it's a security concern, Security Reviewer's section
- If Skeptic catches it, AND it was missed by reviewers, Skeptic gets credit
- If Skeptic catches it AND a reviewer also flagged it, mention briefly in Skeptic noting "echoes Security Reviewer's concern X"

Avoid: same point made fully in 4 different sections, padding the document.

---

## Contradiction handling

When two reviewers contradict each other (e.g., Security says "high risk," DevOps says "well-handled"):

1. **Don't auto-resolve.** Both perspectives may be valid for different aspects.
2. **Surface the contradiction explicitly** in the Judge's reasoning.
3. **Judge picks a side or weights the tradeoff** — doesn't paper over.

Example: "Security flagged data residency concern; DevOps said vendor's compliance posture is solid. Judge weights: data residency is a contractual fix (DPA addendum); operational quality is harder to add later. Judge sides with DevOps assessment overall, with data residency added as a contractual prerequisite (Risk Register)."

---

## Termination conditions

### Early termination at Stage 12 (Confidence Check)

If after Judge synthesis, `confidence < 0.4`:

- DO NOT produce a strong recommendation
- Output: "I cannot recommend with confidence. Here's why and what I'd need."
- List specific information that would raise confidence
- Suggest: pilot/POC at small scale, or specific tests to run, or specific clarifications from user

This is **honest** behavior, not failure.

### Mid-debate termination

If during the debate you discover a fundamental issue with the user's framing (e.g., user is asking the wrong question), pause and surface this:

- "Before continuing, I notice [X]. The decision you're framing is downstream of [Y]. Would you like me to address [Y] first, or proceed with the original question?"

Don't silently re-frame the question. Make it visible.

---

## Context-window management

For long debates, be efficient about what you carry forward:

| Stage | Carry forward |
|-------|---------------|
| 1 → 2 | Topic analysis output |
| 2 → 3 | Topic analysis + clarification answers |
| 3 → 4 | Context object |
| 4 → 5 | Context + candidate list (key facts only, not full research dumps) |
| 5 → 6 | Above + assigned roles |
| 6 → 7 | Above + R1 statements summarized |
| 7 → 8 | Above + R2 attacks/defenses |
| 8 → 9 | Above + reviewer key findings (not full reviews) |
| 9 → 10 | Above + skeptic findings |
| 10 → 11 | Tradeoff matrix |
| 11 → 12 | Judge output |
| 12 → 13+ | Recommendation only (planners don't need full debate) |

When context gets tight (approaching limits), summarize earlier rounds rather than carrying full transcripts.

---

## When the user is in the loop

The user may interrupt mid-debate to add information, change scope, or push back on early findings. Handle:

- **User adds info:** Update Context Object; replay affected stages with updated context
- **User changes scope:** Decide whether to restart Stage 1 or continue with note
- **User pushes back on a candidate's elimination:** Re-include and re-run Stages 6-11 with that candidate; update output

Don't treat the debate as fully autonomous. The user has authority to redirect.
