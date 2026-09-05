# Composable AI Commerce OS
## Cross-Border / Trade / Compliance LEGO

> 文件角色：HS Code、產地、關稅、Incoterms、產品法規、DPP 與跨境文件模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓商品與訂單具備跨境出貨所需的 trade/compliance metadata 與文件。

# 2. Why This LEGO Exists

國際電商必須考慮 customs、duties、restricted goods、product certification 與市場法規。

# 3. Boundary

## Owns

- TradeProfile
- HSCodeMapping
- ComplianceRequirement
- Certification
- DPPRecord
- CustomsDocument

## Does Not Own

- Product identity
- Shipment
- Tax ledger

# 4. Core Dependencies

- Product/PIM
- Market
- Legal Entity
- Documents
- Logistics

# 5. Public Capabilities

- HS code
- Country of origin
- Incoterms
- Duties/landed cost input
- Certificates
- DPP metadata
- Customs docs

# 6. Primary Domain Objects

- TradeProfile
- ComplianceRecord
- Certification
- DPPRecord
- CustomsDocument

# 7. Public Service Contract

```text
classifyProduct()
validateMarketCompliance()
buildCustomsData()
generateCommercialInvoice()
getDPPData()
```

# 8. Events Published

```text
compliance.validation_failed
compliance.approved
dpp.updated
customs.document.generated
```

# 9. Events Consumed

```text
product.updated
market.enabled
order.ready_to_ship
```

# 10. Permissions

```text
compliance.read
compliance.manage
compliance.approve
trade.export
```

# 11. AI Tool Surface

```text
suggest_hs_code()
detect_missing_compliance()
summarize_market_requirements()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- Customs/tax providers
- DPP registry/provider
- Logistics

# 13. Primary Workflows

1. Product → trade profile。
2. Market → requirement validation。
3. Order → customs data。
4. Shipment → commercial invoice / compliance docs。

# 14. UX Surfaces

- Compliance dashboard
- Product compliance
- Certificate expiry
- Trade profile
- DPP

# 15. Data & Integration Rules

- AI classification 必須 human-verifiable
- 法規來源版本化
- 過期 certification 要阻止 publish/shipping when required

# 16. MVP

- HS code
- COO
- Commercial invoice
- Compliance checklist

# 17. Explicit Non-Goals for MVP

- Legal advice automation
- All-country customs engine day one

# 18. Acceptance Criteria

- Market enable 前可檢查缺 compliance fields
- customs document 可從 canonical data 生成
- certificate expiry 可 alert

# 19. Expansion Roadmap

- V1 trade basics
- V2 EU DPP
- V3 automated landed cost

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

商品進入新市場前，有可驗證的 trade/compliance readiness。
