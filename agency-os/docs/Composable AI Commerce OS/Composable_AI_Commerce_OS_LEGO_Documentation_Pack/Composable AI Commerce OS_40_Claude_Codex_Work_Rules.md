# Composable AI Commerce OS
## Claude / Codex Work Rules

> 這份文件直接放 repo 根目錄，AI coding agent 每次工作都必須遵守。

# Global Instruction

```text
The long-term Business OS blueprint is architectural context, not the active implementation scope.

Do not implement future modules unless explicitly assigned.

Respect the Product Constitution.

Do not introduce direct dependencies between modules.

Do not put provider-specific logic inside Core.

Do not access another module's private tables directly.

Use public services, read models, events, and capabilities.

Do not create speculative abstractions unless required by:
1. an explicit architecture contract, or
2. at least two real implementations.

Before adding a dependency, explain why the current stack cannot reasonably solve the problem.

Before introducing Redis, Kafka, RabbitMQ, Kubernetes, or a new service, stop and justify it with a measured need.

Every external webhook must be idempotent.

Every Connector must expose health.

Every sensitive write must pass Permission/Policy and be audited.

AI may only use registered permissioned Tools.

Every change must include tests for the architectural boundary it touches.

Stop when the assigned task is complete.
```

# File Scope Rule

當任務指定某 LEGO：

```text
Allowed:
- that module
- public Core contracts
- tests/docs required by task

Forbidden without explicit instruction:
- unrelated modules
- global schema redesign
- new infrastructure
```

# Review Checklist

每次 PR / task 完成：

- Boundary 是否破壞？
- 是否 provider-specific code leak？
- organization scope 是否完整？
- permission 是否完整？
- audit 是否需要？
- idempotency 是否需要？
- contract tests 是否有？
- 是否新增不必要 dependency？
