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
      for ([d,q] of graded):                                     // 兩條獨立品質軸，見 ADR 014
        if (!q.ok)                     report.dirty.push({uri:d.uri, ...q})
        else if (!relevant(d, t.meta)) report.offEntity.push({uri:d.uri})  // 抽得好，但講的是別人
        else                           pending.push(stampTrust(d))
      if (graded.length === 0 || admittedAny)                    // 全被拒的頁面不得提名下一批頁面
        frontier.push(...r.discovered
          .filter(x => (x.depth === 0 || x.depth < depthLimitOf(t)) && inScope(x))  // depth 0 = 來源自己指名的 root
          .map(withCarriedMeta))                                 // entity/searchQuery/maxDepth 隨著走
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
| **C0** ✅**已完成** 2026-09-11 | — | collect/sink **獨立 registry**（**不動 `BlockKind`**）；型別；編排器 + `ctx.fetch` + 預算 + 續傳 + 品質閘 + trust 標記與指令樣態掃描；`sink/null`；lint 禁止積木用全域 fetch | `npx tsc --noEmit` 綠；編排器測試涵蓋 **8 項**：深度上限、scope 擋外站、預算耗盡後**可續爬**、單點失敗不中斷、canonical 去重、SSRF redirect 擋、積木超量 fetch 被 ctx 拒、**植入指令樣態的頁面不自動入庫**（真餵一份含 `ignore previous instructions` + 零寬字元的 HTML） | 刪新目錄（**零既有檔改動**） |
| **C1** ✅**已完成** 2026-09-11 | **客戶改官網 FAQ，KB 自動跟上**（今天靠人工貼，會靜默過期） | `collect/http-html` ＋ `sink/kb` | **依賴 KB 的 K1 完成**（版本化與檢索契約）；真 URL → KB → `search()` 查得到；同 URL 二次不產生新版；改內容後產生第二版 | 刪兩個積木 |
| **C2** ✅**已完成** 2026-09-11 | 整站而非單頁；抽不到內容的頁面**被看見**而非靜默入庫 | `collect/sitemap`（→discovered）、`collect/rss`（**只回 discovered，不回摘要 docs**）、`collect/pdf`；`collection_issues` 表 + 告警 | 真實站台 sitemap → N 頁入庫；12,000 URL 在預算內停止、**且下一輪從斷點續爬**（非重頭）；`dirty > 0` 時告警**實際觸發一次**（附證據行），非只寫 log | 刪積木整段 |
| **C3** ✅**已完成** 2026-09-12 | 不用人記得去按 | Trigger.dev 排程（`collect-scheduled-crawl` hourly heartbeat，邏輯全在 next-admin `/api/internal/collect/run-due-schedules`，per `collection_schedules` 表，預設 `enabled=false`）；**增量抓取語意明訂**（`lib/collect/url-state.ts` + orchestrator 304 回放，migration 0080）；**per-host 令牌桶跨 run 持久化**（migration 0082 `collection_rate_limit_take()`，keyed by host 非 org） | ~~排程真跑過一輪~~✅（code 完成，等部署後首次真實排程觸發驗證）；~~第二輪對未變更來源未重抓 body~~✅（實測：`collect-url-state-wiring.test.ts`，突變測試過）；~~兩個 run 併行時對同一 host 的合計 QPS 未超限~~✅——`net/rate-limit.ts` `createSupabaseRateLimitStore()` 已接線進 `run.ts`（非 dry-run 一律使用），單一原子 `SELECT...FOR UPDATE`+`UPDATE`（PL/pgSQL，非應用層 read-then-write）；真實 Postgres 驗證 200 組隨機序列與 `nextBucket()`（純函式）逐一比對零誤差 + 2 個並發首請求對同一新 host 恰好 1 個獲准（`apps/next-admin/scripts/collect-rate-limit-verify.ts`）。 | 停用 task；`collection_schedules.enabled` 全設 false 等同凍結（不用刪表）；rate-limit：down migration 0082 |
| **C3b** | 法規發布、產品改版當天就進庫，不用等下次排程 | **事件觸發入口**（webhook → 立即重抓指定 seed）；Domain Pack 的 `collect-sources.json` 消費 | 打一次 webhook 觸發真實抓取並落地（實測）；未知來源的 webhook 被拒（鑑權）；同一事件重送不重複入庫（冪等） | 關 webhook 入口 |
| **C4** | hci30 自動化檢索與快照（`DISCOVERED`，**限組織實體**） | **HCI 自有隔離 fetch runner**（ADR-0029）＋ `sink/hci-discovered` ＋ `hci.sources` unique migration ＋ object storage | ADR-0029 四項閘全綠（無 docker bridge 路由、egress-only、DNS-rebind 防護、SSRF payload corpus）；append-only 與 FORCE RLS 未被繞過；**未產生任何 Evidence 狀態躍遷**（實測：寫入後仍為 `DISCOVERED`）；**未做 record-level 去重**；含自然人的來源一律擋；routing 三件套同 PR | 關 runner |
| **C5** | 個資 verticals | **BLOCKED**（ADR §決策 10） | — | — |
| **C6** | 「幫我找出這個產業該追的來源」——但決定權留在人手上 | discovery 積木（查詢→候選來源）＋ `collection_source_candidates` 表＋ops 待核准清單＋撤銷路徑（[ADR 013](../architecture/decisions/013-open-web-discovery-into-corpus.md)） | 候選**永遠不會**直接變成 KB 文件（實測：discovery 產出後 KB 零新增）；核准後該來源走既有 seed 路徑入庫；取消核准後由它產生的文件可一次找出並 archive（實測）；未核准的 webhook／API 呼叫者不能塞任意 URL | 停用 discovery 積木；候選表可留 |

> **C4 執行計畫**（2026-09-17，`planner` 產出）：見 [`HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md`](../../../Projects/internal/hci30/docs/HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md)（13 個 Task Prompt，Task 0/1 為 STOP，尚未取得操作者 go-ahead，不得動工）。查證中發現本表「HCI 自有隔離 fetch runner」的設計意圖與 ADR-0029 一致，但 `hci.sources`/`hci.source_snapshots` 目前完全沒有 `admission_state` 欄位——DoD 講的「未產生任何 Evidence 狀態躍遷」現在只是散文承諾，無機械閘，需新 migration 才補得上。

> **C6 的入口型別刻意與 `Target` 分開**（ADR 013 落地位置）：今天的 `match(t: Target)` 是 URL 形狀，把查詢塞進同一個型別會讓兩種語意共用一條路。C6 之前，`lib/collect/` 不得出現以查詢為入口的積木。

> **C2 交付與計畫的差異**（2026-09-11）：
> ① **`collect/pdf` 沒有另外寫**——PDF 由新的 `collect/extract-provider` 階處理（供應商就能抽 PDF），自己再寫一個零依賴 PDF 抽取器是重複造輪且抽不準。`collect/http-html` 仍拒收 `.pdf`，provider 階接收。
> ② **gzip 壓縮的 sitemap 明確不支援**（丟 `status: 415`），不假裝解析後回報「零個 URL」。
> ③ **`dirty` 的告警走既有 ops-inbox incident 管線**（`0073` 把 `collection` 加進 `ops_incidents.source`，比照 `0031` 加 `deploy` 的作法），不自建第二套通知：那條管線已經有 fingerprint 去重、storm 關聯、severity 規則與 Telegram/Slack 扇出。告警規則本身（`severityFor`）刻意不對 `disallowed` 出聲——robots 擋下是正常行為，對它告警等於訓練人把告警關掉。
> ④ 新增 **`collect/extract-provider`** 階（JS 渲染站台、PDF）：`match()` 給 0.5 分，排在 `http-html` 的 1 分之後，所以只有便宜階讀不到時才會花錢。無 API key 時 `match()` 回 0，整階等於不存在。供應商選 **Firecrawl**（理由寫在 `net/providers.ts`：per-call API 沒有長駐足跡，browser farm 有；Apify 是 actor 市集，屬更後面的特殊平台階）。
>   **2026-09-21 更新**：預設供應商改為自架 `renderer`（`apps/renderer`，Playwright 1.60 + 隔離網路＋每次啟動重套 egress 規則），Firecrawl 保留為第二供應商（目前唯一能讀 PDF）。實測 10 頁：自架 4、Cloudflare 2。renderer 回傳渲染後 HTML，走 `http-html` 的 `docFromHtml`，抽取標準只有一套（WORKLOG 2026-09-21 續95／續96）。
>
> **C0／C1 覆審後補進實作的規則**（critic 1c/8h/13m，全數處理；細節見 WORKLOG 2026-09-11）：
> ⓐ **失敗分類讀 `status` 欄位不讀錯誤訊息**——訊息裡有 URL，`/blog/404-explained` 回 500 會被字串比對判成「頁面已刪除」。積木契約因此明訂：有 HTTP 狀態就用 `Object.assign(new Error(msg), { status })` 丟。
> ⓑ **`seen` 只在「本 target 有終局答案」時保留**。預算在 `ctx.fetch` 內耗盡／robots 暫時取不到／retry 用盡，都必須把標記拿掉並重排——`seen` 會被持久化，留著就是「那一頁此後永遠不會再被抓」，而測試全綠（正是 §1.2 續傳欄點名的假死）。
> ⓒ **頁面自宣告的 `<link rel=canonical>` 限同源**。canonical 在下游就是文件身分（`lib/kb/family.ts` 拿它算 family id），不限制的話一個 CMS 設錯就能把整站 200 頁塌成一份文件、彼此互相 archive，無錯誤無告警。
> ⓓ **`ctx.fetch` 預設查 robots**（要關必須顯式傳 `robots: null`）、**method 限 GET/HEAD**、**積木不得覆寫 UA／cookie／authorization**——UA 是 robots 判定的依據，能改就等於「用一個身分問許可、用另一個身分抓」。**2026-09-18 加窄範圍例外**：`net/fetcher.ts` 的 `ROBOTS_EXEMPT_API_HOSTS`（目前僅 `export.arxiv.org`）讓「已查證 robots.txt 為全站 `Disallow: /` 的免金鑰查詢 API」略過這條預設檢查——這類 host 沒有「頁面」可言，`Disallow: /` 問的是別的問題（別把我的網站當成人類瀏覽的內容爬），不是「這支 API 可不可以被查」；其餘 host 的 robots 檢查不受影響（見 `lib/collect/__tests__/collect-fetch.test.ts` 的同檔對照測試）。起因：`collect/academic` 的 arXiv 來源選項在正式環境因此 100% 回傳零結果，見 WORKLOG 2026-09-18。
> ⓔ **tombstone 前加健康度閘**，且比對的是「本輪實際交付的 canonical URL」而非「走訪過的 target」：兩者是不同鍵空間，且「整站 5xx 但 frontier 清空」也會滿足原本的條件——差集就是整個租戶的知識庫。
> ⓕ **偵測器誤殺修掉兩個**：soft-404 拆成強／弱樣式（弱樣式只在標題或開頭且要有第二訊號），否則「找不到頁面怎麼辦？」這種真 FAQ 會被擋在 KB 外；隱形字元清單移除 ZWJ/ZWNJ（emoji 與波斯／印度語系的必要字元）。
> ⓖ **SSRF 檔頭改成誠實敘述**：literal + 解析後位址都擋，但 **DNS rebinding 沒有關**（檢查與連線各解析一次，中間沒有 pinning，需要 undici Agent）。原本的註解宣稱擋住了——宣稱比漏洞更危險。已進 TASKS。**2026-09-12 已修復**：`net/fetcher.ts` 用 `undici.Agent({connect:{lookup}})` 把連線釘死在 `checkUrl()` 驗證過的那個位址，每個 hop 各自一個新 Agent；機制本身用真實 HTTP server 驗證過（不可解析的 hostname 仍連得到 pinned 位址），wiring 用 mock transport 驗證過（含跨 redirect 不共用 pin）。見 WORKLOG 2026-09-12、`lib/collect/__tests__/collect-dns-pin.test.ts`。
> ⓗ 令牌桶介面改成單一原子 `take()`（get-then-set 中間有 await 就是競態，C3 的「兩個 run 併行不超限」用原介面做不到）；robots 取用失敗只快取 60 秒（永久 fail-closed = 一次瞬斷讓整站再也不抓）。
>
> **C0／C1 實作與本節的三處差異**（皆有程式內註解說明，理由見 WORKLOG 2026-09-11）：
> ① 「lint 禁止積木用全域 fetch」→ 本 repo **沒有 ESLint 設定**（無 `.eslintrc*`／`eslint.config.*`／`lint` script，已實查），改成機械閘測試 `__tests__/collect-block-hygiene.test.ts`（已用突變測試證明會紅）。裝 ESLint 後可換回 lint rule。
> ② `RawDoc.provenance` 為**獨立欄位**，非 §1.1 所寫的塞在 `meta` 裡——§1.3b 本來就寫成獨立欄位，兩處矛盾；選型別化的那個，漏掉會是型別錯誤而不是靜默少一個安全標記。
> ③ `RawDoc` 多一個 `author` 欄（來自操作者 2026-09-11 提供的 `data_collection_design_v0.1.md`）：抓取當下不記就補不回來，KB 目前無欄位可存，與 provenance 一起列在 TASKS。
> ④ `sink/kb` **不實作 `finalize`**（tombstone）：它需要「該租戶先前的全部 canonical URL」，KB 今天無法按來源系統回答，硬做會把人工上傳的文件一起 archive 掉。歸 C2。
> **C1 唯一未完成的 DoD**：「真 URL → KB → `search()` 查得到」需要 prod 套用 KB 的 `0072` migration（High-STOP，未執行）。其餘三項（同 URL 二次不產生新版、改內容產生第二版、真 URL 抓取與抽取）已用真站台與真流程驗過。

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
