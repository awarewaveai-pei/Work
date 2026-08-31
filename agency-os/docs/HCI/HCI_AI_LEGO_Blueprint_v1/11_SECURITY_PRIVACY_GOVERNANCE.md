> 🚨 **SUPERSEDED 2026-08-29** -- this V1 document is historical record only. Read the current, authoritative version of this chapter at agency-os/docs/HCI_AI_LEGO_Blueprint_v2/11_SECURITY_PRIVACY_GOVERNANCE.md. See 00_README.md in this folder for why.

# 11 — Security, Privacy & Governance

## Security model

Use defense in depth:

```text
Edge
↓
Identity
↓
API Gateway
↓
Policy Engine
↓
Tenant Context
↓
Application Authorization
↓
Database RLS
↓
Encryption
↓
Audit
```

## Authentication

- MFA
- short-lived sessions
- strong service-account separation
- enterprise SSO
- SCIM where applicable

## Authorization

Use:
- RBAC
- ABAC
- least privilege
- need-to-know
- just-in-time admin access

## Admin principle

Administrative authority does not automatically imply content access.

## Data classification

Recommended:

```text
PUBLIC
INTERNAL
CONFIDENTIAL
RESTRICTED
```

HCI person-analysis data defaults to:

```text
RESTRICTED
```

## Encryption

- in transit
- at rest
- field-level for highly sensitive notes/evidence
- KMS/secret manager
- no production secrets in repository

## Tenant isolation

Every tenant-owned table must contain:

```text
tenant_id NOT NULL
```

and be protected by DB-level Row Level Security where appropriate.

Do not rely solely on application WHERE clauses.

## Protected data restrictions

Formal scoring should not use irrelevant protected/sensitive traits such as:

- race
- religion
- sexual orientation
- health conditions
- private sex life
- political affiliation
- similar sensitive categories

AI must not infer these from face, voice, name, or communications for HCI decisions.

## Employment / HR boundary

HCI may support decision-making, but must not become an autonomous engine for:

```text
Hire
Fire
Promotion
Compensation
```

High-impact employment use requires:
- human review
- explainable evidence
- local policy/jurisdiction check
- protected-attribute exclusion
- decision logging

## Customer data ownership

Customer data belongs to the customer subject to contract and applicable law.

Default:
- no cross-tenant person reputation database
- no training on enterprise evidence without explicit lawful authorization
- no resale of customer evidence
- no hidden public reputation score

## Trust & safety

Explicitly prohibit:
- covert mass citizen scoring
- illegal surveillance
- hacked/private account access
- purchase/use of clearly illicit leaked data
- protected-trait scoring
- fully autonomous irreversible human decisions

## Audit

High-value audit event should include:

```text
who
what
when
where
before
after
reason
request_id
session_id
```

High-risk audit alerts:
- bulk export
- unusual admin reading
- permission escalation
- mass evidence changes
- retention override
- audit deletion attempt
