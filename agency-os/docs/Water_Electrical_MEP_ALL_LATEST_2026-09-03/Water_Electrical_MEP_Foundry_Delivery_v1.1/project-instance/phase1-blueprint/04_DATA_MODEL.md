# Phase 1 Logical Data Model

## Authoritative server entities
- Company (single organization; no SaaS tenant infrastructure)
- User, Employee, Crew
- Role, Permission, RolePermission, UserPermissionOverride
- Project, ProjectSite, ProjectMember
- Dispatch, DispatchMember, DispatchAcknowledgement
- NotificationDelivery, LineBinding
- GoogleCalendarBinding, CalendarProjection
- AuditLog
- OutboxMessage / durable side-effect record

## Offline client records (bounded, non-authoritative)
- OfflineReadSnapshot metadata (user, scope, server revision, expires_at)
- OfflineQueuedAction (stable idempotency key, actor, command type, target/version, encrypted payload where needed)
- SyncCheckpoint
- SyncConflict / Rejection evidence

## Critical constraints
1. Dispatch has one stable identifier and explicit revision/version.
2. Dispatch members reference one Dispatch; never duplicate the same work assignment per employee.
3. Acknowledgement binds to a specific dispatch version.
4. Material amendment invalidates acknowledgements for the old version.
5. CalendarProjection uses stable `(dispatch_id, employee_id, provider)` mapping.
6. Authorization is server-evaluated from Role + Scope + Permission on every protected synchronization/application operation.
7. Offline queued actions are allow-listed, idempotent and re-authorized on the server before commit.
8. Local cache does not become source of truth and must not leak data across users/sessions.
9. Audit preserves before/after and sync/rejection evidence.

## Phase 4 compatibility invariant
Do not encode actual attendance or labor-cost truth into Dispatch duration. Future `AttendanceRecord` / `ApprovedLaborTime` are separate records; project labor-cost posting references approved labor time.
