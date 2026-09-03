# ADR-0016 — Mandatory Tenant Row-Level Security

Status: **ACCEPTED — SYNTHETIC RUNTIME GATE VERIFIED (mutation-checked); NOT production-authorized**
Date: 2026-09-01
Decision authority: Operator explicit approval — `HD-05=A`

## Decision

Every tenant-owned HCI table must carry `tenant_id NOT NULL`, force PostgreSQL RLS, and be covered by an executable cross-tenant test run as a non-owner, `NOBYPASSRLS` role. Application `WHERE` clauses do not replace this control.

## Runtime gate

The local synthetic schema and negative-test runner implement this pattern for the Wave 1 skeleton only. No portal integration, production database migration, or deployment is authorized by this ADR.

## 🟢 RESOLVED — tenancy principal (raised 2026-09-02 by adversarial review; resolved 2026-09-02 by `ADR-0033`, Option B-signed — see §Resolution at end of file. Analysis below kept verbatim: `ADR-0033` cites its specific lines.)

RLS is only as strong as the identity it keys on. `hci.current_tenant_id()`
resolves the tenant from the `role` GUC:

```sql
WHERE role_name = COALESCE(NULLIF(current_setting('role', true), 'none'), session_user)
```

`SET ROLE` changes that value freely, and its permission is checked against
`session_user`, not the current role. Both tenant roles are `NOLOGIN`, which
means this design necessarily assumes a shared login role able to `SET ROLE`
into either tenant. Consequences: one missed `RESET ROLE`, one pooled connection
returned without `DISCARD ALL`, or one SQL injection moves the entire session to
another tenant, and RLS follows along because it is keyed on the value that moved.

The synthetic suite cannot meaningfully assert against this, because the suite is
itself a superuser session using `SET ROLE`; any such assertion would pass for the
wrong reason.

Options (operator decision, not an implementation detail):

- **A** — one real LOGIN role per tenant; `current_tenant_id()` reads only
  `session_user`, so `SET ROLE` cannot change tenancy. Simplest to reason about;
  scales poorly to many tenants and complicates pooling.
- **B** — keep a pooled login role, but carry tenancy in `SET LOCAL app.tenant_id`
  written by a signed/validated `SECURITY DEFINER` setter, with `RESET`/`DISCARD`
  explicitly in the threat model.
- **C** — accept the current shape for synthetic scope only, and block real-data
  admission on resolving this first.

**Until this is decided, no non-synthetic tenant data may be admitted.** Whichever
option is chosen, `RLS-ESCALATE-01` (a genuine tenant principal attempting
`SET ROLE` into another tenant must be denied) has to become an executable,
CI-blocking assertion.

## Rollback

RLS may not be weakened in place. A future change needs a superseding ADR, adversarial test evidence, and a reviewed migration.

## Resolution (2026-09-02)

`ADR-0033-signed-tenant-context-principal.md` picks **Option B-signed** (a refinement of Option B above): one pooled login role `hci_app` replaces the per-tenant `hci_app_test_a`/`hci_app_test_b` roles, and tenancy is carried in a signed, HMAC-verified `SET LOCAL hci.tenant_ctx` token instead of the forgeable `role` GUC — closing the exact "missed `RESET ROLE`" and "SQL-injection re-tenants the session" failure modes described above. `RLS-ESCALATE-01..03` (the CI-blocking assertion this section required) is specified there. Gates are still **OPEN** — nothing above is runtime-verified until `ADR-0033`'s own gates land — but the *decision* itself is no longer pending; do not re-litigate it here. This section is appended, not inserted above, to avoid shifting the line numbers `ADR-0033` and other ADRs cite into the analysis above.
