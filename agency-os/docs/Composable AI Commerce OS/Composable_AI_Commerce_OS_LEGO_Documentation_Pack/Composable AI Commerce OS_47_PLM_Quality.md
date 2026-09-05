# Composable AI Commerce OS
## PLM & Quality LEGO

> 文件角色：自有品牌商品開發、BOM、樣品、版本、品質與 Recall 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

支援產品從 idea/sample 到 launch，再到 QA、defect、corrective action 的生命週期。

# 2. Why This LEGO Exists

自有品牌國際電商會逐步進入工廠、包裝、材料、法規與品質，不應塞進 PIM。

# 3. Boundary

## Owns

- ProductDevelopmentProject
- BOM
- Sample
- SpecificationVersion
- Inspection
- QualityIssue
- CorrectiveAction

## Does Not Own

- PIM listing copy
- Inventory balance
- Compliance authority

# 4. Core Dependencies

- Product identity
- Supplier
- Compliance
- Files
- Tasks/Approval

# 5. Public Capabilities

- Product development
- BOM
- Samples
- Costing refs
- Specification
- Inspection
- Defect
- CAPA
- Recall

# 6. Primary Domain Objects

- DevelopmentProject
- BOM
- Sample
- SpecVersion
- QualityIssue
- CAPA

# 7. Public Service Contract

```text
createDevelopmentProject()
approveSample()
releaseSpec()
recordInspection()
createQualityIssue()
```

# 8. Events Published

```text
product.sample.approved
product.spec.released
quality.issue.created
quality.recall.started
```

# 9. Events Consumed

```text
supplier.created
return.inspected
review.created
```

# 10. Permissions

```text
plm.read
plm.manage
quality.inspect
quality.approve
```

# 11. AI Tool Surface

```text
summarize_quality_issues()
detect_defect_pattern()
compare_spec_versions()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Supplier portal
- Lab/certification providers optional

# 13. Primary Workflows

Idea → Sample → Approval → Spec release → PIM launch → QA feedback → CAPA。

# 14. UX Surfaces

- Development stage board
- BOM/spec
- Sample approval
- Quality dashboard

# 15. Data & Integration Rules

- Released spec immutable/versioned
- PIM consumes released data only
- Recall high-risk workflow

# 16. MVP

- Development project
- Sample
- Spec version
- Quality issue

# 17. Explicit Non-Goals for MVP

- Full manufacturing MES

# 18. Acceptance Criteria

- Spec 可版本追蹤
- Return/review defect 可彙總 quality issue
- release 有 approval

# 19. Expansion Roadmap

- V1 PLM-lite
- V2 QA/CAPA
- V3 recall/supplier quality

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

產品設計資料與 marketplace marketing content 清楚分離，且品質回饋可閉環。
