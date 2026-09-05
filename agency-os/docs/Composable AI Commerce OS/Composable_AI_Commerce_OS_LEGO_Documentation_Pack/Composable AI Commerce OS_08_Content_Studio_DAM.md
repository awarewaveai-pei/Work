# Composable AI Commerce OS
## Content Studio & DAM LEGO

> 文件角色：文字、圖片、影音生成、Brand System 與 Digital Asset Management 模組規格。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

統一產生、管理、版本化與授權所有品牌內容素材，供 Marketing、Social、PIM、Commerce 重複使用。

# 2. Why This LEGO Exists

內容不是一次性 AI output；要成為可搜尋、可授權、可追蹤來源與使用權的企業資產。

# 3. Boundary

## Owns

- Asset
- AssetVersion
- CreativeProject
- Template
- BrandProfile
- GenerationJob
- UsageRights

## Does Not Own

- Product identity
- Campaign
- Social publish transport
- External AI provider implementation

# 4. Core Dependencies

- Files/Object Storage
- AI Control Plane
- Approval
- Search
- Audit

# 5. Public Capabilities

- Copy generation
- Image generation
- Video generation
- Translation
- Subtitles
- Brand kit
- DAM
- Versioning

# 6. Primary Domain Objects

- Asset
- AssetVersion
- BrandProfile
- Template
- CreativeJob

# 7. Public Service Contract

```text
createAsset()
generateAsset()
createVariant()
approveAsset()
searchAssets()
attachUsageRights()
```

# 8. Events Published

```text
content.asset.created
content.asset.generated
content.asset.approved
content.asset.expired
```

# 9. Events Consumed

```text
campaign.created
product.updated
brand.policy.updated
```

# 10. Permissions

```text
content.read
content.create
content.generate
content.approve
brand.manage
asset.delete
```

# 11. AI Tool Surface

```text
generate_copy()
generate_image()
generate_video()
translate_content()
adapt_brand_voice()
```

所有 AI tool 都必須：
- 經過 organization scope。
- 經過 permission / policy check。
- 有 audit trail。
- 對高風險 write action 使用 confirmation / approval。
- 不直接呼叫平台 API。

# 12. Connector Dependencies

- OpenAI/Anthropic/Google
- Image/video providers
- TTS/STT
- Postiz
- Cloud storage

# 13. Primary Workflows

1. Brief → generation job。
2. AI 產生 draft → Brand validation → human approval。
3. Approved asset → DAM。
4. Marketing / Social / PIM 只引用 asset id。

# 14. UX Surfaces

- Asset library
- Creative workspace
- Brand kit
- Template library
- Approval queue
- Usage-right warning

# 15. Data & Integration Rules

- 所有生成結果保留 model/prompt/version metadata
- Asset binary 與 metadata 分離
- 使用權與到期日不可遺失
- Downstream 只引用 asset id

# 16. MVP

- Text + image
- Brand profile
- Asset library
- Versioning
- Approval

# 17. Explicit Non-Goals for MVP

- Full NLE video editor
- Own model training platform

# 18. Acceptance Criteria

- 同一 asset 可被 Social/PIM/Marketing 共用
- 可追溯 AI source、版本與審核者
- 過期素材可阻止再使用

# 19. Expansion Roadmap

- V1 copy/image/DAM
- V2 video/voice
- V3 localization automation

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

內容從生成到審核、版本、授權、分發皆有完整生命週期。
