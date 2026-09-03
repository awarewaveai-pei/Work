# Phase 1 Executive Summary

Build the first production slice of the water/electrical/MEP contractor operations system for a 10–25 person company. Phase 1 solves employee/project/dispatch/calendar/LINE/Google Calendar/authorization/audit workflows through **one responsive web application with bounded offline continuity**.

Source scope: `sources/water_electrical_project_management_spec.md:110-146`.
Owner decisions: `sources/OWNER_DECISIONS_2026-09-03.md:7-26`.

## Phase 1 current capabilities
- Identity + Role/Scope/Permission authorization.
- Workforce / crew / project / site / dispatch.
- Company calendar, My Dispatch, acknowledgement + re-ack after material changes.
- LINE + Google Calendar asynchronous integrations.
- RWD browser experience for desktop/tablet/mobile.
- Bounded offline read cache and safe queued actions, beginning with dispatch acknowledgement.
- Audit, observability, backup/restore and Foundry baseline controls.

## Explicit exclusions
- No native iOS/Android app.
- No separate mobile codebase.
- No installable PWA product requirement or web-app manifest.
- No multi-tenant SaaS infrastructure.
- No online payment gateway.
- Phase 2–5 business modules remain deferred except their stable boundaries.

## Expected result
Phase 1 can be deployed independently and used at jobsites with intermittent connectivity without corrupting authoritative dispatch state or coupling later procurement/cost/AI modules into Phase 1.
