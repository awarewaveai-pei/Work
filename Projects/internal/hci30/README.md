# HCI-30 — Wave 1 local skeleton

Canonical product root: `D:\Work\Projects\internal\hci30\`. HCI runtime code belongs here; architecture, ADR, and research records remain under `D:\Work\agency-os\docs\HCI\`.

Start with `docs\HCI30_DELIVERY_PLAN.md` for architecture and gates, then `docs\HCI30_EXECUTION_PLAN.md` for the ordered implementation backlog.

This is an **isolated, synthetic-only PostgreSQL 15.8 test skeleton**. It has no host-port mapping, production configuration, portal integration, real-person fixture, or deployment path.

Run `powershell -ExecutionPolicy Bypass -File .\scripts\test-wave1-local.ps1` after Docker Desktop is running. The runner rejects non-local Docker contexts, creates a per-run compose project and generated temporary password file, runs migrations and negative tests, then tears down only that project and removes the password file. It must never be pointed at an existing database.

A green suite is not evidence that a gate is closed. `powershell -ExecutionPolicy Bypass -File .\scripts\mutation-check-wave1.ps1` deletes each control in turn and requires the suite to go red on the specific assertions covering it. If any mutation survives, those assertions are not constraining the schema and the green result must not be trusted until they are fixed. Run it whenever a trigger, grant, constraint, or policy changes. It exists because the first version of this suite could not fail at all.

Implemented gates are limited to the approved HD-03/04/05 slice: Person-only subject constraints, separate permission records, DataSubjectRequest event history, identity-confirmation admission, and mandatory tenant RLS. HD-06 through HD-10, HD-20, and HD-21 remain open. Passing synthetic tests is not a claim of legal compliance or production readiness.
