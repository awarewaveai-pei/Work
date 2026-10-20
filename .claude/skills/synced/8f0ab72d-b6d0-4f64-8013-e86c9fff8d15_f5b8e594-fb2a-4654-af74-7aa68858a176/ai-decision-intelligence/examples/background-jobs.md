# Example 2: Rails Background Job System Selection

A condensed walkthrough showing the skill applied to a different domain. Demonstrates the system handles non-WordPress contexts equally well.

---

## User query

> "Should I use Sidekiq, GoodJob, or Solid Queue for our new Rails 7 app? We're a 6-person team, expect 100k jobs/day at peak, mostly transactional emails and report generation. We already have Redis."

---

## Stage 1: Topic Analyzer

```json
{
  "topic_type": "tool_selection",
  "primary_decision": "Choose a background job system for a Rails 7 application processing ~100k jobs/day from a 6-person team with existing Redis infrastructure",
  "decision_dimensions": [
    "throughput_at_peak",
    "operational_complexity",
    "redis_dependency",
    "rails_integration_quality",
    "observability",
    "cost_model"
  ],
  "complexity_score": 0.55,
  "implicit_assumptions": [
    "100k/day = ~1.2/sec average, but peaks can be 10-50x average",
    "Reports are 'long' jobs; emails are 'short' — different requirements",
    "Team has Rails expertise; Redis already operated"
  ],
  "missing_info": [
    {
      "question": "Are reports time-sensitive (must complete in N seconds) or can they queue?",
      "options": ["Real-time required", "Best-effort, can queue", "Mixed"],
      "why_it_matters": "Latency requirements drive worker count and possibly architecture"
    }
  ],
  "domain_signals": ["rails", "background_jobs", "queueing", "redis"]
}
```

---

## Stage 4: Candidates

| ID | Name | Type | One-liner |
|----|------|------|-----------|
| C1 | Sidekiq | OSS self-host | Mature, Redis-backed; the de facto Rails job standard |
| C2 | Sidekiq Pro/Enterprise | SaaS-OSS hybrid | Sidekiq with paid features (batches, encryption, etc.) |
| C3 | GoodJob | OSS self-host | Postgres-backed, advisory-lock based; no Redis needed |
| C4 | Solid Queue | OSS self-host | Rails 8 default; database-backed; 37signals-built |
| C5 | SQS + custom worker | DevOps | AWS SQS with custom Rails consumer |
| C6 | Resque | OSS self-host | Older Redis-based, predates Sidekiq |

`intentionally_excluded`: Delayed Job (legacy, slower), Que (low adoption recently)

---

## Stage 7: Cross-Exam Highlights

### C3 (GoodJob) → C1 (Sidekiq):

> "Advocate cited 'industry standard' but didn't address the operational reality: you're now running TWO data stores (Postgres + Redis). For a 6-person team, every additional service is operational tax. GoodJob runs in your existing Postgres — zero new infrastructure. The 'Sidekiq is faster' argument breaks at this team's actual throughput (100k/day = 1.2/sec average). Both handle this load with margin. The performance argument is for organizations 10x larger; you're paying complexity tax for capacity you don't need."

### C1 (Sidekiq) defense:

> **Type: Reframe.** "GoodJob's pitch assumes Postgres scales to job-queue workloads. At 100k/day with 10-50x peaks (so 30k jobs/hour at peak), Postgres-as-queue introduces lock contention and vacuum pressure that's well-documented in production reports. The 'no Redis' argument trades a known-good architecture (Sidekiq+Redis, run by thousands at scale) for a less-proven pattern (Postgres-as-queue). For a team that ALREADY has Redis (per user's context), the cost of using it for jobs is zero."

### C4 (Solid Queue) → both C1 and C3:

> "Both advocates ignored what's coming: Solid Queue is the Rails default starting Rails 8. Choosing C1 or C3 in 2024 means you're swimming against the framework's current. By 2026, the Rails community's Stack Overflow answers, blog posts, and gem ecosystem will increasingly assume Solid Queue. C1 will remain supported but increasingly 'legacy.' C3 may struggle for adoption. Solid Queue is the safe future bet."

### C1 defense against C4:

> **Type: Rebut.** "Solid Queue is genuinely promising but currently underpowered: missing job-class-level priority, missing scheduler reliability features that Sidekiq has had for years, missing the rich middleware ecosystem. Choosing 'future default' over 'current best' is a rationalization for accepting a less mature tool today. Sidekiq isn't going to be deprecated; it'll be one of two reasonable choices for years."

---

## Stage 8: Reviewer Highlights

### Cost Reviewer

| Candidate | 1yr TCO | 3yr TCO | Note |
|-----------|---------|---------|------|
| C1 Sidekiq (free) | $0 | $0 | Existing Redis already paid |
| C2 Sidekiq Pro | $1,995 | $5,985 | Annual; pays for monitoring + encryption |
| C3 GoodJob | $0 | $0 | Some Postgres cost increase at peak |
| C4 Solid Queue | $0 | $0 | Database storage cost included |
| C5 SQS | $360-1200 | $1,080-3,600 | Depends on volume; egress added |
| C6 Resque | $0 | $0 | But high opportunity cost (legacy) |

### DevOps Reviewer 3am scenarios:

- **C1 (Sidekiq):** "Redis OOMs due to retry queue buildup; jobs accumulate; you scale Redis or kill bad jobs"
- **C3 (GoodJob):** "Long-running job blocks advisory lock; queue backs up; you must identify and kill the offender"
- **C4 (Solid Queue):** "Database transaction log fills due to high job throughput; you tune retention or scale DB"

### Skeptic findings:

- **C1:** No fatal flaw at user's scale; minor concern about Redis retry queue management discipline
- **C3:** Postgres-as-queue at 30k/hour peak: documented to work but requires care; fatal flaw likelihood low if peaks stay under 50k/hour
- **C4:** Maturity risk: missing features that exist in mature alternatives; rapid development means breaking changes possible

**Cross-candidate pattern:** "All three top candidates handle 100k/day. The decision is about operational shape (1 datastore vs 2) and ecosystem maturity, not about throughput."

---

## Stage 11: Judge

```json
{
  "ranked_candidate_ids": ["C1", "C3", "C4", "C2", "C5", "C6"],
  "primary": {
    "candidate_id": "C1",
    "reasons": [
      "Highest maturity for production reliability: 12+ years of production use, robust middleware ecosystem, well-understood failure modes, comprehensive observability tooling.",
      "User already operates Redis; adding Sidekiq is incremental complexity, not new infrastructure. The 'two datastores' argument from C3's advocate doesn't apply here.",
      "Team can adopt without learning curve: Sidekiq is the ecosystem default; team likely has prior exposure; documentation and Stack Overflow coverage is unmatched."
    ]
  },
  "rejections": [
    {
      "candidate_id": "C3",
      "reason": "Strong choice for teams without Redis, but user already has Redis — the 'no new datastore' advantage doesn't materialize for THIS user",
      "could_be_right_if": "User wanted to reduce Redis dependency, OR Postgres has spare capacity and Redis is at limit"
    },
    {
      "candidate_id": "C4",
      "reason": "Promising future default but currently lacks feature maturity for production use beyond simple queues",
      "could_be_right_if": "User can wait 12-18 months for Rails 8 ecosystem to settle, OR job complexity is low enough that Solid Queue's current feature set covers it"
    },
    {
      "candidate_id": "C2",
      "reason": "Sidekiq Pro/Enterprise pays for features user doesn't need at this scale (batches for 100k/day are over-engineering)",
      "could_be_right_if": "User scales beyond 1M jobs/day OR needs encryption-at-rest for job payloads OR needs unique-jobs at scale"
    }
  ],
  "confidence": 0.82,
  "confidence_basis": "High confidence because: user's context (existing Redis, mid-scale throughput, mainstream Rails team) lines up clearly with Sidekiq's sweet spot. Lower confidence cap because Solid Queue's trajectory could change the answer in 18-24 months.",
  "switch_conditions": [
    "If team migrates off Redis for other reasons, re-evaluate to GoodJob",
    "If scale exceeds 1M jobs/day, evaluate Sidekiq Pro features",
    "If migrating to Rails 8 in 18+ months, evaluate whether Solid Queue's then-state covers needs"
  ],
  "open_questions": [
    "What's the longest expected job duration? (Affects timeout configuration and worker memory)",
    "Are reports CPU-intensive? (Affects worker concurrency settings)"
  ],
  "recency_bias_check": "Yes — Sidekiq was discussed first; checked by reordering. Conclusion holds; the win is contextual fit (user has Redis, mainstream team) not rhetorical."
}
```

---

## TL;DR

**Recommendation:** Sidekiq (free OSS version)

**Why:** You already have Redis. Sidekiq is the most mature option for production Rails background jobs. At your scale (100k jobs/day, 6-person team), the alternatives' selling points either don't apply (GoodJob's "no Redis" — you already have it) or trade maturity for promise (Solid Queue's future-default status).

**Watch for:** If you're migrating to Rails 8 within 12-18 months and your job complexity stays low, re-evaluate Solid Queue at that point.

**Confidence:** 0.82.

**Skip Sidekiq Pro at this scale** — its premium features (batches, encryption, unique-jobs at scale) are for organizations with 10x your volume.
