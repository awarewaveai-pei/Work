# HCI ADR Index

Status: **PLANNING REGISTER — no entry below is an accepted decision**
Owner: HCI AI LEGO Blueprint v2
Last reviewed: 2026-09-01

## Purpose and state rules

This is the auditable index for the ADRs proposed by `17_REPOSITORY_LAYOUT_AND_PATHS.md`. It records intent, owner references, evidence links, and approval state; it does not create an ADR file, approve a design choice, or permit implementation of a 🔴 DECISION PENDING item.

Allowed lifecycle: `PLANNED` → `DRAFT` → `PROPOSED` → `ACCEPTED` / `REJECTED` / `SUPERSEDED`. Only a recorded, explicit human approval may move a decision to `ACCEPTED`. A `DRAFT` or `PROPOSED` entry is not authority to implement.

For any material change, start with `HCI_CHANGE_PROPOSAL_TEMPLATE.md`, attach the result here, and link the final ADR/approval record before changing an implementation boundary.

## Register

| ADR | Planned topic | Primary blueprint source | State | Explicit approval |
|---|---|---|---|---|
| ADR-0001 | HCI and Cognitive OS are peer products | `02_PRODUCT_BOUNDARIES.md` | `PLANNED` | Not recorded |
| ADR-0002 | No cross-product database access | `02_PRODUCT_BOUNDARIES.md`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` | `PLANNED` | Not recorded |
| ADR-0003 | `api.aware-wave` is the unified gateway | `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `PLANNED` | Not recorded |
| ADR-0004 | No universal human trust score | `01_SYSTEM_CONSTITUTION.md`, `05_HCI30_INTELLIGENCE_METHODS.md` | `PLANNED` | Not recorded |
| ADR-0005 | HCI × AI LEGO integration is optional | `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `PLANNED` | Not recorded |
| ADR-0006 | Domain evidence and execution evidence are distinct | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md`, `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md` | `PLANNED` | Not recorded |
| ADR-0007 | Modular monolith first | `17_REPOSITORY_LAYOUT_AND_PATHS.md`, `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` | `PLANNED` | Not recorded |
| ADR-0008 | Vendor-neutral domain core | `01_SYSTEM_CONSTITUTION.md`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` | `PLANNED` | Not recorded |
| ADR-0009 | Tenant/Organization model reconciliation | `02_PRODUCT_BOUNDARIES.md` (`HD-01`) | `PLANNED` | Not recorded |
| ADR-0010 | Consent entity scope | `07_HCI30_DOMAIN_MODEL_AND_DATA_OWNERSHIP.md` (`HD-02`) | `PLANNED` | Not recorded |
| ADR-0011 | HCI subject-type scope | `02_PRODUCT_BOUNDARIES.md` (`HD-00`) | `PLANNED` | Not recorded |
| ADR-0012 | Regulatory market scope | `11_SECURITY_PRIVACY_GOVERNANCE.md` (`HD-20`) | `PLANNED` | Not recorded |
| ADR-0013 | Shared Foundation-kernel extraction | `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md` (§Shared Kernel) | `PLANNED` | Not recorded |

## Review record template

For every state change, add: date; change/proposal identifier; affected documents and implementation paths; alternatives considered; evidence; reviewer and review type; explicit approver and decision; compatibility/migration impact; verification; and rollback/reversal path. Link the entry to the repository worklog closeout required by `14_ROADMAP_AND_DEFINITION_OF_DONE.md`.
