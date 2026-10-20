# Scoring Rubric Reference

How reviewers and the tradeoff matrix should score candidates on each dimension. Calibration matters more than absolute numbers — scores must differentiate candidates within a comparison set.

---

## General principles

### 1. Comparative, not absolute

Scores are calibrated **within the candidate set**. A "7" for security in one debate isn't comparable to a "7" in another debate.

### 2. Differentiation is required

If all candidates score 6-8 on a dimension, you didn't do enough work. Push to differentiate.

### 3. Force ranking

Before assigning numbers, ask: which candidate is BEST on this dimension? Which is WORST? Then assign numbers that respect that order.

### 4. Reference the user's context

A candidate that's "perfectly secure for personal projects" may be "inadequate for regulated finance." Same candidate, different scores depending on context.

---

## Dimension-by-dimension rubric

### Time-to-Value (1-10)

Days from "yes, do it" to user receiving the value they wanted.

| Score | Days | Description |
|-------|------|-------------|
| 10 | < 1 | Same day; SaaS quick-start |
| 9 | 1-2 | Quick setup, minimal config |
| 8 | 3-5 | Standard SaaS setup or simple self-host |
| 7 | 1 week | Self-host with verification |
| 6 | 2 weeks | More involved setup |
| 5 | 1 month | Build minimal v1 |
| 4 | 2 months | Build with reasonable scope |
| 3 | 3+ months | Full custom build |
| 2 | 6+ months | Major custom development |
| 1 | 1+ year | Long-term build effort |

### TCO at Year 1 (1-10, lower cost = higher score)

Score based on candidate's cost relative to the comparison set, not absolute.

| Score | Means |
|-------|-------|
| 9-10 | Cheapest in the set, by margin |
| 7-8 | Below set median |
| 5-6 | At set median |
| 3-4 | Above set median |
| 1-2 | Most expensive in the set |

### TCO at Year 3 (1-10, lower cost = higher score)

Same scoring as Year 1, but at 3-year horizon. Often diverges from Year 1 because:
- SaaS: linear cost growth
- Self-host: front-loaded cost, then flat
- Build: highest year 1, but flat afterward

A candidate may score 9 at year 1 (cheap up front) and 4 at year 3 (expensive long-term), or vice versa. **Show the divergence** — don't average.

### Operational Complexity (1-10, simpler = higher score)

Calibrated against THIS user's team capability.

| Score | Means |
|-------|-------|
| 9-10 | Trivial for this team; minimal ops burden |
| 7-8 | Standard ops; team has skills |
| 5-6 | Some skill stretch; manageable with effort |
| 3-4 | Skills gap exists; requires growth or contractor |
| 1-2 | Far beyond team's capacity; requires hiring |

### Security Posture (1-10)

Combination of: candidate's inherent security + user's compliance/sensitivity needs.

| Score | Means |
|-------|-------|
| 9-10 | Excellent for this context's risk profile |
| 7-8 | Solid security with normal-care mitigations |
| 5-6 | Acceptable with documented controls |
| 3-4 | Concerning; requires significant compensating controls |
| 1-2 | Inadequate for this context |

### Lock-in Risk (1-10, less lock-in = higher score)

| Score | Means |
|-------|-------|
| 9-10 | Standard formats, easy migration; weeks to migrate |
| 7-8 | Some proprietary aspects; months to migrate |
| 5-6 | Notable lock-in; significant rewrite to migrate |
| 3-4 | Heavy lock-in; major rewrite |
| 1-2 | Effectively impossible to migrate |

### Skeptic Resistance (1-10)

How well does the candidate withstand Skeptic's findings? Higher score = fewer / less severe fatal flaws.

| Score | Means |
|-------|-------|
| 9-10 | Skeptic found no fatal flaw or only low-likelihood ones |
| 7-8 | Fatal flaws are addressable with documented mitigation |
| 5-6 | Real concerns but tradeoff is acceptable |
| 3-4 | Multiple concerns or one severe one |
| 1-2 | Skeptic found a likely fatal flaw with no good mitigation |

### Domain Fit (1-10)

When a specialist is added, this dimension reflects their assessment.

| Score | Means |
|-------|-------|
| 9-10 | Excellent domain fit; specialist endorsed |
| 7-8 | Good fit with caveats |
| 5-6 | Adequate; some concerns |
| 3-4 | Poor fit; specialist flagged |
| 1-2 | Misaligned with domain reality |

### UX Score (1-10)

For the END USER (not implementer).

| Score | Means |
|-------|-------|
| 9-10 | Polished, intuitive, minimal friction |
| 7-8 | Functional with some training |
| 5-6 | Workable but rough |
| 3-4 | Painful UX; users will complain |
| 1-2 | Hostile UX; users will refuse adoption |

### Time-to-Recovery (1-10, faster = higher)

When something fails, how fast can the user recover?

| Score | Means |
|-------|-------|
| 9-10 | Auto-rollback or <30 min documented procedure |
| 7-8 | <2 hour recovery with documented runbook |
| 5-6 | Same-day recovery; some scrambling |
| 3-4 | Multi-day recovery; requires expertise |
| 1-2 | Multi-week recovery; potential data loss |

---

## Weighted total

Multiply each dimension's score by the weight (from 0.0-1.0, summing to 1.0 across all dimensions).

Default weights for tool selection:
- Time-to-Value: 0.10
- 1-yr TCO: 0.10
- 3-yr TCO: 0.15
- Operational Complexity: 0.15
- Security Posture: 0.15
- Lock-in Risk: 0.10
- Skeptic Resistance: 0.15
- Domain Fit: 0.10

These shift based on context (see `agents/judge.md` weighting rules).

---

## Common scoring failures

1. **All 7s.** No differentiation. Re-examine each dimension and force a ranking.
2. **Score reflects bias not evidence.** Pet candidate scored too high. Check against reviewer outputs.
3. **Ignored context.** Same candidate scored same regardless of user — context should change scores.
4. **Year 1 = Year 3.** Always different for cost dimensions; show divergence.
5. **Weights not stated.** User can't validate without knowing what was weighted.
