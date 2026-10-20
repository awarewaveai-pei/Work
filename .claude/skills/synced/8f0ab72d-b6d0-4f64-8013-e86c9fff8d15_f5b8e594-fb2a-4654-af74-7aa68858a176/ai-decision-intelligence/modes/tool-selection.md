# Mode: Tool Selection Debate

Use this mode when the user is choosing between specific tools, services, or products.

**Trigger phrases:** "A vs B", "which tool", "what should I use for", "compare these options", "should I use X or Y", "best [framework/database/library/SaaS] for"

---

## How this mode modifies the standard pipeline

The 16-stage pipeline applies, but tool selection has these specific characteristics:

### Stage 4 (Candidate Discovery) — emphasis

For tool selection, ensure **all four quadrants** are represented:
- SaaS option (hosted, paid)
- OSS self-host option (open-source, you operate)
- Build option (roll your own)
- Hybrid / DevOps option (use infrastructure primitives)

If a quadrant has no realistic candidate, **state explicitly** in `intentionally_excluded` rather than silently omitting.

### Stage 6 (Position Statements) — number of advocates

One advocate per candidate. If you have 7 candidates, you have 7 advocates. Each one believes their candidate is the right choice for the user's specific context.

### Stage 7 (Cross-Examination) — the heart of tool selection

This is where tool selection mode lives or dies. Each advocate must:

1. **Attack 2 other candidates** (not all of them — focus on plausible competitors)
2. **Defend their own** against attacks
3. Use specific evidence: features, pricing, documented limits, real failure modes

If advocates are politely agreeing or hedging in cross-exam, the debate failed. Be vigilant.

### Stage 8 (Specialist Reviews) — comparative scoring

All four reviewers (Security, DevOps, Cost, Product) must score **every candidate** on a comparable 1-10 scale. The relative scores are what feed into the tradeoff matrix; absolute scores matter less.

### Stage 10 (Tradeoff Matrix) — required dimensions

For tool selection, the matrix MUST include:

| Dimension | Source |
|-----------|--------|
| Time-to-Value | Product Reviewer |
| 1-year TCO | Cost Reviewer |
| 3-year TCO | Cost Reviewer |
| Operational complexity | DevOps Reviewer |
| Security posture | Security Reviewer |
| Lock-in risk | Product Reviewer |
| Skeptic resistance | Skeptic findings |
| Domain fit | Specialist agent (if any) |

### Stage 11 (Judge) — context-aware weighting

Apply weights from context:

| Context signal | Weight adjustments |
|----------------|-------------------|
| Sensitive data / regulated industry | Security ↑↑, Lock-in ↑ |
| Small team / limited DevOps | Operational complexity ↑↑ |
| Tight budget | TCO ↑↑ (both 1yr and 3yr) |
| Early-stage / rapid iteration | Time-to-Value ↑↑ |
| Long-term commitment | 3-year TCO ↑↑, Lock-in ↑↑ |
| Enterprise scale | Scalability ↑, Compliance ↑ |

State the applied weights in Judge output.

---

## Specific quality bars for Tool Selection mode

- **Cross-exam must show real disagreement.** If all advocates politely respect each other, restart cross-exam with stronger prompts.
- **At least one Skeptic-found fatal flaw OR explicit "no fatal flaw" per candidate.** Lazy Skeptic invents flaws; honest Skeptic differentiates.
- **Tradeoff matrix shows differentiation.** If all candidates score 7-8 on every dimension, scoring was sloppy.
- **Judge identifies a clear #1.** No ties. Confidence below 0.7 if top 2 are within 5%.

---

## Anti-patterns specific to Tool Selection

1. **The "Wikipedia article" failure mode.** Output reads like a feature comparison, not a debate.
2. **The "advocate as marketer" failure mode.** Advocate sounds like the vendor's website.
3. **The "all candidates are good" failure mode.** Genuine differentiation is buried.
4. **The "judge as referee" failure mode.** Judge summarizes without picking. NO. Judge picks.

---

## When this mode might NOT apply

If the user's question looks like tool selection but the answer is obviously "you don't need a tool yet" or "the question is premature" — say so. Don't run the full pipeline if the right answer is "decide on requirements first."

Examples:
- "Which message queue should I use?" + user has 0 messages currently → "What's the use case? You may not need a queue."
- "Which database for my app?" + user has no users → "Standard relational DB is fine; revisit when you have constraints."

In these cases, return early with a brief explanation rather than running the full 16-stage pipeline.
