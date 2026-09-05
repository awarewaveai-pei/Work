# HCI Tenant / Portal Organization Adapter Contract

Status: **DESIGN ARTIFACT COMPLETE — re-verified 2026-09-05 against the real portal migration (`lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql`), confirmed accurate as written; runtime mapping needs no HCI-30 schema (see ADR-0009's "Implementation note"); migration and negative test remain OPEN, the latter genuinely blocked on an adapter/API layer that does not exist in either repo**
Date: 2026-09-01
Authority: ADR-0009 (`HD-01=A`)
Scope: A pre-implementation contract for the HCI Wave 1 adapter. It does not alter portal tables, create a cross-product foreign key, or provision a tenant.

## Canonical meanings

| Concept | Canonical owner | Meaning | Not permitted |
|---|---|---|---|
| HCI Tenant | HCI product, aligned to AI LEGO ADR-003 | HCI's outermost billing/legal/deployment and isolation identity | Reusing a portal organization ID as the HCI Tenant primary key |
| Portal organization | Portal product | Customer identity/membership record used by the control plane | Becoming a second platform Tenant source of truth |
| `organization_product_subscriptions.external_tenant_id` | Portal subscription seam | Nullable external reference to the product-owned Tenant | A cross-product DB foreign key or a claim that `NULL` means provisioned |
| HCI Organization node | HCI Workspace graph | Relationship/attribute node beneath a Workspace | An intervening tenancy boundary |

## Adapter mapping

1. HCI owns an immutable `tenant_id`; the portal only stores it as `external_tenant_id` on the active HCI product subscription.
2. The portal adapter must use `organization_id`, `product_key='hci'`, subscription lifecycle, and `external_tenant_id` together. It must not infer HCI access from a portal organization alone.
3. HCI receives a signed/versioned tenant-context contract through an API/event adapter. HCI and portal must not directly query each other's databases.
4. A Workspace belongs to exactly one HCI Tenant. An Organization relationship node is scoped inside that Workspace and never changes the tenant context.

## Provisioning and lifecycle contract

| Event | Required adapter behavior | Failure behavior |
|---|---|---|
| First HCI provisioning | Create/retrieve HCI Tenant idempotently, then bind it to the matching portal HCI subscription | `external_tenant_id` remains `NULL`; launcher reports unprovisioned, never a fabricated Tenant |
| Duplicate request | Return the same product-owned `tenant_id` only when the same portal subscription is the live claimant | Fail closed and raise an operator-visible conflict for any different claimant |
| Suspension/cancellation | Revoke portal entitlement through the adapter; retain HCI records pending retention/deletion decisions | No automatic cross-product deletion or reassignment |
| Portal organization deletion request | Stop and require the subscription/retention workflow; do not cascade-delete product data | Operator-visible failure rather than data loss |

The portal migration already enforces one live HCI subscription per portal organization and one live portal claimant per `external_tenant_id`; this contract adds no stronger claim until an HCI Tenant implementation exists.

## Compatibility and migration plan

1. **Inventory first**: enumerate HCI-product subscriptions with their `organization_id`, `status`, and `external_tenant_id`; no writes.
2. **Preflight**: reject duplicate live external tenant claims, missing required portal membership, or a non-HCI product key.
3. **Pilot with synthetic tenant**: provision one synthetic portal organization and one HCI Tenant through the adapter; record correlation IDs and rollback data.
4. **Controlled binding**: write only a product-owned HCI Tenant ID to an eligible live HCI subscription through the approved service path. Do not add an FK while the products remain independently owned.
5. **Rollback**: disable the adapter binding and restore the prior nullable seam value from the migration record; never delete an HCI Tenant as a rollback shortcut.

## Runtime-verification gate

The required cross-tenant test is specified in `HCI_WAVE1_NEGATIVE_TEST_SPEC.md` as `TENANT-ADAPTER-NEG-01` through `TENANT-ADAPTER-NEG-03`. It cannot be run until HCI has an executable API, database, and non-superuser tenant role.

## Evidence

- `D:\Work\lobster-factory\packages\db\migrations\0001_core.sql` — portal `organizations` and `workspaces` ownership.
- `D:\Work\lobster-factory\packages\db\migrations\0062_organization_product_subscriptions.sql` — HCI subscription seam, nullable non-FK external tenant reference, lifecycle uniqueness, and RLS boundary.
- `../ADR-0009-tenant-organization-model-reconciliation.md` — approved HCI decision.
