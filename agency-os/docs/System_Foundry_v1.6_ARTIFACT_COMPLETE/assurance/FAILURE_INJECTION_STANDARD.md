# Failure Injection Standard

Resilience claims are unproven until the failure they claim to survive has actually been injected and observed — a documented failover procedure never exercised is a hypothesis, not a control.

Required failure classes to rehearse on a defined cadence: dependency/provider outage (`engineering/PROVIDER_RESILIENCE_STANDARD.md`), data corruption or partial write, network partition between services, and resource exhaustion (CPU/memory/connection pool). Each exercise MUST record: detection time (did monitoring catch it before a human did), containment (did the failure stay bounded to its expected blast radius), recovery time against the stated RTO/RPO (`engineering/SRE_STANDARD.md`), and any data-integrity check performed after recovery.

A failure-injection exercise that reveals a gap MUST produce a tracked remediation item, not just a "good learning" writeup with no follow-through. Exercises MUST run against an environment realistic enough that passing means something — an exercise against a toy environment with no real dependencies is insufficient evidence for a production resilience claim.
