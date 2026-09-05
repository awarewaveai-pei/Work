# Composable AI Commerce OS
## Communication Connectors

> 客服 / 通知 / Marketing 的通訊平台 Connector Roadmap。

# 1. Tier 0 Taiwan

## LINE Official Account
Capabilities：
```text
messaging.text
messaging.image
messaging.audio
messaging.file
messaging.reply
messaging.push
profile.read
rich_menu
```

第一個實作 Connector。

# 2. Tier 1 Global

## WhatsApp Business
```text
messaging.text
messaging.media
messaging.template
messaging.reply
messaging.push
calling (capability-gated)
```

## Telegram
```text
messaging.text
messaging.image
messaging.audio
messaging.file
bot.commands
```

## Instagram / Messenger
```text
messaging.dm
comments.read
comments.reply
media_context
```

## Email
```text
email.receive
email.send
email.thread
attachments
```

## Web Chat
自有 channel，作為 reference connector。

# 3. Tier 2

```text
SMS
Discord
Slack
X/Twitter DM
Threads replies
```

# 4. Platform-Restricted

Snapchat / others：只有公開 capability 才開；不要 UI 宣稱不存在的功能。

# 5. Normalized Messaging Contract

```text
external_message_id
connection_id
external_sender_id
direction
message_type
text
attachments[]
reply_to
occurred_at
raw_reference
```

# 6. Golden Connector Test

LINE 與 WhatsApp 必須能同時進同一 Inbox，Customer Service module 不需要 provider-specific branch。
