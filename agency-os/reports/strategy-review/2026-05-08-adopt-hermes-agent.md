# Strategy Review: 要不要把 NousResearch Hermes Agent 採用／整合到 AwareWave AgencyOS？

- **Date**: 2026-05-08
- **Mode(s) run**: four-role-collaboration (Mode 1)
- **Recommendation (analytical)**: **proceed-with-modifications** (sandbox probe path only — no production touch)
- **Operator final decision (2026-05-08)**: **REJECTED — not adopting**. See §14.
- **Reversibility**: medium（probe 模式可撤；production adoption 則 hard）
- **Cost of being wrong**: 採用後失敗 ~ 拆既有 Phase 2a/2b production + 1–2 週工程消耗 + ops 多一個系統要學；不採用後悔 ~ miss 自我改進 agent infrastructure（市場有 LangGraph、smolagents 等替代）。**Note**: 此 cost 由 main agent 推論而非操作者明確 stated；skill 規範要求 `cost_of_being_wrong unstated → stop and ask`，本次為 demo 場景以推論值繼續，但 final adoption 決策前須由操作者確認量化。
- **Schema version**: 1

## 1. Question

要不要把 **NousResearch Hermes Agent**（Feb 2026 開源、v0.2.0、自我改進、自託管 autonomous AI agent）採用或整合到 AwareWave AgencyOS（既有 Always-On Command Plane Phase 2a+2b production）？

## 2. Framing

```yaml
goal: Q3 2026 前決定 (a) 替換 / (b) 補強 / (c) 試用 既有 Always-On Command Plane（已 Phase 2a+2b live）
constraints:
  - 不破壞既有 Always-On Command Plane Phase 1+2a+2b production（@awarewave_ops_bot Telegram bot）
  - 不破壞 Anthropic Claude 為主的 LLM 路由（CLAUDE.md 已定）
  - 30 年穩定/可審計（CLAUDE_EXECUTION_BLUEPRINT_30Y）
  - 不外洩私鑰/secrets（只能在自家 SG/EU VPS 跑）
obstacles:
  - Hermes 3 model 與既有 Anthropic stack 不同（多一個 inference provider）
  - 與既有 Telegram bot + Trigger.dev dispatcher 功能重疊
  - 「自我改進+學習」與既有 governance（rules + memory）的衝突風險
  - 0.2.0 早期版本，API/data shape 可能 breaking
prior_attempts: 無
relevant_adrs: 無直接（CLAUDE.md commit prefix / SG-EU 架構間接相關）
stakeholders: AgencyOS 核心 + tenant onboarding 流程 + 客戶（潛在 Hermes 暴露）
```

## 3. Convergence

≥3 roles 在以下 4 個結論性方向交集（雖各從不同 lens 切入，這正是 4-role 設計的高訊號區）：

- **Finding A — 自我改進與 30Y governance／SSOT 直接張力** _(roles: critical, systems, communication)_
  - critical 把它叫做「load-bearing assumption」（若假，整個整合崩塌）
  - systems 把它叫做「reinforcing feedback loop」（每個自動生成 skill 是 undocumented entry point；違反 30Y rules #2 mechanized checks + #6 deprecation discipline）
  - communication 把它叫做「misframing risk」（除非明示 "skill learning 不寫 agency-os/memory 或 .cursor/rules"，否則被讀成 governance bypass）

- **Finding B — Phase 2a/2b 才剛 production live，現在不是替換時機** _(roles: critical, systems, communication)_
  - critical 點出「novelty bias / shiny object syndrome」+ 引用 MEMORY.md `feedback_no_wasteful_work`
  - systems 模擬出「entry-point fragmentation」（雙 Telegram gateway → 6 月後 ops 不認得哪個 bot 哪個 command）
  - communication 模擬 operator 聽到的話：「又要拆掉剛上線的東西嗎?」

- **Finding C — 應該走 sandbox/probe 路徑，不是直接 a/b/c 三選一** _(roles: critical, creative, systems, communication)_  ★ 4 roles 全交集
  - critical: 投資 must_investigate 答完才該下結論（特別是「Phase 2a/2b 缺哪一個具體能力」的 gap list 闕如）
  - creative: weekend `hermes-lab.aware-wave.com` + 新 bot token，不碰 @awarewave_ops_bot
  - systems: 「smallest reversible trial — sandbox VPS, no Telegram binding, no memory write access」
  - communication: 「one-sentence thesis — sandboxed R&D probe, NOT replacement」

- **Finding D — 可能稀有的不是 agent runtime，而是 skill artifact schema** _(roles: creative; consistent with critical's "right problem" frame)_
  - creative 提出 reframe：Hermes 真正稀有的不是「自我改進 agent」而是「ChatML tool-call 91% accuracy 的 8B 本地模型」+「skill self-generation schema」
  - critical's "right problem" 框架同向：framing 預設「要不要採 Hermes」，但真正問題沒被名為「現有 Command Plane 缺什麼具體能力」

## 4. Divergence

| Finding | Disagreement | Domain owner | Resolution |
|---------|--------------|--------------|------------|
| 「整合形式」上 — extension（creative：treat as MCP server #N）vs sandbox-isolated probe（systems/communication：no Telegram, no memory write, parallel infra） | creative 偏 *integration*（用既有 stdio router 把 Hermes 當 MCP backend 接入），systems/communication 偏 *isolation*（先嚴格隔離 Telegram + memory + governance 邊界） | **systems**（owner of integration boundary risk）為主，**creative** 為 phase-2 fallback | **第一步**走 systems/communication 的 isolation probe；若 isolation probe 通過 must_investigate 答案，**第二步**才考慮 creative 的 MCP-extension 路線 |
| 「Hermes 帶來的真正價值」 — runtime（systems 預設 Hermes 整套）vs skill artifact schema only（creative） | creative 認為最有價值的副產品是「自動產生可重用 skill」的格式（schema 抽離可獨立用），systems 預設整套都是負擔 | **creative**（capability re-framing 是其專責） | must_investigate #1（skill artifact schema 是否可獨立於 runtime）為決定性問題；答案是 yes → 走 schema-only 路線（更輕）；no → 走完整 isolation probe |
| confidence 數值 — critical/creative 3 vs systems/communication 4 | critical/creative 對 Hermes 實技或 schema 抽離無一手證據；systems/communication 對「結構性風險與框架危險」較有把握 | 不需 reconcile — confidence 差異反映「對風險的把握」高於「對機會的把握」，這是健康的不對稱 | 推薦 tier 採用較保守端：proceed-with-modifications，要求 isolation 邊界可審計 |

## 5. Bias audit

4 roles 自我點名共 11 條 bias，去重 + 合併為 6 條，附 mitigation：

- **Status quo bias**（critical, systems, communication 三 roles 共同點名）→ Mitigation: 已被 4 roles 自覺，convergence Finding C「sandbox probe」恰是 status-quo-honoring 路線；但需操作者主動確認「現有 Command Plane 是否真的『夠用』」，而非預設保護它
- **Novelty bias / shiny object syndrome**（critical）→ Mitigation: must_investigate #4「Phase 2a/2b 缺哪一個具體能力」必須先答；沒有 gap list 就不能評估替換
- **Skepticism-as-default**（critical 自覺）+ **Governance tribalism**（systems 自覺）→ Mitigation: creative role 的 reframe（Postgres + pg_extension 類比、constraint-as-feature「Auditable Self-Improving Agent」moat）已對沖此偏差；synthesis 採納 reframe 為 Phase-2 fallback 而非否決
- **Anchoring on MEMORY.md**（critical）→ Mitigation: 引用 `feedback_no_wasteful_work` 是 *支援* 論述而非結論依據；本案的「沒做完不要追求 perfection」確實對應「Phase 2a/2b 才剛 ship、不該立即評估替換」
- **Analogy over-fit**（creative 自覺：Postgres extension 類比可能掩蓋實際 impedance mismatch）→ Mitigation: 已被 creative 自我標記，synthesis 不採該類比作為 hard 決策依據，僅作 phase-2 探索方向
- **Asymmetry illusion / Complexity aversion**（creative + systems）→ Mitigation: 不對稱選項與複雜性恐懼互為對沖；sandbox probe 設計恰好限制複雜性（VPS 隔離、新 bot token、no memory write）同時保留 asymmetric upside

## 6. Investigation queue

4 roles 共 16 條 must_investigate，去重後優先排序 7 條（按 stakes 高低）：

| # | Question | Why it matters | How to answer | Owner |
|---|----------|---------------|---------------|-------|
| 1 | Hermes Agent v0.2.0 自我改進模式是否可**完全關閉**，只當 dumb tool runner 用？ | 決定能否走 isolation probe 路徑；若不可關，整個 Convergence Finding C 失效 | 讀 github.com/nousresearch/hermes-agent README + config docs；issue tracker 搜「disable self-improvement」 | 操作者或代理 web research |
| 2 | Hermes skill artifact 的 on-disk schema 是否穩定且可獨立於 runtime 解讀？ | Decisive for Divergence #2（runtime vs schema-only 之爭） | clone repo + 檢視 skill 檔案結構（推測在 `~/.hermes/skills/` 或類似）；找官方 schema doc | 代理 web research + repo inspection |
| 3 | 現有 Command Plane Phase 2a+2b 究竟**缺哪一個具體能力**讓 tenant onboarding 受阻？ | 沒有 gap list 不應評估替換；critical's right-problem 框架要求此問先答 | 操作者列出最近 30 天 tenant onboarding 中需要 agent 做但 Command Plane 做不到的 3-5 個具體任務 | **操作者**（不可由代理推論） |
| 4 | NousResearch 過去 OSS repo 的 12-month 維護持續率（commits/issues/releases）？deprecation 政策？ | 30Y 穩定承諾下，採用半衰期 < 12 月的 OSS 是嚴重風險 | 看 NousResearch GitHub org 過去 5 個專案 12-month 後的 commit/release 頻率；找 0.x → 1.0 stability commitment | 代理 web research |
| 5 | Hermes runtime 能否作為 *subagent invoked by* 既有 Trigger.dev dispatcher（保留 single ingress），而非自己的 gateway？ | systems Finding 點出 entry-point fragmentation 是 30Y rule #1 違反；若可作 subagent 則消除此違反 | 讀 Hermes API docs：是否有 single-task invocation mode？是否需要 Telegram binding 才能用？ | 代理 web research |
| 6 | Hermes 8B 自託管最低硬體實測（不是 marketing 的 $5 VPS）？特別是繁中 + AwareWave domain task 的 tool-call accuracy？ | 91% 是 marketing 數字，benchmark dataset 不公開；實際 ops 任務跑得動才有意義 | sandbox probe 跑 2 週後 measure；或先找社群 benchmark | 代理（probe phase）或社群 |
| 7 | 客戶／tenant 端是否需要披露「Telegram bot 背後是哪個 agent」？引入 Hermes 是否創造新的 disclosure obligation？ | communication 點出潛在合規／信任面議題；30Y 客戶關係 > 短期能力擴增 | 與既有 tenant 合約核對 AI 揭露條款 | **操作者**（法遵層） |

## 7. Action triage

### 立即執行 (do now)

- [ ] **不要動既有 Phase 2a/2b production**。任何 Hermes 工作必須在 isolation 邊界外（不同 VPS / 不同 bot token / 不寫 agency-os/memory 或 .cursor/rules）
- [ ] **代理 web research**：完成 Investigation Queue #1（self-improvement 是否可關）+ #2（skill schema 穩定性）+ #4（NousResearch 維護半衰期）+ #5（單 task subagent 模式）

### 待決定 (deciding next)

- [ ] **操作者回答 Investigation Queue #3**：列出最近 30 天 tenant onboarding 中 Command Plane 做不到的 3-5 個具體任務（gap list）。沒有 gap list 不繼續
- [ ] **操作者回答 Investigation Queue #7**：客戶／tenant 端 AI 揭露義務盤點
- [ ] 若 #1+#2+#4+#5 web research 答案均正面（self-improvement 可關 + schema 可抽離 + 維護穩定 + 可作 subagent），且 #3 gap list 真有對應能力缺口 → **進入 Mode 2 (Red-Blue Debate) 壓力測試** 「sandbox probe」具體實作計畫；否則停在此處

### 觀望 (watch, do not act yet)

- [ ] NousResearch Hermes Agent 0.2.0 → 1.0 release（停在 0.2.0 直接採用是 30Y 紅線）
- [ ] LangGraph、smolagents、ServiceNow Hermes（同名不同物）等替代品 12-month 演進；保留比較基線
- [ ] Hermes 是否被任何 enterprise governance framework（如 NIST AI RMF）認可

## 8. Verdict

**Recommendation**: **proceed-with-modifications** — proceed *only* on the sandbox probe path (Convergence Finding C); reject straight production adoption (Convergence Finding A+B).

**Rationale**: 4 roles 從 4 個獨立角度（philosophical / structural / time-dynamic / audience）都收斂到「不該直接 a/b/c 三選一，應走 isolation probe」這個結論。關鍵不對稱：sandbox probe 失敗只浪費一個 weekend + 一個 VPS subdomain；production adoption 失敗則拆既有 Phase 2a/2b 的 production work + 1-2 週重做。**The dominant uncertainty**：Hermes 自我改進是否可完全關閉（Investigation #1）— 若不可關，連 isolation probe 都不該做。**The decisive consideration**：Phase 2a/2b 才剛 production（today, 2026-05-08）；novelty bias 與 status-quo 過度保護兩端共存，唯一健康路徑是透過 reversible probe 收集證據再決定。

**Required preconditions** (for sandbox probe path):
- [ ] Investigation Queue #1 答案 = yes（self-improvement 可完全關閉，或可導入 read-only memory mirror）
- [ ] Investigation Queue #4 答案 = NousResearch 過去 OSS repo 12-month 維護率 ≥ 70%
- [ ] Investigation Queue #3 答案 = 操作者列出 ≥ 3 個 Command Plane 做不到的具體任務作為 probe baseline
- [ ] Sandbox probe **絕不**使用 `@awarewave_ops_bot` token，必須新建 bot
- [ ] Sandbox probe **絕不**有對 `agency-os/memory/`、`.cursor/rules/`、`mcp/claude-userlevel/` 的寫入權
- [ ] Sandbox probe 跑在獨立子網域（建議 `hermes-lab.aware-wave.com`），與 production 服務 nginx 隔離

**Kill criteria** (if proceeding to probe):
- Abort if: 2 週內 baseline 任務 tool-call accuracy < 60% OR governance violation（誤寫 agency-os/memory 或 production secrets 出現在 Hermes 持久化儲存）≥ 1 次
- Review checkpoint at: 2 週後（建議 2026-05-22 evaluation review；若 probe 開始日延後則同步延）

## 9. CHANGE_IMPACT_MATRIX hits

If proceed (即使僅 sandbox probe path)：

- `agency-os/docs/CHANGE_IMPACT_MATRIX.md` 影響行：
  - Telegram bot ingress（新 bot vs 既有 @awarewave_ops_bot 並存）
  - Inference provider routing（Anthropic-primary 多了一個 NousResearch Hermes 3 self-hosted）
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` impact: **yes** — Hermes 若進入 MCP routing 必須在此 spec 顯式列出（即使是 sandbox 階段也應提前 placeholder）
- `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` 30-year stability rules touched:
  - Rule #1（Deterministic entry points）— sandbox 階段不違反，production adoption 階段可能違反
  - Rule #2（Mechanized checks over tribal knowledge）— Hermes self-improvement 必須有 mechanical gate（自動產生的 skill 不可繞過 register-new-governance-doc / WORKLOG evidence）
  - Rule #6（Deprecation discipline）— 0.2.0 採用必須有明示 1.0-or-deprecate window

## 10. ADR promotion

This decision should be promoted to a numbered ADR if **any** of the following are true:

- [ ] Touches manifest / shell SSOT — **不適用**（probe 階段不動）
- [ ] Touches identity / authentication boundary — **不適用**（新 bot token 與既有不衝突）
- [ ] Touches data system-of-record — **不適用**（probe 不寫 agency-os/memory）
- [x] Touches MCP tool routing — **適用 if probe 進入 MCP-extension 路線**（creative role 提出的 Phase-2 路線）
- [ ] Touches tenant isolation model — **不適用**（probe 階段不接 tenant）
- [ ] Reversibility: low AND cost-of-being-wrong: high — **不適用**（probe 是 medium reversibility）

**結論**：probe 階段**不需** ADR promotion；若 Investigation Queue 全綠並決定進入 MCP-extension 路線，則應 promote 為 ADR。建議 ADR title：`ADR-NNN: Hermes Agent as MCP-extension backend (parallel to Anthropic-primary routing)`，編號待 `agency-os/docs/architecture/decisions/ADR_INDEX.md` 下一個空號。

## 11. WORKLOG snippet

Copy-pasteable line for `agency-os/WORKLOG.md` at AO-CLOSE:

```
- AUTO_TASK_DONE: [strategy-review] 2026-05-08 adopt-hermes-agent → proceed-with-modifications (sandbox probe only) | record: agency-os/reports/strategy-review/2026-05-08-adopt-hermes-agent.md
```

## 12. References

- SKILL: `.claude/skills/strategy-review/SKILL.md`
- Mode used: `.claude/skills/strategy-review/modes/01-four-role-collaboration.md`
- Roles consulted: `roles/critical-thinker.md` / `creative-thinker.md` / `systems-thinker.md` / `communication-thinker.md`
- Related ADRs: 無直接（CLAUDE.md commit prefix / SG-EU 架構間接相關）
- Related WORKLOG entries: 2026-05-07 § Always-On Command Plane Phase 1 production live; 2026-05-08 § Phase 2a/2b deploy + Phase 2 hardening
- Source materials cited: 
  - Hermes Agent web research: hermes-agent.nousresearch.com, github.com/nousresearch/hermes-agent
  - User stack context: agency-os/AGENTS.md, CLAUDE.md, MEMORY.md (`feedback_no_wasteful_work`, `feedback_check_deploy_drift_first`), docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md, docs/operations/COMMAND_PLANE_RUNBOOK.md
  - Subagent IDs (this run): critical=acd20296f27573136, creative=ae88ebd16d3256ceb, systems=a00c2ed14bbb58791, communication=a82c9c09237276b45

## 13. DoD verification (skill demo run)

This was the inaugural strategy-review skill run. DoD per TASKS.md item:

| DoD | Result |
|-----|--------|
| 4 個 `general-purpose` subagent 並行返回 4 份結構化 finding/bias_check/must_investigate | ✅ |
| 產出 `agency-os/reports/strategy-review/2026-05-08-adopt-hermes-agent.md` | ✅ (this file) |
| `INDEX.md` 自動補一行 | ✅ (in same commit) |
| 確認 4 份報告**真的不同**（無 context contamination） | ✅ — 各 role 命中其專責角度（critical 找漏洞 / creative 給類比與 reframe / systems 跨 6/12/18/24 月時間軸 + 30Y rules / communication thesis 與 stakeholder hears-map）；convergence 點都從不同 lens 切入 |

**No mode-file revision needed** — 4-role separation works as designed.

## 14. Operator decision (final)

- **Date**: 2026-05-08
- **Decision**: **不採用 Hermes Agent**（不進 sandbox probe，不進 production adoption）
- **Rationale (operator)**: 此次 review 主要目的為**驗證 strategy-review skill 的 4-role 機制**（DoD 為「4 份報告真的不同、無 context contamination」）。Skill 機制驗證 PASS。對 Hermes 本身的採用提案不接受。
- **Implications**:
  - Investigation Queue（§6）**不執行** — 既然不採用，無需投入 web research / operator gap-list
  - Required preconditions（§8）**作廢**
  - Kill criteria（§8）**不適用**
  - CHANGE_IMPACT_MATRIX 影響行（§9）**不觸發**
  - 本檔案保留為**歷史紀錄**，未來如重新評估時提供完整 framing + 4-role 分析基線
- **Skill 補強動作（同日落地）**：依本次 demo 觀察到的可加強處，已直接套用：
  - Critical role：加 frame-first discipline style line（避免 `#rightproblem` 隱性觸發）
  - Systems role：加 §「governance red lines」special concern matrix（security / multi-tenant / auth-identity / data SoR / production destructive — 對應 CLAUDE.md High-STOP 紅線）
  - Communication role：加 §「legal / regulatory disclosure」special concern（GDPR Art 22/44+、EU AI Act Art 50、multi-tenant 法律 vs 技術隔離、messaging vendor DPA）
  - SKILL.md：加 §「Demo / training / non-decisive runs」明確化 demo 模式 cost_of_being_wrong assumption 路徑
- **Cross-ref**：操作者最終立場；INDEX.md 已更新；memory project entry `project_hermes_evaluation_declined.md` 已建立。

---

_Generated by `/strategy-review` skill, schema v1, 2026-05-08._
