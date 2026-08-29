# DEVOPS_SRE_PLAN
Status: PROPOSED
Date: 2026-08-29
Scoped Authority: 本文件不修改 Master Plan (MP) / Method Atlas (Atlas) / Execution Contract (EC) 任一份母文件。若獲操作者批准，依 Program Plan §6「母文件修改協議」逐條折回 MP/EC/Atlas 或落地為獨立 runbook。與母文件衝突時，母文件現況優先，本文件標記 `CONFLICT_REQUIRES_HUMAN_REVIEW`。

---

## 0. 讀法與非目標

- 本文件只回答「怎麼做」，不重複 Phase 1 已完整記錄的「哪裡缺」。
- 所有新 schema 欄位以**擴充**既有結構為原則，不引入平行的第二套詞彙表——正是 ADR-004 抓到的反面教材（`risk_tier` 與 epistemic label 曾被四套版本各自定義）。
- 硬體規格類數字（§6）標記為 `AI_SUGGESTION`——基於現有開源模型部署常識推算，非實測值，**發布前必須經 Phase 5 MVP 真機測試校準**。
- SLA 數字（§2）屬對外可能構成契約承諾的內容，一旦要外部生效即落入 EC §8 R3——需 Threat Review + Human Approval。

---

## 1. Incident Management & On-call

**Closes**: P1-GAP-INFRA-1（`high`）
**證據**：EC §55 Incident Mode（L1912-1948）定義完整生命週期 state machine，但無嚴重度分級、無 Declare 授權定義；全庫 grep on-call/pager/SEVx/war room 皆 0 命中。

### 1.1 嚴重度分級（新軸線，不與 risk_tier 合併）

`risk_tier`（EC §8, R0-R4）描述的是**計畫中變更**的風險；SEV 描述的是**正在發生的事件**的衝擊。兩者關聯但不可合併成同一 enum——這正是 ADR-004 警告過的坑。SEV 的初始值由觸發它的變更/能力的 `risk_tier` 提示，但可依實際 blast radius 上修，兩者是「提示關係」不是「同一欄位」。

| SEV | 定義 | 典型觸發條件 | 對應 risk_tier 起始提示 |
|---|---|---|---|
| **SEV1 — Critical** | 全域服務中斷；資料正在遺失中；主權/居住地違規**已發生**；安全事件有 active exfiltration；R4 資產遭破壞 | AI Gateway 全 Provider 皆 Open（見 §4）；Sovereign Cell Local KMS 不可用 | R3/R4 |
| **SEV2 — High** | 單一 Capability cluster 或單一 Edition 大範圍降級；Legal Pack 過期造成高風險 workflow 被 BLOCK；備援 restore drill 在演練窗口外失敗 | 單 Provider circuit breaker Open 超過 5 分鐘；Queue Lag SLO 連續違約 | R2/R3 |
| **SEV3 — Low** | 單一 Capability 有 workaround；非客戶可見內部工具故障；SLA 指標輕微偏移但未觸及契約門檻 | 單一 Challenger 評估失敗 | R0/R1/R2 |

### 1.2 Declare 授權

```text
Declare 可由以下任一觸發：
  (a) 自動監控（error-budget burn / circuit breaker 狀態 / Queue Lag SLO 違約）→ 自動宣告，最低 SEV3
  (b) 任一工程師/操作者 → 可宣告任何 SEV
  (c) AI Agent（依 EC §72 Agent Evaluation）→ 可自動宣告至 SEV2，
      SEV1 對 Enterprise/Sovereign 租戶的客戶可見宣告需人類於 15 分鐘內確認
```

### 1.3 單一操作者情境下的升級路徑

```text
Tier 0 — Automated Containment（0 min）：系統執行 pre-approved playbook，標 owner=system/expiry/follow-up
Tier 1 — Primary Responder Page（SEV1: 立即 / SEV2: 15 min / SEV3: next business hour）：雙通道並發通知，要求 Ack
Tier 2 — Escalation（Tier 1 逾 Ack 時限未回應）：SEV1 +10 min 未 Ack → 升級至次要聯絡人
  （單一操作者現況下，真人 backup 是 Sales 對 Enterprise SLA 承諾前必須先解決的組織缺口，非工程能獨力補的）
Tier 3 — Executive/Customer Bridge（SEV1 逾 60 min 未 Contain）：自動開 status page + 通知 Customer Success；
  觸發 EC §120 Human Specialist Escalation，AI 必須輸出「exact question + evidence bundle + uncertainty」
```

### 1.4 Incident Record Schema

```yaml
incident:
  incident_id: INC-2031
  declared_by: monitor|human|ai_agent
  declared_at: <UTC ISO8601>
  severity: SEV1|SEV2|SEV3
  risk_tier_hint: R0|R1|R2|R3|R4
  affected_capability: [...]
  affected_deployment_mode: cloud|local|hybrid
  affected_jurisdiction: [...]
  ack_by / ack_at / contained_at / resolved_at: ...
  postmortem_ref: ...
```

---

## 2. SLA Targets by Edition

**Closes**: P1-GAP-INFRA-2（`medium`）
**證據**：MP §6.3（L525-574）把 SLA 列為 Enterprise/Sovereign 販售項目，唯一數字化的 RTO/RPO（MP §74）明文標示為「範例」。

### 2.1 Edition 對照

| Edition | Availability（月） | SLA 具契約效力？ | AI Gateway p95 延遲預算 | Support 首次回應 | Incident 通知時限 |
|---|---|---|---|---|---|
| Community/Free | Best-effort，僅公開 status page | 否 | 無承諾 | 社群論壇，無 SLA | 無 |
| Personal Pro | 99.0%（資訊性） | 否 | 5s | 2 工作天 | 無 |
| Professional | 99.5% | 選配付費 add-on | 3s | 1 工作天 | SEV1/2：1h 內更新 status page |
| Local Pro | 不適用（自架） | 否 | 不適用 | **安全性 SLA 取代 uptime SLA**：Critical CVE 揭露後 14 天內修補+簽章 release | 不適用 |
| Enterprise/Sovereign | 99.9%（合約可談至 99.95%） | 是，財務性 credit | 2s p95 / 4s p99 | SEV1: 1h(24/7)／SEV2: 4h／SEV3: 下工作天 | SEV1: 15 分鐘內（合約義務） |

**業界依據**：99.9%（≈43 分鐘/月停機）是主流 SaaS 中高階方案常見基線；99.5% 常見於中階服務；99.95%/99.99% 通常只用於雲端基礎設施層本身，本表刻意不把 Enterprise/Sovereign 標到 99.99%，避免對 Phase 0-2 架構做不可信的承諾。

### 2.2 RPO/RTO 分層

| 資料層 | RPO | RTO | 適用 Edition |
|---|---|---|---|
| Core metadata | 5 min | 2h | Enterprise/Sovereign（沿用 MP §74 範例） |
| Artifacts | 24h | 4h | Enterprise/Sovereign |
| Core metadata | 24h | 24h | Professional |
| Artifacts | 7 days | best-effort | Personal Pro |
| — | 客戶自管，僅提供 drill runbook | — | Local Pro |

### 2.3 交付機制

依 MP §146 Contract & DPA Engine 透過 MSA/DPA/Security Addendum 附掛；上線後回填 MP §73 既有 Observability「SLA」指標。

---

## 3. Backup & DR Hardening

**Closes**: P1-GAP-INFRA-3（`medium`）+ P1-GAP-INFRA-4（`medium`）
**證據**：EC §105 Backups/Restore「有 backup 不等於能 restore」但無演練週期；全文無 WORM/immutable backup/anti-ransomware 要求。

### 3.1 演練週期

| 層級 | 演練類型 | 週期 | 理由 |
|---|---|---|---|
| Core metadata / control plane | Full restore drill（Atlas §12.40 六步法） | **每季** | 高價值攻擊目標；季度成本可負擔，早於年度標準 |
| 全區域 DR failover | 完整跨區 failover 演練 | **每半年** | 侵擾性/成本高於單純 restore，加嚴於業界年度底線因需維持跨境不違規把握度 |
| Sovereign / Air-gapped Cell | 隔離環境 restore drill | 每季 | 主權部署通常受合約稽核，季度頻率降低發現「有備份不能還原」的風險 |
| Local Pro（客戶自管） | Vendor 僅提供 drill runbook + checklist | 建議每季，非強制 | 客戶自管基礎設施 |

每次演練產出遵循 Atlas §12.40 第 6 步「產 Evidence」，格式套用 EC §65 Content-addressed Evidence（`hash + source + timestamp + producer`）。

### 3.2 Immutable Backup / WORM 設計

```text
Object Storage Backend 必須支援 Object Lock / WORM：
  AWS S3 Object Lock（Compliance mode）/ Azure Immutable Blob Storage / GCS Bucket Lock / MinIO WORM

最小 immutability window：35 天（涵蓋完整月結週期 + buffer；AI_SUGGESTION，非精算值）

Core metadata 備份 → Compliance mode（連 root/admin 帳號都不能提前刪除）
  理由：對應 P1-RISK-SEC-1（釣魚劫持 session 核准 R4 操作）——若同一帳號也能刪備份，WORM 形同虛設
```

### 3.3 備份金鑰隔離

備份加密金鑰使用獨立 KMS realm，**不與** ADR-002 crypto-shredding 的 per-subject DEK 服務共用同一個 Key Vault——避免單點故障同時摧毀「資料本身」與「救援資料的備份」。

---

## 4. AI Gateway Resilience（Circuit Breaker）

**Closes**: P1-GAP-INFRA-5（`high`）
**證據**：EC §42 與 MP §144/§151 已定義 fallback 必須留在 Eligible Provider Set / 合法轄區內，但無 health check 頻率、失敗率門檻、auto vs 人工判定。

### 4.1 狀態機

```text
Health Check：主動探測每 15s 一次；被動監控 60 秒滑動視窗

Trip 條件（Closed → Open）：視窗內樣本數 ≥ 20 且 (錯誤率 > 20% 或 p95 延遲 > 3x rolling baseline)

Open 冷卻：30s → Half-Open
Half-Open 探測：放行 5 個 canary request，≥80% 成功且延遲達標 → Close，否則重新 Open，退避 30→60→120→300s
```

### 4.2 Auto vs 人工 Failover 判定

```text
IF Champion Provider Open:
  IF 存在同一 Eligible Provider Set 內的 Challenger/備援 → 自動 failover（已通過 Jurisdiction/Residency/合約檢查）
  ELSE:
    R3+/high-risk Capability → BLOCK + 告警
    R0-R2/low-risk Capability → 排入 queue + 退避重試

升級為 Incident：單一 Provider Open 超過 5 分鐘 → 自動宣告 SEV2；
  Eligible Set 內「所有」Provider 同時 Open → 自動宣告 SEV1
```

**設計原則**：circuit breaker 絕不允許「為了可用性」跳出 Eligible Provider Set——直接接上 MP §151「Fallback only within Eligible Provider Set」，避免斷路器變成繞過主權約束的後門。

---

## 5. Model Registry

**Closes**: P1-GAP-INFRA-6（`medium`）
**證據**：`model_profile` 字串在 EC §64、MP §69、Atlas 三處都是自由文字，無 backing 元件。

`model_profile:` 欄位保持不變，只給它一張表：

```yaml
model_registry_entry:
  model_profile_id: reasoning-high-v3
  provider: anthropic|openai|google|azure|self-hosted|byo-endpoint
  model_identifier: <upstream 精確 model id/version>
  endpoint: {type: cloud_api|private_endpoint|local_runtime, uri: artifact://..., region: [...]}
  weights_hash: sha256:...       # 僅 local/self-hosted
  license_ref: ...
  capability_tags: [...]
  cost_profile: {input_per_1k: ..., output_per_1k: ...}
  eval_scorecard_ref: ...        # 連到 MP §70 五套資料集結果
  champion_status: champion|challenger|shadow|retired
  security_review_ref: ...
  deprecation: {announced_at: ..., sunset_at: ..., replacement_model_profile_id: ...}
  crypto_policy: {algorithm_id: ..., key_version: ...}
  registered_at / registered_by: ...
```

Champion/Challenger/Shadow 狀態不是新發明——Model Registry 只是讓 EC §37 與 MP §71 已定義的生命週期第一次有具體 system-of-record 落地。

---

## 6. Local Deployment Hardware Baseline

**Closes**: P1-GAP-INFRA-7（`high`）

> **Epistemic label: `AI_SUGGESTION`**。基於現有開源模型常見部署經驗估算，**非實測值，Phase 5 MVP 前不得對外發布為官方規格**。

| 功能 | 最低可用 | 建議 | 備註 |
|---|---|---|---|
| Local LLM 推論（7-8B, Q4） | 6GB VRAM / 16GB RAM | 8-12GB VRAM / 32GB RAM | fp16 未量化需 16GB VRAM |
| Local LLM 推論（13-14B, Q4） | 10-12GB VRAM | 16GB VRAM | — |
| Local LLM 推論（30-34B, Q4） | 20-24GB VRAM | 24GB+ VRAM | 消費級高階顯卡量級 |
| Local LLM 推論（70B, Q4） | 40-48GB VRAM 或 CPU+64GB+ RAM offload | 48GB+ VRAM | 定位為 Professional/Enterprise 而非 Local Pro 入門檔 |
| Embedding（BGE/E5 量級） | CPU 可行，<2GB | 2-4GB VRAM 加速 | 成本最低 |
| RAG 向量索引 | 1M chunks ≈ 6-9GB RAM | 依比例外推 | 經驗法則：RAM ≈ 1.5-3x 原始向量位元組數 |
| Local ML/微調（LoRA 7-8B） | 24GB VRAM | 24GB+ VRAM | 完整 fine-tune 導回 Professional/Cloud |

**底線硬體**：16GB 系統 RAM、AVX2 CPU、NVMe SSD。無獨立 GPU 時僅建議 Embedding + 小型 RAG。

---

## 7. Air-gapped Model Update Security

**Closes**: P1-GAP-INFRA-8（`high`）

### 7.1 直接複用既有模式

MP §127 Signed Offline Law Packs 已定義完整模式，本節直接套用到 model 更新：

```text
model-pack-<model_profile_id>-v<version>.bundle
包含：Model weights（或增量 delta）/ Model card / Eval scorecard（MP §70 五套結果）/
      weights_hash（per-file sha256）/ Signature / Provenance manifest / effective_from
```

### 7.2 驗證流程

```text
Fetch（離線傳輸媒介） → Signature/Hash 驗證 → 安裝至隔離 model cache →
Shadow 執行（既有生命週期） → 本地 Eval scorecard 重放 → Canary → Activate
```

### 7.3 信任根與金鑰輪替

Publisher 簽章公鑰於 build time 內嵌。輪替屬 EC §8 R4，需完整 rehearsal + Human Approval，且需**雙簽章重疊期**：新舊 root 公鑰同時有效一段過渡窗口，避免離線客戶端死鎖。

---

## 8. Capability × Deployment Matrix

**Closes**: P1-GAP-INFRA-10（`high`）
**證據**：MP §143 只涵蓋法律轄區，未涵蓋部署模式可用性。

拆成兩條正交軸（比照 ADR-004 拆解 risk_tier/epistemic label 的手法）：

```yaml
capability_availability:
  capability: biometric_identification
  jurisdiction: EU
  legal_status: allowed|restricted|human_review|government_only|prohibited|unknown
  deployment_mode: cloud|local|hybrid
  deployment_availability: ga|beta|unsupported|roadmap
```

`effective_status = worst_of(legal_status, deployment_availability)`

---

## 9. Auto-scaling Strategy

**Closes**: P1-GAP-INFRA-11（`medium`）

```text
Scale-out：Queue Lag p95（3 分鐘滾動）> SLA 延遲預算 → +25% replica，冷卻 2 分鐘
Scale-in：Queue Lag < 20% 目標值 AND queue depth < replica_count，持續 10 分鐘 → -1 replica，冷卻 10 分鐘
Hard ceiling：Cost Governance 預算天花板觸頂 → 停止擴容 + 告警，不可靜默超支
```

六種 Worker 類型各自獨立擴縮（不共用單一 autoscaler），因負載/延遲特性差異極大。擴容僅能在 Eligible Provider Set / Sovereign Cell 邊界內進行，不可繞過主權約束。

---

## 10. Network Security Baseline

**Closes**: P1-GAP-INFRA-12（`high`）

```text
TLS：最低 1.2，預設/目標 1.3；禁用 1.0/1.1 與弱 cipher；憑證自動輪替

強制 mTLS：AI Gateway ↔ 內部 model-serving/local-runtime worker；
           Sovereign Regional Cell ↔ Global Control Metadata plane；
           任何處理 Restricted 分級資料的服務間呼叫

VPN/Private Link：Enterprise/Sovereign 客戶可加購專線；跨 Cell 複寫建議走專用加密骨幹

金鑰居住地：Sovereign Cell 的 TLS 終止/mTLS CA 私鑰必須存放在該 Cell 自己的 Local KMS，
  不可用居住地外的金鑰終止該 Cell 的客戶流量
```

---

## 11. Cost Governance for Shadow Execution

**Closes**: P1-RISK-INFRA-1（`cost explosion`）

### 11.1 兩層對策

**(a) 治本：分級 Eval 深度**——`smoke`（僅 Golden Dataset，每次迭代跑）vs `full`（五套全跑，只在 Promote 決策前跑一次），壓低隨 Capability 數量線性放大的係數。

**(b) 治標：per-Capability 專屬預算欄位**

```yaml
shadow_eval_budget:
  capability_id: ...
  budget_class: shadow_eval
  monthly_cap_usd: ...
  eval_dataset_cost_multiplier: 5
  per_change_hard_cap_usd: ...
  breach_action: block_new_challenger_runs|alert_only
  owner / reviewed_at: ...
```

按 Capability 而非全域記帳，避免早期 Capability 吃光額度或晚期 Capability 悄悄超支查不出是誰。啟用一組新 Challenger pair 視為需要先有 `shadow_eval_budget` 物件且已指定 owner 的變更（EC §8 R1/R2 等級）。

---

## Appendix A — Gap/Risk → Solution Traceability

| ID | Severity | 章節 | 關鍵設計 |
|---|---|---|---|
| P1-GAP-INFRA-1 | high | §1 | SEV1-3 分級（與 risk_tier 正交）+ Declare 授權 + 單一操作者升級梯 |
| P1-GAP-INFRA-2 | medium | §2 | 5 Edition SLA 數字表 + RPO/RTO 分層 |
| P1-GAP-INFRA-3 | medium | §3.1 | 季度/半年演練週期表 |
| P1-GAP-INFRA-4 | medium | §3.2-3.3 | WORM Compliance mode + 35 天窗口 + 備份金鑰獨立 KMS |
| P1-GAP-INFRA-5 | high | §4 | Circuit breaker 狀態機 + Eligible Provider Set 綁定 |
| P1-GAP-INFRA-6 | medium | §5 | Model Registry schema |
| P1-GAP-INFRA-7 | high | §6 | VRAM/RAM 下限表（AI_SUGGESTION） |
| P1-GAP-INFRA-8 | high | §7 | `model-pack-*.bundle` 複用 Signed Offline Law Pack 模式 |
| P1-GAP-INFRA-9 | medium | 未涵蓋，見 Appendix B | — |
| P1-GAP-INFRA-10 | high | §8 | `legal_status` × `deployment_availability` 正交拆分 |
| P1-GAP-INFRA-11 | medium | §9 | Queue Lag 觸發規則 + per-pool 獨立擴縮 |
| P1-GAP-INFRA-12 | high | §10 | TLS 1.2+/1.3、強制 mTLS、VPN、金鑰居住地 |
| P1-RISK-INFRA-1 | — | §11 | 分級 Eval 深度 + per-Capability 預算 |

## Appendix B — Open Questions

1. P1-GAP-INFRA-9（Cloud↔Local 可攜策略）屬 Data Architecture Plan 職權，不在本文件範圍。
2. §1.3 Enterprise/Sovereign 需要「真人 backup 聯絡人」——組織/人力缺口，非工程能單獨補。
3. §6 硬體基線需 Phase 5 真機 benchmark 校準。
4. §7 信任根雙簽章重疊期具體運送週期待與客戶合約條款一併設計。
5. 本文件全部提案若獲批准，依 Program Plan §6 逐條產出母文件修改協議套件。
