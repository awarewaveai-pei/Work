---
name: feedback-bug-hunt-protocol
description: 使用者談 audit / 抓蟲 / bug class / encoding / silent fail / 工具化 → 自動讀 BUG_HUNT_PROTOCOL.md 再答
metadata: 
  node_type: memory
  type: feedback
  originSessionId: be3de1eb-01d8-4b15-9564-bd3898cc8e82
---

**Rule**：使用者訊息（或 Claude session）中出現以下任一觸發詞，**先讀 `agency-os/docs/operations/BUG_HUNT_PROTOCOL.md` 再回答**，不要憑記憶或常識回。

**觸發詞**（任一命中即觸發）：
- 中文：`抓蟲`、`audit`、`蟲`、`掃描漏洞`、`bug class`、`encoding`、`silent fail`、`潛在 bug`、`vibe coding 的蟲`、`我有蟲`、`類似的問題在哪`、`怎麼確保不漏`、`工具化`、`class-by-class`、`vibe coding`、`30 年`、`永久部署`、`永久化`、`類似的`、`這一類`、`潛在問題`、`技術債`、`系統性`、`掃過`、`類似 bug`、`同類`、`定期`、`漏洞`、`覆蓋率`
- 英文：`audit`、`bug hunt`、`encoding trap`、`silent failure`、`latent bug`、`technical debt`、`tooling`、`class-by-class`、`hardening`、`bug class`、`drift`

**Why**: 2026-05-22 — 全日一系列 audit 證實半年 vibe coding 累積數百到千個 latent bug。建立 4-tier 觸發 + 9-step build playbook + KPI 的永久協定，所有 audit 相關決策**必須**遵循該協定，不靠 Claude 臨機判斷。

**How to apply**：
1. 看到觸發詞 → 立即 Read `agency-os/docs/operations/BUG_HUNT_PROTOCOL.md`
2. 同時 Read `agency-os/docs/operations/AUDIT_REGISTRY.md`（看當前 audit 狀態）
3. 同時 Read `agency-os/AGENTS.md` §代理自動工具使用規則（trigger rules）
4. 依協定 4-tier 觸發模型分類使用者情境（Tier 1 incident / Tier 2 critic-reuse / Tier 3 schedule / Tier 4 opportunistic）
5. 依 Build Playbook 9 步啟動（不要省略或順序變更）
6. 完成後 update AUDIT_REGISTRY + WORKLOG entry

**禁止**：
- 看到「audit」就憑常識答而**沒讀** protocol
- 自創 audit 流程繞過 9-step playbook
- 「修所有蟲」式回應——協定明文「mathematically impossible」
- 把 audit 結果寫進別處（必須在 AUDIT_REGISTRY）

**相關記憶**：
- [feedback_test_review_default.md](feedback_test_review_default.md)（real test + critic 是每次必跑的）
- [feedback_root_cause_discipline.md](feedback_root_cause_discipline.md)（fix must survive machine switch）
- [feedback_all_machines_sync.md](feedback_all_machines_sync.md)（audit tool 改動必跨機 sync 驗證）
