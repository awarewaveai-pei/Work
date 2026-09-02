# ADR-0016 — Mandatory Tenant Row-Level Security

Status: **ACCEPTED — SYNTHETIC RUNTIME GATE VERIFIED (mutation-checked); NOT production-authorized**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-05=A`

## Decision

Every tenant-owned HCI table must carry `tenant_id NOT NULL`, force PostgreSQL RLS, and be covered by an executable cross-tenant test run as a non-owner, `NOBYPASSRLS` role. Application `WHERE` clauses do not replace this control.

## Runtime gate

The local synthetic schema and negative-test runner implement this pattern for the Wave 1 skeleton only. No portal integration, production database migration, or deployment is authorized by this ADR.

## Rollback

RLS may not be weakened in place. A future change needs a superseding ADR, adversarial test evidence, and a reviewed migration.
