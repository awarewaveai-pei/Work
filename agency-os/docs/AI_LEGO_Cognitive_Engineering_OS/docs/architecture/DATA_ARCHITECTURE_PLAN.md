# DATA_ARCHITECTURE_PLAN
Status: PROPOSED
Date: 2026-08-29

## 0. Purpose & Scope

回應 Program Directive §XXII：

> 不要預設一定需要五種 database。先以 requirements 驗證：Relational / Object / Vector / Graph / Search / Cache / Queue / Event 何時需要獨立產品。避免 premature distributed architecture。需要時優先評估：PostgreSQL + Object Storage + pgvector / relational graph representation，再依 measurable threshold 抽離。

Master Plan §60（L2610-2635）目前宣告 7 種儲存引擎（PostgreSQL/Object Storage/Vector Index/Graph Store/Event Store/Search Index/Time-series），但只有一句「應用層透過 Repository Contract，不直接依賴資料庫」——無 schema、無 system-of-record、無跨儲存一致性機制（P1-GAP-ARCH-2）。本計畫依 §XXII 原則逐一驗證這 7 種（加上 directive 額外點名但 MP 未宣告的 Cache / Queue，共 8 類）在 MVP 階段是否真的需要獨立產品，並補齊 P1-GAP-ARCH-2/3/4/5/7/9 六個已登記缺口，整合 ADR-002（crypto-shredding）、ADR-003（Tenant + CAS）、ADR-005（DB Migration Recipe SSOT）。

全文 Grep 確認（`CQRS` / `saga` / `eventual consistency` / `optimistic lock` / `pessimistic lock` / `version column` / `distributed lock` / `advisory lock` / `serializable` / `PostgreSQL` / `pgvector`）：三母文件對這組詞彙**僅有 1 命中**（MP:2613 "PostgreSQL" 本身），其餘全部零命中——確認 P1-GAP-ARCH-2/4 描述的「一致性/並發詞彙真空」屬實，本計畫是在空白處建立詞彙，不是在修正既有但錯誤的詞彙。

---

## 1. Storage Engine Necessity Analysis

判準：對每個用途，先問「PostgreSQL + pgvector + Object Storage 這三件套能不能做」，能做則列出**量化門檻**（超過此門檻才抽離成獨立產品）；不能做則說明結構性理由（理由必須是「規則衝突」等級，不能是「業界常見做法」）。

| # | 用途（MP §60 原文） | MVP 方案（單一 Postgres 為主） | 獨立產品抽離門檻（量化） |
|---|---|---|---|
| 1 | Structured Metadata | **PostgreSQL** 主庫，所有 22+1（含 ADR-003 新增 Tenant）個 Domain Model 物件的關聯式 schema | 無需抽離——這是 SoR 本體，只有水平擴充問題（讀取 QPS 使主庫 CPU 持續 > 70% 或 replication lag > SLA 時加 read replica，非換產品） |
| 2 | Object Storage（Video/Audio/PDF/Artifact） | **S3 相容物件儲存**（AWS S3 / MinIO 自架），MP §58/59 既有 CAS + Portable Artifact URI 設計原樣沿用 | 這是 §XXII 自己列的 MVP 三件套之一，**不受「先證明必要性」檢驗**——二進位大檔本來就不該存進關聯式資料列。門檻只用於「要不要加 CDN / 多區複寫 / 冷歸檔分層」：總容量 > 個位數 TB 或需要邊緣快取延遲 SLA 時 |
| 3 | Semantic Retrieval（Vector Index） | **pgvector extension**（同一 Postgres 內，HNSW index） | 向量數 > 2000 萬 **或** 調過 index/硬體後 p99 查詢延遲仍 > 300ms **或** 向量查詢負載持續佔主庫 CPU > 30%（與 OLTP 寫入路徑搶資源）→ 抽到獨立向量產品（Qdrant/Milvus 類） |
| 4 | Evidence/Claim/Entity Relationships（Graph Store） | **關聯式鄰接表**（`entities` / `relations(from_id,to_id,type,properties jsonb)`）+ `WITH RECURSIVE` 或 Apache AGE extension（directive 明文允許的 "relational graph representation"） | 生產查詢中 > 20% 需要 > 3 hop 多跳遍歷，且調過 CTE/index 後 p95 仍違反 SLA（如 > 500ms）**或** 需要圖演算法（PageRank/社群偵測）作為核心產品功能 → 先升級 Apache AGE（仍在 Postgres 內），演算法需求成立才抽到專用 Graph DB |
| 5 | State History（Event Store） | **PostgreSQL append-only `events` 表**（`event_id`/`aggregate_id`/`sequence`/`causation_id`/`correlation_id`/`payload jsonb`），與 EC §27 Event/Messaging Contract 既有詞彙（Outbox/Inbox/Idempotency Key/Replay-safe）直接對接 | 持續寫入 > 2000 events/sec（WAL/replication 開始出現壓力）**或** > 5 個獨立下游 consumer group 需要各自獨立 offset + 保留視窗重播 **或** §112 30-year Replacement Drill 的 replay 操作實測會拖慢即時流量 → 抽到專用 event streaming（Kafka/Pulsar），但 **Postgres `events` 表永遠是 SoR，不因抽離而讓位**（見§2） |
| 6 | Full Text（Search Index） | **PostgreSQL 內建 `tsvector`/`tsquery` + GIN index** | 全文語料 > 5000 萬文件 **或** 調過 GIN/dictionary 後 p95 搜尋延遲仍 > 300ms **或** 產品需要 faceted search / typo-tolerance UI，Postgres FTS 結構上做不到 → 抽到 Elasticsearch/OpenSearch/Typesense 類 |
| 7 | Metrics（Time-series） | **TimescaleDB extension**（同一 Postgres，hypertable + continuous aggregate）或純時間分區表 | 持續攝入 > 5 萬 points/sec **或** 需要對數十億列做次秒級聚合查詢，壓縮/連續聚合調校後仍不達標 → 抽到專用 TSDB |
| 8a | **Cache**（directive 點名，MP §60 未宣告） | 不建：三母文件全文檢索 `Cache` 唯一命中是 Atlas §11.38 ATAM 通用註記（"Cache 提高 performance，但增加一致性複雜度"），**無任何具體需求登記**。MVP 用 Postgres 自身 `shared_buffers` + 應用層 memoization 即可 | 出現具體、可量測的「重複讀相同 query、cache-hit ratio 預估 > 80%、且延遲 SLA 未達標」情境才加 Redis 類——**在此之前引入 Cache 本身就是違反 §XXII** |
| 8b | **Queue**（directive 點名，MP §60 未宣告） | 不建獨立產品。MP 唯一相關訊號是監控指標「Queue Lag」（`MP:2973`），代表存在非同步任務但未指定實作。用 EC §27 既有 **Outbox 表**（同一 Postgres）+ 背景 worker 輪詢或 `LISTEN/NOTIFY` 做非同步任務派發 | 派發延遲 SLA 違反（如 > 5s）**或** 持續 > 500 jobs/sec **或** 需要 dead-letter/backoff 語意超出 Postgres-based queue 表能力 → 抽到 RabbitMQ/SQS 類 |

**結論**：MVP 階段 8 類需求可用 **1 個 PostgreSQL 實例（+ pgvector/AGE/TimescaleDB/GIN 四個 extension）+ 1 個 Object Storage + 1 個 Key Vault（見 §5）** 全部滿足，零額外資料庫產品。這直接落實 §XXII「不要預設需要五種 database」，也把 P1-GAP-ARCH-13（「避免過早拆微服務無量化門檻」）在**資料儲存維度**上補上了具體數字。

---

## 2. System-of-Record Assignment

MP §57 Event-native Architecture（`MP:2546-2566`）已自陳「Current State = Events 的 Projection」——本計畫沿用此既有宣稱，不發明平行機制：

```text
【Tier 0 — 終極 SoR】
Postgres `events` 表（append-only）
  ↓ 同一 ACID transaction 內原子更新
【Tier 1 — 主要 SoR，強一致】
Postgres 關聯式「current-state」投影表（Domain Model 22+1 物件）
  ↓ 非同步、經由 EC §27 既有 Outbox 機制
【Tier 2 — 衍生投影，最終一致，皆可從 Tier 0 replay 重建】
pgvector 欄位 / tsvector 欄位 / graph 鄰接表 / TimescaleDB hypertable
（或門檻跨越後抽離的專用 Vector/Graph/Search/TSDB/Kafka 產品）
```

**規則（closes P1-GAP-ARCH-2）**：
1. 任何不是 `events` 表本身的儲存，一律是**可重建的投影**，不是權威來源。判斷一筆資料是否「遺失」的唯一標準是「`events` 表裡還在不在」，不是任何投影是否還在。
2. Tier 0→Tier 1 因為**同一 Postgres 交易**寫入，一致性等級 = **Strong / Linearizable**（免費得到，不需額外機制）。
3. Tier 1→Tier 2 因為跨產品或跨非同步邊界，一致性等級 = **Eventual**，SLO 建議 p99 staleness < 60s，監控指標可直接掛 MP §73 既有「Retrieval Quality」監控項（`MP:2967`），不需新開監控類別。
4. Object Storage 是 CAS 內容位址、不可變，只有「先寫入後引用」的順序要求，無一致性等級爭議。
5. 一個查詢命中 stale 的 Tier 2 投影是**延遲/使用者體驗問題**，不是**正確性問題**——只要任何 Decision/審計動作最終回頭核對 Tier 1（或 Tier 0）即可，這條規則本身就該寫進未來的 Repository Contract schema。

**為何這不是空話**：MP §61 資料分級（`MP:2639-2664`）+ AI Architecture 的 Provider Adapter 抽象（Program Directive §XXI）意味著 Tier 1→Tier 2 的向量化（embedding）呼叫必須先過 §61 的 External AI routing 政策（Restricted=DENY／Confidential=需核准）——這正是「為什麼向量投影必須非同步、由一個受政策節流的 worker 執行，而不能直接塞進主交易」的架構理由，不只是效能考量。

---

## 3. Consistency & Concurrency Strategy

回應 P1-GAP-ARCH-4（「lock 或序列化」無 isolation level 定義）。具體機制：

1. **Aggregate 層級樂觀鎖（Optimistic Concurrency）**：每個 Domain Model aggregate root（Claim/Evidence/Decision 等）的「版本」= 該 aggregate 已套用的 event 數。寫入時 `INSERT INTO events (aggregate_id, sequence, ...) ... ON CONFLICT (aggregate_id, sequence) DO NOTHING`，靠 `(aggregate_id, sequence)` 的 **UNIQUE constraint** 偵測並發衝突：兩個 writer 同時搶下一個 sequence，其中一個會拿到 `23505 unique_violation`，敗方重讀最新狀態、重放業務邏輯、重試。這是 EventStoreDB/Marten 等既有事件溯源系統的標準做法，非本計畫發明。
2. **模組擁有權消除跨模組並發**（同時縮小 P1-GAP-ARCH-10 的影響面）：每個 aggregate 只有**唯一擁有模組**能直接寫 `events` 表；其他模組一律派發 Command 給擁有模組，不得繞過。並發從「N 個模組互搶 M 張表」降階成「N 個 writer 對 1 個擁有模組的序列化寫入路徑」，不需要分散式鎖。
3. **跨步驟長流程（Workflow/Execution 跨越外部 AI 呼叫）**：用 Postgres **advisory lock**（`pg_advisory_xact_lock(hashtext(execution_id))`）鎖定該 Execution 生命週期，比引入 Zookeeper/etcd 等外部協調服務便宜且足夠。門檻：只有當 lock 等待時間持續違反 SLA，或需要跨水平擴充 worker fleet、超出單一 Postgres session 可管轉的範圍時，才升級到專用分散式鎖/共識服務。
4. **跨租戶**：依 ADR-003，每個 Workspace 唯一歸屬一個 Tenant、每個租戶單一區域落地——**沒有任何場景需要跨租戶交易**。這直接讓「分散式一致性」問題的範圍永遠限縮在單一 Tenant 內，是本計畫並發策略成立的前提，不是附帶好處。
5. **升級到多主/多區域寫入的唯一觸發點**：某租戶因資料主權（Program Directive §XXIII）要求物理落地多區域——即使如此，仍是 **per-tenant** 個案決定（比照 ADR-003 CAS Option C 的「窄範圍例外」模式），不是平台整體改架構。

---

## 4. Backup & DR Matrix（補齊 P1-GAP-ARCH-3：從 2/7 補到全部）

MP §74（`MP:2977-3006`）現況只給 PostgreSQL（RPO<5min）與 Object Storage（RPO<24h，Artifacts）。分兩層：

### Tier 1 — System-of-Record（最嚴格）

| 儲存 | RPO | RTO | 備援方法 |
|---|---|---|---|
| Postgres 主庫（events + 全部關聯式投影 + pgvector/AGE/Timescale/GIN） | < 5 min（沿用既有 §74 數字） | < 2h（沿用既有） | 連續 WAL 歸檔（PITR）+ 每日 base backup + 跨區 replica |
| Object Storage（CAS blobs） | < 24h（沿用既有） | < 2h | 版本化 bucket + 跨區複寫；內容位址天然可用 hash 重算驗證備份完整性 |
| **Key Vault / KMS**（ADR-002 新增，§74 原文完全缺席） | **< 1 min** | **< 15 min** | HSM 多區複寫 + 離線 escrow 副本。門檻比 Postgres 更嚴，因為 ADR-002 自己指出「Key Vault 遺失 = 全體使用者個資一次性 crypto-shred，是比原問題更劇烈的新單點故障」 |

### Tier 2 — Derived Projections（可從 Tier 1 重建，門檻跨越後才存在）

| 儲存（僅當 §1 門檻跨越、真正抽離時才存在） | RPO | RTO | 備援方法 |
|---|---|---|---|
| 專用 Vector Index | < 24h（快照，非強制） | = 從 events 表全量重 embedding 所需時間（依語料量與 AI provider 吞吐量而定，寫成公式而非固定數字） | 定期快照避免每次故障都要全量重算；「正確性 RPO」永遠是 0，因為可完整 replay 重建 |
| 專用 Graph Store | < 24h（快照） | = replay 時間 | 同上 |
| 專用 Search Index | < 24h（快照） | = 從 Postgres 全文欄位 reindex 時間 | 同上 |
| 專用 Event Streaming（Kafka 類，若因吞吐門檻抽離） | Topic 本身 < 5 min（replication factor 3） | 災難復原的**唯一真相來源仍是 Postgres `events` 表**，Kafka 只是 fan-out 層，不是恢復依據 | Postgres outbox → Kafka 既有模式 |
| 專用 TSDB | < 1h | < 4h（若指標同時作合規稽核用途則升級至 Tier 1 規格） | 快照 + 從 Postgres 分區表重灌 |

**跨儲存 Reconciliation（closes P1-GAP-ARCH-3 明確指出「DR 流程無跨儲存 Reconciliation」）**：任何一次觸及 Tier 2 的 DR 事件，Tier 1 復原並驗證完成後，統一跑一支 **Reconciliation Job**（沿用 ADR-005 自己在 DB Migration Recipe 裡定義的 Reconciliation 語意——counts/checksums/business invariants）：Tier 2 store 要嘛從自己最近快照復原後補放 Tier 1 快照時間點之後的 event，要嘛整個砍掉重 replay；結束後一律跑一次「Tier 2 筆數/checksum 對比 Tier 1 同時間窗口」的一致性檢查。**一支通用 Job 適用所有 N 個 Tier 2 store**，不需要為每種 store 各寫一套復原程序。

---

## 5. Provenance Chain Unification（closes P1-GAP-ARCH-7）

現況兩條鏈互不相交：

- §13（`MP:1039-1057`）：`SOURCE → EVIDENCE → CLAIM → INFERENCE → ASSUMPTION → DECISION`
- §37（`MP:1909-1949`）：`Paper Sentence → Result → AnalysisRun → Code → Dataset → Original Source`（Dataset 直接連回 Source，跳過 Evidence/Claim）

**不合併**（兩者服務目的本質不同：§13 是論述性/策略推理鏈，§37 是量化可重現性鏈），改用**顯式橋接事件**，命名沿用 MP §57 既有 `XCreated`/`XVerified` 事件命名慣例：

```yaml
ResultPromotedToEvidence:
  result_id: RESULT-229          # 錨定 §37 鏈
  analysis_run_id: ANA-92817     # 錨定 §37 鏈
  evidence_id: E-xxxx            # 在 §13.3 Evidence Graph 新建節點
  promoted_by: <Identity>
  promoted_at: timestamp
  promotion_rationale: string
```

機制：
1. Evidence schema 的 `source_ref` 從單一型別擴為 union type：`DocumentSource | AnalysisRunSource`——這是非破壞性擴充，不改既有 Evidence 定義。
2. 反向索引 `evidence_promotions(evidence_id, analysis_run_id, result_id)` 存在同一 Postgres SoR（純 schema 新增，不需要新儲存引擎）。
3. **雙向完整性串聯（直接關閉本 gap 的 consequence 描述）**：
   - 若 Source/Dataset/AnalysisRun 被標記 `Quarantined`/`Retracted`/`Invalidated`，透過反向索引找到所有依賴它的 Evidence（及其下游 Claim），標記 `provenance_integrity: at_risk`，並對曾在 Decision 中使用該 Claim 的 HumanContribution 發出通知——重用既有 Decision/HumanContribution 物件，不建新通知子系統。
   - 反方向：若某 Evidence 被標記 quarantine 且它本身是經 `ResultPromotedToEvidence` 產生，同一反向索引回頭標記來源 AnalysisRun/Dataset 為 `evidence_integrity: at_risk`。

儲存影響：`ResultPromotedToEvidence` 只是 `events` 表裡新增一種 event type，反向索引是普通關聯表——**不需要任何新儲存引擎**。

---

## 6. Integration with ADR-002 / ADR-003 / ADR-005

**ADR-002（crypto-shredding）**：
- 每租戶每 subject 的 DEK 存在 §4 定義的 Key Vault（Tier 1 DR）。Confidential/Restricted 欄位在寫入 `events` 表前於應用層加密，Key Vault 本身不是通用資料庫，不受 §XXII「證明必要性」檢驗——它是 ADR-002 已定案的窄範圍元件。
- **本計畫補上 ADR-002 未覆蓋的缺口**：ADR-002 只定義了 Postgres 主投影讀到已銷毀 DEK 時填 `REDACTED` sentinel；但 §2 的 Tier 2 投影（pgvector/search/graph）若在 crypto-shred 之前已完成 embedding/索引，**shred 只擋住未來 rebuild，不會清掉既有的衍生內容**——一個向量本身可能仍帶著已被刪除明文的語意殘留。修法：crypto-shred 觸發時額外發出 `DeleteDerivedProjections(subject_id)` 事件，由與 §5 相同的事件監聽機制驅動，實際清除該 subject 在所有 Tier 2 store 裡的既有衍生條目，而不只是防止未來重建——這是本計畫對 ADR-002 的必要補完。
- Key Vault 可用性變成所有 replay 操作的新單點依賴，已在 §4 給予比 events 表更嚴格的 RPO/RTO。

**ADR-003（Tenant + Tenant-scoped CAS）**：
- Tenant 作為 Domain Model #23 落在 Postgres SoR（`tenants` 表），含 `data_residency_region`/`encryption_root_key_ref`（連回 Key Vault）。
- **本計畫關閉 ADR-003 Consequences 段列的 follow-up (i)**（"full RLS/schema-per-tenant vs. shared-schema decision"）：推薦 **shared-schema + Row-Level Security（RLS）**，理由：(a) §XXII 明文避免 premature distributed architecture；(b) RLS 是 Postgres 引擎層強制、fail-closed，與 ADR-003 自己的「fail-closed over fail-open」決策驅動一致；(c) schema-per-tenant/database-per-tenant 只在**量化門檻**跨越時才個案採用——決策範圍是**該租戶**，不是全平台，完全比照 ADR-003 CAS Option C 的「窄範圍例外」模式。
- **本計畫關閉 follow-up (ii)**（"how shared components like Vector Index avoid cross-tenant leakage"）：pgvector 情境下每筆查詢強制 `tenant_id` 過濾並由同一張表的 RLS 保護；若日後抽到不支援原生 RLS 的專用向量產品，強制**每租戶獨立 collection/namespace**，確保漏寫過濾條件時回傳空集合而非另一租戶明文——結構性 fail-closed。Graph Store 比照同一規則。
- Object Storage CAS 路徑直接沿用 ADR-003 Option A 的 `/objects/<tenant_id>/sha256/...`，本計畫不重複決策。

**ADR-005（DB Migration Recipe SSOT + Method ID Grammar）**：
- 本計畫 §1 表格裡的每一個「門檻跨越後抽離」動作，定義上都是 EC §28 意義下的 Database Change，**必須**走 ADR-005 訂定的 15 步序列，不得另創簡化版。
- 具體套用範例（Postgres pgvector → 專用向量產品）：Expand=新產品上線；Enable Dual Write=非同步 projector 同時寫 pgvector 欄位與新產品；Backfill=歷史向量搬遷/重算；Reconciliation=筆數+抽樣 cosine similarity 比對；Dual Read Verification=雙讀 top-K 結果比對；Canary=部分檢索流量導新產品；Contract=下線 pgvector 欄位/index。

---

## 7. Migration Path

**Phase A（Day 1 / MVP）**：單一 PostgreSQL 實例（PITR 啟用）+ 四個 extension（pgvector / 原生 FTS / TimescaleDB 或時間分區表 / 選用 Apache AGE）+ `events`/`outbox` 兩張表 + RLS **從第一天就開**（比照 ADR-003 自己的論證——「這是系統 30 年生命中最便宜的修正時機」同樣適用於儲存引擎選型）。Object Storage（S3 相容）存二進位檔。Key Vault（雲端 KMS 或 HashiCorp Vault 類託管服務）存 DEK/KEK。

**Phase B（門檻觸發，逐引擎獨立進行）**：§1 表格中任一門檻被跨越，**只抽離該引擎**，走 ADR-005 15 步流程，`events` 表全程維持終極 SoR 不變。順序由實際數據觸發，不預先排定；但依 MP 對 Evidence/Claim/RAG 的產品重心判斷，Vector Index 與 Search Index 最可能最早跨越門檻，建議預留擴充空間但**不預先建置**。

**Phase C（僅租戶個案觸發）**：特定租戶因合約/主權要求需要專屬 schema 或實體資料庫，比照 ADR-003 CAS Option C 模式，範圍限定該租戶，不引發平台級重構。

**本計畫產生、但故意不在此次修改三母文件的規格缺口**：
1. MP §60 需新增 System-of-Record 宣告段落（本計畫 §2 的 Tier 0/1/2 規則）。
2. EC §28 Database Change Contract 需新增「儲存引擎抽離」作為 Database Change 的一種具體子類型，並引用本計畫 §1 的量化門檻表。
3. MP §74 Disaster Recovery 需要把本計畫 §4 的全量矩陣（尤其 Key Vault 的 Tier 1 規格）正式併入。
4. MP §13/§37 需要正式加入 `ResultPromotedToEvidence` 橋接事件與雙向完整性串聯規則（本計畫 §5）。
5. ADR-002 需要一則 Addendum，補上「crypto-shred 必須連動清除 Tier 2 衍生投影」這一步（本計畫 §6）。

---

## Evidence

- MP §60 Data Architecture：`MP:2610-2635`
- MP §13 Knowledge 與 Provenance（含 §13.3 Evidence Graph）：`MP:1039-1114`
- MP §37 Reproducible Research：`MP:1909-1949`
- MP §57 Event-native Architecture：`MP:2546-2566`；§58 Immutable-first/CAS：`MP:2570-2586`；§59 Portable Artifact URI：`MP:2588-2607`
- MP §61 資料分級：`MP:2639-2664`；§74 Disaster Recovery：`MP:2977-3006`；§100 Global Privacy Engine：`MP:4259`；§148 Encryption & Key Sovereignty：`MP:5637-5656`
- MP §3 產品核心物件（22 個 Domain Model）：`MP:330-357`；§1.5 最小爆炸半徑：`MP:262-274`
- EC §27 Event/Messaging Contract：`EC:1099-1127`；§28 Database Change Contract：`EC:1135-1157`；併發寫入宣告：`EC:2010`
- Program Directive §XXII：`.ai/research/phase-0/source-directive-2026-08-28.md:326-333`
- Phase 1 Gap Register：`.ai/research/phase-1/GAP_REGISTER.yaml`（P1-GAP-ARCH-2/3/4/5/7/9）
- ADR-002/003/005：`docs/adr/`（全文）
- 全文 Grep 確認缺席（一致性/並發詞彙）：`CQRS`/`saga`/`eventual consistency`/`optimistic lock`/`pessimistic lock`/`distributed lock`/`advisory lock`/`serializable` 於 MP+EC+Atlas 三份文件皆零命中；`Cache`唯一命中 Atlas:2122（通用 ATAM 註記，非儲存決策）；`Queue`僅以監控指標／人工審核佇列語意出現，非基礎設施決策。

**邊界確認**：本次任務全程僅執行 Read/Grep/Bash（唯讀）；未對三母文件做任何修改；未建立任何 schema 檔案。
