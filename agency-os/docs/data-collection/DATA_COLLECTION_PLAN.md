# 資料蒐集執行計畫 — collect / sink 積木 + 編排器

> 決策與理由：[ADR 011](../architecture/decisions/011-collection-ingestion-boundary.md)。本檔只寫「怎麼做」。
> **姊妹檔**：[知識庫計畫](../knowledge-base/KNOWLEDGE_BASE_PLAN.md)。KB 是本系統的**消費者之一**，不是本系統的一部分。
> 兩檔為**兩個獨立系統**：Collection 沒有 KB 也能活（`sink/signal`、`sink/hci-discovered` 都不碰 KB）；KB 沒有 Collection 也能活（人工上傳，今天就在跑）。
> 本版已納入一次獨立 critic 攻擊的 8 個發現 ＋ 與 HCI-30 既有規格的對帳。

## §0 現況實據

| 事實 | 位置 |
|---|---|
| 既有積木 registry：`run` 是**單參數**、`ContentBlock` **無 `match`** → collect/sink 塞不進去 | [registry.ts:26-34](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts) |
| 「同一套契約、多個 registry」的既有慣例（自承） | [registry.ts:10-12](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/blocks/registry.ts) |
| `BlockKind` union 全 repo **僅一處定義** | registry.ts:18 |
| 既有 Signal 積木（已上線，本計畫**不碰**） | [trending-sources.ts](../../../lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/trending-sources.ts) |
| SSRF 閘：只驗字面 host | `isSafePublicHttps()`，trending-sources.ts:72-87 |
| **`safeFetchText()` 未設 `redirect:"manual"`** → 302 可繞過 SSRF 閘 | trending-sources.ts:92-95 |
| Evidence 溯源模型（append-only + FORCE RLS） | [0004:117-126,179-181](../../../Projects/internal/hci30/database/migrations/0004_wave1_source_provenance_up.sql) |
| **`hci.sources.source_ref` 無 unique 約束** → 以 URL upsert 需另一個 hci migration | `0001_wave1_synthetic_up.sql:94` |
| hci schema 有 table-inventory drift 檢查（加表會被擋） | 0004:93-108, 205-220 |
| hci30 自承缺自動 ingestion | [server.mjs:52-57](../../../Projects/internal/hci30/app/server.mjs) |
| 耐久編排歸屬 Trigger.dev | [ADR 004:13](../architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md) |
| **ADR-0029**：HCI fetch 須跑網路隔離 runner，Trigger.dev **不得執行對外 fetch** | `HCI_AI_LEGO_Blueprint_v2/06:91` |
| **ADR-0026**：HCI Source/SourceSnapshot **禁止 record-level 去重** | `06:202` |
| HCI raw 內容**不得**進 Postgres text/bytea，須 object storage | `06:302` |
| 「Raw web result **must never** automatically become formal HCI Evidence」 | `06:215` |
| 無 workspace（跨專案無法共用 TS） | `lobster-factory/package.json` 無 `workspaces`；hci30 無 `package.json` |

## §1 契約

### 1.1 型別

```ts
interface Target {
  uri: string;
  canonicalUri: string;               // 編排器在 push 前算好；frontier 去重鍵。積木不得自行產生
  scope: { hosts: string[]; pathPrefix?: string };  // 回灌邊界，繼承自 seed
  tier: number;                        // 已嘗試到策略階梯第幾階；降級時遞增
  hint?: string;
  depth: number;
  meta?: Record<string, unknown>;      // cursor / etag / 上一跳線索
}

/** Collection 的唯一輸出。無 id / organizationId / sourceId / quality — 那些不屬於積木。 */
interface RawDoc {
  uri: string;
  canonicalUrl: string;                // 由編排器提供的同一個正規化函式產生（ADR §決策 2）
  contentHash: string;                 // sha256(text)
  mime: string;
  title: string | null;
  text: string;
  raw: { bytes: Uint8Array; mime: string } | null;
  fetchedAt: string;
  publishedAt: string | null;
  collector: string;
  tenantRef: string;                   // 不透明；kernel 落地後對齊 TenantContext（ADR §決策 15d）
  meta: Record<string, unknown>;       // 含編排器蓋的 trust 標記（§1.3b）
}

interface CollectBlock {
  id: string; title: string; icon?: string; enabled?: boolean;
  /** 0 = 不處理；>0 = 可處理。編排器取全部 >0 的候選排序後**依序嘗試**（可降級）。 */
  match: (t: Target) => number;
  run: (t: Target, ctx: CollectCtx) => Promise<{ docs: RawDoc[]; discovered: Target[] }>;
}

interface SinkBlock {
  id: string; title: string; icon?: string; enabled?: boolean;
  /** 擁有租戶鍵與合規契約。可被多次呼叫（增量落地），必須冪等。 */
  run: (docs: RawDoc[], ctx: SinkCtx) => Promise<SinkReport>;
  finalize?: (seen: Set<string>, ctx: SinkCtx) => Promise<SinkReport>;  // tombstone 差集
}

/** 積木唯一可用的對外能力。禁止直接用全域 fetch（lint 規則強制）。 */
interface CollectCtx {
  fetch(url: string, opts?): Promise<Response>;  // 內含：SSRF 閘（每一跳重驗）、redirect:"manual"、
                                                 // robots、per-host 令牌桶、單次位元組上限、逾時
  canonicalize(url: string): string;             // 全系統唯一實作（ADR §決策 2）
  budget: { spend(n: BudgetUnit): void; ok(): boolean };
  tenantRef: string;
  log(msg: string): void;
}
```

`canonicalUrl` 與 `contentHash` 是唯二被下游當鍵用的欄位。

### 1.2 編排器（唯一非積木的共用碼）

```
run(seeds, { sink, budget, tenantRef, maxDepth, flushEvery }):
  frontier = load(runId) ?? seeds.map(withCanonicalAndScope)   // 可續爬
  seen = loadSeen(runId) ?? Set(); pending = []; report = {}

  while frontier.length && budget.ok():
    t = frontier.shift()
    if seen.has(t.canonicalUri) continue
    if !inScope(t) { report.outOfScope++; continue }
    seen.add(t.canonicalUri)

    candidates = collectRegistry.all().map(b => [b, b.match(t)])
                   .filter(([,s]) => s > 0).sort(desc).slice(t.tier)
    if !candidates.length { report.unhandled.push(t.uri); continue }

    for (block of candidates):                                  // 真的能降級
      try { r = await block.run(t, ctx) }
      catch (e) {
        if (retryable(e)) { requeueWithBackoff(t); break }       // 429/503/瞬斷
        if (permanent(e)) { report.gone.push(t.uri); break }     // 404 → 交 sink 做 tombstone
        continue                                                 // 抽取失敗 → 試下一階
      }
      graded = r.docs.map(d => [d, grade(d)])                    // 編排器算，不是積木自報
      if (graded.every(([,q]) => !q.ok) && hasNextTier) continue // 全不合格 → 升級策略再試
      for ([d,q] of graded) q.ok ? pending.push(stampTrust(d)) : report.dirty.push({uri:d.uri, ...q})
      frontier.push(...r.discovered.filter(x => x.depth < maxDepth && inScope(x)).map(withCanonical))
      break

    if pending.length >= flushEvery:                             // 增量落地，不是最後才寫
      await sink.run(pending.splice(0), ctx); persist(runId, frontier, seen)

  await sink.run(pending, ctx)
  return { ...await sink.finalize(seen, ctx), report }
```

編排器獨佔六個橫切面（積木一律不得自行處理）：**路由、預算、禮貌、去重、續傳、重試**。
**可成長性的誠實界定**：承諾是「加來源不需改路由邏輯」，不是「編排器永不變更」（ADR §決策 5）。

| 職責 | 要點 |
|---|---|
| 去重 | 鍵 = `canonicalUri`（正規化在 push 前完成）。**不是** `uri`——否則 `?utm_source=`／trailing slash／host 大小寫會讓同一頁被抓 3-10 次 |
| Scope | `discovered` 回灌前必過 `inScope`，預設 = seed 的 host + path prefix。**沒有這道閘，客戶官網頁尾的維基百科連結會被抓進客戶 KB** |
| 預算 | 迴圈頂檢查 **＋** 單次抓取的位元組／逾時上限（`ctx.fetch` 強制），否則一個 500MB endpoint 吃掉整個 run |
| 禮貌 | per-host 令牌桶，**跨 run 持久化**（ADR 011 §決策 9）。per-run 令牌桶在排程併行後等於無效，被封 IP 的是同時跑生產服務的那台機器。**分類為 `RATE_LIMIT`**（[ADR 012](../architecture/decisions/012-shared-platform-layer.md) §決策 1）——風險落在外部共用資源，**不得用加購點數解除** |
| 續傳 | frontier + seen 持久化。否則預算耗盡後下次從頭來，第 N+1 頁**永遠**抓不到（測試會綠，系統假死） |
| 重試 | 分類：429/503/瞬斷 → 退避重排；404/410 → 交 sink 做 tombstone；抽取失敗 → 降級下一階 |
| SSRF | `ctx.fetch` 設 `redirect:"manual"`，**每一跳重驗**。既有 `safeFetchText` 未設此項，爬蟲場景下 302 到 `169.254.169.254` 即繞過 |

`report.dirty` 只推 `{uri, reason, checks}`，**不推整個 `RawDoc`**（否則原始 bytes 進記憶體與 log）。

### 1.3 抽取品質閘（編排器計算，ADR §決策 7）

最危險的形態是**不丟例外**：把導覽列／cookie 橫幅／soft-404 當內容寫進 KB，無錯誤、無告警，RAG 答案逐步劣化。

| 檢查 | 判準 | 註 |
|---|---|---|
| 內容長度 | `utf8Bytes(text) ≥ 門檻`，門檻**依語言分設** | 中文 200 字元 ≈ 英文 130 詞。單一門檻會擋掉合法中文 FAQ、又放過英文樣板頁 |
| 文字密度 | `utf8Bytes(text) / utf8Bytes(raw.bytes) ≥ 門檻` | **分子分母必須同單位**。UTF-16 code unit ÷ UTF-8 byte 會讓中文 ratio 只有英文的 1/3 = 系統性誤傷中文 |
| `raw == null` 分支 | 明訂：跳過密度檢查，不視為不合格 | 不明訂會 `NaN >= x` → **全部**判不合格 |
| soft-404 | title/正文否定樣式 + canonical 自指檢查 | 回 200 OK 的「找不到頁面」+ 完整導覽，長度與密度都正常，是「導覽列當內容」的真實主因 |
| 樣板段落 | **C1 不做**。要做必須是 per-host 段落頻率表（編排器狀態，非積木） | 需跨頁比對；無狀態積木做不到。中文頁常被抽成無換行單段，「行」比例恆為 0 或 1 |

密度門檻的已知限制：Next.js/React 頁面 raw HTML 常含 1-2MB inline JSON，完美抽取也會落在 0.003。**不得為特定站台加豁免**（= AGENTS.md 明令禁止的「調門檻消音偵測器」）；正解是該站進 headless 階，或標記為「密度檢查不適用」的來源類型。

不合格 → 不寫入、進 `report.dirty` 並**觸發告警**（非只寫 log）。落點見 §2 註。

> **命名紀律**（ADR §決策 14）：本節是 **extraction quality**（抓到內文還是導覽列）。與 hci30 的 **evidence quality**（幾個獨立來源佐證，`HCI_EVIDENCE_QUALITY_SPEC.md`）是**兩個不同的軸**，不得互相引用門檻或詞彙。Collection 不得宣稱任何 evidence-quality 結論。

### 1.3b 不可信內容隔離（ADR §決策 15b；**產品級，非 HCI 專屬**）

抓回來的每一個位元組都是**對手可控**的。對手只要在自己控制的頁面種一段指令文字，就會被抓進 KB，再被客服／研究 AI 當 context 讀進提示——無錯誤、無告警。

| 層 | 要求 |
|---|---|
| 儲存 | 抽取文字**原樣**存，不預先改寫（改寫會破壞引用錨點與 hash） |
| 標記 | 編排器蓋 `RawDoc.provenance = { epistemic_type: "EVIDENCE", authorship_state: "SOURCE_QUOTATION", locked: null }`，**積木不得覆寫**。三軸定義沿用 `specs/governance/epistemic-label.schema.yaml`（ADR-004），**不自創詞彙**（ADR §決策 20）。抓來的東西一律是 `EVIDENCE`（來源**聲稱**過），**永不**是 `SOURCE_FACT` |
| 掃描 | 二次掃描指令樣態（`ignore previous`／`system:`／`<\|im_start\|>`／CSS 隱藏文字／零寬字元／異常長 base64）→ 命中即**不自動入庫**，進人工佇列 |
| 傳遞 | `trust` 隨 `RawDoc` 進 sink，KB 必須忠實保留到 `Passage.trust`（見[知識庫計畫 §1.4](../knowledge-base/KNOWLEDGE_BASE_PLAN.md)） |

**不自行重新推導威脅模型**：接 HCI 已分析過的同一威脅類別（`06:88` → AI LEGO `SECURITY_THREAT_MODEL.md` TB-1/T2/E4）。

### 1.4 觸發與增量（C3／C3b）

**兩種觸發，不是一種**：

| 觸發 | 適用 | 為何 |
|---|---|---|
| **排程**（Trigger.dev，ADR 004） | 內容會慢慢漂移的來源（官網、FAQ、目錄頁） | 週期性檢查即可 |
| **事件**（webhook 入口） | 法規發布、產品改版、公告——**這些是事件不是週期** | 輪詢在此類場景是錯的工具：不是太慢就是太吵 |

事件入口必須：鑑權（未知來源拒收）、冪等（同一事件重送不重複入庫）、只接受**已註冊 seed**（不接受 webhook 內夾帶任意 URL — 否則就是 SSRF 的新入口）。

**增量抓取語意**（`Target.meta` 的槽現在明訂）：

| 欄位 | 用法 |
|---|---|
| `etag` / `lastModified` | 帶 `If-None-Match` / `If-Modified-Since`；**304 即短路**，不重抓 body、不重算 embedding |
| `cursor` | API 型來源的分頁續傳（積木**內部**迴圈，不進 frontier —— 分頁不是新文件，塞進 frontier 會吃掉 depth 額度並被 `maxDepth` 靜默截斷） |
| `contentHash` | 即使拿到 body，hash 未變就不下傳給 sink |

整站每輪重抓在大來源上不可持續；三層短路（304 → hash → sink 跳過）缺一層成本就會爆。

**產業預設來源**：Domain Pack 的 `collect-sources.json`（見[知識庫計畫 §1.6](../knowledge-base/KNOWLEDGE_BASE_PLAN.md)）提供該產業的預設 seed 清單。新客戶從基線開，不從空白開。

## §2 Sink 對應

| Sink | 目的地 | 規則 |
|---|---|---|
| `sink/kb` | `lib/kb/ingest()` | 版本語意由 KB 擁有 → 見[知識庫計畫 §1.3](../knowledge-base/KNOWLEDGE_BASE_PLAN.md)。本系統只負責交付 `RawDoc` |
| `sink/hci-discovered` | `hci.sources` + `hci.source_snapshots`，**僅 `DISCOVERED` 階段** | **不產生 Evidence**（`06:215`）；raw 進 **object storage**，DB 只存 hash + `snapshot_ref`（`06:302`）；**禁止 record-level 去重**（ADR-0026）；fetch **必須**跑 HCI 自有隔離 runner（ADR-0029），**不得**用本系統的 `ctx.fetch`；限組織實體（ADR §決策 10） |
| `sink/signal` | 不落地，直接回傳呼叫端 | 無版本、無保存 |
| `sink/null` | 丟棄 | 乾跑。任何新 collect 積木先對它跑過 |

**`dirty` 的落點**：不進 `cs_knowledge_sources`（該表有三處邏輯專門消滅零 chunk 的 ghost source，會衝突）。另建輕量 `collection_runs` / `collection_issues`（C2）。

**Tombstone**：來源頁下架（404）時，KB 裡的內容若不處理會永久存活（RAG 繼續介紹已停售商品）。`sink.finalize(seen)` 比對「本輪 seen vs 該租戶上輪 URL 集」的差集 → 交 KB 標 `archived`。

## §3 階段

| C | 交付的價值 | 內容 | DoD（缺一不算） | Rollback |
|---|---|---|---|---|
| **C0** | — | collect/sink **獨立 registry**（**不動 `BlockKind`**）；型別；編排器 + `ctx.fetch` + 預算 + 續傳 + 品質閘 + trust 標記與指令樣態掃描；`sink/null`；lint 禁止積木用全域 fetch | `npx tsc --noEmit` 綠；編排器測試涵蓋 **8 項**：深度上限、scope 擋外站、預算耗盡後**可續爬**、單點失敗不中斷、canonical 去重、SSRF redirect 擋、積木超量 fetch 被 ctx 拒、**植入指令樣態的頁面不自動入庫**（真餵一份含 `ignore previous instructions` + 零寬字元的 HTML） | 刪新目錄（**零既有檔改動**） |
| **C1** | **客戶改官網 FAQ，KB 自動跟上**（今天靠人工貼，會靜默過期） | `collect/http-html` ＋ `sink/kb` | **依賴 KB 的 K1 完成**（版本化與檢索契約）；真 URL → KB → `search()` 查得到；同 URL 二次不產生新版；改內容後產生第二版 | 刪兩個積木 |
| **C2** | 整站而非單頁；抽不到內容的頁面**被看見**而非靜默入庫 | `collect/sitemap`（→discovered）、`collect/rss`（**只回 discovered，不回摘要 docs**）、`collect/pdf`；`collection_issues` 表 + 告警 | 真實站台 sitemap → N 頁入庫；12,000 URL 在預算內停止、**且下一輪從斷點續爬**（非重頭）；`dirty > 0` 時告警**實際觸發一次**（附證據行），非只寫 log | 刪積木整段 |
| **C3** | 不用人記得去按 | Trigger.dev 排程（ADR 004）；per-host 令牌桶**持久化**；**增量抓取語意明訂**（§1.4） | 排程真跑過一輪；**兩個 run 併行時對同一 host 的合計 QPS 未超限**（實測，非推論）；第二輪對未變更來源**未重抓 body**（實測 304／hash 短路） | 停用 task |
| **C3b** | 法規發布、產品改版當天就進庫，不用等下次排程 | **事件觸發入口**（webhook → 立即重抓指定 seed）；Domain Pack 的 `collect-sources.json` 消費 | 打一次 webhook 觸發真實抓取並落地（實測）；未知來源的 webhook 被拒（鑑權）；同一事件重送不重複入庫（冪等） | 關 webhook 入口 |
| **C4** | hci30 自動化檢索與快照（`DISCOVERED`，**限組織實體**） | **HCI 自有隔離 fetch runner**（ADR-0029）＋ `sink/hci-discovered` ＋ `hci.sources` unique migration ＋ object storage | ADR-0029 四項閘全綠（無 docker bridge 路由、egress-only、DNS-rebind 防護、SSRF payload corpus）；append-only 與 FORCE RLS 未被繞過；**未產生任何 Evidence 狀態躍遷**（實測：寫入後仍為 `DISCOVERED`）；**未做 record-level 去重**；含自然人的來源一律擋；routing 三件套同 PR | 關 runner |
| **C5** | 個資 verticals | **BLOCKED**（ADR §決策 10） | — | — |

**刻意不做**：不碰既有 `search/*` Signal 積木（已上線正常，改它零收益有風險）。`sink/signal` 只在 Content Studio 真的要複用 collect 層時才寫。

## §4 已代決（可推翻）

| # | 決定 | 推翻成本 |
|---|---|---|
| 1 | collect/sink **自建 registry**，不擴充 `BlockKind` | 低。擴充既有 `ContentBlock` 會動到 8 種已上線 kind 共用的介面 |
| 2 | 第一個落地價值選 KB 新鮮度（C1），非 hci30 | 低（換 C1/C4 順序，契約不變） |
| 3 | **C4 的 sink 在 HCI 側** | **已由 ADR-0029 決定，非選項**：fetch 必須在 HCI 隔離 runner 執行，sink 必然跟著在該側。生產應用不持有 hci30 個資庫憑證 |
| 4 | 原件只在 hash 變化時存快照 | 中（改 sink）。HCI 側另受 `06:302` 拘束（object storage） |
| 5 | 積木住 next-admin 同 deployable（HCI 路徑除外） | 中。C4 後才需重議 |
| 6 | 個資源 C5 才進 | 安全方向，不建議推翻 |

## §5 風險

| 風險 | 緩解 |
|---|---|
| 編排器是唯一共用單點 | 體積小（§1.2 即全部語意）＋ C0 DoD 要求 8 項行為測試 |
| 新積木誤觸 SSRF（含 redirect 繞過） | `ctx.fetch` 唯一出口 ＋ `redirect:"manual"` ＋ 每跳重驗 ＋ lint 禁全域 fetch |
| 抓取壓垮 next-admin 或目標站 | 預算 ＋ **跨 run 持久化**令牌桶；C3 起在 Trigger.dev 內跑，不在 web request 內 |
| 品質閘門檻誤傷中文 | 單位對齊 UTF-8 bytes ＋ 門檻依語言分設 ＋ dirty 上報讓誤傷可見 |
| 品質閘退化成另一種靜默 | C2 DoD 要求「告警**實際觸發一次**」，不是「log 裡看得到」 |
| HCI 路徑誤用本系統的 `ctx.fetch` | C4 DoD 明列 ADR-0029 四項閘；lint 對 `sink/hci-*` 禁止 import `ctx.fetch` |
| 跨專案契約漂移 | routing 三件套同 PR；契約變更走新 ADR |
