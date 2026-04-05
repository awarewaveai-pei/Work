# Global Compliance Baseline

## Objective
- Maintain minimum compliance posture for cross-border client delivery.

## Data Classification
- Public
- Internal
- Confidential
- Restricted (PII, credentials, financial records)

## Required Controls
- Least privilege access for all systems
- Tenant-level data isolation
- Credential rotation every 90 days (or earlier on incident)
- Audit trail for production changes
- Backup and restore validation per month

## Privacy and Regulatory Baseline
- Handle personal data under GDPR-like principles:
  - purpose limitation
  - data minimization
  - retention and deletion control
- Keep regional requirements as tenant addendums.
- Leads and scraping activities must pass `docs/compliance/leads-and-scraping-checklist.md`.

## Vendor and Subprocessor Governance
- Maintain approved vendor list
- Record purpose and data scope per vendor
- Ensure subprocessors meet equivalent security baseline

## Incident and Breach
- Security incident process follows `docs/operations/incident-response-runbook.md`
- For potential breach:
  - preserve evidence
  - scope impact
  - notify stakeholders per contract/legal requirement

## Evidence Package (for audits)
- Access register snapshots
- Change logs and deployment records
- Backup restore test logs
- Incident reports and CAPA actions

## Related Documents (Auto-Synced)
- `docs/compliance/leads-and-scraping-checklist.md`
- `docs/international/global-delivery-model.md`
- `docs/operations/incident-response-runbook.md`
- `docs/operations/security-secrets-policy.md`
- `README.md`

_Last synced: 2026-03-20 04:57:15 UTC_

