# Composable AI Commerce OS
## Platform Core LEGO

> 所有 Module 共用、不可重複實作的底板。

# 1. Core Owns

```text
Organization
LegalEntity (later)
Brand (later)
Market (later)

User
Team
Role
Permission

Contact
Identity

Files
Notifications

ConnectorRegistry
ConnectorConnection
CapabilityRegistry

EventEnvelope
WebhookInbox
AuditLog

ModuleRegistry
Settings
```

# 2. Core Does NOT Own

```text
Conversation
Lead
Campaign
Order business rules
Inventory ledger
Finance ledger
Product content
Marketplace listing
```

# 3. Required Core Services

```text
OrganizationService
IdentityService
PermissionService
EventBus
AuditService
FileService
ConnectorRuntime
CapabilityRegistry
ModuleRegistry
NotificationService
```

# 4. Organization Model

```text
Organization
├ Users
├ Teams
├ Connector Connections
├ Installed Modules
└ Settings
```

所有 tenant data 必須有 `organization_id`。

# 5. Contact / Identity

```text
Contact
├ LINE identity
├ WhatsApp identity
├ Telegram identity
├ Email identity
├ WooCommerce identity
├ Shopify identity
└ Shopee identity
```

Contact 是人；Identity 是外部平台身份。

# 6. Event Envelope

```json
{
  "event_id": "evt_xxx",
  "event_type": "message.received",
  "organization_id": "org_xxx",
  "aggregate_type": "conversation",
  "aggregate_id": "conv_xxx",
  "source": "line",
  "occurred_at": "ISO-8601",
  "schema_version": 1,
  "data": {}
}
```

# 7. Webhook Inbox

```text
Receive
→ Verify
→ Persist raw envelope
→ Idempotency check
→ Process asynchronously
→ Mark success/failed
→ Retry / replay
```

# 8. Core Acceptance

- Tenant isolation test。
- Identity merge/unmerge audited。
- Connector can register capabilities without Core code change。
- Module can register permissions/events/routes without leaking internals。
