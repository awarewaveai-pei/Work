# ADR 011: 蒐集分三類需求；KB 先模組化後服務化；共用層是 collect/sink 積木 + 編排器

- **狀態**：提案（待操作者批准；§決策 10 為 High-STOP，批准本 ADR 不含批准該項）
- **日期**：2026-09-10
- **審查**：已經一次獨立 critic 攻擊（8 發現：3 紅 4 橘 1 黃），全部反映在本版。修正記錄見 [WORKLOG 2026-09-10](../../WORKLOG.md)。

## 脈絡

### 三類需求

「知識庫 + 資料蒐集」實際涵蓋三種**保存期限、合規強度、失敗模式都不同**的需求：

| 類別 | 語意 | 保存 | 合規 | 消費者 | 現況 |
|---|---|---|---|---|---|
| **Signal** | 現在在發生什麼 | 用完即丟 | 無 | Content Studio | 已上線（`search/*` 積木） |
| **Corpus** | 實體怎麼描述自己 | 版本化 + 需保新鮮 | 一般 | cs KB、**未來對外產品** | KB 已上線但**版本化未接線**（見下） |
| **Evidence** | 關於主體能證明什麼、來源為何 | append-only | 特殊類別資料 + 抹除義務 | hci30 | 溯源模型已建，**人工輸入** |

把三者塞進同一條管線 = 用最弱的合規契約承載最強的需求。這是本 ADR 要避免的主要失敗。

### 全 Work 知識資產盤點（整合關係）

| 資產 | 位置 | 類別 | 與本設計的關係 |
|---|---|---|---|
| cs 知識庫（pgvector） | `cs_knowledge_sources/_chunks` | Corpus | **產品本體**。抽成 `lib/kb/`；cs 降為其第一個消費者 |
| Content Studio 趨勢源 | `content_sources` + `search/*` 積木 | Signal | 不落 KB。可改用 collect 層，但**不共用儲存** |
| hci30 證據鏈 | `hci.sources`/`source_snapshots`/`subject_records` | Evidence | **獨立合規邊界**。只共用 collect 層，不共用 KB |
| cognitive-os knowledge 模組 | `ai_lego/modules/knowledge/`（Python） | 治理邏輯（erasure/provenance），**非儲存** | 不是 KB，是規則模組。若日後需檢索 → 走 KB 的 HTTP 介面 |
| 會議轉錄管線 | meeting → transcript | Corpus 的**來源** | 可成為一種 collect 積木輸入（本地檔案） |
| System Foundry `CAP-KNOWLEDGE-BASE` | `System_Foundry_v1.6_ARTIFACT_COMPLETE/capabilities/catalog.json:1380` | **規格**（能力目錄條目，非實作） | `lib/kb/` 就是這條能力的實作。`CAP-DOC-TEMPLATES` 宣告 `requires` 它 → 規格側依賴已存在，接得上 |
| hci30 `docs/intelligence/*_SPEC.md` | `HCI_EVIDENCE_QUALITY`／`CONTRADICTION`／`TIME_DECAY`／`TRUST_DOMAIN` | **Analysis 層規格**（認識論），非蒐集 | 不重複實作。命名衝突見 §決策 14 |
| cognitive-os `ai_lego` | `modules/knowledge/`（Python） | 治理規則（erasure／provenance），**無向量檢索、無 KB** | 實查確認無 RAG/vector（先前疑似命中為 `rag` 比對到 `storage` 的假陽性）。若日後需檢索 → 走 KB 的 HTTP 介面 |
| System Foundry / Method Atlas 文件本體 | `agency-os/docs/` | 設計知識，非執行期 | 不進 KB（除非日後要做內部問答，屆時走同一契約） |

### 已驗證的現況（含一項推翻本 ADR 前版的發現）

| 事實 | 影響 |
|---|---|
| **`cs_knowledge_sources.doc_family_id`／`source_version` 是死欄位**：`insertSource()`（`lib/cs/db.ts:231-251`）無參數可寫入，全走 DB default；`insertChunks` 寫 `doc_family_id: r.sourceId`（`db.ts:273`）＝ chunk 的 family 是 source 主鍵而非 source 列的 family；全 repo 無任何讀取處 | **版本化必須實作，不是重用**。本 ADR 前版宣稱「不需新建」為誤，已更正。P1 成本上修 |
| `cs_match_chunks`（`0051:209-214`）與 `matchChunksKeyword`（`db.ts:323-340`）**皆無 status/version 過濾** | 舊版 chunk 會與新版同時被檢索 → 換版需同時改檢索端，非只改寫入端 |
| `rag.ts:130-136,150-154,156-159` 有三處邏輯專門消滅零 chunk 的 ghost source | 「不合格就標 `status='dirty'`」與此直接衝突，需另設計落點 |
| `registry.ts:33` 的 `run` 是**單參數** `(ctx) => Promise<TOut>`，`ContentBlock` 無 `match` 欄位 | collect/sink 塞不進既有 registry；擴充它會動到 8 種已上線 kind 共用的介面 |
| `hci.sources.source_ref` **無 unique 約束**（`0001_wave1_synthetic_up.sql:94`） | 以 URL 為鍵 upsert 需要一個 hci migration，且受該 schema 的 table-inventory drift 檢查約束 |
| hci30 用 `hci.tenants`+`current_tenant_id()`+FORCE RLS+append-only；lobster-factory 用 `organizations`+service_role-only RLS | 兩個合規強度不同的租戶宇宙，不可合併 |
| 無 npm workspace（`lobster-factory/package.json` 無 `workspaces`；hci30 無 `package.json`） | 跨專案共用 TS 需 HTTP 邊界，決定分期 |
| ADR 004：耐久編排必須 Trigger.dev | 排程歸屬已定案 |

## 決策

1. **只有「取得 + 抽取」是共用層**。Signal／Corpus／Evidence 三類共用 fetch 與 text extraction，此外一律不共用：不共用 documents 表、不共用去重表、不共用租戶模型。

2. **整合不變量（「資料不能有衝突」的可執行定義）**：
   > 一份文件 = 一個 `canonicalUrl` + 一個 `contentHash` + 一份正規抽取。
   > 派生索引（chunk、embedding、摘要）可因消費者而異；**「原文說了什麼」全系統只能有一個答案**。
   正規化函式與 hash 演算法屬編排器，**不得由積木各自實作**——兩個積木對同一 URL 產生不同 canonical 即違反本條。

3. **KB 先模組化，後服務化，順序不可顛倒**。
   - 現在：`lib/cs/` 拆為 `lib/kb/`（通用知識庫 = 未來產品）與 `lib/cs/`（客服專屬：intent／autonomy／guardrail／eval）。同 process 純搬移，零行為變更。
   - 之後：修正 KB 版本化正確性（見脈絡，非做不可）。
   - 最後：出現第二個真實消費者（對外產品、或 Python 的 cognitive-os）才抽成獨立服務。
   - **理由**：先抽服務等於把未接線的版本化原樣搬到網路邊界後面再修，更貴。修好、驗證、再抽取 = 零重工。

4. **collect/sink 自建 registry，不動 `ContentBlock`／`BlockKind`**。沿用 `registry.ts:10-12` 已誠實承認的「同一套契約、按 runtime 落多個 registry」慣例。爆炸半徑歸零，不觸及 8 種已上線 kind。

5. **兩種積木 + 一個編排器**。
   - `collect`：`match(target) → 候選排序` ＋ `run(target, ctx) → { docs, discovered }`。無狀態、無 DB、無租戶概念。
   - `sink`：`run(docs, ctx) → SinkReport`。**擁有租戶鍵與合規契約**。
   - **編排器獨佔六個橫切面**：路由、預算、禮貌、去重、續傳、重試。積木永遠不碰這六項。
   - **可成長性的誠實界定**：承諾是「**加來源不需改路由邏輯**」，不是「編排器永不變更」。編排器沿上述六軸成長是預期的；積木把這六項的狀態偷藏進自己 = 違反本條。

6. **`match` 回傳候選清單，失敗或品質不合格時降級到下一階**。策略階梯（API > RSS > sitemap > 靜態 HTTP > headless）由分數表達，但**必須真的能往下走**——只取最高分且失敗即放棄，等於有梯級沒有走法，實務上會被迫在 `match` 內寫 host 專屬 if-else。

7. **品質由編排器判定，非積木自報**。被審者不得當自己的裁判：`RawDoc` 不帶品質欄位，編排器拿 `{text, raw}` 自算。判準與門檻在 config，單位必須對齊（見計畫書 §1.3；中文/英文的 byte-vs-codeunit 錯配會造成系統性誤傷）。

8. **Collection 不擁有租戶模型與儲存**。`RawDoc` 帶不透明 `tenantRef`，Collection 只傳遞不解讀、不落地。租戶語意只在 sink 內展開。

9. **禮貌（rate limit）是跨 run 的全域資源，令牌桶必須持久化**。編排器實例是 per-run，但目標站看到的是同一個出口 IP。多個 run 各自「有禮貌」合起來就是不禮貌——而被封的是同時跑生產服務的那台機器。

10. **個資類來源屬 High-STOP，且涵蓋 hci30 自動化**。心理／藝術治療領域的人物背景屬特殊類別資料；hci30 自述 DSR 抹除生命週期尚未接線（ADR-0018 gate 5 仍在 Wave 4）。在抹除路徑打通 + 明示批准前：只做非個資來源，**hci30 側自動蒐集限組織實體、不含自然人**。

11. **去重的邊界 = 租戶樹內可以，跨樹／跨系統禁止**。同一棵樹內（集團已收錄 → 部門不必重嵌）去重是省錢且合規的；跨系統（Corpus ↔ Evidence）共用去重表等於跨合規邊界洩漏。

12. **KB 回傳證據，不回傳答案**。`lib/kb/` 的對外能力只有 `ingest` / `search`（回傳帶引用的段落）/ `get` / `archive`。**`answer()`、guardrail、intent 分類、autonomy 等級、對話狀態一律不屬於 KB**，留在各消費者。
    **理由**：學術研究、公司內訓、業務、客服要的**答案形式**互不相容，但要的**證據**是同一種。混在一起 = 這個 KB 只能賣給客服。`lib/cs/` 現況正是混在一起，這是 §決策 3 拆分的根本理由。

13. **檢索謂詞現在一次定型，之後永不重寫**（⚠️ 本條原列四維，**已由 §決策 16 更正為六維**——少了 `as_of_time` 與 `embed_model`。讀本條請一併讀 16）：
    ```sql
    WHERE tenant_node = ANY(scope_chain)                    -- 租戶繼承鏈
      AND space_id    = ANY(spaces)                          -- 知識空間
      AND status      = 'active'                             -- 版本／tombstone
      AND (NOT is_sensitive OR tenant_node = viewer_node)    -- 敏感不向下繼承
    ```
    - **租戶是樹**（集團→公司→部門→個人；「自用」是普通節點，無後門）。KB 端**現在**就把 `cs_match_chunks(p_org uuid, …)` 改成 `p_scope uuid[]`；今日 chain 長度為 1，租戶樹落地時 KB **零改動**。
    - **租戶樹本身不在本 ADR 建**。層級是全系統概念（計費、權限、KB 皆需），只在 KB 內建一份會產生第二個「誰在誰底下」的真相 → 另立 ADR。本 ADR 只保證 KB 不擋路。
    - **繼承只向下**：部門看得到公司／集團；公司**看不到**自己部門的（部門可能有草稿與敏感內容）。上行或平行共享需顯式授權。
    - **一份文件只屬於一個節點**，不共有 → 不會有兩個擁有者兩套真相。
    - **Space ≠ `kind`**：現有 `kind ∈ ('doc','faq','sop','conversation','url')` 是**文件類型**，不是知識空間，不得代用。業務查詢撈到學術論文是預設要擋掉的失敗。
    - 四者皆為便宜索引欄位；現在加 = 一次 migration，事後加 = 重建索引＋回填＋改全部呼叫端。

14. **兩種「品質」必須分名，不得互相引用門檻**：
    | 名稱 | 層 | 問的問題 | 位置 |
    |---|---|---|---|
    | **extraction quality**（抽取品質） | Collection | 抓到的是內文還是導覽列？ | 本設計 §1.3 |
    | **evidence quality**（證據品質） | Analysis | 這個主張有幾個**獨立**來源佐證？ | hci30 `HCI_EVIDENCE_QUALITY_SPEC.md` |
    後者的核心主張是「URL 數量不等於獨立來源數量」，與抽取無關。**兩者不得互相引用對方的門檻或詞彙**；Collection 不得宣稱任何 evidence-quality 結論。

15b. **抓回來的內容一律視為不可信資料（prompt injection 防線）**。這是**產品級**要求，不限 HCI：任何吃外部內容的 KB 都是注入面，而本 KB 要對外銷售。
    - 抽取出的文字進入任何 LLM 提示時**必須包裹**（分隔標記 + 明示為 untrusted data），**不得**與系統指令直接串接；
    - 消費端必須做 output-schema 驗證；
    - 二次掃描標記「指令樣態」句子（"ignore previous"、"system:"、隱藏文字、極端指令句）→ 進人工佇列，不自動入庫。
    - **不自己重新推導威脅模型**：接 HCI 已分析過的同一威脅類別（`06_HCI30_PUBLIC_INTELLIGENCE.md:88` 指向 AI LEGO `SECURITY_THREAT_MODEL.md` TB-1/T2/E4）。
    **理由**：對手只要在自己控制的頁面種一段指令文字，就會被抓進 KB，然後被客服／研究 AI 當 context 讀。無錯誤、無告警。

15c. **HCI-30 不使用本 KB；只共用 fetch/extract，且須在其自有隔離環境執行**。HCI 的 Evidence 層有自己的 claim 物件、來源獨立性、佐證圖、admission 狀態機、身分解析與 S1-S6 來源品質階梯（`06_HCI30_PUBLIC_INTELLIGENCE.md`）——那是完整的領域系統，不是知識庫。跨 HCI 邊界時本設計**服從**下列既有已 ACCEPTED 決策，不得覆寫：
    | HCI 既有決策 | 對本設計的拘束 |
    |---|---|
    | **ADR-0029**（`06:91`） | fetch 須跑在**網路隔離專用 runner**；Trigger.dev 只 enqueue/status/retry，**不得執行對外 fetch**；DNS-rebind 防護為 blocking gate。→ 本設計的 `ctx.fetch`（跑在 next-admin）**不得**用於 HCI 路徑 |
    | **ADR-0026**（`06:202`） | Source/SourceSnapshot **禁止 record-level 去重**（僅允許 byte 層 raw 去重）。→ §決策 11 的「租戶樹內可去重」**不適用** HCI |
    | `06:302` | raw 內容**不得**進 Postgres `text`/`bytea`；須 object storage，DB 只存 hash + metadata reference。→ 前版「砍掉 MinIO、raw 進 Postgres」對 Evidence 路徑**是錯的**，已更正；`snapshot_ref` 的指向由此定義 |
    | `06:215` | 「Raw web result must never automatically become formal HCI Evidence」。→ 自動化**最多到 `DISCOVERED`**，後續 MATCHED/VERIFIED/ACCEPTED 走 HCI 既有 gate。前版 P4「變自動蒐證」為超譯，已更正 |
    | `06:49-82`（ADR-0015） | Identity Resolution 前置強制。→ target 由 HCI 的 Search Planning 提供，Collection **不得**自行尋找主體 |
    | `06:263` | Continuous Monitoring 受 tier + ToS + 異常偵測限制。→ HCI 路徑的排程受此拘束（一般 Corpus 路徑不受） |

15d. **不重新發明 Shared Kernel 已指定的型別**。`ADR-0013`（`09:63`）已決定把 `TenantContext`／`SourceRef`／`EvidenceRef` 等 thin reference 抽成 `Projects/shared/kernel`（vendored/pinned semver，非 live service）。本設計的 `tenantRef` **必須**在該 kernel 落地後對齊 `TenantContext`，不得長期並存為第二套定義——那正是該審查已指出的「兩個產品各自重新推導同一個東西」。

15. **引用錨點在抽取當下記錄，即使暫無消費者**。`page` / `section` / `char_offset` 寫進 `cs_knowledge_chunks.metadata`。學術用途需要「第 12 頁第 3 段」級的引用；抽取當下不記，事後**永遠補不回來**（原文可能已改版）。這是典型的「現在幾乎零成本、事後不可能」。

16. **檢索謂詞是 6 維，不是 4 維**（更正 §決策 13）。前版寫「四個維度定型後不再變」，**講太滿且不完整**。實際必須一次到位的是六個：
    ```sql
    scope_chain × space × status × sensitive × as_of_time × embed_model
    ```
    - **`as_of_time`（時間）是最大缺口**：法規／政策／規格／SOP／價目表全部有生效期，而客戶真正會問的是「**當時**是怎樣」（稽核、爭議、追溯、保固認定）。`status='active'` + `source_version` 是**線性版本不是時間**，答不出這題。且 `valid_from`/`valid_to` **不在入庫當下記就永遠推不回來**。
    - **不重新發明 bitemporal**：沿用 hci30 既有的 `0005_wave1_bitemporal_history_up.sql` + `hci.mark_superseded()` 模式。
    - **`embed_model` 必須進謂詞且分索引**：`cs_knowledge_chunks.embedding` 是寫死的 `vector(1536)` 配**單一** HNSW 索引。換維度不同的模型**存不進去**；換同維度不同模型**存得進去但餘弦距離不可比**，檢索靜默劣化、無錯誤無告警。混進同一索引後要救只能全部重嵌。

17. **產業以 Domain Pack 承載，引擎零改動**（模式取自 System Foundry `industries/REGISTRY.json` + `industries/<slug>/`）。加第 N 個產業 = 加一包 + registry 一筆。
    | 一包內含 | 用途 |
    |---|---|
    | `vocabulary.json` | 同義詞／縮寫消歧（`PT` = physical therapy vs prothrombin time） |
    | `doc-types.json` | 該產業文件型別 → **每型別指定 chunker 與引用形狀** |
    | `authority-tiers.json` | 來源權威階梯（法規 > 期刊 > 廠商規格書）。**不得與 HCI 的 S1-S6 互相引用**（ADR §決策 14 的命名紀律） |
    | `temporal-rules.json` | 該產業的時間語意（法規用生效日、產品用型號世代、論文用撤稿狀態） |
    | `collect-sources.json` | 預設來源清單（蒐集系統消費） |
    | `conflict-rules.json` | **結構性**矛盾規則（見 §決策 18） |
    | `baseline.json` | 已知良好設定。新客戶從基線開，不從零開 |
    紀律直接沿用 System Foundry：**registry 明寫每個檔的路徑，沒有就寫 `null`，不做靜默 fallback**；並比照 `tests/test_industries.py` 建機械閘驗證每包完整（必填檔存在、規則引用的 doc-type 真的存在），防半殘的包混進來。
    **不抄的**：System Foundry 是**產生器**（問卷→藍圖），KB 是**執行期系統**。不得把 KB 做成問卷驅動。

18. **KB 只偵測「結構性矛盾」，語意矛盾不歸它**。
    - **KB 做**（機械可判、無需理解內容）：同一 `canonicalUrl` 有兩份 `active`；`valid_from`/`valid_to` 區間重疊；`supersedes` 鏈斷裂或成環；被 `retracts` 指向的文件仍可檢索。→ 命中即 `CONFIGURATION_CONTRADICTION` 風格的錯誤碼 + 上報，比照 System Foundry `rules/conflict-rules.json` 的 `if_all → code + message` 宣告式形狀。
    - **KB 不做**：兩份文件對同一主題給相反答案。那是語意判斷，屬 hci30 `HCI_CONTRADICTION_SPEC.md` 與 cognitive-os 的地盤。KB 越界做這件事 = 在最弱的層做最需要領域知識的判斷。

19. **chunker 與 embedder 皆為可插拔槽**。法條按條文切、論文按章節切、SOP 按步驟切、程式碼按函式切——單一切法在每個產業都是中等。選擇來自 Domain Pack 的 `doc-types.json`。
    **為何是現在**：留槽現在幾乎零成本；事後換切法 = **全部重嵌**。

20. **來源標記沿用 `epistemic-label.schema.yaml`，不自創第五套**（更正 §決策 15b 的 `trust` 三值）。
    canonical SSOT：`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml`（ADR-004 ACCEPTED 2026-08-29）。該檔存在的**理由**就是同一概念曾在四份文件長出四套不相容詞彙；本設計前版的 `trust: untrusted-external | operator-provided | internal` 是**第五套**，撤回。
    - 每個 chunk／passage 攜帶 `provenance_record`：`epistemic_type`（11 值）×`authorship_state`（6 值）×`locked`（3 值），**三軸正交**。
    - 對映範例：外部抓取 = `EVIDENCE` + `SOURCE_QUOTATION`（**不是** `SOURCE_FACT`——廠商官網只能證明「該公司做過此聲明」，不能證明聲明為真，同 `06:166`）；操作者手寫 SOP = `SOURCE_FACT` + `HUMAN_ORIGINAL`；AI 摘要 = `AI_INFERENCE` + `AI_GENERATED`。
    - **與 HCI 一致**：HCI 已決定棄用自己半成品的四級 ladder 改用同一套（`09:74-77`）。KB 也用 → 三個系統同一詞彙，即 §決策 2「整合不衝突」在標記軸上的落實。
    - ⚠️ **取用來源的精確界線**（ADR-0013 明訂）：`Projects/shared/contracts/kernel/` **只 re-export `epistemic_type` 這一個 enum**；`authorship_state`、`locked`、複合的 `provenance_record` **刻意不進 kernel**，屬各產品層的延伸。因此 KB 取 `epistemic_type` 自 kernel（釘版本），另兩軸直接引 `specs/governance/epistemic-label.schema.yaml`。**不得**因為「都在同一個 schema 檔」就假設三軸都由 kernel 提供。

21. **`locked` 軸必須實作，不是可選**。真實故障：操作者手寫一份權威版政策放進 KB，爬蟲下次抓到官網舊版**把它覆蓋掉**——無錯誤、無告警。`locked != null` 的內容**自動化一律不得改寫或重新版本化**（EC §57）。約束沿用 schema：`LOCKED_FACT` 僅在 `epistemic_type == SOURCE_FACT` 合法，`LOCKED_DECISION` 僅在 `DECISION` 合法。

22. **提升路徑用機械閘，不用散文**。前版把「不可信內容不得靜默變成權威」寫成散文——**擋不住任何東西**。改為沿用 schema 的 `promotion_redline`：`forbidden_transition: "UNKNOWN -> SOURCE_FACT (direct)"`＋`legal_paths`＋`each_legal_path_must_record`。KB 的 ingest／更新路徑必須對每次 `epistemic_type` 變更驗證該規則，違反即拒絕寫入。

23. **檢索必須可重播；不可重播時給明確終端狀態**。Cognitive OS 每次執行保存 method 版本/hash、workflow 版本、模型細節、policy 版本，並定義 `REPLAY_UNAVAILABLE` 為**與成功重播不同的終端狀態**（模型被廠商下架時，`09:41`）。
    - **`as_of_time`（§決策 16）只解決內容版本，不解決管線版本**：embedding 模型、chunker、排序參數都會變。
    - KB 每次 `search()` 產出 `retrieval_manifest`：`{query, as_of, scope, spaces, embed_model+version, chunker_id+version, ranker_params, domain_pack_version}`。
    - 重播時任一元件版本已不可得 → 回 `REPLAY_UNAVAILABLE`，**絕不靜默用現行版本替代**（同 `09:41` 的「never silently substitute forbidden models」，該規則明訂亦適用於重播）。
    - **為何現在**：`retrieval_manifest` 不在當下記就永遠重建不了。這是稽核／爭議／合規客戶的入場券。

24. **可插拔元件走 contract 形狀**（取自 `methods/contracts/*.contract.yaml`）。每個 chunker／extractor／ranker 一份 contract：`id`、`version`（semver）、`status`、`source_of_truth_for`（明列它是哪些文件的 SSOT）、`decided_by`（指向 ADR，或明寫「無 ADR 管轄」）、`invariants`。
    - 好處：chunk 記得住是哪個版本切的（餵 §決策 23 的重播）；行為不能靜默替換；`source_of_truth_for` 防文件漂移。
    - 並比照其 `contract-backlog.yaml` 建 registry，追蹤哪些 pack／contract 完整、哪些仍缺。

## 開放項的處置（2026-09-10 操作者授權代決）

| 項目 | 處置 | 依據 |
|---|---|---|
| KB 與 Collection 是一個還是兩個系統 | **兩個**。各自一份執行計畫，本 ADR 定義邊界 | 獨立性測試雙向皆通過（見 §需跟進文件） |
| `sink/hci-*` 放哪一側 | **HCI 側，且非選項**——ADR-0029 要求 fetch 在 HCI 隔離 runner 執行，sink 必然跟著 | §決策 15c |
| 要不要先做 `lib/kb/` 拆分 | **要**，且是 K0（第一步）。不做則 Collection 會對著混雜模組寫，欠一次重工 | §決策 3 |
| 租戶樹何時立 ADR | **現在不立**。KB 用 scope chain 預留、零改動成本。**觸發條件**：第一個有部門結構的客戶，或開始按節點計費 | §決策 13 |

## 後果

### 正面

- 銜接第 N 個系統的成本 = 寫一個 sink 積木，不動既有任何東西。
- 合規邊界不被跨越：hci30 的 append-only + crypto-shredding 保證維持完整。
- 「資料不衝突」有可驗證的定義（§決策 2），不是口號。
- KB 成為產品的路徑明確且零重工（§決策 3）。
- 靜默劣化有偵測點（品質閘 + dirty 上報），非事後才發現 RAG 變笨。

### 負面／代價

- **P1 成本高於本 ADR 前版所述**：非「0 表 0 服務」。需 1 個小 migration ＋ 改 3 個既有檔（`db.ts`／`rag.ts` 的版本化簽名、`cs_match_chunks` 的檢索端過濾）。前版低估來自「版本化已存在」的錯誤事實宣告，已更正。
- 編排器是唯一「非積木」的共用碼，是單點；以小體積與高測試覆蓋換取。
- `lib/cs/` → `lib/kb/` 的搬移動到已上線模組（純搬移、零行為變更，但需完整回歸）。
- 同一 URL 可能被兩個 sink 各抓一次（§決策 11 的已知代價）。
- 跨專案共用積木需 HTTP 邊界，因無 workspace。引入 workspace 會動到生產應用 build/deploy，爆炸半徑更大，不做。

### 需跟進文件／腳本

- [`docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md`](../../knowledge-base/KNOWLEDGE_BASE_PLAN.md)（**KB 產品**執行正本：對外四能力、**檢索六謂詞**、版本語意、Domain Pack、K0–K4）
- [`docs/data-collection/DATA_COLLECTION_PLAN.md`](../../data-collection/DATA_COLLECTION_PLAN.md)（**蒐集系統**執行正本：積木契約、編排器、品質閘、C0–C5）
- 兩份為**兩個獨立系統**（獨立性測試：KB 沒有 Collection 能活——今天靠人工上傳在跑；Collection 沒有 KB 能活——`sink/signal`／`sink/hci-discovered` 都不碰 KB）。本 ADR 定義兩者的**邊界**，故不拆。
- `docs/architecture/decisions/ADR_INDEX.md`（本 ADR 入表；`scripts/verify-adr-index.ps1` 機械強制）
- `lobster-factory/.../lib/content/blocks/README.md`（積木契約 SSOT；本 ADR 新增第三個 registry，需在該檔說明關係）
- 若開 `/api/collect/*`：`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md` + `workflow-risk-matrix.json` + `docs/ROUTING_MATRIX.md`（三件套同 PR）

## Related

- ADR 004（耐久編排 Trigger.dev；§決策 5/9 服從之）
- ADR 006（租戶鍵 + RLS 原則；§決策 8 為其在「多個租戶宇宙並存」下的延伸）
- ADR 010（WP Site Contract 五層 registry/contract/reconciler；同一分層思路）
