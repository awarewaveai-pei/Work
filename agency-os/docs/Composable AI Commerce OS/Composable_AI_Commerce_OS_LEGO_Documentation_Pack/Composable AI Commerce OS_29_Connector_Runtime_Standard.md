# Composable AI Commerce OS
## Connector Runtime & Integration Standard

> 這是所有 LINE、WhatsApp、Telegram、WooCommerce、Shopify、Shopee、Amazon、Etsy、Stripe、Postiz 等外部串接的共同施工規範。

# 1. Standard Integration Pipeline

```text
External Platform
        ↓
Authentication / Authorization
        ↓
ConnectorConnection
        ↓
Webhook / API / Polling / SFTP / CSV / EDI
        ↓
Raw Payload Inbox
        ↓
Signature / Schema Validation
        ↓
Idempotency
        ↓
Normalization
        ↓
Identity / Entity Mapping
        ↓
Domain Service
        ↓
Domain Event
        ↓
Module
```

# 2. Supported Transports

```text
REST
GraphQL
Webhook
Polling
SFTP
CSV
EDI
Email ingestion
```

# 3. Every Connector Must Define

- Authentication
- Authorization scopes
- Connection lifecycle
- Capabilities
- Region availability
- API version
- Webhooks
- Polling fallback
- Initial sync
- Incremental sync
- Mapping
- Identity mapping
- Rate limits
- Retry policy
- Idempotency key
- Reconciliation
- Health check
- Error taxonomy
- Secrets
- Uninstall behavior
- Tests

# 4. Connection Lifecycle

```text
DISCONNECTED
CONNECTING
CONNECTED
DEGRADED
AUTH_EXPIRED
ERROR
DISABLED
```

# 5. Health

至少：

```text
last_success_at
last_webhook_at
last_sync_at
token_expires_at
latency
rate_limit_state
last_error_code
```

# 6. Error Taxonomy

```text
AUTH
PERMISSION
RATE_LIMIT
VALIDATION
NOT_FOUND
CONFLICT
PROVIDER_OUTAGE
TIMEOUT
NETWORK
UNKNOWN
```

# 7. Idempotency

Inbound webhook 以 provider event/message id + connection id 建唯一鍵。

# 8. Reconciliation

不能假設 webhook 完美。

所有有重要業務資料的 Connector 要能：
- backfill
- resync time range
- compare remote vs local projection
- repair missing records

# 9. Secrets

Secret 只能以 encrypted reference 存放，禁止：
- plaintext logs
- analytics events
- user-facing error message

# 10. Uninstall

拔 Connector：
- 不刪 canonical Contact / Order projection。
- credentials revoke/delete。
- mappings 保留 archival state 或依 policy 清除。
