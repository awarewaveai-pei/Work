# External Provider Resilience Standard

Any critical external provider MUST sit behind an owned contract/adapter boundary.

Define eligible provider set, capability/semantic equivalence, data residency/security constraints, timeout, retry budget, circuit breaker, rate-limit behavior, degraded mode, failover eligibility, replay/idempotency, observability, exit/migration procedure, and regular failover test.

Fallback MUST NOT silently weaken security, privacy, compliance, consistency or data-residency guarantees.
