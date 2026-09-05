# Composable AI Commerce OS
## AI Copilot & Agents LEGO

> 文件角色：AI provider、Tool Registry、Copilot、Agent、Evaluation、Policy 與 AI observability。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

把 AI 變成全系統共用能力，但禁止 AI 直接碰外部平台或未授權資料。

# 2. Why This LEGO Exists

真正差異化不在多接一個 LLM，而在 permissioned tools、grounding、evaluation、approval 與 audit。

# 3. Boundary

## Owns

- AIProviderConfig
- PromptVersion
- ToolDefinition
- AgentDefinition
- EvaluationSuite
- AIUsageRecord

## Does Not Own

- Business domain data
- Connector API
- Core permissions

# 4. Core Dependencies

- Permission/Policy
- Audit
- Knowledge
- Search
- Events

# 5. Public Capabilities

- Model gateway
- Prompt registry
- Tool registry
- Copilot
- Agents
- Fallback
- Budget
- Evaluation
- Guardrails

# 6. Primary Domain Objects

- AIProvider
- Prompt
- Tool
- Agent
- Evaluation
- UsageBudget

# 7. Public Service Contract

```text
complete()
invokeTool()
runAgent()
evaluateOutput()
enforceBudget()
selectModel()
```

# 8. Events Published

```text
ai.request.completed
ai.tool.invoked
ai.agent.action_requested
ai.evaluation.failed
ai.budget.exceeded
```

# 9. Events Consumed

```text
business events selected by agent subscriptions
```

# 10. Permissions

```text
ai.use
ai.prompt.manage
ai.agent.manage
ai.tool.manage
ai.audit.read
```

# 11. AI Tool Surface

```text
Tool Registry 本身；所有 domain tools 必須 declarative metadata: permission, risk, audit, input/output schema
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- OpenAI
- Anthropic
- Google
- OpenRouter
- STT/TTS/Image/Video providers

# 13. Primary Workflows

1. Copilot → read tools → suggestion。
2. Agent → plan → tool request → policy → confirmation/approval → execute → audit。
3. Outputs → evaluation / quality / cost monitoring。

# 14. UX Surfaces

- AI provider settings
- Prompt versions
- Agent console
- Tool permissions
- Evaluation dashboard
- Usage/cost

# 15. Data & Integration Rules

- AI 不能直接 SQL
- AI 不能直接叫 Woo/LINE API
- 高風險 write 必須 approval
- 每個 tool call 可追蹤

# 16. MVP

- Single provider
- Suggested reply
- Conversation summary
- Read-only tools
- Usage logging

# 17. Explicit Non-Goals for MVP

- Autonomous refund
- Unlimited agents
- Own foundation model

# 18. Acceptance Criteria

- 換 provider 不改 business logic
- Tool permission 有測試
- Prompt regression 可評估

# 19. Expansion Roadmap

- V1 Copilot
- V2 safe actions
- V3 agents
- V4 voice/agentic commerce

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

AI 只透過受控 tools 操作 Business OS，所有讀寫皆有權限、風險級別與 audit。
