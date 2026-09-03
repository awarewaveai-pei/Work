# Phase 1 Domain Boundaries

## identity_authorization
Owns user identity, role, project/data scope, permissions and overrides.

## workforce
Owns Employee, Crew, Foreman and employment status. Former employees remain referencable by historical records.

## project
Owns Project, ProjectSite, ProjectMember and project lifecycle.

## dispatch
Owns Dispatch, DispatchMember and DispatchAcknowledgement. Dispatch is the official **planned** company work assignment; it is not actual attendance or approved labor time.

## offline_sync
Owns browser-side bounded read cache metadata, queued allow-listed actions, sync checkpoints and explicit conflicts. It never changes authoritative domain ownership: company-system server records remain authoritative.

## notification
Owns LINE/internal delivery attempts and status; never dispatch truth.

## calendar_integration
Owns Google Calendar binding/projection state only; provider callbacks cannot mutate official dispatch truth.

## audit
Owns immutable evidence of important state changes and synchronization outcomes.

## Future stable boundaries
- Phase 2: field_execution, document_control, quality.
- Phase 3: procurement.
- Phase 4: commercial, subcontract, **labor_time**, cost, **accounting_integration**.
- Phase 5: AI.

`labor_time` SHALL own actual attendance/work log and approved labor time. Phase 4 labor cost consumes approved labor time, not Dispatch duration.
`accounting_integration` SHALL isolate provider-specific accounting identifiers/protocols behind adapters and reconciliation.
