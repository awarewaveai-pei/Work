# Multi-Platform Delivery Architecture (WordPress-first)

## Objective
- Keep current operations optimized for WordPress while allowing future CMS/platform expansion.

## Platform Strategy
- Default platform profile: `wordpress`
- Additional profiles supported via adapters:
  - `headless`
  - `shopify`
  - `webflow`
  - `custom_app`

## Adapter Contract
Every platform adapter must expose these capabilities:
- Content operations (create/update/publish/unpublish)
- User and role mapping
- Deployment hooks
- Backup/restore hooks
- Monitoring and incident signals
- Change approval and rollback metadata

## Current Implementation Baseline
- WordPress is primary production path
- WordPress custom guidelines remain mandatory for WP projects
- Project docs must specify `platform_profile`

## Required Tenant Metadata
- `platform_profile` (default `wordpress`)
- `hosting_model`
- `deployment_path`
- `backup_policy_ref`
- `integration_set`

## Release and Migration Rules
- Any platform change requires CR and migration checklist completion
- New platform requires:
  - adapter readiness review
  - QA gate pass
  - rollback plan
  - operations runbook

## Cross-Platform Consistency
- Business workflow remains stable regardless of platform:
  - Discovery -> Build -> UAT -> Launch -> Operate
- Metrics definitions must stay consistent across platforms
- Compliance checks must remain platform-agnostic

## Related Documents (Auto-Synced)
- `docs/architecture/agency-command-center-v1.md`
- `docs/operations/end-to-end-linkage-checklist.md`
- `docs/standards/wordpress-custom-dev-guidelines.md`
- `README.md`

_Last synced: 2026-03-20 04:57:15 UTC_

