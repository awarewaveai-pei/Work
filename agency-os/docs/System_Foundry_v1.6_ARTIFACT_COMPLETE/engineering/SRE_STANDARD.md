# SRE Standard

Reliability is a measured, budgeted property, not an aspiration; every service with a user-facing SLA MUST have defined SLIs/SLOs before it is treated as production-critical.

Required: Service Level Indicators (SLI) that reflect actual user experience, Service Level Objectives (SLO) with a defined error budget and a documented consequence when the budget is exhausted (feature freeze, incident-response escalation), stated Recovery Time Objective (RTO) and Recovery Point Objective (RPO) per critical service, an on-call rotation with a defined incident-response process, blameless postmortems for incidents above a defined severity, and periodic disaster-recovery exercises ("game days") that actually exercise failover, not tabletop-only discussion.

Error budgets MUST gate feature velocity, not just be reported and ignored. Disaster-recovery capability claimed but never rehearsed (`assurance/RESTORE_VERIFICATION.md`, `assurance/FAILURE_INJECTION_STANDARD.md`) MUST be treated as unproven, not as a passing control.
