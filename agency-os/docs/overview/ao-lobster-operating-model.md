# AO + Lobster Operating Model

> Purpose: one operating model for how Agency OS governance and Lobster Factory execution run together, so daily work does not split across inconsistent docs.

## 1) System Roles (Who owns what)

- `Agency OS`: governance, policies, task board, worklog, memory, closeout evidence.
- `Lobster Factory`: engineering execution pipeline, workflow/routing enforcement, factory validation gates.
- `Supabase`: system of record for workflow state and approvals.
- `Trigger`: durable orchestration owner for long-running execution flows.
- `n8n`: light glue only (webhook ingress, notifications, sync), not critical orchestration.

## 2) Event SSOT (Single Source of Truth)

- Startup event (`AO-RESUME`):
  - `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
  - `.cursor/rules/30-resume-keyword.mdc`
- Shutdown event (`AO-CLOSE`):
  - `docs/operations/end-of-day-checklist.md`
  - `.cursor/rules/40-shutdown-closeout.mdc`

All other docs should link to these event docs instead of duplicating full command blocks.

## 3) Daily Operating Cadence

1. Align Git in monorepo root.
2. Run startup checks (`AO-RESUME` + quick self-check).
3. Execute exactly one main line item from `TASKS.md` / Lobster checklist.
4. Record evidence in `WORKLOG.md` and `memory/daily/YYYY-MM-DD.md`.
5. Run closeout (`AO-CLOSE`) so next machine can continue via `git pull`.

## 4) AO + Lobster Event Flow (Mermaid)

```mermaid
flowchart TD
    A[開機/開工意圖] --> B[AO-RESUME]
    B --> C{Git 對齊?}
    C -- 否 --> C1[先 pull/rebase 解衝突]
    C1 --> B
    C -- 是 --> D[30 秒自檢<br/>status + drift + verify-build-gates]
    D --> E{Critical Gate PASS?}
    E -- 否 --> E1[先修復阻塞<br/>不進主線開發]
    E1 --> D
    E -- 是 --> F[選 1 個主線任務<br/>TASKS / Lobster Checklist]
    F --> G[Execution Plane<br/>Trigger/Lobster workflows]
    G --> H[Data Plane<br/>Supabase SoR + artifacts]
    H --> I[Observability Plane<br/>Sentry/PostHog/logs]
    I --> J[回寫證據<br/>WORKLOG + memory/daily]
    J --> K[AO-CLOSE]
    K --> L[verify-build-gates + system-guard + integrated-status]
    L --> M{全部 PASS?}
    M -- 否 --> M1[回滾安全修復計畫<br/>不推送]
    M -- 是 --> N[git add/commit/push]
    N --> O[他機 git pull 後可續接]
```

## 5) Stable Operation Definition

The stack is considered stable only when all are true:

- Git alignment is clean (no drift against `origin/main`).
- `verify-build-gates` passes.
- `system-health-check` is 100% (or explicitly exception-approved).
- Evidence files are updated (`TASKS`, `WORKLOG`, `memory`).
- Cross-machine handoff can continue without extra interpretation.

## 6) Current Critical Execution Gaps

These are known "must run in rhythm" items to convert configuration into real operation:

- Run one real new-client onboarding flow (`tenants/NEW_TENANT_ONBOARDING_SOP.md`).
- Close Lobster A10-2 business loop (new client -> acceptance -> production evidence chain).

## 7) Related Core Docs

- `README.md`
- `AGENTS.md`
- `docs/overview/agency-os-complete-system-introduction.md`
- `../lobster-factory/README.md`
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/LOBSTER_FACTORY_MASTER_CHECKLIST.md`
