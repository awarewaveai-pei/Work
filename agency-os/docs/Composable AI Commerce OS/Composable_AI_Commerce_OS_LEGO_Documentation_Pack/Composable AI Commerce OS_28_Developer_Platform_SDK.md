# Composable AI Commerce OS
## Developer Platform & SDK LEGO

> 目標：未來不只你自己能寫 LEGO，第三方也能寫 Module 與 Connector。

# 1. Deliverables

```text
Connector SDK
Module SDK
CLI
Manifest schema
Capability schema
Event schema
Permission schema
Test Harness
Sandbox
Mock providers
Developer Docs
Certification pipeline
```

# 2. Module SDK

每個 Module 必須宣告：

```yaml
module: customer-service
version: 1
provides:
  - inbox
  - tickets
consumes:
  - core.contact
events:
  publishes:
    - message.received
permissions:
  - inbox.read
  - conversation.reply
```

# 3. Connector SDK

```yaml
connector: line
category: messaging
regions:
  - TW
capabilities:
  - messaging.text
  - messaging.image
auth:
  type: channel_secret_access_token
transports:
  - webhook
  - REST
```

# 4. Test Harness

每個 Connector 至少測：
- connect
- auth failure
- health
- webhook verify
- duplicate webhook
- timeout
- rate limit
- retry
- normalization
- reconnect

# 5. Compatibility

Contracts 必須 versioned。

```text
Connector Contract v1
Event Schema v1
Capability Schema v1
```

Breaking change 必須提供 migration path。

# 6. Marketplace Later

第三方：
Build → Sandbox → Certification → Publish → Install → Billing/Revenue Share。
