# Global Delivery Model

## Objective
- Operate as an international agency with consistent quality across time zones.

## Coverage Model
- APAC shift: client comms and execution window
- EMEA shift: overlap handoff and QA window
- Americas shift: client comms and deployment window
- Use follow-the-sun handoff notes for every active project.

## Time Zone Rules
- Every tenant defines primary timezone in `PROFILE.md`.
- All milestones are stored in UTC and displayed in client timezone.
- SLA clocks run in client-local timezone unless contract states otherwise.

## Communication Cadence
- Daily: async status update (blockers, progress, next action)
- Weekly: priority review + risk review
- Monthly: executive review (KPI, margin, roadmap)
- Quarterly: contract and growth plan recalibration

## Handoff Standard
- Required handoff fields:
  - What changed
  - What is blocked
  - What can be deployed
  - Rollback notes
  - Owner and ETA

## Escalation
- P1 incidents: immediate escalation chain (AM -> PM -> Tech Lead -> Owner)
- Cross-region issue: assign single incident commander within 15 minutes

## Delivery SLAs (Baseline)
- P1 response: 15 minutes
- P2 response: 60 minutes
- P3 response: next maintenance window

## Related Documents (Auto-Synced)
- `docs/international/global-compliance-baseline.md`
- `docs/international/multi-currency-commercial-policy.md`
- `docs/operations/tenant-scheduling.md`
- `README.md`

_Last synced: 2026-03-20 04:57:15 UTC_

