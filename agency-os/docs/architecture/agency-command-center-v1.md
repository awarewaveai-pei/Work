# Agency Command Center v1

## Objective
- Operate all tenants from one control plane while preserving tenant isolation.
- Provide no-code, role-based operations for non-technical clients.
- Keep full auditability and one-click execution for agency admins.

## Architecture Layers
- Experience Layer: client portal + agency command center UI
- Application Layer: API orchestration, workflow dispatch, approval engine
- Data Layer: Supabase schemas with RLS isolation
- Automation Layer: n8n, scheduled jobs, guard/health checks
- Integration Layer: adapters for WordPress and future CMS systems
- Governance Layer: policies, release controls, compliance and audit evidence

## Role Model
- Client Admin: can operate own tenant scope only
- Client Operator: limited daily operations inside tenant scope
- Agency AM/PM: cross-tenant view by assigned accounts
- Agency Admin: global policy, one-click actions, escalation controls
- System Operator: automation maintenance and incident response

## Data Domains (Supabase schemas)
- `core`: tenants, users, memberships, role mappings
- `delivery`: projects, milestones, tickets, approvals, release states
- `ops`: schedules, jobs, run logs, alerts, maintenance windows
- `integrations`: tools catalog, tool instances, credentials references
- `finance`: invoices, payments, margin snapshots, risk flags
- `compliance`: policy checks, evidence records, review attestations
- `audit`: immutable operation trail and actor attribution

## One-Click Operations (Agency Admin)
- Run health checks for all tenants
- Run guard checks for all tenants
- Re-register tenant schedules in batch
- Trigger monthly reports in batch
- Pause/resume automations for selected tenants
- Trigger policy re-validation and emit compliance report

## Safety Controls
- High-risk actions require confirmation + reason
- Optional dual-approval for production-impacting operations
- Every action writes `audit` log with actor, scope, payload hash, result
- Blocked if guard status is FAIL for affected tenant

## Tenant Operations (No-Code)
- Submit requests and change requests
- Approve milestones and releases
- Upload assets and read reports
- View schedule and current service status
- View billing status and open items

## Reporting Surfaces
- Tenant dashboard: project progress, risks, pending approvals, monthly KPIs
- Agency dashboard: cross-tenant SLA, risk heatmap, margin trend, incident trend
- Audit dashboard: compliance posture, failed controls, overdue actions

## Extensibility Principles
- CMS-specific logic must stay behind adapters
- Integration config uses typed records and secret references
- New tool onboarding must include runbook + rollback + owner metadata

## Related Documents (Auto-Synced)
- `docs/architecture/multi-platform-delivery-architecture.md`
- `docs/operations/system-operation-sop.md`
- `docs/operations/tenant-scheduling.md`
- `README.md`
- `TASKS.md`

_Last synced: 2026-03-20 04:57:15 UTC_

