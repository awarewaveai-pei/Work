> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/08_HCI30_COMMERCIAL_EDITION_ARCHITECTURE.md. See 00_README.md in this folder for why.

# 08 — HCI-30 Commercial Edition Architecture

## Product editions

Recommended:

```text
HCI Personal
HCI Professional
HCI Team
HCI Enterprise
HCI Group
HCI Private
```

## Personal

- single user
- private vault
- person/relationship/evidence
- analysis
- export
- encryption
- optional local-first mode

## Professional

Adds:
- multiple projects
- advanced analysis
- custom templates
- API
- automation

## Team

Adds:
- workspaces
- collaboration
- RBAC
- shared evidence
- review workflows
- activity history

## Enterprise

Adds:
- SSO
- SCIM
- RBAC + ABAC
- DLP
- data residency
- enterprise audit
- retention
- legal hold
- BYOK
- enterprise AI policy controls
- dedicated DB option

## Group

Adds:
- multi-organization hierarchy
- delegated administration
- group-level policies
- regional policies
- legal-entity isolation
- consolidated risk views
- internal chargeback
- multi-region support

## Private

Deployment modes:

```text
SaaS Shared
SaaS Dedicated
Customer Cloud
On-Premise
Air-Gapped
```

All deployment modes must share the same HCI core. No customer-specific forks.

## Tenant hierarchy

```text
Tenant
↓
Organization
↓
Workspace
↓
Project
↓
Person / Relationship / Evidence
```

Tenant is a security/customer boundary.

Organization is a real-world legal/business entity.

Never conflate the two.

## Entitlement architecture

Plans are sets of entitlements.

Do not scatter:

```text
if plan == enterprise
```

through the codebase.

Use:

```text
Product
Plan
Feature
Entitlement
Limit
Subscription
License
```

## Possible editions / vertical packs

Future market packs may include:

```text
HCI Executive
HCI Investor
HCI Partnership
HCI Procurement
HCI Vendor Risk
HCI Family Office
```

They should share 80–90% core domain logic and differ by:

```text
Templates
Policies
Workflow
Dashboard
Reports
Entitlements
```

## White-label

Support branding by configuration:
- logo
- domain
- email branding
- report branding
- terminology

White-label must never equal code fork.

## Upgrade path

Must support in-place:

```text
Personal
→ Professional
→ Team
→ Enterprise
→ Group
```

## Personal to company transfer

Personal data must not automatically become company property.

Provide an audited transfer wizard.

## Group/M&A support

Plan for:
- Tenant Merge
- Tenant Split
- Organization Transfer
- Workspace Transfer

All migrations require:
- dry run
- impact analysis
- audit
- rollback
