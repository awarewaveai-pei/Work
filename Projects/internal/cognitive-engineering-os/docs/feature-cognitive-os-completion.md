# Cognitive OS Completion

Status: ACTIVE
Goal: turn the verified Method Atlas into a source-to-trusted-output operating system for life, EdD research, art projects, and business.

## Architecture

Keep one modular monolith. Stable domain/application ports sit above replaceable local SQLite/CAS and future Postgres/S3 adapters. Every slice must preserve tenant isolation, provenance, policy gates, durable replay, and rollback.

## Delivery sequence

1. **Project + Source Intake** — Project/Source domain contracts, tenant-scoped repository, CAS content, API, Dashboard.
2. **Ingest + Normalize** — document workers, safe parsing, untrusted-source boundary, provenance locators, retention/deletion.
3. **Goal + Recipe Compiler** — plain-language goal to reviewable Workflow IR; no execution before policy/cost/risk approval.
4. **Knowledge + Research Integrity** — retrieval, claim/evidence graph, citation verification, EdD research workspace.
5. **Data Lab + Simulation** — datasets, statistics, calculation, scenarios, reproducible analysis runs.
6. **Workshop + Challenge** — role assembly, expert debate, red team, human review and decision records.
7. **Canvas + Artifact Studio** — multimodal human contribution, versioned artifacts, proposal/thesis/project outputs.
8. **Production Trust** — KMS, retention/erasure, RLS/Postgres adapter, observability, backup/restore, SSO, billing and editions.

## Definition of done per slice

- Public behavior works end to end with real persistence.
- Machine-readable contract and runtime validate the same invariants.
- Tenant, source-trust, provenance, audit and failure paths are tested.
- Migration/rollback boundary is explicit; no external provider is hard-coded.
- Deployment truth and runnable evidence are updated without duplicating implementation detail.

## Current slice

Project + Source Intake. V1 accepts bounded UTF-8 text only. PDF, Office, image, audio and video remain blocked until the isolated document pipeline exists.
