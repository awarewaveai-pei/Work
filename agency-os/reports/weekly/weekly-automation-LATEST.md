# Weekly automation report

- Generated: 2026-05-11 09:10:20
- Work root: C:\Users\USER\Work
- Config: C:\Users\USER\Work\scripts\weekly-automation-config.json
- Result: PASS

## Job results

### weekly-system-review - PASS
- Description: Run weekly build gates and integrated status report.
- Type: powershellFile
- Started: 2026-05-11T09:10:01
- Ended: 2026-05-11T09:10:15
- Exit code: 0
- Command: powershell.exe 

#### stdout
```text
== Lobster Factory: bootstrap-validate ==
Running manifest validation...
All manifests valid
Running governance validation...
Governance config validation PASSED
Running V3 governance gates...
Running V3 governance gates (4 checks) ...

== manifest_schema: manifest schema and staging guardrail validation ==
All manifests valid

== governance_configs: agent and policy governance config validation ==
Governance config validation PASSED

== dryrun_contract: dryrun apply-manifest acceptance contract ==
Dryrun apply-manifest validation PASSED ??(mode=fast)

== doc_integrity: doc links and canonical file integrity ==

--- Duplicate long command lines (consider linking to runbook instead) ---
Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\ONE_CLICK_BUILD_SOP.md, lobster-factory\docs\operations\LOBSTER_FACTORY_OPERATOR_RUNBOOK.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1

Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\e2e\STAGING_PIPELINE_E2E_PAYLOAD.md, lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-33...

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --pro...

Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\e2e\STAGING_PIPELINE_E2E_PAYLOAD.md
  node <WORK_ROOT>\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast --wpRootPath="<path\to\wordpress>"

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-operable-e2e-skeleton.mjs

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\run-restore-test.mjs --siteId=44444444-4444-4444-4444-444444444444 --environment=staging

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\dryrun-client-offboarding.mjs --clientId=CLIENT_UUID

Files: lobster-factory\docs\operations\LOCAL_WORDPRESS_WINDOWS.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1

Files: lobster-factory\docs\operations\LOCAL_WORDPRESS_WINDOWS.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni

Doc integrity PASSED (workRoot=C:\Users\USER\Work, scanned: lobster-factory, agency-os/docs, agency-os/memory, agency-os/tenants, agency-os/*.md (top-level), docs/spec/raw)
Note: 11 duplicate command patterns (warnings only; use --strict-duplicates to fail)
V3 governance gates PASSED
Running workflow routing policy validation...
Workflow routing policy validation PASSED
Running workflows integrations baseline validation...
Workflows integrations baseline validation PASSED ??Running staging manifest executor structural validation...
Staging manifest executor structural validation PASSED ??Running operable E2E skeleton validation...
Operable E2E skeleton validation PASSED ??Running artifacts governance validation...
Artifacts governance validation PASSED ??Running doc link + canonical integrity...

--- Duplicate long command lines (consider linking to runbook instead) ---
Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\ONE_CLICK_BUILD_SOP.md, lobster-factory\docs\operations\LOBSTER_FACTORY_OPERATOR_RUNBOOK.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1

Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\e2e\STAGING_PIPELINE_E2E_PAYLOAD.md, lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-governance-configs.mjs

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\dryrun-apply-manifest.mjs --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --projectId=33333333-3333-33...

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_COMPLETION_PLAN_V2.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md, agency-os\memory\CONVERSATION_MEMORY.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-dryrun-apply-manifest.mjs --mode=strict --organizationId=11111111-1111-1111-1111-111111111111 --workspaceId=22222222-2222-2222-2222-222222222222 --pro...

Files: lobster-factory\docs\e2e\OPERABLE_E2E_PLAYBOOK.md, lobster-factory\docs\e2e\STAGING_PIPELINE_E2E_PAYLOAD.md
  node <WORK_ROOT>\lobster-factory\scripts\run-staging-pipeline-regression.mjs --mode=fast --wpRootPath="<path\to\wordpress>"

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\validate-operable-e2e-skeleton.mjs

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\run-restore-test.mjs --siteId=44444444-4444-4444-4444-444444444444 --environment=staging

Files: lobster-factory\docs\LOBSTER_FACTORY_CHECKLIST.md, lobster-factory\docs\LOBSTER_FACTORY_MASTER_CHECKLIST_v2.md
  node <WORK_ROOT>\lobster-factory\scripts\dryrun-client-offboarding.mjs --clientId=CLIENT_UUID

Files: lobster-factory\docs\operations\LOCAL_WORDPRESS_WINDOWS.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\setup-wp-cli-windows.ps1

Files: lobster-factory\docs\operations\LOCAL_WORDPRESS_WINDOWS.md, agency-os\docs\overview\REMOTE_WORKSTATION_STARTUP.md
  powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-local-wordpress-windows.ps1 -EnsurePhpIni

Doc integrity PASSED (workRoot=C:\Users\USER\Work, scanned: lobster-factory, agency-os/docs, agency-os/memory, agency-os/tenants, agency-os/*.md (top-level), docs/spec/raw)
Note: 11 duplicate command patterns (warnings only; use --strict-duplicates to fail)
Bootstrap validation PASSED ??== Monorepo: sync Cursor rules (00 + 30 + 40 + 50-operator + 63-66) to repo root ==
== Agency OS: verify-adr-index ==
verify-adr-index: OK (6 ADR file(s))
== Local config: scan-for-secrets ==

Findings (11):
  [WARN] mcp/user-env.ps1:30  JWT (Supabase / generic)  match=eyJh***55AM  tracked=False
  [WARN] mcp/user-env.ps1:32  JWT (Supabase / generic)  match=eyJh***55AM  tracked=False
  [WARN] mcp/user-env.ps1:34  JWT (Supabase / generic)  match=eyJh***55AM  tracked=False
  [WARN] mcp/user-env.ps1:35  Postgres DSN with password  match=post***AGo@  tracked=False
  [WARN] mcp/user-env.ps1:37  JWT (Supabase / generic)  match=eyJh***55AM  tracked=False
  [WARN] mcp/user-env.ps1:44  JWT (Supabase / generic)  match=eyJh***2jak  tracked=False
  [WARN] mcp/user-env.ps1:45  JWT (Supabase / generic)  match=eyJh***UR80  tracked=False
  [WARN] mcp/user-env.ps1:63  GitHub PAT (classic)  match=ghp_***GoMo  tracked=False
  [WARN] mcp/user-env.ps1:64  GitHub PAT (classic)  match=ghp_***GoMo  tracked=False
  [WARN] mcp/user-env.ps1:68  Anthropic API key  match=sk-a***oAAA  tracked=False
  [WARN] mcp/user-env.ps1:69  Google API key  match=AIza***waU8  tracked=False

scan-local-config-for-secrets: WARN ??secret(s) in gitignored local config files.
  These are not in git, but reduce local exposure by sanitizing.
  Recipe: see agency-os/docs/operations/mcp-secrets-hardening-runbook.md 禮Local Plaintext Scanner
verify-build-gates: scan-local-config-for-secrets WARN (gitignored plaintext; non-blocking). See runbook.
== Observability baseline: Sentry contract ==
== Agency OS: system-health-check ==
Health report: reports/health/health-20260511-091011.md
Score: 99.7% (357/358)
== Shared AI Governance: Verify SSOT and Sync ==
== Shared AI Governance: Checking SSOT Consistency ==
  [OK] Canonical rules found and unique.
  [OK] MCP registry template found.
  Verifying .mcp.json consistency...
  [OK] Agent bootstrap prompts found.
  [OK] .mcp.json server list matches registry template.
Shared AI Governance verification passed.
== AO-RESUME contract: auto-checkpoint must pin WorkRoot ==
== Claude user-level SSOT contract: required files exist ==
verify-build-gates: ALL PASSED
Integrated status report: reports/status/integrated-status-20260511-091014.md
Also written to: reports/status/integrated-status-LATEST.md
== generate-integrated-status-report: render PROGRAM_TIMELINE from PROGRAM_SCHEDULE.json ==
render-program-timeline: updated C:\Users\USER\Work\agency-os\docs\overview\PROGRAM_TIMELINE.md
weekly-system-review: done (gates=PASS (exit 0), report OK).
```

### workflows-security-audit - PASS
- Description: Run workflows npm audit and emit security report.
- Type: process
- Started: 2026-05-11T09:10:15
- Ended: 2026-05-11T09:10:20
- Exit code: 0
- Command: npm 

#### stdout
```text

> audit:workflows-security
> node scripts/audit-workflows-security.mjs

Wrote: C:\Users\USER\Work\agency-os\reports\security\workflows-npm-audit-2026-05-11-011019.md
Wrote: C:\Users\USER\Work\agency-os\reports\security\workflows-npm-audit-LATEST.md
```


