# Context Management Reference

How to keep the multi-agent debate manageable across long conversations and many stages.

---

## The Context Object

Stage 3 produces a `ContextObject` that anchors all downstream stages. Every reviewer and advocate must reference it explicitly. It looks like:

```json
{
  "primary_decision": "<from Topic Analyzer>",
  "scale_profile": {
    "current_scale": "<numerical scale: 30 sites, 1k users, 10TB data>",
    "projected_12mo": "<expected growth>",
    "projected_36mo": "<longer-term>"
  },
  "team_profile": {
    "size": "<1-5, 5-20, 20-100, 100+>",
    "domain_expertise": "<high/med/low for the relevant domain>",
    "devops_expertise": "<high/med/low>",
    "available_hours_per_week": "<for this initiative>"
  },
  "constraints": {
    "must_have": ["<hard requirements>"],
    "must_not": ["<hard exclusions>"],
    "preferences": ["<soft preferences>"],
    "compliance": ["<applicable regulations>"]
  },
  "budget_band": "<tight / moderate / generous / TCO-optimal>",
  "risk_tolerance": "<low / medium / high>",
  "timeline_pressure": "<urgent / standard / patient>",
  "current_solution": "<status quo if any>",
  "exit_criteria": "<what would tell user we picked wrong>"
}
```

Build this from the user's message + clarifications. If a field is unknown, either:
- Ask a clarifying question (Stage 2)
- Set a documented default with explicit assumption

**Don't proceed without `primary_decision`, `scale_profile`, and `team_profile` at minimum.**

---

## What each agent sees

To manage context window length, agents have **memory views** — they don't see everything verbatim:

### Topic Analyzer
Sees: user query only

### Research Agent
Sees: Topic Analyzer output + ContextObject

### Advocate (R1)
Sees: ContextObject + assigned candidate's full research_facts + topic_type

### Advocate (R2)
Sees: above + R1 statements (full) + the 2-3 candidates they're attacking (research summaries)

### Reviewers (Stage 8)
Sees: ContextObject + all candidates with research_facts + R1 + R2 transcripts

### Skeptic
Sees: Everything (this is why Skeptic catches what others missed)

### Judge
Sees: Everything (final synthesis requires full information)

### Installation Planner
Sees: ContextObject + chosen candidate + Judge output (just primary recommendation, not full debate)

### Rollout Planner
Sees: ContextObject + chosen candidate + Judge output + Installation Plan (especially limited-production phase)

---

## When context gets long

For very complex debates with 7+ candidates and many specialists, the full transcript can balloon. Strategies:

### 1. Summarize earlier rounds before moving forward

Before Stage 8 (Reviewers), summarize R1 + R2 in a compressed format:

```
R1 summary:
- C1 advocate: emphasized [3 key points]
- C2 advocate: emphasized [3 key points]
- ...

R2 summary:
- Attack matrix:
  C1 → C2: [attack title]; C1 → C3: [attack title]
  C2 → C1: [attack title]; ...
- Key concessions: [list]
- Unresolved disputes: [list]
```

Keep the summary; can drop the full R1/R2 text if context is tight.

### 2. Focus reviewer attention

Reviewers don't need to re-read every advocate's word-for-word statement. They need:
- Key claims made about each candidate
- Concessions made
- Unresolved questions

### 3. Skeptic drops to summary-level inputs

If Skeptic is over-context due to long debate, give Skeptic:
- ContextObject
- Per-candidate: research_facts + reviewer key findings (3-5 bullets)
- R2 attack matrix

Skeptic doesn't need every advocate's prose to find the fatal flaw.

### 4. Final document collapses transcript

In the final output document, the full debate transcript goes inside `<details>` collapsible. Most readers want the recommendation, not the debate.

---

## When user adds information mid-debate

The user may interrupt with new info ("oh wait, I forgot to mention we have HIPAA scope"). Handle:

1. **Pause current stage**
2. **Update ContextObject** with new information
3. **Identify affected stages**:
   - Did this change `decision_dimensions`? → re-run Stage 1 portion
   - Did this change `must_have`? → re-run Stage 4 (some candidates may now be disqualified)
   - Did this change risk profile? → re-run Stages 8-11 with updated weights
4. **Resume**

Don't pretend the new info was always there. Note explicitly: "Updating analysis given the HIPAA constraint user just shared. Candidates without BAA availability now disqualified: [list]."

---

## When the user's question evolves

Sometimes mid-debate, the user's question shifts:
- "Wait, let me also consider X tool"
- "Actually, what if we built it ourselves?"
- "Forget the SaaS options; only consider self-host"

Treat these as legitimate scope changes:
1. Restate the new scope
2. Confirm: "I'll re-run with [scope change]. The previous analysis remains valid for the original scope."
3. Re-run from the appropriate stage

---

## The "exit at low confidence" path

Sometimes the right answer is "I cannot recommend with confidence." This should be clearly visible to the user, not hidden.

When `confidence < 0.4`:

```
Recommendation: I cannot recommend a primary candidate with confidence at this point.

Why confidence is low:
- [Specific reason 1]
- [Specific reason 2]

What would raise confidence:
- [Specific information from user]
- [Specific test or pilot]

Provisional ranking (low confidence):
- C2 (slightly preferred)
- C1 (close second)
- C3 (could be right with different priorities)

Suggested next step:
- [Pilot recommendation, or further analysis, or specific clarification]
```

This is **not failure**. It's **honest service**. The user can act on this — make a decision under uncertainty with eyes open, or invest in resolving the uncertainty.

---

## Saving the conversation for future reference

The decision document is meant to be re-read by the user (or shared) months later. Make it self-contained:

- Don't reference the conversation's history ("as I said earlier")
- Include enough context that someone reading only the document can understand
- Date it clearly so future-self knows when assumptions were made
- Mark switch conditions so future-self knows what would invalidate the decision
