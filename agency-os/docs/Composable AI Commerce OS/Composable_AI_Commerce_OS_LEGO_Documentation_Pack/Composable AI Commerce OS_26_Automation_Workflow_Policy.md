# Composable AI Commerce OS
## Automation / Workflow / Policy LEGO

> 文件角色：跨 Module automation、Human approval 與 business policy 的核心平台 LEGO。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓 business event 以 Trigger/Condition/Action 形式驅動跨模組工作，但不讓 Module 彼此硬耦合。

# 2. Why This LEGO Exists

如果 CRM、Marketing、Commerce 各有自己的 automation engine，最後會變成三套規則與不可追蹤 side effects。

# 3. Boundary

## Owns

- AutomationRule
- WorkflowRun
- StepRun
- ApprovalRequest
- PolicyRule

## Does Not Own

- Domain records of business modules
- Connector implementation

# 4. Core Dependencies

- Events
- Permissions
- Tasks
- Audit

# 5. Public Capabilities

- Trigger
- Condition
- Action
- Delay
- Branch
- Schedule
- Human approval
- Retry
- Policy evaluation

# 6. Primary Domain Objects

- Automation
- WorkflowRun
- Step
- Approval
- Policy

# 7. Public Service Contract

```text
evaluateTrigger()
startWorkflow()
executeStep()
requestApproval()
evaluatePolicy()
```

# 8. Events Published

```text
workflow.started
workflow.completed
workflow.failed
approval.requested
approval.approved
policy.denied
```

# 9. Events Consumed

```text
Any registered domain event
```

# 10. Permissions

```text
automation.read
automation.manage
approval.act
policy.manage
```

# 11. AI Tool Surface

```text
explain_workflow()
draft_automation()
summarize_failed_run()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- 所有 action 最終透過 Module public service / Connector capability

# 13. Primary Workflows

Example:
order.paid
  IF amount > 10000
  THEN add CRM tag
       create task
       send LINE
       notify finance


# 14. UX Surfaces

- Automation builder
- Run history
- Approval inbox
- Policy editor
- Failure/retry

# 15. Data & Integration Rules

- Workflow 不直接 SQL
- Action 必須可 idempotent
- Policy precedes high-risk write

# 16. MVP

- Event trigger
- Conditions
- Actions
- Approval
- Retry

# 17. Explicit Non-Goals for MVP

- Full BPMN engine
- Distributed workflow infrastructure day one

# 18. Acceptance Criteria

- 跨模組 workflow 無 direct table access
- Failed step 可 retry
- Approval 有完整 audit

# 19. Expansion Roadmap

- V1 simple builder
- V2 delays/branches
- V3 long-running workflows

# 20. LEGO Test

這個模組完成前必須通過：

1. **Remove Test** — 停用本模組後，Core 與其他模組仍可啟動。
2. **Replace Test** — 外部 Provider 可替換，不需修改本模組 Domain。
3. **Boundary Test** — 不可直接讀寫其他模組擁有的資料表。
4. **Event Test** — 跨模組 side effects 透過 public service 或 event 發生。
5. **Tenant Test** — 所有資料都必須 organization scoped。
6. **Audit Test** — 敏感 write action 都可追蹤。
7. **Contract Test** — 對外 contract 有自動化測試。

# 21. Definition of Done

跨 Module automation 由統一 engine 控制，任何高風險動作先過 policy/approval。
