# Composable AI Commerce OS
## Security / Privacy / Observability LEGO

> 文件角色：全平台 Tenant isolation、RBAC、Secrets、Audit、Privacy、Monitoring 與 Incident 基礎。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓系統從第一天就可安全自用，並能升級成可販售的 multi-tenant SaaS。

# 2. Why This LEGO Exists

客服、訂單、地址、電話、付款與 CRM 都是高價值資料；安全不是最後補的功能。

# 3. Boundary

## Owns

- AuditLog
- SecurityEvent
- SecretReference metadata
- RetentionPolicy
- Incident

## Does Not Own

- Provider secret vault internals if external
- Business module data

# 4. Core Dependencies

- Organization
- User
- Permission
- Connector Runtime

# 5. Public Capabilities

- Tenant isolation
- RBAC
- 2FA/SSO later
- Secrets
- Audit
- Retention
- Export/Delete
- Logs/Metrics/Tracing
- Incident

# 6. Primary Domain Objects

- AuditLog
- RetentionPolicy
- SecurityEvent
- Incident

# 7. Public Service Contract

```text
authorize()
audit()
storeSecretRef()
exportSubjectData()
deleteSubjectData()
reportHealth()
```

# 8. Events Published

```text
security.permission_denied
security.suspicious_activity
incident.created
privacy.deletion_completed
```

# 9. Events Consumed

```text
connector.failed
login.failed
policy.denied
```

# 10. Permissions

```text
security.audit.read
security.settings.manage
privacy.export
privacy.delete
incident.manage
```

# 11. AI Tool Surface

```text
summarize_incident()
explain_permission_denial()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- SSO/IdP
- Secrets manager
- Error tracking
- Observability provider

# 13. Primary Workflows

1. Every request → tenant scope + authz。
2. Sensitive write → audit。
3. Connector secret → encrypted reference。
4. Error/health → incident when threshold crossed。

# 14. UX Surfaces

- Audit viewer
- Security settings
- Connector secret health
- Privacy request
- Incident console

# 15. Data & Integration Rules

- organization scope mandatory
- Never log raw secrets
- PII in logs minimized
- Sensitive exports audited

# 16. MVP

- Tenant tests
- RBAC
- Audit
- Encrypted secrets
- Basic observability
- Export/Delete contact

# 17. Explicit Non-Goals for MVP

- Full SOC2 automation day one
- Customer-managed keys first

# 18. Acceptance Criteria

- Cross-tenant test fails closed
- secret 不出現在 logs
- 敏感操作可追溯

# 19. Expansion Roadmap

- V1 SaaS security
- V2 SSO/SCIM
- V3 enterprise controls

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

任何資料讀寫都有 tenant/permission boundary；任何故障可定位 organization/connector/request。
