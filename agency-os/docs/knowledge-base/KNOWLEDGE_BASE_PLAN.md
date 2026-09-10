# 知識庫（KB）執行計畫 — 產品本體

> 決策與理由：[ADR 011](../architecture/decisions/011-collection-ingestion-boundary.md)。本檔只寫「怎麼做」。
> **姊妹檔**：[資料蒐集計畫](../data-collection/DATA_COLLECTION_PLAN.md)（餵料管道之一，是 KB 的**消費者**不是 KB 的一部分）。
> 兩檔為**兩個獨立系統**：KB 沒有 Collection 也能活（今天就靠人工上傳在跑）；Collection 沒有 KB 也能活（`sink/signal`、`sink/hci-discovered` 都不碰 KB）。

## §0 現況實據

| 事實 | 位置 | 影響 |
|---|---|---|
| KB 唯一對外入口（已有模組邊界，抽取起點） | [cs/index.ts:1-23](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/index.ts) | K0 純搬移可行 |
| **`insertSource()` 無參數可寫 `doc_family_id`/`source_version`/`status`** | [cs/db.ts:231-251](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts) | 版本化**未接線** |
| **`insertChunks` 硬編 `doc_family_id: r.sourceId`、`source_version: 1`** | [cs/db.ts:273-274](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/db.ts) | 兩表 family 語意**已分岔**，且無查詢會報錯 → 最易靜默留下的債 |
| 版本化欄位存在但全 repo 無人讀寫（死欄位） | [0051:55-70](../../../lobster-factory/packages/db/migrations/0051_cs_core.sql) | 「重用既有機制」不成立，須實作 |
| 唯一刪除路徑刪的是**整個 source 列**（chunk 靠 FK cascade） | `deleteKnowledgeSource()`，cs/db.ts:129-134 | 拿它換版 = 版本歷史當場被毀 |
| **檢索端無 status/version/space 過濾**（向量與關鍵字**兩半都沒有**） | [0051:209-214](../../../lobster-factory/packages/db/migrations/0051_cs_core.sql)、cs/db.ts:323-340 | 換版需同時改檢索端；兩半謂詞不一致 = 跨租戶洩漏路徑 |
| 三處邏輯專門消滅零 chunk 的 ghost source | [cs/rag.ts:130-136,150-154,156-159](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/cs/rag.ts) | 「不合格標 `dirty`」不能寫進這張表 |
| `listKnowledgeSources()` 的 select **未取 `status`** | cs/db.ts:99-126 | UI 看不到 dirty/archived |
| `cs_ai_replies.retrieved_chunk_ids` 是**無 FK 的 uuid 陣列** | 0051:172 | 實體刪 chunk 會讓稽核鏈懸空 → 只標 `archived`，不刪 |
| RLS = service_role only（DB 層無跨租戶兜底） | 0051:217-234 | 任何漏寫租戶過濾的語句都無防護網 |
| `organizations` **無 `parent_id`**，租戶是平的 | [0001_core.sql:3-14](../../../lobster-factory/packages/db/migrations/0001_core.sql) | 層級式租戶不存在 → 用 scope chain 預留 |
| 規格側已有 `CAP-KNOWLEDGE-BASE`，且 `CAP-DOC-TEMPLATES` `requires` 它 | `System_Foundry_v1.6_ARTIFACT_COMPLETE/capabilities/catalog.json:1380` | 本 KB 即該能力的實作，接得上 |
| ADR-0013 已指定 `TenantContext`/`SourceRef` 抽入 `Projects/shared/kernel` | `HCI_AI_LEGO_Blueprint_v2/09:63` | KB 的租戶型別**須對齊該 kernel**，不得長期並存第二套 |

## §1 產品契約

### 1.1 對外能力（僅四項）

```ts
// lib/kb/index.ts — 唯一對外入口
ingest(doc: KbDoc, ctx): Promise<{ docId, version, chunks }>
search(query: string, ctx): Promise<Passage[]>   // 回傳證據，帶引用與 trust
get(docId: string, version?: number): Promise<KbDoc>
archive(docId: string, ctx): Promise<void>
```

**沒有 `answer()`**、沒有 guardrail、沒有 intent 分類、沒有 autonomy 等級、沒有對話狀態（ADR §決策 12）。
**理由**：學術／內訓／業務／客服要的**答案形式**互不相容，要的**證據**是同一種。混進答案層 = 這個 KB 只能賣給客服。

```ts
interface Passage {
  text: string;
  docId: string; version: number;
  citation: { url: string; title: string; page?: number; section?: string; charOffset?: number; retrievedAt: string };
  provenance: ProvenanceRecord;   // 見 §1.4 —— 沿用既有 canonical schema，非自創
  score: number;
}

/** SSOT: agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/specs/governance/epistemic-label.schema.yaml
 *  （ADR-004 ACCEPTED）。KB **不得**自行定義此三軸。 */
interface ProvenanceRecord {
  epistemic_type: "SOURCE_FACT" | "EVIDENCE" | "ASSUMPTION" | "HYPOTHESIS" | "AI_INFERENCE"
                | "AI_SUGGESTION" | "HUMAN_OPINION" | "CALCULATED_RESULT" | "SIMULATED_RESULT"
                | "UNKNOWN" | "DECISION";
  authorship_state: "HUMAN_ORIGINAL" | "AI_GENERATED" | "AI_SUGGESTED"
                  | "HUMAN_EDITED" | "HUMAN_APPROVED" | "SOURCE_QUOTATION";
  locked: null | "LOCKED_FACT" | "LOCKED_DECISION";
}
```

`search()` 同時回傳 `retrieval_manifest`（§1.7），供重播。

### 1.2 檢索謂詞（**六維度**，定型後不再變）

> 前版寫「四維度」是**錯的**（ADR §決策 16 已更正）。少了時間與模型兩軸，事後補要改 RPC 簽名 + 全部呼叫端 + 可能重建索引。

```sql
CREATE OR REPLACE FUNCTION public.cs_match_chunks(
  p_scope     uuid[],       -- 租戶繼承鏈（集團→公司→部門→個人；自用亦為普通節點）
  p_spaces    uuid[],       -- 知識空間（學術／內訓／業務／客服）
  p_viewer    uuid,         -- 檢視者節點，用於敏感判定
  p_as_of     timestamptz,  -- 以哪個時點的知識回答；NULL = now()
  p_model     text,         -- embedding 模型；跨模型比距離無意義
  p_embedding vector(1536),
  p_limit     int DEFAULT 8
) ...
WHERE c.organization_id = ANY(p_scope)
  AND c.space_id        = ANY(p_spaces)
  AND s.status          = 'active'
  AND (NOT s.is_sensitive OR c.organization_id = p_viewer)
  AND s.valid_from     <= COALESCE(p_as_of, now())
  AND (s.valid_to IS NULL OR s.valid_to > COALESCE(p_as_of, now()))
  AND c.embed_model     = p_model
  AND c.embedding IS NOT NULL
```

| 維度 | 規則 |
|---|---|
| **scope chain** | 今日呼叫端傳 `[orgId]`（長度 1）；租戶樹落地後傳整條鏈，**KB 零改動**。繼承**只向下**：部門看得到公司／集團，公司**看不到**自己部門的。上行或平行共享需顯式授權 |
| **space** | `space ≠ 既有 kind`。`kind ∈ ('doc','faq','sop','conversation','url')` 是**文件類型**，不得代用。業務查詢撈到學術論文是預設要擋掉的失敗 |
| **status** | 版本與 tombstone。舊版標 `archived` 排除檢索，**不實體刪除**（`retrieved_chunk_ids` 無 FK，實體刪會讓稽核鏈懸空） |
| **sensitive** | `is_sensitive` 欄位**已存在**，用它擋向下繼承 |
| **as_of（時間）** | 法規／政策／規格／SOP／價目表全部有生效期；客戶真正會問「**當時**是怎樣」（稽核、爭議、追溯、保固認定）。`valid_from`/`valid_to` **不在入庫當下記就永遠推不回來**。**不重新發明 bitemporal**：沿用 hci30 `0005_wave1_bitemporal_history_up.sql` + `hci.mark_superseded()` 的模式 |
| **embed_model** | `embedding` 是寫死的 `vector(1536)` 配**單一** HNSW。維度不同的模型**存不進去**；同維度不同模型**存得進去但距離不可比** → 檢索靜默劣化、無錯誤無告警。**必須進謂詞且分索引**（partial index per model）。混進同一索引後只能全部重嵌 |

### 1.2b 可插拔的 chunker 與 embedder（ADR §決策 19）

```ts
interface Chunker { id: string; chunk(doc: KbDoc, opts): Chunk[] }      // 法條按條、論文按章、SOP 按步驟、程式碼按函式
interface Embedder { id: string; dims: number; embed(texts: string[]): Promise<number[][]> }
```

選擇來自 Domain Pack 的 `doc-types.json`（§1.6），不寫死在引擎。
**為何現在留槽**：幾乎零成本；事後換切法 = **全部重嵌**。

### 1.2c 文件關係（新表，小而必要）

```sql
CREATE TABLE kb_document_relations (
  organization_id uuid NOT NULL,
  from_doc uuid NOT NULL, to_doc uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supersedes','translates','cites','retracts','amends')),
  PRIMARY KEY (organization_id, from_doc, to_doc, kind)
);
```

沒有它就會端出**已廢止的法規、已撤稿的論文、已停產的型號**——這是正確性 bug 不是功能。`retracts` 指向的文件必須自動排除檢索。

### 1.2d 結構性矛盾偵測（ADR §決策 18）

比照 System Foundry `rules/conflict-rules.json` 的 `if_all → code + message` 宣告式形狀。

| KB **做**（機械可判） | KB **不做** |
|---|---|
| 同一 `canonical_url` 有兩份 `active` | 兩份文件對同一主題給相反答案 |
| `valid_from`/`valid_to` 區間重疊 | ↑ 屬語意判斷 → hci30 `HCI_CONTRADICTION_SPEC.md` / cognitive-os |
| `supersedes` 鏈斷裂或成環 | KB 越界做這件事 = 在最弱的層做最需要領域知識的判斷 |
| 被 `retracts` 指向者仍可檢索 | |

**租戶過濾留在函式內**（既有設計性質，`0051:199-201`：呼叫端無法跨租戶）。
**關鍵字半邊（`matchChunksKeyword`）必須套用同一組謂詞**——兩半不一致 = 「向量查不到但關鍵字查得到」的跨租戶洩漏路徑。

### 1.3 版本語意

- `doc_family_id = uuidv5(NS, organizationId + "|" + canonicalUrl)`。**必須含 org**：兩個 organization 抓同一公開 URL 會得到相同 family uuid，未來任何「刪掉這個 family 的舊版本」漏寫 org 過濾就是跨租戶刪除，而 RLS 是 service_role only → **DB 層沒有兜底**。NS 常數寫死程式碼，不可從 env 取。
- `insertChunks` 的 family **改為繼承 source 列**，不再用 `sourceId`。
- **換版順序：先插新 → 確認 `chunks > 0` → 再標舊版 `archived`**。反過來若 embedding 中途失敗，`rag.ts:157` 會回滾新 source → **該文件的 KB 內容歸零**（supabase-js 無交易，順序是唯一保護）。

### 1.4 出處標記與不可信內容（ADR §決策 20/21/22）

**不自創詞彙**：三軸沿用 `specs/governance/epistemic-label.schema.yaml`（ADR-004 ACCEPTED）。該檔存在的理由就是同一概念曾在四份文件長出四套不相容詞彙；前版的 `trust` 三值是**第五套**，已撤回。HCI 也已決定改用同一套（`09:74-77`）→ 三系統同詞彙。

| 情境 | `epistemic_type` | `authorship_state` |
|---|---|---|
| 外部網頁／PDF 抓取 | `EVIDENCE` | `SOURCE_QUOTATION` |
| 操作者手寫 SOP／政策 | `SOURCE_FACT` | `HUMAN_ORIGINAL` |
| AI 產生的摘要／改寫 | `AI_INFERENCE` | `AI_GENERATED` |
| 廠商規格書聲稱值 | `EVIDENCE`（**不是** `SOURCE_FACT`） | `SOURCE_QUOTATION` |

> 廠商官網只能證明「該公司**做過此聲明**」，不能證明聲明為真（同 HCI `06:166`）。把它標成 `SOURCE_FACT` 是把行銷文案當事實。

**`locked` 軸（ADR §決策 21）**——真實故障：操作者手寫權威版政策入庫，爬蟲下次抓到官網舊版**把它覆蓋掉**，無錯誤無告警。`locked != null` 的內容**自動化一律不得改寫或重新版本化**。約束沿用 schema：`LOCKED_FACT` 僅在 `SOURCE_FACT` 合法、`LOCKED_DECISION` 僅在 `DECISION` 合法。

**提升路徑是機械閘不是散文（ADR §決策 22）**：

```yaml
forbidden_transition: "UNKNOWN -> SOURCE_FACT (direct)"
legal_paths:
  - "UNKNOWN -> (via Compute producing evidence) -> EVIDENCE"
  - "UNKNOWN -> (via Human Validation) -> SOURCE_FACT"
each_legal_path_must_record: [authorship_state, execution_manifest_entry]
```

ingest／更新路徑對每次 `epistemic_type` 變更驗證此規則，違反即**拒絕寫入**。

**消費端契約**（KB 契約的一部分，非建議）：
- `Passage.provenance` 缺失即視為契約違反。
- 消費者把 `SOURCE_QUOTATION` 的段落放入提示時**必須包裹**（分隔標記 + 明示 untrusted data），**不得**與系統指令直接串接。
- 消費者必須做 output-schema 驗證，不接受自由文字。
- 掃描與標記在**餵料側**做（見[資料蒐集計畫 §1.3b](../data-collection/DATA_COLLECTION_PLAN.md)）；KB 只負責忠實傳遞不遺失。

### 1.7 檢索可重播（ADR §決策 23）

`as_of_time`（§1.2）只解決**內容**版本；embedding 模型、chunker、排序參數也會變。沒有這節，「三月時 AI 為什麼那樣答」永遠答不出來——那是稽核／爭議／合規客戶的入場券。

```ts
interface RetrievalManifest {
  query: string; as_of: string | null;
  scope: string[]; spaces: string[];
  embed_model: string; embed_version: string;
  chunker_id: string; chunker_version: string;
  ranker_params: Record<string, unknown>;
  domain_pack: string; domain_pack_version: string;
  executed_at: string;
}
```

重播時任一元件版本已不可得 → 回 **`REPLAY_UNAVAILABLE`**（與成功重播不同的終端狀態），**絕不靜默用現行版本替代**（同 `09:41`：never silently substitute forbidden models，該規則明訂亦適用於重播）。

### 1.8 可插拔元件的 contract 形狀（ADR §決策 24）

每個 chunker／extractor／ranker 一份 `*.contract.yaml`，形狀取自 `methods/contracts/`：

```yaml
$id: "kb://contracts/chunker.legal_article.contract.yaml"
id: chunker.legal_article
version: "1.0.0"
status: ACTIVE
source_of_truth_for: ["domains/legal-tw/doc-types.json 的 statute 切法"]
decided_by: "無 ADR 管轄；由 domain pack 擁有"
invariants:
  - "每個 chunk 恰好對應一個條文編號"
  - "條文編號不得跨 chunk 斷裂"
```

`version` 進 `RetrievalManifest`（§1.7）→ chunk 記得住是哪個版本切的。行為不得靜默替換。
並比照 `contract-backlog.yaml` 建 registry，追蹤哪些 pack／contract 完整、哪些仍缺。

### 1.6 Domain Pack（產業承載機制，ADR §決策 17）

模式取自 System Foundry（`industries/REGISTRY.json` + `industries/<slug>/` 同構目錄）。**加第 N 個產業 = 加一包 + registry 一筆，引擎零改動。**

```
domains/REGISTRY.json          ← 明寫每個檔的路徑；沒有就寫 null，不做靜默 fallback
domains/<slug>/
  vocabulary.json              同義詞／縮寫消歧（PT = physical therapy vs prothrombin time）
  doc-types.json               文件型別 → 指定 chunker（§1.2b）與引用形狀
  authority-tiers.json         來源權威階梯（法規 > 期刊 > 廠商規格書）
  temporal-rules.json          時間語意（法規用生效日、產品用型號世代、論文用撤稿狀態）
  collect-sources.json         預設來源清單（由蒐集系統消費）
  conflict-rules.json          結構性矛盾規則（§1.2d）
  baseline.json                已知良好設定；新客戶從基線開，不從零開
```

- **`authority-tiers` 不得與 HCI 的 S1-S6 互相引用**（ADR §決策 14 的命名紀律）。
- 比照 `tests/test_industries.py` 建**機械閘**驗證每包完整（必填檔存在、規則引用的 doc-type 真的存在），防半殘的包混進來。
- **不抄的**：System Foundry 是**產生器**（問卷→藍圖）；KB 是**執行期系統**，不得做成問卷驅動。

### 1.5 schema 變動（K1）

```sql
ALTER TABLE public.cs_knowledge_sources
  ADD COLUMN IF NOT EXISTS canonical_url text,
  ADD COLUMN IF NOT EXISTS content_hash  text,
  ADD COLUMN IF NOT EXISTS space_id      uuid,
  ADD COLUMN IF NOT EXISTS valid_from    timestamptz,   -- 生效（時間軸，補不回來）
  ADD COLUMN IF NOT EXISTS valid_to      timestamptz,   -- 失效／被取代
  ADD COLUMN IF NOT EXISTS language      text,
  ADD COLUMN IF NOT EXISTS doc_type      text,          -- 餵 chunker 與引用形狀
  ADD COLUMN IF NOT EXISTS authority_tier text,         -- 來源權威（Domain Pack 定義）
  ADD COLUMN IF NOT EXISTS domain_pack   text;          -- 屬於哪個產業包
ALTER TABLE public.cs_knowledge_chunks
  ADD COLUMN IF NOT EXISTS space_id      uuid;

CREATE INDEX IF NOT EXISTS idx_cs_sources_canonical ON public.cs_knowledge_sources(organization_id, canonical_url);
CREATE INDEX IF NOT EXISTS idx_cs_sources_hash      ON public.cs_knowledge_sources(organization_id, content_hash);
CREATE INDEX IF NOT EXISTS idx_cs_sources_valid     ON public.cs_knowledge_sources(organization_id, valid_from, valid_to);
CREATE INDEX IF NOT EXISTS idx_cs_chunks_scope      ON public.cs_knowledge_chunks(organization_id, space_id);
-- 每個 embedding 模型一個 partial HNSW（跨模型距離不可比，不得同索引）
CREATE INDEX IF NOT EXISTS idx_cs_chunks_hnsw_te3s  ON public.cs_knowledge_chunks
  USING hnsw (embedding vector_cosine_ops) WHERE embed_model = 'text-embedding-3-small';
```

＋ §1.2c 的 `kb_document_relations` 新表。

- 全部可為 null → 既有列不受影響、**不需 backfill**（null space = 預設空間；null `valid_from` 視為「自始有效」）。
- **刻意不加 unique index**：版本化下同一 `canonical_url` 會有多列（不同 `source_version`），加 unique 會在寫第二版時炸。
- **`embedding` 仍固定 `vector(1536)`**：換維度的模型需另開表或改欄型，屬 K4 範圍，此處只先讓**同維度多模型**不互相汙染。
- Down：`DROP INDEX` ×5 + `DROP COLUMN` ×9 + `DROP TABLE kb_document_relations` + 還原 `cs_match_chunks` 舊簽名。
- **六個維度現在加是一次 migration；事後加是重建 HNSW ＋ 回填 ＋ 改全部呼叫端，而 `valid_from` 根本回填不了。**

## §2 階段

| K | 交付的價值 | 內容 | DoD（缺一不算） | Rollback |
|---|---|---|---|---|
| **K0** | 產品化前提：知識庫不再與客服邏輯綁死 | `lib/cs/` 拆為 `lib/kb/`（rag/db 的 knowledge 部分）＋ `lib/cs/`（intent／autonomy／guardrail／eval）。**純搬移、零行為變更** | `npx tsc --noEmit` 綠；cs 既有測試全綠；`lib/kb/index.ts` 為唯一對外入口（grep 確認無人繞過）；ops 路由行為不變（真跑 ingest + retrieve 比對前後輸出） | `git revert`（純搬移） |
| **K1** | **版本化真的會動 + 檢索契約一次定型** | 修 `insertSource`／`insertChunks` 簽名；chunk family 改繼承 source 列；§1.5 migration；`cs_match_chunks` 改**六謂詞**（§1.2）；`matchChunksKeyword` 套**同一組**謂詞；換版改「先插後標 archived」 | 同文件改內容 → 產生第二版且**舊 chunk 確實不再被檢索到**（用**查詢**驗證，非只看 insert）；先插後刪順序實測（模擬 embedding 失敗，確認舊版仍在）；**scope chain 傳兩節點時只回鏈上的**；**`is_sensitive` 不向下繼承**（實測）；**向量半邊與關鍵字半邊可見範圍一致**（同一 query 兩半 source 集合比對）；cs 既有 eval golden set（`cs_eval_cases`）未退步；migration down 實測可逆 | down migration + revert |
| **K2** | 多用途不互相汙染 + 學術級引用 | space 管理 API；引用錨點（`page`／`section`／`charOffset`）寫入 chunk metadata；`Passage.citation` 回傳；`listKnowledgeSources` 補 `status` 欄位 + UI 顯示 | 同一租戶下建兩個 space，交叉查詢**互不可見**（實測）；PDF 進來後 `search()` 回傳的 citation 含正確頁碼（開原文核對）；dirty/archived 在 UI 看得到 | 移除 space 過濾（退回單空間） |
| **K2b** | **答得出「當時是怎樣」**；不再端出已廢止內容 | `valid_from`/`valid_to` 寫入 + as-of 檢索；`kb_document_relations`（§1.2c）；結構性矛盾偵測（§1.2d） | 同一文件兩個生效期版本，`p_as_of` 指到過去**回傳舊版**、指到現在回傳新版（實測）；`retracts` 指向的文件**查不到**；刻意造一組區間重疊 → 矛盾偵測**實際觸發並上報**（非只寫 log） | 移除 as-of 謂詞（退回 always-now） |
| **K2c** | 一套引擎吃多產業 | Domain Pack 機制（§1.6）+ registry + 完整性機械閘；chunker/embedder 可插拔槽（§1.2b） | 建**兩個** pack（如 `general` + 一個真實產業），同一份文件在兩包下**切法不同、引用形狀不同**（實測）；故意造一個缺檔的 pack → 機械閘**擋下**；`domains/REGISTRY.json` 中的 `null` 不觸發靜默 fallback（實測） | 刪 pack 目錄，退回單一預設設定 |
| **K2d** | 知識變動能驅動流程，不用輪詢 | KB 事件輸出：`kb.document.ingested` / `.superseded` / `.archived` / `.conflict_detected` | 一次真實 ingest 觸發事件且**至少一個訂閱者收到**（實測，非只發不收） | 停發事件 |
| **K2e** | **出處說得清楚 + 手寫權威不被覆蓋** | `provenance_record` 三軸（§1.4）；`locked` 執行期強制；`promotion_redline` 機械閘 | 抓來的內容標成 `EVIDENCE`+`SOURCE_QUOTATION`（非 `SOURCE_FACT`）；標 `LOCKED_FACT` 的文件**被爬蟲重抓時未被改寫**（實測，非閱讀程式碼推論）；嘗試 `UNKNOWN → SOURCE_FACT` 直接提升**被拒絕寫入**；`LOCKED_FACT` 配非 `SOURCE_FACT` 的 `epistemic_type` 被 schema 擋下 | 移除三軸（退回無標記） |
| **K2f** | **答得出「當時為什麼那樣答」**——稽核／爭議客戶的入場券 | `retrieval_manifest`（§1.7）；replay API；`REPLAY_UNAVAILABLE` 終端狀態；chunker/ranker contract + version（§1.8） | 同一 query 用同一 manifest 重播**得到相同結果集**（實測）；刻意移除某個 chunker 版本後重播回 **`REPLAY_UNAVAILABLE`** 而**非**靜默用現行版本（這條是本階段的重點） | 停寫 manifest |
| **K3** | 可計費 | 依 [ADR 012](../architecture/decisions/012-shared-platform-layer.md) 接共用計費 substrate：宣告 meters（查詢次數=flow／embedding token=flow／文件數=flow／**儲存量=stock**）、`limit_kind` 全為 `QUOTA`、驗證 `entitlement_ref`、回報簽章用量記錄。**不自建帳本** | 四個 meter 數字對得起來；**儲存量以 stock 形狀計提**（非事件流）；產品登記機械閘綠；**未直讀控制面資料表**（ADR-0002） | 停寫計量 |
| **K4** | 可被非 TS 消費者使用（Python／外部客戶） | `lib/kb/` 抽成獨立服務 + HTTP 契約 + API key 鑑權 | **僅在出現第二個真實消費者時啟動**；既有 cs 改打網路版後行為不變（eval golden set 比對） | 退回同 process 呼叫 |

**K4 的啟動條件（不是時間，是事件）**：出現對外產品客戶、或 cognitive-os 真的需要檢索。在那之前抽取只會把還沒驗證的契約凍進網路邊界。

## §3 已代決（可推翻）

| # | 決定 | 推翻成本 |
|---|---|---|
| 1 | **先做 K0 拆分才做其他**（含 Collection 的 C1） | 中。可跳過，但 KB 產品化會欠一次重工，且 Collection 會對著混雜的模組寫 |
| 2 | 先模組化 → 修正確性 → **最後**才服務化（K4） | 高。反序 = 把未接線的版本化搬到網路邊界後面再修 |
| 3 | 租戶樹**不在本計畫建**，KB 只用 scope chain 預留 | 低（KB 端零改動）。租戶樹另立 ADR，**觸發條件**：第一個有部門結構的客戶，或開始按節點計費 |
| 4 | 舊版標 `archived` 不實體刪除 | 低。實體清理另立保留政策 |
| 5 | `space` 為獨立欄位，不重用 `kind` | 低 |

## §4 風險

| 風險 | 緩解 |
|---|---|
| `lib/cs/` 搬移動到已上線模組 | 純搬移零行為變更 ＋ 前後真跑比對 ＋ 可 `git revert` |
| 改 `cs_match_chunks` 影響線上客服檢索 | migration 含 down；改動後跑 `cs_eval_cases` golden set 驗證答題品質未退 |
| 兩表 family 語意分岔且無查詢會報錯 | K1 DoD 要求跨表比對 family 值一致（實查，非推論） |
| 實體刪 chunk 讓 `retrieved_chunk_ids` 懸空 | 只標 `archived`，不刪 |
| 消費者忘記包裹 untrusted passage | `trust` 為契約必填；K2 加一個「未包裹即拒絕」的消費端 lint／執行期檢查 |
| 租戶型別與 `shared/kernel` 的 `TenantContext` 長期並存兩套 | kernel 落地時對齊為**同一型別**（ADR §決策 15d），不做適配器長期共存 |
