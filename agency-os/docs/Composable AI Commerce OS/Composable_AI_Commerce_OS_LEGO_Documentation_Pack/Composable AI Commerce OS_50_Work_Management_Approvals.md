# Composable AI Commerce OS
## Work Management & Approvals LEGO

> 文件角色：Task、Project、Checklist、Owner、Due Date、Approval 的跨模組協作 LEGO。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

承接那些不能或不應全自動化的 business work，讓所有 Module 共用同一人工作業層。

# 2. Why This LEGO Exists

客服退款、內容審核、PO、法規、財務結帳都需要人；不能每個 Module 各做一套 task。

# 3. Boundary

## Owns

- Task
- Project
- Checklist
- Assignment
- ApprovalRequest
- Comment

## Does Not Own

- Domain business object
- Automation definition

# 4. Core Dependencies

- Organization/User/Team
- Permissions
- Audit
- Notifications

# 5. Public Capabilities

- Tasks
- Projects
- Checklist
- Due date
- Dependencies
- Approvals
- Comments
- Attachments

# 6. Primary Domain Objects

- Task
- Project
- Approval
- ChecklistItem

# 7. Public Service Contract

```text
createTask()
assignTask()
completeTask()
requestApproval()
approve()
reject()
```

# 8. Events Published

```text
task.created
task.completed
approval.requested
approval.approved
approval.rejected
```

# 9. Events Consumed

```text
Any module may create tasks/approvals through public service
```

# 10. Permissions

```text
task.read
task.manage
approval.act
project.manage
```

# 11. AI Tool Surface

```text
summarize_tasks()
prioritize_tasks()
draft_action_plan()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Slack/Email notifications optional

# 13. Primary Workflows

Module requests work → Task/Approval → owner acts → event returns result to originating module。

# 14. UX Surfaces

- My Work
- Team board
- Approval inbox
- Project view

# 15. Data & Integration Rules

- Task stores reference to domain object, not copies it
- Approval decision immutable/audited

# 16. MVP

- Task
- Assignment
- Due date
- Approval

# 17. Explicit Non-Goals for MVP

- Full Jira replacement

# 18. Acceptance Criteria

- Marketing/Finance/Returns 都能共用 approval
- Task 可追到來源 entity
- Approval result 回傳 event

# 19. Expansion Roadmap

- V1 tasks/approval
- V2 projects/dependencies
- V3 workload planning

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

所有需要人介入的跨模組流程有共用工作層，而不是各自造輪子。
