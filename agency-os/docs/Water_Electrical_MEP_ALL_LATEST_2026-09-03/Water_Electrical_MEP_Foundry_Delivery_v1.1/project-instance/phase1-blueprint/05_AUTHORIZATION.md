# Authorization

Source: `sources/water_electrical_project_management_spec.md:164-196`.

## Model
`Role + Scope + Permission -> decision`

Roles include administrator, owner, engineering manager, engineer, admin/procurement/accounting, foreman and employee.

## Enforcement
- Server-side authorization is mandatory on every protected query/command.
- UI visibility is convenience only and never the security boundary.
- Scope is explicit for project/company/team data.
- Financial permissions are not introduced until the corresponding Phase 4 capability is enabled.
- Audit all permission/role changes.

## Tests
Negative tests must prove an employee cannot read another project's restricted data, a foreman cannot perform disallowed admin actions, and financial data remains inaccessible before/without authorization.
