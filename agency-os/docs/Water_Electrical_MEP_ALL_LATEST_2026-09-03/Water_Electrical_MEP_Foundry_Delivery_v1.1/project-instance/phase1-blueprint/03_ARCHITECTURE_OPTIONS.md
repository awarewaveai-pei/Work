# Phase 1 — Architecture Options

Status: **ARCHITECTURE DECISION REQUIRED BEFORE IMPLEMENTATION**

## Stable constraints
- Single RWD web application; no native mobile application and no PWA requirement.
- Company system is source of truth; LINE and Google Calendar are outbound projections/integrations.
- Role + Scope + Permission authorization begins in Phase 1.
- Dispatch is a first-class domain aggregate, not a calendar event.
- Phase 2–5 domain boundaries must remain independently addable.

## Option A — Next.js + Supabase-centric modular application
Pros: low operational burden; matches source's suggested stack.  
Risks: provider-specific auth/RLS/storage semantics can leak into domain/application code if not isolated.

## Option B — RWD web + modular monolith API + PostgreSQL + object storage + background integration worker
Pros: explicit domain boundaries; easy provider replacement; strong control over integration retries/outbox; straightforward long-term evolution.  
Risks: more infrastructure/operations than an all-in-one BaaS.

## Option C — Server-rendered modular monolith + PostgreSQL + job worker
Pros: smallest moving-part count; strong fit for 10–25 internal users; operational simplicity.  
Risks: front-end interaction complexity for drag/drop calendar must be evaluated; future rich client UX may need more dedicated frontend architecture.

## Current recommendation
**Architecture shape:** modular monolith with a single RWD web client, relational source of truth, explicit integration adapters, and durable asynchronous delivery for LINE/Google Calendar side effects.

**Framework/provider:** unresolved until team skill, hosting, cost, backup/restore, token security, and vendor-exit criteria are compared. The source suggestion (Next.js/Supabase/Vercel) remains a candidate, not a constitutional dependency.

## Expected result
One deployable system for Phase 1 with clear internal module boundaries and no microservice/Kubernetes requirement.
