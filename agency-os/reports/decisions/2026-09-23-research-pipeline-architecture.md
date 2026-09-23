# 研究管線（蒐集 → 分析 → 報表）架構裁決：三條線不順的根因與重建方案

> **Mode: 直接決策，非 /decide 面板**（架構師身分主筆，全程實讀程式碼＋prod DB／容器實查，無多代理辯論）。
> 2026-09-23。操作者原話：「運作起來非常不順，也很怪異，你去深度研究並提出最完美的建議」。
> 讀者是接手的 agent。每個發現附 `file:line`；「可能是」一律不寫。
> 狀態：**提案，等操作者裁決 §7 三題**。§6 P0/P1 屬 Medium（新表、新頁、資料搬移），得到 go-ahead 才動工；P3 起涉及 Cognitive OS 契約與 HCI 邊界，逐階段再確認。

## 0. TL;DR

- **三條線今天都不是「管線」，是三個獨立系統靠人肉搬運。** 沒有任何一個物件代表「我正在對 Theo Farrell 做合作風險分析」；「一件事」被切成 organization → collection_source → collection_run → KB 資料夾（名稱＝關鍵字＋時間戳）→ Cognitive OS Project → HCI seed／case，六張表、三個資料庫、三個 UI，靠 `cognitive_os_project_id`／`hci_source_id` 兩個回寫欄位黏著。
- **根因不是 bug，是缺一個聚合根（aggregate root）**：研究案（Case）。近 14 天 `lib/collect` 29 commits、`lib/kb` 17、`ClientHubTabs.tsx` 13、hci30 45、cognitive-os 156——高修補速度是設計錯位的症狀（§2.8）。
- **建議 B：建「研究案」聚合根 + 分析積木登錄表 + 報表合成器，三個既有系統改為「以引用整合」而非「複製整合」**（§4、§5）。分五階段，每階段可獨立上線、獨立回滾；既有 `lib/collect`／`lib/kb`／`lib/dossier`／Cognitive OS methods／HCI 證據鏈**零重寫**，只加接縫。
- **三題必須由操作者裁決**（§7）：① HCI 是否擴到 Organization 主體；② Cognitive OS 是否接受「引用式來源」（改 Python 契約）；③ 流程 3 的方向（文件寫的是 HCI→Cognitive OS，操作者說的是 Cognitive OS→HCI）。

## 1. 任務理解

操作者要的三條產品線 × 三種流程：

| 線 | 主體 | 流程 |
|---|---|---|
| L1 合作風險 | 人／公司／組織／集團 | 搜 → HCI → 報表 |
| L2 事的利弊 | 一個決策 | 搜 → Cognitive OS → 報表 |
| L3 EdD 研究 | 文獻／論文 | 搜 → Cognitive OS → HCI → 報表 |

不變量（本裁決的判準）：**一個研究案 = 一個主體 + 一個目的 + 一組來源（引用，非拷貝）+ N 次分析執行 + 一份可版本化、每句帶出處的報表。** 任何系統參與都靠 id＋content hash 引用；「原文說了什麼」全系統只有一個答案（ADR 011 §決策 2，`011-collection-ingestion-boundary.md:54`）。

## 2. 現況分析（全部實讀／實查）

### 2.1 四個系統各自是什麼

| 系統 | 位置 | 真實功能 | 單位 |
|---|---|---|---|
| 資料蒐集 `/ops/collect` | `apps/next-admin/lib/collect/`（29 檔）+ `app/(shell)/ops/collect/CollectionSourcesPanel.tsx`（1029 行） | 積木式抓取（web／rss／sitemap／academic／web-search／entity-dossier／video／local-file／renderer）+ 品質閘 + 相關性閘 + sink/kb | **organization（客戶）**：`page.tsx:25-27` 先選客戶 |
| 知識庫 `/ops/knowledge` | `lib/kb/`（表 `cs_knowledge_sources`／`cs_knowledge_folders`）；`app/(shell)/ops/knowledge/page.tsx` | 唯讀總覽；編輯在客戶中心「客服」分頁（`knowledge/page.tsx:3-9`） | organization + folder |
| Cognitive OS | `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py`（1463 行）+ `dashboard.html`（1443 行）；prod `cognitive-os-api` healthy | 285 methods／16 recipes／自組工作流；Project+Source 只是「文字儲存」 | tenant → workspace → project（無資料夾） |
| HCI-30 | `Projects/internal/hci30/app/server.mjs`（768 行）+ `app/public/index.html`；prod `hci-app`／`hci-postgres`／`hci-fetch-runner`／`hci-object-storage` 全 healthy，`https://hci.aware-wave.com/health`=200 | Person 主體的證據帳本：cases／persons／records／decisions／seeds（DISCOVERED 佇列）／case report snapshot | tenant（合成 a／b）→ case → person |

### 2.2 三個「橋」實際做什麼

| 橋 | 程式 | 實際行為 | 與操作者期待的落差 |
|---|---|---|---|
| KB → Cognitive OS | `lib/cognitive-os/import-sources.ts` | 把 `cs_knowledge_sources.body` **整份複製**進 Cognitive OS 的 CAS（`:482-491`）；**以 title 去重**（`:236-240,248`）；閘門要求 title＋authors＋body 非空、DOI 格式、年份合理（`:85-107`） | authors 是學術假設，套用到全部三條線 → 網頁（公司／人物新聞）多數 `MISSING_AUTHORS` 被拒。Cognitive OS 端拿到後**唯一用途**是 `/projects/{id}/sources/brief` 把全文串成一段文字貼進表單（`main.py:1272-1319`、`dashboard.html:201,834-843`），再由 AI 起草某一個 method 的欄位。「送去 Cognitive OS 分析」＝「把文字搬過去，你自己去挑一個方法貼」 |
| KB → HCI | `lib/hci/import-sources.ts` | **只送 URL**（`:9-14`），HCI 隔離 runner 重抓成 snapshot；固定寫進合成租戶 `a`（`lib/hci/client.ts:15-23`）；`subject_kind` 只能 `ORGANIZATION`（`server.mjs:570-583`） | HCI 的評估主體 schema 只認 PERSON（Blueprint `02_PRODUCT_BOUNDARIES.md:29`，ADR-0011）。所以：公司頁能進 DISCOVERED 但**永遠變不成 Assessment**；人物頁**不能自動送**（ADR 011 §決策 10，`:79`）。L1 在 HCI 兩頭都被結構擋死 |
| Cognitive OS → HCI（流程 3） | **不存在** | Blueprint `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:23-47` 定義的是 **HCI 送 case package 給 Cognitive OS、拿回 analysis candidates 再過 HCI admission gate**（方向相反）；規定的落地目錄 `Projects/internal/hci30/integrations/cognitive-os/`（`:83`）**不存在** | 操作者說的「Cognitive OS 分析完再送 HCI」在文件與程式碼都沒有對應物 |

另有第四條操作者沒提的線：`lib/dossier/`（2026-09-20 新建）= 資料夾 → 直接呼叫 LLM → 帶 [n] 引註的「背景檔案」寫回同一資料夾（`lib/dossier/folder.ts:9-12`、`report.ts:76-80`）。它**繞過** Cognitive OS 與 HCI，是目前唯一真的能「出報表」的路徑。

### 2.3 「報表」有三種互不相通的定義

| 產出 | 形式 | 存哪 | 能否互相引用 |
|---|---|---|---|
| 背景檔案（dossier） | Markdown，[n] 引註，gaps／conflicts | KB 文件 `docType=dossier_report`（`folder.ts:129-147`） | 不引用 Cognitive OS／HCI |
| Cognitive OS method／recipe 結果 | JSON record + gate table（`dashboard.html:1397-1440`）；圖表為 base64 image artifact | Cognitive OS journal／artifact CAS；`/recipes/{id}/runs/{run_id}/result`（`main.py:687`） | 不回寫 KB；無文件形式 |
| HCI case report | JSON snapshot（trust domains、severity alerts）（`server.mjs:329-`、`:428-476`） | `hci.case_report_snapshots` | 不引用 KB 來源 id |

### 2.4 租戶軸錯位（prod DB 實查 2026-09-23）

```
slug                    | live_docs | collected | sent_cog | sent_hci | dossiers | folders
e2e-verify-0704-5c1356  |        25 |        23 |       10 |        4 |        3 |       6
awarewave-ops           |        23 |        23 |        0 |        0 |        0 |       1
edd-research            |         4 |         4 |        8 |        3 |        0 |       1
```

- 操作者的真實研究（Theo Farrell，6 個資料夾：`_202609181518`／`_202609181529`／`_202609200517`／`_202609200716`／`_202609200718`／`_202609210356`）全部落在 **`E2E-Verify-0704`（2026-07-04 建的測試 fixture 組織）**。因為 `/ops/collect` 逼你先選「客戶」，而操作者不是任何客戶。
- 同一個人每按一次「正式抓取」多一個資料夾（`lib/collect/sinks/kb.ts:46-57` 名稱＝關鍵字＋`YYYYMMDDHHmm`），沒有任何物件說「這六個資料夾是同一件事」；`lib/dossier/folder.ts:157-170` 只好從資料夾名去掉時間戳猜主體名。
- KB 表前綴 `cs_` = 客服 AI 的表；研究用途是後來塞進去的（ADR 011 §脈絡 表 `:28,32` 自己寫明 cognitive-os「若日後需檢索 → 走 KB 的 HTTP 介面」，實作卻選了複製）。

### 2.5 一次 L1 研究要跨幾個畫面

`/ops/collect`（選客戶→勾來源→填定位詞→正式抓取→輪詢）→ `/ops/clients/<slug>` 客服分頁（找到時間戳資料夾→「產生背景檔案」或「送去 Cognitive OS 分析」→輪詢）→ `cognitive.aware-wave.com`（透過 `/api/cognitive-os/open` handoff → 選 Project → 「帶入 Project 來源當背景資料」→ 選一個 method → AI 起草 → 執行 → 讀 JSON）→（若 HCI）`/ops/collect` 「送去 HCI 探索來源」→ `hci.aware-wave.com` 探索來源分頁（逐筆看內容／採用為證據→選案件×當事人）→ 案件頁產生報告。**三個網域、四個頁面、六次輪詢、零處回看全貌。**

### 2.6 狀態追蹤全在記憶體

`lib/collect/run-jobs.ts:1-22`：抓取／Cognitive 匯入／HCI 送出三種 job 共用 in-memory Map，容器重啟即失蹤（UI 三處「追蹤不到這次執行的狀態（可能伺服器重啟過）」）。`collection_runs` 有落地（14 筆，2026-09-12→21），但匯入與送出沒有對應表。

### 2.7 文件與程式碼互相過期

- `lib/hci/client.ts:6-9`「HCI-30 has never been deployed anywhere network-reachable」、`CollectionSourcesPanel.tsx:991-993`／`ClientHubTabs.tsx:1880-1888`「no deployed, publicly reachable URL yet」——prod `HCI_API_BASE_URL=https://…` 已設、`hci.aware-wave.com` 200（WORKLOG 2026-09-18 續63）。
- `feature-cognitive-os-completion.md:29` Current slice 仍是「Project + Source Intake」；`:13,15,18` Ingest+Normalize／Knowledge+Research Integrity／Artifact Studio（proposal/thesis outputs）全未勾。**Cognitive OS 今天沒有「對來源做分析」的能力，只有「對表單欄位跑方法」**。

### 2.8 操作者回報的症狀都指向同一根因

WORKLOG：續29「根本沒奏效」（回寫失敗、資料夾沒建、抓完不知道抓到沒）；續78「所有的每個工具都亂做表格」；續81「這狗屎東西 怎麼做 HCI分析?」；續92「沒有真正搜出以下角度…也沒有最終的資料彙整」。每一輪都修了一個局部（回寫欄位、資料夾、狀態字串、dossier 層），沒有一輪處理「這件事是誰的、在哪一步、結果在哪」。

## 3. 風險清單（現況繼續下去）

| # | 風險 | 證據 |
|---|---|---|
| R1 | 同一來源三份拷貝、三個 id，內容漂移無人察覺 | §2.2；Cognitive OS 以 title 去重（`import-sources.ts:236-240`），改標題即重複匯入 |
| R2 | 研究資料落在測試 fixture 組織，任何清理 e2e 資料的動作會刪掉真實研究 | §2.4 |
| R3 | HCI 收進永遠無法評估的 ORGANIZATION seeds（今天 17 REJECTED／3 ACCEPTED／2 DISCOVERED；4 cases；1 report） | §2.2 第二列 |
| R4 | 每加一個分析引擎就再加一組「送去 X」按鈕＋回寫欄位＋in-memory poller（已發生兩次：0087、0088） | migrations 0087／0088／0089 |
| R5 | 「送去 Cognitive OS 分析」標籤承諾了不存在的能力（§2.7） | `CollectionSourcesPanel.tsx:547-549` |
| R6 | 學術閘（authors 必填）套用到非學術線，L1／L2 的網頁來源系統性被拒 | `import-sources.ts:91-92` |

## 4. 方案比較

### A（最小）：保留三個 UI，加一頁「研究案清單」串連結，並把 Cognitive OS 結果回寫 KB

- 做法：新表 `research_cases(id, org_id, subject, purpose, folder_id, cognitive_project_id, hci_case_id)`；`/ops/research` 列出並深連結到既有頁面；Cognitive OS run 結果用現有 `/recipes/{id}/runs/{run_id}/result` 拉回存成 KB 文件。
- 優點：一週內可上；不動 Python、不動 HCI。
- 缺點：三份拷貝、三套閘、六次輪詢、in-memory 追蹤全部保留；「資料夾＝時間戳」照舊；每加一個引擎仍要加按鈕。**這是補丁**（AGENTS §1 補丁判準：只關眼前實例，不關整類）。
- Rollback：drop 一張表、刪一頁。

### B（完整）：研究案聚合根 + 分析積木登錄表 + 報表合成器；三系統改「引用式整合」

- 不變量落地：§1 那句話變成 schema（§5.1）。
- 「蒐集積木／sink 積木」的既有模式（ADR 011 §決策 5）**再加第三種：分析積木**。dossier、Cognitive OS recipe、HCI case 各是一個檔案；加第四個引擎＝加一個檔案，UI 不變。
- 報表只有一種：合成器從 case 讀來源（KB）、讀每個 run 的輸出（各積木自己 `render()`）、產生帶 [n] 引註與 gaps／conflicts 的版本化文件，存回 KB（沿用 `lib/dossier/report.ts` 的引註強制 `enforceCitations`，`:185-206`）。
- 三系統零重寫：`lib/collect` 全保留（只讓 sink 讀 `meta.caseId` 決定資料夾）；`lib/kb` 全保留（加 `research_cases` 外鍵）；Cognitive OS methods／recipes 全保留（Source Import 加兩個選填欄位）；HCI 證據鏈全保留（seeds／promote／report 照用，只是由 case 記住 `hci_case_id`）。
- 缺點：五個階段、含一段 Python 契約變更與一個 HCI 產品邊界決策；P1 前操作者先過一次資料搬移。
- Rollback：每階段獨立（§6 各列）。

**建議 B。** 理由：A 保留全部六個風險；B 關掉整類（R1–R6 各對應 §5 一個機制），且每階段都是加法、可獨立回滾，符合最小爆炸半徑。

## 5. 目標架構（B）

### 5.1 資料模型（next-admin，Supabase；新 migration，全部加法）

```
research_cases            id, organization_id, subject_name, subject_kind(person|company|event|topic|decision),
                          purpose(partnership_risk|decision|edd_research), status(open|analyzing|reported|closed),
                          folder_id → cs_knowledge_folders(1:1，資料夾即來源集合), created_by, created_at
research_case_runs        id, case_id, block_id('analysis/dossier'|'analysis/cognitive-recipe'|'analysis/hci-case'),
                          status(queued|running|done|failed), external_ref(jsonb: cognitive run_id / hci case_id / …),
                          input_source_ids uuid[], output(jsonb), started_at, finished_at, error
research_case_reports     id, case_id, kb_source_id → cs_knowledge_sources（報表本體＝版本化 KB 文件）, run_ids uuid[], generated_at
```

- `collection_sources` 加 `case_id`（nullable）；sink/kb 在 `meta.caseId` 存在時把文件歸進 `research_cases.folder_id`，**取代**「關鍵字＋時間戳」命名（`sinks/kb.ts:46-57` 那條只在無 case 時保留，客戶 KB 行為不變）。
- `cognitive_os_project_id`／`hci_source_id` 兩欄保留（相容），新流程改寫進 `research_case_runs.external_ref`。
- 追蹤改落地：`research_case_runs.status` 取代 in-memory Map（dry-run 仍不落地，維持 `run.ts:144-146` 承諾）。

### 5.2 分析積木（`lib/analysis/`，與 collect/sink 同一種登錄表慣例）

```ts
interface AnalysisBlock {
  id: string; title: string;
  supports: Purpose[];                       // 哪幾條線能用
  plan(c: CaseView): Promise<{ cost: string; issues: string[] }>;   // 執行前告訴人要花什麼
  run(c: CaseView, ctx): Promise<{ externalRef; output }>;
  render(run: CaseRun): string;              // 報表段落（markdown，[n] 指向 case 來源編號）
}
```

| 積木 | 包裝的既有能力 | 備註 |
|---|---|---|
| `analysis/dossier` | `lib/dossier/report.ts` 原封搬入 | `folder.ts` 退場（case 取代資料夾當單位） |
| `analysis/cognitive-recipe` | `POST /recipes/{id}/run` + `/ai/draft/recipe/{id}` + `/runs/{run_id}/result` | 由 purpose 決定預設 recipe：L2→`life-decision-v1`／`business-feasibility-review-v1`；L3→`edd-research-evidence-v1`／`research-qualitative-v1`；L1→stakeholders／challenge 家族方法組成的 custom workflow。**來源以引用送**（§5.3） |
| `analysis/hci-case` | `POST /seeds`（限 org）→ 人工 promote → `POST /cases/{id}/reports` → `GET /reports/{id}` | 記住 `hci_case_id`；報表段落＝trust domains + severity alerts；人工晉升仍在 HCI UI 做（ADR-011 決策 10 不變） |

管線＝資料，不是程式：`lib/analysis/pipelines.ts` 一張表 `purpose → [collect block defaults, analysis blocks order]`，與 `query-plan.ts:38` ANGLES 同一手法。三條線各一列；流程 3 就是 L3 那列多一個 `analysis/hci-case`。

### 5.3 三系統的接縫（引用式）

| 邊界 | 現況 | 目標 |
|---|---|---|
| KB → Cognitive OS | 複製 body、title 去重、學術閘 | `CreateSourceRequest`（`main.py:1108-1116`）加選填 `external_ref: {system:'next-admin-kb', source_id, content_sha256}`；Cognitive OS 以 `(tenant, external_ref.source_id, content_sha256)` 冪等；**閘門依 purpose**：EdD 才要 authors／DOI；risk／decision 只要 body。CAS 內容照存（Cognitive OS 的 replay／journal 需要），但身分是 KB id + hash，不是 title |
| KB → HCI | 只送 URL、重抓 | 維持（ADR-0029 要求 HCI 自己隔離抓）；改為由 `analysis/hci-case` 送並回填 `external_ref.hci_source_ids`；`content_sha256` 一併送去，HCI snapshot hash 不同時在報表標「HCI 重抓版本與 KB 版本不同」 |
| Cognitive OS ⇄ HCI | 無 | **不直接接**。兩者都只跟 case 講話：Cognitive run 的 output 由報表合成器變成 HCI 可讀的「候選評估」段落，人工在 HCI 建 ASSESSMENT（Blueprint 10 admission gate `:47-55` 的精神，方向留給 §7 Q3） |
| 報表 → 三系統 | 三種 JSON | 一份 KB 文件（`docType=research_report`，AI_INFERENCE／AI_GENERATED）；段落 = 各 run 的 `render()`；附錄列 Cognitive run_id／HCI report id 可回溯 |

### 5.4 一個畫面：`/ops/research`

- 清單：每案一列（主體／目的／狀態／來源數／最新報表）。
- 案件頁四段：**來源**（觸發蒐集＝既有 `runCollection` 帶 `caseId`；列 KB 文件、相關性標記）→ **分析**（可用積木＝`supports` 含此 purpose 者；每個先 `plan()` 顯示成本再跑）→ **報表**（版本列表、開啟、匯出 md／pdf）→ **紀錄**（runs 表）。
- 長工走 Trigger.dev（ADR 004；沿用 `packages/workflows/src/trigger/collect-scheduled-crawl.ts` 的部署路徑），瀏覽器輪詢 `research_case_runs`。
- `/ops/collect` 與客服分頁的「送去 X」三顆按鈕在 P2 後移除（不是隱藏）。

### 5.5 租戶

- 建真實組織 `awarewave-research`（或直接用 `awarewave-ops`），研究案預設掛在此；客戶委託的研究才掛客戶 org。
- 一次性搬移：`e2e-verify-0704-5c1356` 底下 6 個 Theo Farrell 資料夾＋25 份文件 → 新 org、合併成 1 個 case（`UPDATE cs_knowledge_sources/cs_knowledge_folders SET organization_id`，RLS 為 service-role-only，無跨租戶 policy 阻擋；chunks 走 `source_id` 不含 org 欄位需查證後再寫 script）。

## 6. 實作計畫（每階段獨立可上線／可回滾）

| 階段 | 內容 | 風險級 | 驗證 | Rollback |
|---|---|---|---|---|
| **P0** 資料衛生 | 建研究 org；搬 Theo Farrell 資料；`lib/hci/client.ts:6-9`、兩處 UI 註解改成事實 | Medium（資料搬移） | 搬移前後 `count(*)` 三表對帳；`/ops/knowledge` 目視；`npx vitest run lib/kb` | 反向 UPDATE（搬移 script 自帶 down） |
| **P1** 聚合根 | migration 0092（§5.1 三表 + `collection_sources.case_id`）；`lib/research/`（case CRUD）；sink/kb 讀 `meta.caseId`；`/ops/research` 清單＋案件頁「來源」段 | Medium | `tsc` 綠；新測試：case 建立→蒐集→文件落在 case folder（真 Supabase）；既有 `collect-c1`／`kb.test.ts` 不變綠 | migration down；頁面刪除；sink 分支只在 `meta.caseId` 存在時走 |
| **P2** 分析積木＋報表 | `lib/analysis/` registry + `analysis/dossier`（搬 `lib/dossier`）+ `analysis/cognitive-recipe`（先用現有 copy import，不等 P3）+ 報表合成器 + Trigger.dev task `research-case-run` | Medium | 真跑：一個 case 跑 dossier + `life-decision-v1` → 一份報表含兩段、[n] 全在範圍內（`enforceCitations` 突變測試）；容器重啟後 run 狀態仍可讀 | 刪 `lib/analysis`、task 停用；`lib/dossier` 舊按鈕保留到 P2 驗收才移除 |
| **P3** 引用式 Cognitive OS | `main.py` `CreateSourceRequest` 加 `external_ref`、冪等鍵、purpose 閘；next-admin 改送引用；移除 title 去重與 authors 硬閘 | Medium（Python 契約，加法） | Cognitive OS `pytest tests/unit`＋新測試（同 id 同 hash 二次 = 200 不重複；同 id 不同 hash = 新版本）；`deploy.sh` test-gate | 欄位選填，舊呼叫端不變；`cognitive-os-api:rollback` image |
| **P4** HCI 積木 | `analysis/hci-case`：送 seeds（org-only）、記 `hci_case_id`、拉 report snapshot 成段落 | Medium（不動 HCI schema） | 真跑 `hci.aware-wave.com` 合成租戶：seed→人工 promote→report→段落出現在 case 報表 | 積木移除；HCI 資料不動 |
| **P5** 流程 3 | 依 §7 Q3 裁決：實作 Blueprint 10 契約（`integrations/cognitive-os/`）或反向 | **High-STOP**（HCI 身分／評估邊界） | 待裁決 | 待裁決 |

估工：P0 半天；P1 2 天；P2 3 天；P3 1.5 天（含 Cognitive OS 部署）；P4 1 天。P0–P2 上線後三條線已能「一頁走完」，P3/P4 是把拷貝改引用。

## 7. 需操作者裁決（本記錄不代決）

1. **HCI 主體範圍**：L1 含「公司／組織／集團」，但 HCI 只評估 Person（ADR-0011）而自動蒐集只收 Organization（ADR 011 §決策 10）。選項：(a) 新 ADR 開放 Organization-as-Subject（HCI schema 改動，High）；(b) 公司線不走 HCI，用 `analysis/dossier` + Cognitive OS stakeholders／challenge 方法出報表，HCI 只服務自然人且維持人工送入；(c) 兩者都做但 (a) 排後。**建議 (b)，理由：(a) 是 HCI 產品邊界的根本變更，且今天 HCI seeds 已證明「收得進、評不了」**。
2. **Cognitive OS 契約**：接受 §5.3 的 `external_ref` + purpose 閘（改 `main.py`，加法、選填）。不接受則 P3 改為 next-admin 端以 `title = <kb_source_id>` 冪等（醜但零 Python 改動）。
3. **流程 3 方向**：Blueprint 10 寫 HCI→Cognitive OS（HCI 把 case package 送去分析，結果過 HCI admission gate）；操作者敘述是 Cognitive OS→HCI。前者有契約文件、後者沒有。**建議依 Blueprint 10**，且在 P5 前先用 §5.3 的「報表段落＋人工建 ASSESSMENT」過渡，不寫任何自動晉升。

## 8. 驗證計畫（本記錄本身）

- 實測：`REALTEST_EVIDENCE` — prod DB 三組查詢、容器清單、`printenv`、兩個 `/health`（見 WORKLOG 2026-09-23 本條）。
- Review：`REVIEW_WAIVED: DOC_ONLY`（決策記錄；實作階段每階段各一個 critic）。
- 抓蟲：`BUGHUNT_WAIVED: DOC_ONLY`（未改任何 symbol；引用的 `file:line` 全數在寫入前以 sed／grep 讀回）。
- 後續：操作者裁決 §7 後，P0/P1 開工前照 AGENTS §1 出七段。

## 9. 附：本次讀過的檔案（供接手者省一輪）

next-admin：`lib/collect/{index,types,run,run-jobs,sinks/kb,collectors/entity-dossier,search/query-plan}.ts`、`lib/cognitive-os/{client,import-sources}.ts`、`lib/hci/{client,import-sources}.ts`、`lib/dossier/{report,folder}.ts`、`lib/kb/types.ts`、`app/(shell)/ops/{collect/page,collect/CollectionSourcesPanel,knowledge/page}.tsx`、`app/(shell)/ops/clients/[slug]/ClientHubTabs.tsx:1279-1900`、`app/api/ops/clients/[slug]/{cognitive-os-import,hci-import}/route.ts`、`app/api/cognitive-os/open/route.ts`、`app/api/internal/cognitive-os/import-project-sources/route.ts`。
Cognitive OS：`ai_lego/apps/api/main.py:395-420,534-710,1108-1385`、`dashboard.html:180-232,820-860,1390-1443`、`docs/feature-cognitive-os-completion.md`、`docs/COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md`、`recipes/validated/{edd-research-evidence-v1,life-decision-v1}.recipe.yaml`、`apps/cli/bootstrap_service_identity.py`。
HCI：`app/server.mjs:138-768`、`app/public/index.html`（節）、`docs/HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md`、Blueprint v2 `02`／`04`／`10`。
治理：ADR 011、`DATA_COLLECTION_PLAN.md §3-5`、`reports/decisions/2026-09-17-hci30-c6-and-collector-task1-decisions.md`、WORKLOG 續29／78／79／81／92／93、TASKS.md 相關條目、`docker-compose.yml` next-admin env。
