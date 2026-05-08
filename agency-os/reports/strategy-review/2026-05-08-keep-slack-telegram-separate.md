# Strategy Review: 要不要把 Slack + Telegram 合併到一個就好？

- **Date**: 2026-05-08
- **Mode(s) run**: four-role-collaboration (Mode 1)
- **Recommendation**: **reject 合併** ＋ **proceed-with-modifications C+**（保留兩個並把角色分工契約化寫進 owner doc）
- **Reversibility**: high（隨時可加回移走的）
- **Cost of being wrong**: 違反 30Y 穩定原則的重工成本（vendor lock-in、escape hatch 消失、auth/identity 邊界錯置）
- **Schema version**: 1

## 1. Question

要不要把現行 **Slack（單向告警接收）** + **Telegram（@awarewave_ops_bot 雙向指令面板）** 兩個通道合併到一個就好？

三個 options：
- **A**：只留 Telegram（指令 + 改把 alert 也走 Telegram）
- **B**：只留 Slack（接 Slack slash command 取代 Telegram）
- **C**：都留（現狀，分工不重疊）

## 2. Framing

```yaml
question: 要不要把 Slack + Telegram 合併到一個就好？
goal: 降低 ops 維運面，不犧牲 phone-ops 即時性 / alert 可達性
constraints:
  - 30 年穩定（CLAUDE_EXECUTION_BLUEPRINT_30Y）
  - 不可 lock-in 到單一 vendor 而無 escape hatch
  - 必須可擴充（未來雇人/有 tenant）+ 可刪減（隨時能撤）
  - 不重工 / 不浪費空間 / 不衝突矛盾
obstacles:
  - 兩個 vendor 都是 SaaS，30 年內可能停服 / 大改 API
  - 解決方案要支援未來「多操作者」與「目前單操作者」兩個情境
reversibility: high
cost_of_being_wrong: 違反 30Y 穩定原則的重工成本（vendor lock-in / escape hatch 消失 / auth/identity 邊界錯置）
prior_attempts: 無
relevant_adrs: 無直接（CLAUDE.md High-STOP risk tier 對 auth/identity 邊界相關）
stakeholders: 唯一操作者（peijing）+ 未來潛在團隊／tenant
```

## 3. Convergence

4 個 role **完全一致** reject 合併。這是高訊號——不同 lens 各自找到不同理由抵達同一結論：

- **Finding A — 合併假設「降低維運面」未量化** _(roles: critical, systems, communication)_
  - critical: 現狀 $0 marginal cost、雙通路就位、運作中——若維運成本本來接近零，合併等於解一個不存在的問題（`#rightproblem`）
  - systems: 保留兩個的真實成本是「兩個 webhook URL + 兩個 bot token」≈ 一年改一次
  - communication: 「兩個＞一個 = 複雜」是 simplicity bias 錯覺，真複雜在角色不清

- **Finding B — 雙通路本身就是 vendor 失效時的 escape hatch**（紅線級對齊 30Y constraint）_(roles: critical, systems)_
  - critical: framing 自陳 obstacle 包含「30 年內 vendor 可能停服」；A／B 主動消除冗餘 = 內部矛盾
  - systems: Telegram bot 是**主權通道**（你擁有 token，無第三方訂閱風險）；放棄等於把 always-on command plane 的存活性外包給 Salesforce 商業決策

- **Finding C — Alert（單向 push）與 Command（雙向 IO）是不同 modality，本來就該分頻** _(roles: creative, systems, communication)_
  - creative: 跨領域類比——航空駕駛艙 annunciator panel vs MCP/FMS、Bloomberg squawk box vs hotkey、Unix 哲學工具各做一件事
  - systems: 6-18 月會啟動「告警疲勞 → 靜音 → 漏接」reinforcing loop；alert 噪音湧入指令面板會反向訓練忽略指令通知
  - communication: 一句話 thesis「Telegram 是手機指令台、Slack 是告警面板」就夠了

- **Finding D — 合併會違反多個 30Y 規則 + 開新攻擊面** _(roles: systems, communication, critical)_
  - systems: 選 A 違反 30Y rules #3 narrow interfaces + #5 low-friction extensibility（每個告警源變客製整合）；選 B 違反 #1 deterministic entry points（Slack workspace 計費／policy 風險）
  - communication: Slack 升級成雙向 = 在 auth/identity 邊界開新攻擊面（CLAUDE.md High-STOP tier governance red line）；GDPR Art 28 processor agreement 觸發點（未來若客戶資料流入 Telegram 即踩雷）
  - critical: framing 把 alert 與 command 當可互換通路——這個前提本身未證

- **Finding E — 真正可做的小修是「角色契約化」（不是合併）** _(roles: creative, communication)_ ★ Action item
  - creative: 提出 **C+ asymmetric option** — 保留兩個但明確契約化分工寫進 ALWAYS_ON_COMMAND_PLANE.md：Slack=read-only firehose、Telegram=write-path control plane
  - communication: 主導敘事「command channel + alert channel」（命名即定位）；先發制人擋掉「合併＝簡化」的誤框

## 4. Divergence

幾乎沒有衝突——4 個 role 收斂度極高。唯一差異是「該不該做 30 天鏡射實驗」：

| Finding | Disagreement | Domain owner | Resolution |
|---------|--------------|--------------|------------|
| Creative 提 30 天 mirror experiment（把 Slack alert 同步到 Telegram 30 天觀測 first-seen latency）vs Critical/Systems 認為「過去 12 月若沒漏接則 C 已驗證、不必新實驗」 | 是否需要主動 falsification | **critical**（cost-benefit 主場） | 採 critical 觀點：先答 must_investigate #1（過去 12 月有沒有單通路漏接事件）；若答案是「沒漏」→ 不必做 30 天實驗（資料已證）；若答案是「曾漏」→ 才做 mirror experiment |

## 5. Bias audit

4 roles 自我點名共 11 條 bias，去重併入 6 條：

- **Simplicity bias / Marie Kondo fallacy**（4 roles 共同點名）→ Mitigation：以「角色分離（modality separation）」概念取代「工具數量最少」概念；narrative 鎖在 ALWAYS_ON_COMMAND_PLANE.md
- **Solo-operator myopia**（creative + communication）→ Mitigation：決策必須經得起「未來 12 月可能加第 2 位 operator 或 tenant-facing alert」這個假設；分頻架構在 scale-out 時零重工（這正是 C+ 勝出原因）
- **Status quo bias**（critical 自覺）→ Mitigation：本案 cost_of_being_wrong 對稱性確認——合併錯（重工＋escape hatch 失）＞保留錯（極小，幾乎為零），偏向 C 有 asymmetric payoff 的客觀理由，不是惰性
- **Recency bias / Phase 2c overweight**（systems）→ Mitigation：Slack 的 alert 角色比 Telegram bot 更老更穩定；不該因 Phase 2c 剛 ship 就誇大 Telegram 中心性
- **Sunk cost**（communication）→ Mitigation：保留 C 的理由不是「捨不得已建好」，是「兩個 channel 各自承擔 modality 對應」
- **Maintenance theater**（creative + critical）→ Mitigation：把「兩個 channel」誤認為維運負擔；實際 marginal cost 已是 $0（webhook + bot token 一年改一次）

## 6. Investigation queue

4 roles 共 13 條 must_investigate，去重後優先排序 6 條：

| # | Question | Why it matters | How to answer | Owner |
|---|----------|---------------|---------------|-------|
| 1 | 過去 12 月（或可考的最遠歷史）有沒有任何一次 Slack 或 Telegram **單通路** delivery 失敗／漏接的真實事件？ | 決定是否需要 mirror experiment；若沒漏接，C 已被歷史驗證 | 翻 Slack channel 與 Telegram bot 紀錄、PagerDuty escalation 記錄、Sentry alert delivery 紀錄 | **操作者**（記憶或可考） |
| 2 | 過去 30 天 Slack alert 去重後事件數？ | 量化 alert 噪音；若 > 100/月，合併引爆指令通路、若 < 20/月 B 仍不可行（小量沒理由換通路） | 翻 Slack `#ops` channel 訊息計數 + 去重 | 代理（讀 Slack history） |
| 3 | Telegram bot 在離線／弱網時推播延遲 vs Slack mobile push 實測差距？ | 決定 phone-ops 即時性 claim 是否成立 | 用 alarm app 模擬「離線→開網路→收推播」延遲 5 次取中位數 | 操作者（手動測） |
| 4 | `command_requests.source = 'slack'` 是否已有實作驗證？ | 選 B 等於押注未實作的整合路徑 | grep `lib/command-plane/` 看是否有 slack ingress handler；若無，B 需先寫 Slack webhook receiver 才能評估 | 代理 grep |
| 5 | 若未來引入 client-facing ops 對話（tenant 看得到），Telegram 是否需要切第二個 bot 隔離以避免 GDPR Art 28 / EU AI Act Art 50 揭露義務觸發？ | 預先擋住 ops 對話與 client 對話混用的法遵踩雷 | 看 `docs/international/global-compliance-baseline.md` + Telegram 是否在歐盟有 DPA | 操作者（法遵層）+ 代理 web research |
| 6 | PagerDuty / Sentry / Uptime Kuma / Netdata 是否有 Telegram-native 整合（非 webhook hack）？ | 影響 A 案重工量——若都需 webhook → bot relay，違反 30Y rule #3 | 代理 web research 各 vendor docs | 代理 |

## 7. Action triage

### 立即執行 (do now)

- [ ] **拒絕合併（A 與 B 都不採）**——保留 Slack + Telegram 雙通路。本場 review 即決議。
- [ ] **角色契約化**：在 `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md` 加一段「Channel separation contract」明文寫：
  - **Slack** = read-only alert sink（PagerDuty / Sentry / Uptime Kuma / Netdata / Grafana / drift cron）
  - **Telegram** = write-path control plane（@awarewave_ops_bot；指令與簽核回應）
  - **禁止**將 ops 對話內容（含可能的 client PII）流入 Telegram；若未來有 tenant-facing ops，必須切第二個 bot 隔離
  - 命名鎖定：對外正式說法用「command channel + alert channel」而非「兩套系統」

### 待決定 (deciding next)

- [ ] **答 Investigation Queue #1**：過去歷史有沒有單通路漏接事件？答完才能確認 C 已被驗證或需做 30 天 mirror experiment
- [ ] **答 Investigation Queue #4**：`command_requests.source = 'slack'` 是否已實作？若無，記錄為 future work（schema 預留但無 ingress——這是設計，不是 bug）
- [ ] 未來若引入第 2 位 operator → 重新 review（Slack threading 對 multi-operator 友善度提升才考慮微調分工）

### 觀望 (watch, do not act yet)

- [ ] Slack 商業條款大改（如把 message 保留期限縮短到 < 30 天）→ 重評是否需要把 alert audit 路徑搬出 Slack
- [ ] Telegram 在地緣政治下被迫停服或政策性鎖定 bot → 啟動 fallback（Signal / Discord / 自家 PWA）
- [ ] 觀察 12 月內 alert 量／指令量比率變化，量化「modality separation 是否仍合理」

## 8. Verdict

**Recommendation**: **reject 合併（A 與 B 都不採）+ proceed-with-modifications C+（保留兩個並角色契約化）**

**Rationale**: 4 個獨立 lens（critical / creative / systems / communication）**完全一致** reject 合併，且每個 role 都從不同角度證明 C+ 是 dominant strategy：
- (critical) 合併解的是不存在的問題——$0 marginal cost 下找不出 ROI
- (creative) Alert 與 Command 是不同 modality，分頻是 feature 不是 bug（航空艙 / Bloomberg / Unix 哲學三個跨域類比一致）
- (systems) 6-18 月內合併會啟動 alert fatigue reinforcing loop，違反 30Y rules #1/#3/#5；單通路在 vendor 失效時無 escape hatch
- (communication) 「兩個工具 = 兩個角色」narrative 一句話可記住；命名鎖定即可阻止未來「為什麼當初沒合併」的舊話重提

**The dominant uncertainty**: Investigation Queue #1（歷史是否有單通路漏接事件）。若答案是「沒有漏接」，C+ 完全充足；若答案是「曾漏 X 次」，需要做 30 天 mirror experiment 補課。

**The decisive consideration**: cost_of_being_wrong 強烈不對稱——合併錯（重工 + escape hatch 失 + auth 邊界錯置）遠 > 保留錯（一年改兩個 token 的低度負擔）。30Y constraint 下 C+ 是唯一不違反任何 rule 的 path。

**Required preconditions（C+ 的小修）**:
- [ ] 在 `ALWAYS_ON_COMMAND_PLANE.md` 加一段 §「Channel separation contract」明文角色分工（10 分鐘內完成；本決議書 §7 已列具體文字）
- [ ] 若操作者回憶或紀錄顯示「曾發生過單通路漏接」→ 觸發 30 天 mirror experiment（否則跳過）

## 9. CHANGE_IMPACT_MATRIX hits

If proceed (C+):

- `agency-os/docs/CHANGE_IMPACT_MATRIX.md` 影響行：低——僅 ALWAYS_ON_COMMAND_PLANE.md 加一段，不破壞既有 cross-ref
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` impact: **no**（兩通路屬 IDE 對話 / ops alert 範疇，非 Lobster orchestration）
- `agency-os/docs/operations/CLAUDE_EXECUTION_BLUEPRINT_30Y.md` 30-year stability rules touched: 無——C+ 是讓現狀**對齊** 30Y rules 而非更動，特別是 #1（deterministic entry）、#3（narrow interfaces）、#5（low-friction extensibility）三條因 C+ 而被加強
- `agency-os/docs/international/global-compliance-baseline.md`：未來若引入 tenant-facing ops，Telegram 用法要重評 GDPR Art 28 / EU AI Act Art 50（已列 Investigation Queue #5）

## 10. ADR promotion

This decision should be promoted to a numbered ADR if any of the following are true:

- [ ] Touches manifest / shell SSOT — **不適用**（不動 manifest）
- [ ] Touches identity / authentication boundary — **適用 if 未來合併 Slack 升雙向**（本決議明示拒絕該方向，所以**不適用本決議**）
- [ ] Touches data system-of-record — **不適用**
- [ ] Touches MCP tool routing — **不適用**
- [ ] Touches tenant isolation model — **適用 if 未來開放 ops 對話給 tenant**（已列 Investigation #5）
- [ ] Reversibility: low AND cost-of-being-wrong: high — **不適用**（reversibility=high）

**結論**：本決議**不需** ADR promotion——角色契約化是 owner doc 段落補充，不是架構決策。若未來 Investigation #5 答案觸發「Telegram 切第二個 bot 隔離 tenant」，**那個**決定才需 ADR（建議 title：`ADR-NNN: Tenant-facing ops channel isolation policy`）。

## 11. WORKLOG snippet

```
- AUTO_TASK_DONE: [strategy-review] 2026-05-08 keep-slack-telegram-separate → reject 合併 + C+（保留兩個 + 角色契約化）| record: agency-os/reports/strategy-review/2026-05-08-keep-slack-telegram-separate.md
```

## 12. References

- SKILL: `.claude/skills/strategy-review/SKILL.md`
- Mode used: `.claude/skills/strategy-review/modes/01-four-role-collaboration.md`
- Roles consulted: critical / creative / systems / communication（含本日新加的 systems red lines 與 communication legal/regulatory 兩個 special concerns）
- Subagent IDs: critical=a2af978b2122f7837, creative=acea86d6bdde86fdc, systems=a9733a9eb9ebdc1e8, communication=a67a9882f4356fbf0
- Related WORKLOG entries: 2026-05-07 § Always-On Command Plane Phase 1 production live; 2026-05-08 § Phase 2c ops console approval UI
- Source materials cited:
  - Owner doc: `agency-os/docs/operations/ALWAYS_ON_COMMAND_PLANE.md`
  - CLAUDE.md §Risk-Tiered Confirmation
  - CLAUDE_EXECUTION_BLUEPRINT_30Y.md 6 stability rules
  - 0025_always_on_command_plane.sql migration（command_requests.source 7 個值）

---

_Generated by `/strategy-review` skill, schema v1, 2026-05-08._
