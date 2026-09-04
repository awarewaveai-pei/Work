# Enterprise Standard

## Purpose
Define what an "Enterprise" commercial tier is obligated to provide beyond a standard edition, and require that every obligation compose with the existing entitlement/tenant model rather than becoming bespoke, per-customer special-cased code.

## Identity and Access
1. Enterprise MUST support SSO (SAML/OIDC or equivalent) and SCIM-based user provisioning/deprovisioning as entitlement-gated capabilities per `commercial/ENTITLEMENT_STANDARD.md`, implemented against `engineering/IAM_STANDARD.md` — not as a one-off integration per customer.
2. Deprovisioning via SCIM MUST take effect within a documented bounded window and MUST be auditable per `governance/AUTHORITY_MODEL.md`.

## Audit and Legal
3. Enterprise MUST support exportable, tamper-evident audit logs covering at minimum authentication, authorization changes, and data access to regulated data classes, consistent with `governance/STATUS_CODE_STANDARD.md`-style structured event registries.
4. Enterprise MUST support legal hold: the ability to suspend normal data-retention/deletion policy for named records under active legal process, without silently breaking `commercial/CUSTOMER_EXIT_STANDARD.md` deletion guarantees for unrelated data.

## Data Residency
5. Where an edition offers data-residency commitments (e.g. "data stays in region X"), the commitment MUST be enforced at the storage/routing layer, not merely stated in a contract with no technical backing. A residency commitment without an enforcement mechanism MUST NOT be sold.

## Support Access
6. Any staff/support access to a customer's Enterprise environment for troubleshooting MUST be logged with actor, scope, and duration, and MUST default to time-bounded, revocable access rather than standing access (`governance/AUTHORITY_MODEL.md`).

## Procurement Fit
7. Enterprise-specific contract terms (custom SLAs, indemnification, custom payment terms) MUST be tracked as structured data referenced by `commercial/BILLING_ARCHITECTURE.md` and `commercial/LICENSE_ARCHITECTURE.md`, not as side-channel agreements invisible to the systems that enforce billing and entitlements.
8. An Enterprise-only capability MUST NOT be implemented as a fork of core code (`commercial/EDITION_ARCHITECTURE.md`); it MUST be an entitlement-gated capability like any other.
