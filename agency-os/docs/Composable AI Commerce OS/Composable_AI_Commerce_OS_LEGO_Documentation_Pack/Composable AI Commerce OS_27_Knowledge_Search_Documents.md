# Composable AI Commerce OS
## Knowledge / Search / Documents LEGO

> 文件角色：企業知識、Global Search、文件與模板平台。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓人與 AI 都能以權限安全地找到 SOP、FAQ、客戶、訂單、對話與文件。

# 2. Why This LEGO Exists

AI 沒有可信 Knowledge 與搜尋，只是昂貴聊天；企業操作需要可追溯來源與權限。

# 3. Boundary

## Owns

- KnowledgeDocument metadata
- DocumentVersion
- Template
- SearchIndex metadata

## Does Not Own

- Domain source records
- Binary storage implementation

# 4. Core Dependencies

- Files
- Permissions
- AI
- Organization
- Audit

# 5. Public Capabilities

- Knowledge base
- Versioning
- Global search
- Document templates
- Source citations
- Retention

# 6. Primary Domain Objects

- KnowledgeDocument
- DocumentVersion
- Template
- SearchEntry

# 7. Public Service Contract

```text
indexEntity()
search()
createKnowledgeDoc()
publishVersion()
renderTemplate()
```

# 8. Events Published

```text
knowledge.published
knowledge.expired
search.index_updated
document.generated
```

# 9. Events Consumed

```text
contact.updated
order.updated
ticket.updated
product.updated
```

# 10. Permissions

```text
knowledge.read
knowledge.write
knowledge.publish
search.global
document.generate
```

# 11. AI Tool Surface

```text
search_knowledge()
search_business_data()
get_source_document()
render_document()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Google Drive/Docs
- Notion
- Web/URL import
- Object storage

# 13. Primary Workflows

1. SOP/FAQ → versioned knowledge。
2. Publish → index。
3. AI search → permission filter → grounded answer。
4. Templates → invoice / packing slip / commercial invoice。

# 14. UX Surfaces

- Knowledge library
- Global search
- Template manager
- Version history

# 15. Data & Integration Rules

- Search result 先過 permission filter
- AI answer 必須保留 source references
- 文件版本不可覆寫歷史

# 16. MVP

- Markdown knowledge
- Global search contacts/messages/orders/tickets
- Basic templates

# 17. Explicit Non-Goals for MVP

- Full enterprise ECM
- Unlimited OCR pipeline

# 18. Acceptance Criteria

- Agent 看不到無權限文件
- AI 可引用正確 source
- 版本可 rollback

# 19. Expansion Roadmap

- V1 KB/search
- V2 external sources
- V3 semantic enterprise search

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

人與 AI 能安全搜尋 business context，並可追溯資訊來源與版本。
