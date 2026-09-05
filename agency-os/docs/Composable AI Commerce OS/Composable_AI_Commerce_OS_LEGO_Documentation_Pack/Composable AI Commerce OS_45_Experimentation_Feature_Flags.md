# Composable AI Commerce OS
## Experimentation & Feature Flags LEGO

> 文件角色：Feature flag、A/B test、Holdout 與逐步 rollout 模組。
>
> 核心原則：這個 LEGO 必須可獨立演進、可被替換、可被停用，且不能把外部平台邏輯寫進 Core。


# 1. Mission

讓產品、Marketing、Search、AI 回覆等決策可以用實驗而不是感覺驗證。

# 2. Why This LEGO Exists

AI、推薦、checkout、pricing 都會需要安全 rollout；沒有 experiment layer 很難知道改動是否真的提升。

# 3. Boundary

## Owns

- FeatureFlag
- Experiment
- Variant
- Assignment
- MetricBinding

## Does Not Own

- Metric source
- Customer identity
- Application deployment

# 4. Core Dependencies

- Identity
- Analytics
- Permissions
- Events

# 5. Public Capabilities

- Flags
- Percentage rollout
- A/B/n
- Holdout
- Targeting
- Experiment metrics

# 6. Primary Domain Objects

- FeatureFlag
- Experiment
- Variant
- Assignment

# 7. Public Service Contract

```text
evaluateFlag()
assignVariant()
startExperiment()
stopExperiment()
getExperimentResult()
```

# 8. Events Published

```text
experiment.exposed
experiment.converted
flag.changed
```

# 9. Events Consumed

```text
analytics.metric.updated
```

# 10. Permissions

```text
experiment.read
experiment.manage
flag.manage
```

# 11. AI Tool Surface

```text
summarize_experiment()
suggest_experiment()
```

所有 AI tool 都必須經過 tenant scope、permission/policy、audit，且不直接呼叫外部平台 API。

# 12. Connector Dependencies

- Analytics/Data platform

# 13. Primary Workflows

1. Define hypothesis/metric。
2. Assign variants。
3. Exposure events。
4. Outcome metrics。
5. Rollout/rollback。

# 14. UX Surfaces

- Feature flags
- Experiment setup
- Results
- Rollout controls

# 15. Data & Integration Rules

- Assignment deterministic
- Exposure logging
- Metric definition frozen during analysis

# 16. MVP

- Flags
- A/B test
- One primary metric

# 17. Explicit Non-Goals for MVP

- Advanced causal inference first

# 18. Acceptance Criteria

- 同 user assignment 穩定
- rollback 即時
- results use canonical metric

# 19. Expansion Roadmap

- V1 product experiments
- V2 marketing/search
- V3 AI eval experiments

# 20. LEGO Test

1. Remove Test
2. Replace Test
3. Boundary Test
4. Event Test
5. Tenant Test
6. Audit Test
7. Contract Test

# 21. Definition of Done

高風險產品改動可小流量 rollout 並用一致 metrics 驗證。
