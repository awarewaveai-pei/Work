# Claude Code × Codex Collaborative Research Mission
## Aware Wave System Foundry — Independent Dual-Agent Architecture Re-Research

你現在擔任本專案的 **Lead Architecture Orchestrator**。

你的任務不是直接開始 Coding，也不是單方面替既有架構背書。

你的任務是：

> 使用 Claude Code + Codex 進行獨立、可反證、可追溯的雙代理研究，重新檢查 Aware Wave System Foundry v1.0，找出缺陷、矛盾、過度設計、低估風險、未來重工點與可升級之處，最後提出候選 v1.1 / v2 架構。

---

# 0. Source of Truth

System Foundry package：

```text
AwareWave_System_Foundry_v1.0
```

建議 Repository 路徑：

```text
D:\Work\agency-os\docs\SYSTEM_FOUNDRY\
```

優先閱讀：

```text
00_SYSTEM_FOUNDRY_MASTER_PLAN.md
01_SYSTEM_FOUNDRY_CONSTITUTION.md
02_SYSTEM_FOUNDRY_OPERATING_MODEL.md
03_SYSTEM_FOUNDRY_EXECUTION_CONTRACT.md
```

再閱讀：

```text
methodology/
engineering/
commercial/
assurance/
schemas/
recipes/
templates/TOP_TIER_SYSTEM_BLUEPRINT/
```

不要只讀 README。

---

# 1. 核心任務

對 System Foundry v1.0 執行：

```text
RESEARCH
→ INDEPENDENT ANALYSIS
→ CHALLENGE
→ FALSIFICATION
→ RED TEAM
→ CROSS-REVIEW
→ CONVERGENCE
→ RECOMMENDATION
```

第一階段禁止直接修改 Production Code。

第一階段目標是：

```text
KEEP
CHANGE
REMOVE
ADD
DEFER
EXPERIMENT
```

分類 v1.0 的所有重要設計。

---

# 2. 八大不可違反準則

每一個重要決策都必須通過：

```text
1. 多角度優先
2. 30 年工程紀律
3. 零重工原則
4. 完整閉環
5. 最小爆炸半徑
6. 證據優於假設
7. 可逆優於鎖死
8. 可證明優於宣稱
```

---

# 3. Claude Code 與 Codex 必須先獨立研究

這是硬規則。

禁止流程：

```text
Claude 提答案
→ Codex 評論 Claude
```

也禁止：

```text
Codex 提答案
→ Claude 幫它完善
```

第一輪必須：

```text
Claude Independent Review
+
Codex Independent Review
```

彼此在完成第一版結論前，不應讀取對方的結論。

目的：

```text
降低 Anchoring
降低 Confirmation Bias
降低 Groupthink
降低 Authority Bias
```

---

# 4. 如果 Codex 已可由目前環境呼叫

如果目前 Claude Code 環境已經具備合法且可用的 Codex CLI、Agent、MCP、API 或其他既有整合：

你可以把研究工作包提交給 Codex。

但是：

```text
不要自行建立未經授權的 credentials
不要硬寫 API key
不要修改 production secrets
不要使用私人資料當測試輸入
```

如果目前環境無法直接呼叫 Codex：

不要假裝已經與 Codex 協作。

改為建立：

```text
CODEX_RESEARCH_HANDOFF/
```

把 Codex 所需的完整獨立研究包產生出來，等待外部 Codex 執行結果回填。

---

# 5. Claude 與 Codex 使用相同 Evidence Pack

建立：

```text
D:\Work\agency-os\docs\SYSTEM_FOUNDRY_RESEARCH\
00_EVIDENCE_PACK\
```

Evidence Pack 包含：

```text
Foundry v1.0
Current repository facts
Existing infrastructure facts
Existing product architecture
Known constraints
Known assumptions
Open decisions
External research references
```

每個事實標記：

```text
VERIFIED
INFERRED
ASSUMED
UNKNOWN
DISPUTED
```

禁止把 assumption 當 fact。

---

# 6. 第一輪：Claude Independent Review

Claude Code 獨立建立：

```text
01_CLAUDE_INDEPENDENT_REVIEW/
```

至少包含：

```text
00_EXECUTIVE_FINDINGS.md
01_KEEP.md
02_CHANGE.md
03_REMOVE.md
04_MISSING.md
05_OVERENGINEERING.md
06_UNDERENGINEERING.md
07_SECURITY_RISKS.md
08_DATA_ARCHITECTURE_RISKS.md
09_DEVOPS_SRE_RISKS.md
10_COMMERCIAL_RISKS.md
11_30_YEAR_RISKS.md
12_ASSUMPTIONS_TO_CHALLENGE.md
13_PROPOSED_ARCHITECTURE.md
```

此階段不得參考 Codex 結論。

---

# 7. 第二輪：Codex Independent Review

Codex 獨立建立：

```text
02_CODEX_INDEPENDENT_REVIEW/
```

輸出同樣結構：

```text
00_EXECUTIVE_FINDINGS.md
01_KEEP.md
02_CHANGE.md
03_REMOVE.md
04_MISSING.md
05_OVERENGINEERING.md
06_UNDERENGINEERING.md
07_SECURITY_RISKS.md
08_DATA_ARCHITECTURE_RISKS.md
09_DEVOPS_SRE_RISKS.md
10_COMMERCIAL_RISKS.md
11_30_YEAR_RISKS.md
12_ASSUMPTIONS_TO_CHALLENGE.md
13_PROPOSED_ARCHITECTURE.md
```

Codex 在完成第一輪前不得看到 Claude 結論。

---

# 8. 每個 Agent 都要從多專業角度審查

至少模擬以下 Reviewer：

```text
Principal System Architect
Product Architect / PM
Domain Architect
Database Architect
Security Architect
Privacy Architect
DevOps Architect
SRE Architect
API Architect
QA / Verification Architect
Commercial SaaS Architect
Enterprise Architect
FinOps Architect
UX / Information Architect
Industry Specialist
Cross-Industry Specialist
Falsification Architect
Red Team
Complexity Auditor
Failure Economist
Independent Assurance Reviewer
```

不是每個 Reviewer 都一定同意。

---

# 9. 同業與異業研究

對 Foundry 要服務的高價企業架構市場進行研究。

研究：

```text
Enterprise Architecture
Architecture Assurance
Technical Due Diligence
Digital Transformation
Software Architecture Governance
Cloud Architecture
Security Architecture
AI Architecture
Commercial SaaS Architecture
Systems Engineering
Safety Engineering
```

同業研究：

```text
大型顧問公司
Enterprise Architecture practices
Architecture assessment frameworks
Technical due diligence firms
cloud architecture frameworks
security assurance approaches
```

異業研究：

```text
Aviation
Nuclear
Medical devices
Financial risk
Industrial safety
Military command systems
Scientific reproducibility
Legal evidence
```

問題不是：

> 別人用了什麼 framework？

而是：

> 哪些成熟產業已經解決過我們面對的結構性問題？

---

# 10. 外部標準研究

對涉及的現行標準做最新核實。

例如：

```text
NIST CSF
NIST SSDF
NIST AI RMF
OWASP ASVS
OWASP API Security
OWASP GenAI / LLM security guidance
ISO/IEC 27001
ISO/IEC 42001
ISO/IEC 25010
ISO 31000
TOGAF
relevant privacy / AI / cybersecurity law
```

每一項標記：

```text
MUST
SHOULD
OPTIONAL
FUTURE
NOT_APPLICABLE
```

不得因為存在某標準就全部塞進產品。

保存：

```text
source
version
publication/effective date
retrieval date
relevance
```

---

# 11. Claude / Codex 都必須提出至少三種 Foundry 架構方案

禁止只改善現有方案。

至少：

```text
Option A
Conservative / Simple

Option B
Balanced / Recommended Candidate

Option C
Advanced / High-Assurance
```

比較：

```text
Correctness
Business Value
Complexity
Security
Maintainability
Automation
Human Oversight
Operational Cost
AI Cost
Vendor Lock-in
Scalability
Auditability
Commercial Value
Migration
Rollback
5-year impact
10-year impact
30-year impact
```

---

# 12. 必須審查 Foundry 自己是否過度工程

專門找：

```text
過多文件
過多 Agent
過多 Review Gate
過多 Approval
過多 abstraction
過多 schema
過多 automation
過多 enterprise-first requirement
```

每一個元件問：

```text
Why does this exist?
What breaks without it?
Can it be introduced later?
What is its operational cost?
Does it reduce more risk than complexity it creates?
```

不能因為目標是高價，就故意讓架構變複雜。

高價必須來自：

```text
Decision Quality
Assurance
Risk Reduction
Execution Certainty
```

不是文件數量。

---

# 13. 同時審查是否低估重要能力

尤其檢查：

```text
Business Architecture
Enterprise Architecture
Architecture Economics
Technical Due Diligence
Assurance Case
Requirements Traceability
Legal / IP / License
Procurement Readiness
Vendor Concentration Risk
Data Quality
Transformation Architecture
Organizational Architecture
Decision Rights
Architecture Fitness Functions
Change Governance
Compatibility
Customer Migration
Decommissioning
Failure Injection
Knowledge Continuity
```

---

# 14. Falsification Round

Claude 與 Codex 各自完成設計後，交換結果。

現在開始：

```text
Claude attacks Codex
Codex attacks Claude
```

但不是修改對方文件。

各自建立：

```text
03_CROSS_FALSIFICATION/
CLAUDE_CHALLENGES_CODEX.md
CODEX_CHALLENGES_CLAUDE.md
```

每個 Challenge 必須包含：

```text
Claim:
Why it may be wrong:
Evidence:
Failure scenario:
Alternative explanation:
What would falsify my criticism:
Severity:
Recommended disposition:
```

---

# 15. Red Team Round

建立：

```text
04_RED_TEAM/
```

至少攻擊以下 Scenario：

```text
Foundry produces wrong architecture confidently
Both AI agents agree on wrong assumption
Industry research is stale
Legal requirement misclassified
Security standard is misapplied
Customer provides incomplete current-state information
Repository contains misleading documentation
AI hallucinates existing infrastructure
Agent modifies system before approval
Architecture becomes overengineered
Architecture becomes vendor-locked
Blueprint cannot actually be implemented
Blueprint is technically excellent but commercially unviable
Customer scales 100x
Customer becomes Group
M&A occurs
Vendor disappears
Key architect leaves
AI providers change completely
```

---

# 16. Benchmark / Prototype Gate

如果 Claude 和 Codex 爭議不能靠 evidence 解決：

不要辯論到最後硬選一個。

標記：

```text
NEEDS_PROTOTYPE
```

或：

```text
NEEDS_BENCHMARK
```

並產生：

```text
Question
Hypothesis
Prototype scope
Environment
Dataset/workload
Metrics
Pass threshold
Fail threshold
Cost
Expected decision impact
```

---

# 17. Convergence

完成 Independent Review + Cross-Falsification + Red Team 後建立：

```text
05_CONVERGENCE/
CONVERGENCE_MATRIX.md
```

每一項分類：

```text
CONSENSUS
MAJORITY
DISAGREEMENT
UNRESOLVED
NEEDS_EVIDENCE
NEEDS_PROTOTYPE
NEEDS_BENCHMARK
NEEDS_EXTERNAL_REVIEW
NEEDS_LEGAL_REVIEW
NEEDS_HUMAN_DECISION
```

重要：

```text
Claude agrees with Codex
!=
Fact
```

AI agreement 只能增加：

```text
Expert / Model Agreement
```

不能自動增加：

```text
Evidence Confidence
```

---

# 18. Independent Assurance

Design Recommendation 完成後，再做一次獨立 Assurance。

原則：

```text
DESIGN TEAM
!=
ASSURANCE TEAM
```

建立：

```text
06_ASSURANCE/
```

輸出：

```text
CLAIM_REGISTER.md
CLAIM_ARGUMENT_EVIDENCE.md
CONTROL_EVIDENCE_MATRIX.md
RESIDUAL_RISK.md
ASSURANCE_FINDINGS.md
```

對重要主張要求：

```text
CLAIM
→ ARGUMENT
→ EVIDENCE
```

例如：

```text
Claim:
Foundry prevents one AI from silently self-approving a material architecture.

Argument:
Independent analysis
+ cross review
+ human gate
+ assurance separation

Evidence:
contracts
workflow tests
agent isolation tests
approval logs
```

---

# 19. 最終輸出

最後建立：

```text
D:\Work\agency-os\docs\SYSTEM_FOUNDRY_RESEARCH\
07_FINAL_RECOMMENDATION\
```

至少包含：

```text
00_EXECUTIVE_REVIEW.md

01_V1_KEEP.md
02_V1_CHANGE.md
03_V1_REMOVE.md
04_V1_ADD.md
05_V1_DEFER.md

06_CLAUDE_VS_CODEX_FINDINGS.md
07_ARCHITECTURE_OPTIONS_MATRIX.md
08_CONVERGENCE_MATRIX.md

09_RISK_REGISTER.md
10_ASSUMPTION_REGISTER.md
11_CONTRADICTION_REGISTER.md

12_PROPOSED_SYSTEM_FOUNDRY_VNEXT.md
13_V1_TO_VNEXT_CHANGESET.md
14_IMPLEMENTATION_ORDER.md
15_MIGRATION_PLAN.md
16_ROLLBACK_PLAN.md

17_OPEN_HUMAN_DECISIONS.md
18_EXTERNAL_REVIEW_REQUIRED.md
19_ASSURANCE_SUMMARY.md
```

---

# 20. 每個 Change 使用固定格式

```text
ID:

Current V1:

Finding:

Evidence State:
VERIFIED / INFERRED / ASSUMED / UNKNOWN / DISPUTED

Problem:

Why it matters:

Risk if unchanged:

Claude position:

Codex position:

Counterarguments:

Option A:

Option B:

Option C:

Recommended:

Why:

Blast radius:

Migration impact:

Security impact:

Commercial impact:

5-year consequence:

10-year consequence:

30-year consequence:

Rollback:

Verification:

Expected result:

Confidence:

Requires human decision:
YES / NO
```

---

# 21. 禁止事項

第一輪研究期間禁止：

```text
大規模 Production 修改
Production deployment
Production DB destructive migration
刪除現有系統
偷偷修改 Source of Truth
因為 Claude/Codex 一致就自動批准
因為文件是 v1.0 就假設不能改
使用 workaround 取代 root-cause correction
```

---

# 22. 第一階段完成條件

只有以下條件完成後，才能建議實作 vNext：

```text
Claude Independent Review complete
Codex Independent Review complete
Cross-Falsification complete
Red Team complete
Complexity Audit complete
Convergence Matrix complete
Assurance review complete
Open human decisions identified
Migration strategy exists
Rollback strategy exists
```

沒有 Human Approval：

```text
DO NOT IMPLEMENT VNEXT
```

---

# 23. 最終成功標準

最終提出的 System Foundry vNext 必須比 v1：

```text
更準確
更簡潔
更安全
更可證明
更可商業化
更能處理 Enterprise / Group
更容易讓不同 AI 協作
更少模型依賴
更少供應商鎖定
更容易執行
更容易驗證
更容易 rollback
更容易由新團隊接手
```

但不能只是：

```text
更多 Agent
更多文件
更多 Framework
更多服務
更多流程
```

最終問題：

> 如果 2036、2046、2056 年 Claude、Codex、供應商、Cloud、Framework、團隊全部換掉，這套 Foundry 的 Constitution、Domain、Contracts、Evidence、Blueprint 與 Assurance 邏輯是否仍然能被理解、驗證、替換與持續演進？

如果答案仍然不是 YES：

```text
CONTINUE RESEARCH
```

第一階段只做研究與架構審查，不要直接開始重建 Foundry。
