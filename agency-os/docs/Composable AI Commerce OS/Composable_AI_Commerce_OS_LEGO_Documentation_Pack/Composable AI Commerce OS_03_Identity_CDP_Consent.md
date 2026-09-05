# Composable AI Commerce OS
## Identity / CDP / Consent LEGO

> 這份文件定義「同一個人跨 LINE、WhatsApp、Shopify、Shopee、Email 仍是同一個 Contact」的資料底座。

# 1. Canonical Identity

`Contact` 是唯一 canonical person object。

```text
Contact
└ Identities[]
```

Identity example：

```text
LINE          Uxxxx
WhatsApp      +886...
Email         a@example.com
Instagram     @a
WooCommerce   customer_123
Shopify       gid://...
Shopee        buyer_x
```

# 2. Deterministic Resolution V1

優先：
1. Explicit account linking
2. Verified email
3. Verified phone
4. Existing provider external id

禁止第一版用模糊姓名自動 merge。

# 3. Merge / Unmerge

Merge 必須：
- 保留 source contacts。
- 記錄 merge reason / actor / timestamp。
- 可 reversible。
- 重新連結 identities / conversations / CRM references。

# 4. CDP Timeline

Customer events：

```text
ad.clicked
website.viewed
message.received
order.paid
return.requested
review.created
campaign.clicked
```

形成 Customer 360 timeline。

# 5. Consent Ledger

```text
contact_id
channel
purpose
status
source
policy_version
jurisdiction
captured_at
withdrawn_at
```

Purpose 例：
- transactional
- marketing
- profiling
- personalization

# 6. Preferences

```text
language
locale
timezone
currency
preferred_channel
quiet_hours
```

# 7. Public Services

```text
findContactByIdentity()
linkIdentity()
mergeContacts()
unmergeContacts()
recordConsent()
withdrawConsent()
getCustomerTimeline()
```

# 8. Acceptance

- 同一人可跨至少兩 messaging + 兩 commerce identity。
- Marketing 送訊息前可查 consent。
- Merge 可 rollback。
- 所有 identity operations organization-scoped。
