# RESEARCH LINES — 蒐集 → 彙整 → 方法 → 報表 MASTER PLAN（唯一計畫正本）

> **這份是什麼**：把 L1 合作風險／L2 決策利弊／L3 EdD 研究三條線做成 **Cognitive OS 上的 Project 工作流**（Project 層級蒐集與彙整 + 既有 Recipe 引擎 + 報表 artifact），達到國際級產品規格（多租戶、溯源、可重放、可匯出、可抹除）。取代 `agency-os/reports/decisions/2026-09-23-research-pipeline-architecture.md` §5–§6 的 next-admin 中心方案（該檔 §10.1 七個矛盾與 §10.2 成熟度矩陣仍為前提，不重述）。
> **給 AI 的開工指南**：接到「研究線／三條線／partnership-risk／彙整層／Collection Service」→ 讀 §0 → 照 §5 當前階段做；設計問題查 §3–§4；產品問題查 §9 **不重問**；退場清單 §8；critic 已駁回的設計見 §4 淘汰欄，**不重提**。每完成一階段更新 §0。
> **建立** 2026-09-23 v1；**同日 v1.1**（critic 對抗審查 3C/8M/1m 全部折入）；**同日 v1.2**（品質評分 harness §3.7 + 演化迴圈 §3.8）；**同日 v1.3**（首用 UX §3.9 + D13 前端殼）；**同日 v1.4**（解讀層 §3.10 + PI 期 + §11 接手指南；①–⑥ 全部拍板）；**同日 v1.5**（critic 2C/6M/4m 折入：路由 `/api/` 前綴、web 放 `COS/apps/`、PI 拆 a/b、解讀 202 輪詢＋伺服器重跑閘門、視覺綁定記錄路徑、估工 17d→18d）；**同日 v1.6**（示意稿重做為固定七段骨架、U13／U14、D15：⑦ 與 P0 部署時機由工程師依授權決定）；**同日 v1.7**（解決方案層：選方案→行動計畫→追蹤驗證，D16，P4 +1d）；**同日 v1.8**（課程層：每個方法開始前 5 分鐘課，U15，D17，P3 +1d）；**同日 v1.9**（第四條線 L4 藝術反思＝未來主力：Airtable 工具庫 → 方法家族＋兩個 recipe，判斷主權原則→機械閘，個案資料 P-P 前置；D19–D22、P-ARF-data／P-ARF-participant），見 §10。路徑：`COS` = `Projects/internal/cognitive-engineering-os`；`SPEC` = `agency-os/docs/AI_LEGO_Cognitive_Engineering_OS`；`NA` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`；`WF` = `lobster-factory/packages/workflows`；`BP` = `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2`；`rt` = `COS/ai_lego/apps/recipe_runtime.py`；`main` = `COS/ai_lego/apps/api/main.py`；`repo` = `COS/ai_lego/data/repositories/project_source_repository.py`；`exec` = `COS/ai_lego/platform/workflow/executor.py`。

## 0. 現況（每次改動更新此段）
| 項 | 狀態（2026-09-23） |
|---|---|
| 計畫 | v1.6；§9 ①–⑧ 全部定案（⑦⑧ 依操作者授權由工程師決定，D15）；執行順序 P0 → PI-a → PI-b → P1 → P2 → P3 → P4 → P4b → P-E；**目前：P0 完成（`19f00f9aa`，未部署，與 PI-b 同窗），PI-a 開工**；PI-b／P5／P-P 為 High-STOP（prod 部署） |
| 可重用（已查證） | 蒐集引擎 `NA/lib/collect`（41 個非測試 .ts；SSRF／DNS pin／robots／限流／品質／相關性／注入隔離／renderer 階）；COS Project+Source+CAS+events（`repo:22-60`）；Recipe 引擎（journal／resume／gates，`exec:236-250,347-361`）；AI gateway（brief→draft→builder→gates，provenance 強制 `draft.py:195-206`）；`ai.draft_record` capability（`SPEC/capabilities/contracts/ai.draft_record.capability.yaml`）；既有 citation gate `COS/ai_lego/modules/research/gates.py:41-63`；dossier prompt／段落表 `NA/lib/dossier/report.ts:76-139`、引註檢查 `:185-206`；`literature_search` ACTIVE 契約（`SPEC/capabilities/contracts/literature_search.capability.yaml:3`）；portal 身分層（`NA/app/portal/*`）；Trigger.dev 內部呼叫樣板 `WF/src/trigger/collect-scheduled-crawl.ts` + `NA/app/api/internal/collect/run-due-schedules/route.ts:27-32`；handoff code 發放／兌換樣板 `COS/ai_lego/platform/identity/store.py:342-385` |
| 缺（本計畫要蓋） | **L4 藝術反思線（§1，D19–D22）**：Airtable→SPEC 同步、`art_reflection.*` 契約家族、`wusheng-journey-v1`／`reflective-cycle-v1` recipe、判斷主權閘、圖像 artifact（P5 object storage）、參與者模式（P-P 後）；**課程層 §3.9 U15／D17**（每個方法首次使用前的 5 分鐘課，資料驅動）；**解決方案層 §3.10(5b)／C11**（分析後的方案比較、行動計畫、追蹤與到期重跑）；**解讀層 §3.10**（現況：方法執行 = builder + gates，無 LLM，`main:758-788`；結果頁 = 閘門表 + JSON，`dashboard.html:1394-1410`；圖表僅 2 方法 `:1320-1345`）；Source 溯源欄位＋supersede；Project 層級 collection run（非同步）＋ ingest grant＋service identity；`sink/cognitive`；三個彙整 typed object＋prompt manifest＋`citation_integrity` gate；context-bound capability adapter 這一類；`literature_search` project-backed adapter；`partnership-risk-v1` recipe；非同步 recipe run 旗標；`artifact.generate_report`；**品質評分 harness（§3.7）**；**演化迴圈（§3.8）**；Postgres／object storage；自然人來源的加密與抹除（P-P） |
| 演化原語（已存在，§3.8 重用） | `SPEC/recipes/validated/champion-challenger.recipe.yaml`（ACTIVE）；prompt 版本重放與回滾 `COS/ai_lego/platform/ai_execution/{replay,rollback_plan}.py`（`replay.py:34-76` `prompt_version`／`restored_prompt_version`；README:27 v12 升級／回滾 replay 測試）；spec-root golden harness `SPEC/tests/run_golden_tests.py`；`ai_usage` 計量表（`store.py:117,465-468`）；`COS/ai_lego/compute/prediction_tracking/error.py`；Claude 雲端 routine（`/schedule`）；行為即資料（`query-plan.ts:38` ANGLES、`source-class.ts`、`methods/registry/method-form-examples.yaml`） |
| 已由 critic 駁回、不再提 | 把 collect 做成 Recipe step（`exec:236-250` RUNNING 不可 resume、`main:131-133` journal 不含 source、adapter 無法注入依賴）；用舊橋搬資料（分類錯、無溯源、title 去重）；`REQUIRED` necessity（enum 無此值，`SPEC/specs/cognitive/recipe.schema.yaml:355`）；把「移植 enforceCitations」說成等價（原邏輯改寫 [?] 不 FAIL）；P1–P4 含自然人 |

## 1. 定位與映射
- 產品 = **AI LEGO Cognitive Engineering OS**（母文件 `SPEC/AI_LEGO_Cognitive_Engineering_Os_Global_Master_Plan_v1.md:254-300`）。三條線 = 母文件 §78 使用者流程（`:3062-3095`：Create Project → Upload Sources → Ingest → Normalize → Knowledge Build → … → Compile → Approve → Execute → Human Review → Write）的三個實例。**蒐集與彙整落在 Execute 之前的 Project 階段**，Recipe 只做 Execute（這正是 critic C2 的修法，也是母文件的順序）。
- 六大 Workspace（`:3019-3050`）：L1 Knowledge→Decision Room；L2 Decision Room；L3 Knowledge→Data Lab→Artifact Studio。
- 完成計畫 `COS/docs/feature-cognitive-os-completion.md:13,15,18` 切片 2／4／7 = P1／P2／P4；切片 8 = P5。
- HCI-30 不在關鍵路徑（決策記錄 §10.3-3）。
- **L4 藝術反思線（操作者 2026-09-23：Art Reflection Framework「以後也會是主力」）**：來源 = Airtable base `appbQ5ACPPxMybVvM`（20 表；`Art Reflection Tools` 每筆 = 使用情境／詳細流程／時間分段／材料／帶活動者提示用語／個案困難／停止活動訊號／評估指標／反應紀錄方式／理論依據／可轉譯為數位互動；`WuSheng Five Phases` WS-01…05 各有 Guiding Question／Session Focus／Practice Strategy／Progress Indicators；治理欄 Canonical ID／Publication Slug／Content Hash（fnv1a64）／Record Version／Record Status／Active／Source Verification／Data Sensitivity／RLS Required）。定位：**不是第四套系統，是同一引擎上的第四條線**——一個工具 = 一個方法契約＋一堂課＋帶領腳本；五生階段 = 一個旅程 recipe；Observe→Externalize→Reflect→Question→Compare→Reframe→Judge→Revisit = 每次 session 的 recipe。EdD 的 Judgment Sovereignty 核心原則 = 這條線的閘（D20）。上線面：soulfulexpression.org（WordPress）只放公開工具說明與預約；互動流程 = `cognitive-web` 參與者模式（app ≠ portal），且在 P-P 之後。

## 2. 不變量（I1–I10）
| # | 不變量 | 機械落點 |
|---|---|---|
| I1 | 同一 Project 內 `(canonical_url, content_sha256)` 唯一；同 URL 新 hash = 新 Source 列 + `supersedes_source_id`，舊列 `status=superseded`（同一交易）+ event。hash = `sha256(utf8(text))`，NA 端算（`NA/lib/collect/types.ts:51`），COS ingest 重算比對不符即 400（ADR 011 §決策 2，`011-collection-ingestion-boundary.md:52-56`） | §3.4-C2 |
| I2 | 抓回內容 = `EVIDENCE／SOURCE_QUOTATION`（`types.ts:33-45`）；彙整輸出走 runtime 既有規則 `AI_INFERENCE／AI_GENERATED`（`rt:28-29`），草稿走 `AI_SUGGESTION／AI_SUGGESTED`（`draft.py:195-206`）；永不自動晉升 | 平台既有 |
| I3 | 彙整**與解讀**每個主張的引註 ⊆ **prompt manifest**（實際送進 prompt 的 Source id + sha256 + 字元範圍）；越界或零引註 = gate FAIL（比 `report.ts:191-200` 的「改寫 [?]」嚴格，刻意） | §3.4-C4／C10 |
| I4 | 方法 builder 只吃結構化 record；彙整表 → 方法 kwargs 必經顯式映射（`ai.draft_record` + 人填價值判斷欄），不直接 binding | §3.4-C5 |
| I5 | 報表 = 版本化 artifact，`AI_GENERATED → HUMAN_APPROVED`，每個 [n] 解析到 Source id + sha256 + URL + fetched_at | §3.4-C6 |
| I6 | 租戶邊界 = COS `Tenant→Workspace→Project`（`BP/12:27-39`）；NA 對 COS 寫入只憑 **per-run ingest grant**（tenant+project+run+scope+exp，伺服器端綁定 project），永不持有靜態全域寫權（`BP/12:62,78`） | §3.4-C3 |
| I7 | 六個橫切面（路由／預算／禮貌／去重／續傳／重試）由 `NA/lib/collect/orchestrator.ts` 獨佔（ADR 011 §決策 1、5：`:50,64-70`）；COS 不發對外 fetch（`COS/ai_lego/platform/net/egress.py:44-50` deny-by-default） | Collection Service 只暴露 `runs` |
| I8 | Recipe 引擎（`exec`）**零改動**；新增行為只以「Project 層級動作」與「capability adapter」實作 | §4 D5 |
| I9 | **演化只改資料、不改碼；任何候選版本必須在 harness 上不劣於 champion 才能晉升，晉升可一鍵回滾**（prompt／角度表／來源分類／模型／recipe 預設皆為版本化資料；程式碼改動一律走人審 PR） | §3.8、§3.4-C9 |
| I10 | **分數是閘，不是目標**：偵測器門檻（品質、密度、相關性、引註）永不由演化迴圈自動調整，只能提案給人（操作者既有裁定：禁止改門檻消音偵測器） | §3.8、§7 R11 |

## 3. 架構
### 3.1 系統邊界
```
cognitive.aware-wave.com (COS, 產品殼)             app.aware-wave.com (NA, 內部營運)
├ Tenant/Workspace/Project/Identity/Entitlement     ├ Collection Service: POST /api/internal/collect/runs
├ Sources（研究來源系統紀錄, CAS）                   │   → Trigger task collect-research-run → runCollection
├ Project 動作: collections / synthesis / reports    │   → sink/cognitive → COS ingest（憑 grant）
├ Recipes（既有引擎；1 個新 recipe）                 ├ 客戶 KB cs_knowledge_*（客服語料，維持）
└ Dashboard: 新研究 → 蒐集 → 彙整 → 起草 → 執行 → 報表 → 核准
lobster-net：兩容器同網（COS egress allowlist 加 NA 內部 host）
```
### 3.2 資料流（一條線一次）
1. `POST /projects`（purpose∈{partnership_risk, decision, edd_research}，subject_kind；`data_classification` 由 purpose+kind 伺服器端決定）。
2. `POST /projects/{id}/collections`（非同步）：COS 寫 `CollectionRequested` event → 發 **ingest grant**（§3.4-C3）→ 呼叫 NA `POST /api/internal/collect/runs`（bearer + grant）→ NA 啟 Trigger task → `runCollection`（既有）→ `sink/cognitive` 批次 `POST COS /projects/{id}/sources/ingest`（Authorization: Grant）→ 完成 `POST COS /projects/{id}/collections/{run}/complete`（同 grant，附 RunReport 摘要）→ `CollectionCompleted` event。Dashboard 輪詢 `GET /projects/{id}/collections/{run}`。
3. `POST /projects/{id}/synthesis`（context-bound capability，§3.4-C4；背景執行 + 輪詢）：讀本 Project Sources → 建 prompt manifest → AI gateway 起草 → typed-object builder → gates（含 `citation_integrity`）→ 存 artifact + `SynthesisCreated` event。
4. Dashboard 選 recipe（既有）→「從彙整表起草」= `ai.draft_record`（brief = 彙整表 JSON）→ 人填價值判斷欄（權重／分數）→ `POST /recipes/{id}/run`（引擎不變；`data_classification` 改由 Project 推導；`async:true` 時 202 + 既有 `GET /recipes/{id}/runs/{run_id}` 輪詢）。
4b. `POST /methods/{id}/interpret`（body = invoke 的 kwargs，§3.10、C10）：伺服器**重跑** builder + gates（任一 FAIL → 422，record 不信任客戶端）→ 202 + `interpretation_id`（背景 thread；provider 與 nginx 都是 60s，`provider.py:45`、`default.conf:431`）→ manifest = record 葉路徑 + Project Sources → AI gateway → `MethodInterpretation` → gates → record＋解讀同存 artifact CAS + `InterpretationCreated`；`GET /interpretations/{id}` 輪詢；結果頁顯示解讀，JSON 收進專家模式。
5. `POST /projects/{id}/reports`（context-bound capability）：讀彙整表 + run 結果 → md（+pdf）→ [n] 經 manifest 解析 → artifact CAS + `ReportGenerated`；`POST …/reports/{id}/approve` → `ReportApproved`（identity_id）。
### 3.3 元件表
| 元件 | 狀態 | 位置 | 說明 |
|---|---|---|---|
| Source 溯源欄位 + supersede | 新 | `COS/ai_lego/core/domain/source.py`（`source_record` 現固定 `status=active, version=1`）；`repo:36-60`（add-column 慣例 `:114-123`）；`SPEC/specs/domain/source.schema.yaml` | 加 `canonical_url, source_uri, fetched_at, provenance{epistemic_type,authorship_state,locked}, source_class, relevance_json, supersedes_source_id`；repo 加 `supersede()`（同交易 UPDATE 舊列 + append event） |
| ingest 端點 | 新 | `main`（`:1187` create_source 旁） | `POST /projects/{id}/sources/ingest`，body = §3.4-C1；auth = grant；冪等 §3.4-C2；`created_by_identity_id` = grant 綁的 collector identity |
| Ingest grant + collector identity | 新 | `COS/ai_lego/platform/identity/store.py`（仿 `:342-385` handoff code：hash 存、單 run、exp）；`apps/cli/bootstrap_service_identity.py` 加 `--tenant-id`（現只會建新 tenant，`:47-58`） | grant = `{tenant_id, project_id, run_id, scope:source.ingest, exp}`，HMAC 或隨機 + hash 存表；每 run 一把；COS 驗 grant 並以 grant 的 project_id 覆寫路徑參數 |
| Collection run 動作 | 新 | `main`（projects 區）+ `SPEC/specs/domain/collection-run.schema.yaml` | `POST /projects/{id}/collections`、`GET …/{run}`、`POST …/{run}/complete`；狀態 requested→running→completed/failed；events 落 `repo` events 表 |
| Collection Service | 新（薄） | `NA/app/api/internal/collect/runs/route.ts`（bearer `COLLECT_RESEARCH_RUNS_TOKEN`，樣板 `run-due-schedules/route.ts:27-32`）；`WF/src/trigger/collect-research-run.ts` | 輸入 `{grant, cos_base_url, project_id, run_id, seeds[], budget}`；只轉交，不做決策 |
| `sink/cognitive` | 新（一檔） | `NA/lib/collect/sinks/cognitive.ts`（形狀同 `sinks/kb.ts:125-246`） | 唯一知道 COS 的檔；批次 ingest；`finalize` 呼叫 complete |
| Context-bound capability adapter | 新（一類） | `rt:70-100`（現為純函式表，宣告 side-effect-free）→ 加 `build_context_bound_adapters(deps)`，deps = {source repo, artifact store, ai gateway, tenant, project} | **不變量修訂**：registry 分兩類：pure（既有）／context-bound（新，只給 Project 動作與 report 用，不進 Recipe 純步驟）；契約檔標 `binding: context` |
| **解讀層 `interpret.method_record`** | 新（context-bound） | `COS/ai_lego/modules/research/interpret_method_record.py`；typed object `SPEC/specs/cognitive/typed-objects/method-interpretation.schema.yaml`；contract `SPEC/capabilities/contracts/interpret.method_record.capability.yaml`（`binding: context`）；端點 `main` `POST /methods/{id}/interpret`（`:758` invoke 旁） | 輸入 = invoke kwargs（＋可選 project_id），伺服器重跑 builder+gates；prompt 由方法契約 `purpose／inputs／outputs／recommended_next`（`SPEC/methods/contracts/*.contract.yaml`，例 `systems.iceberg_model.contract.yaml:34-70`；contract 的 purpose／inputs 是 slug，語意在 `methods/registry/method-display-metadata.yaml` 的 blurb／why zh+en，一併進 prompt）+ typed-object schema 生成，**零方法專屬程式**；輸出 §3.4-C10；gates：`citation_integrity`（同 C4）、`visual_bindings_resolvable`、`next_methods_resolvable`（⊆ ACTIVE catalog；184/285 方法 `recommended_next` 為空，catalog 以 id+blurb 一行進 prompt，成本入 `ai_usage`）；`repo` 新增公開 `append_event(aggregate_id=interpretation_id)`（現 `_append_event` 私有 `:60-72,167`）；202 + 輪詢（背景 thread） |
| **視覺原語** | 新（web） | `COS/apps/cognitive-web/components/visual/{layered,quadrant,table}.tsx`（PI）+ `{matrix,graph,tree,timeline,scorecard}.tsx`（P3）；family→kind 預設表 `SPEC/evolution/interpretation-visuals/v1.yaml`（第 7 種可演化 kind） | 8 種通用圖形涵蓋 285 方法；`visual = {kind, bindings}`，bindings 只指向 record 葉路徑（LLM 不產座標與數字；Eisenhower 的象限是 builder 算的 `eisenhower_matrix.py:91-99`）；方法契約可覆寫 kind；`chart_render.py:62` 現有 `{forest_plot, bubble_chart, quadrant_chart}` 維持給 recipe artifact 用，不擴 |
| **路由與部署（web）** | 新 | nginx `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`（`cognitive.aware-wave.com` 區塊 `:427-450`）；`dashboard.html:299` `api()`；`COS/deploy/deploy.sh:15,113`；`COS/docker-compose.yml` | FastAPI 全部路由在根路徑（`main.py:357-1417`），所以分流 = `/api/` → api（去前綴）、`/expert/` → api `/`（舊 dashboard `api()` 加 `API_PREFIX='/api'`）、其餘 → web；smoke 改 `/api/health`；web 放 **`COS/apps/cognitive-web`**（prod 是 sparse clone `/opt/cognitive-os`，只含 COS+SPEC，WORKLOG 2026-09 `:1450`）；compose 改動走 `deploy.sh`（repo 檔即 prod 檔）並擴成多服務（npm ci + tsc + vitest、web healthcheck、`cognitive-web:rollback` tag、測試清單加 interpret）；nginx 改動走 `safe-infra-patch.sh nginx` + 手動 cognitive smoke；同源 → cookie `samesite=strict`（`main.py:746`）不需 BFF |
| **Airtable → SPEC 同步（L4）** | 新（資料） | `COS/scripts/sync-art-reflection.py`（唯讀 Airtable API；輸出 `SPEC/methods/contracts/art_reflection.<slug>.contract.yaml` + `SPEC/evolution/lessons/art_reflection.<slug>.yaml` + `SPEC/recipes/validated/wusheng-journey-v1.recipe.yaml`）；主鍵 = `Canonical ID`；只取 `Record Status=Active ∧ Active=true`；`Content Hash`／`Record Version` 進契約 `source` 欄，不同即標 drift；Airtable 仍是作者端 SSOT，同步單向 | 欄位映射：使用情境→`purpose`／`preconditions`；詳細流程→`inputs`（每步一欄）；停止活動訊號＋個案困難→`quality.stop_signals`（閘）；評估指標＋反應紀錄→`outputs`；帶活動者提示用語＋主辦者台詞→lesson／facilitation；理論依據＋延伸閱讀→`citations`；搭配工具→`recommended_next`；五生階段連結→recipe 步驟；Data Sensitivity→`data_classification` |
| **判斷主權閘（L4）** | 新（gates） | `COS/ai_lego/modules/reflection/sovereignty_gates.py`（`gates.py:41-63` 旁） | D20 七閘：`participant_final_judgment`、`no_preset_conclusion`、`influence_inventory`、`evidence_conditions`、`revisit_scheduled`、`stop_signals`、`no_belief_scoring`；適用於 `art_reflection.*` 與兩個 recipe |
| `synthesis.*` ×3 | 新（移植） | `COS/ai_lego/modules/research/synthesis_{dossier,decision_evidence,literature}.py`；typed objects `SPEC/specs/cognitive/typed-objects/{dossier-brief,decision-evidence-brief,literature-matrix}.schema.yaml`；capability contracts 同名 | prompt／段落表逐字移植 `report.ts:76-139`；輸出含 `manifest_ref`；每主張 `citations[]`=source_id |
| `citation_integrity` gate | 新（擴充） | `COS/ai_lego/modules/research/gates.py:41-63` 旁 | 輸入 record + manifest；越界／零引註 FAIL；`uncited_sections[]` 進 evidence 不 FAIL |
| `literature_search` adapter v2 | 改 | `rt:80-88`（offline fixture）→ project-backed：回本 Project `source_class=academic` Sources | 關 OQ-LITSEARCH-3、OQ-EDD-LITERATURE-1；`edd-literature-search-v1` fixture recipe 退場（§8） |
| Recipes | 1 新 + 2 既有 | `SPEC/recipes/validated/partnership-risk-v1.recipe.yaml`（新：`stakeholders.stakeholder_map` → `challenge.red_team`，皆 ACTIVE）；L2 用 `life-decision-v1`／`business-feasibility-review-v1`；L3 用 `edd-research-evidence-v1` | necessity 只用 `REQUIRED_BY_RISK`（`SPEC/specs/cognitive/recipe.schema.yaml:355`） |
| 非同步 run 旗標 | 新（小） | `main:534-655` `run_recipe` | `async:true` → 背景 thread 執行，202 + run_id；狀態走既有 `GET /recipes/{id}/runs/{run_id}`；RUNNING 中斷 = 以新 run_id 重跑（P5 前接受；lease 在 P5） |
| run 分類伺服器端推導 | 改 | `main:623-632` | 不再讀 body；由 Project `data_classification`（Title_Case）映射到 run 詞彙（UPPER，`main:1095-1098`）；`COGNITIVE_OS_JOURNAL_KEY_MODE≠disabled` 進 P1 DoD |
| `artifact.generate_report` | 新 | `SPEC/capabilities/contracts/artifact.generate_report.capability.yaml`（context-bound） | md（+pdf）、引註表、`report_state`、export `GET /projects/{id}/artifacts/{id}/export` |
| Dashboard 「新研究」 | 新 | `COS/ai_lego/apps/api/dashboard.html`（pill 慣例 `:414-425`，不用 `<select>`） | 線別按鈕 → 表單（名稱／定位詞／角度／預算＝成本預覽）→ 蒐集進度 → 彙整 → 起草 → 執行 → 報表 → 核准 |
| Egress allowlist | 改 | `COS/docker-compose.yml:24-26`；`SPEC/policies/ai-execution/network-egress.yaml` EGRESS-EC99-2 | 加 NA 內部 host（`lobster-next-admin:3000`）；兩處同步 |
| Postgres／object storage | P5 | `identity/store.py`、`repo`、`custom_workflow_repository.py`、`data/object/tenant_scoped_cas.py` | repository 介面不變；RLS Tier A（`BP/12:41-50`） |
### 3.4 契約
- **C1 Source 投影**（sink → ingest）：`{canonical_url, source_uri, content_sha256, mime, content_type, title, author, published_at, fetched_at, text, provenance{epistemic_type, authorship_state, locked}, collector, source_class, relevance{entityConfidence, entityAnchorsHit, searchAngle, searchQuery}, schema_version}`。來源：`RawDoc`（`types.ts:48-81`）去掉 `raw`、`tenantRef`、整包 `meta`；`relevance` 取自 orchestrator 蓋的 `meta`（白名單同 `sinks/kb.ts:106-115`）。`data_classification` 不由 sink 給，由 Project 決定。
- **C2 冪等／版本**：`(project_id, canonical_url, sha256)` 已存在 → 200 `{unchanged:true}`；同 URL 不同 sha256 → 新 source_id + `supersedes_source_id`，舊列 `status=superseded`，event `SourceSuperseded`；ingest 重算 `sha256(utf8(text))` ≠ 送來的 → 400 `SOURCE_HASH_MISMATCH`。
- **C3 認證（三把，各自獨立，未設 fail closed）**：① COS→NA `runs`：bearer `COLLECT_RESEARCH_RUNS_TOKEN`（NA 端驗，`run-due-schedules/route.ts:27-32` 樣板）；② NA→COS `ingest`／`complete`：`Authorization: Grant <token>`，COS 驗 hash + exp + run 未關閉，並以 grant 內 project_id 覆寫路徑；grant 只經 Trigger payload 傳遞**參照 id**，token 本體由 NA 於 route 內以 ① 換取（`POST COS /collect-grants/{ref}/exchange`），不落 Trigger DB；③ 對外 fetch 只在 NA。COS 端寫入身分 = collector identity（真 Identity 列）。
- **C4 彙整與引註**：capability 先建 manifest（n → source_id, sha256, [start,end)，總量上限沿 `report.ts:82-83` 40 篇×6000 字，超過者分批 map-reduce，manifest 記每批）→ prompt 以 `<<<SOURCE n>>>` 包（`report.ts:93-105`）→ builder 驗 typed object → `citation_integrity`：`∀claim.citations ⊆ manifest.ids`，否則 FAIL；`citations=∅` 的 section 列 `uncited_sections`。manifest 與輸出一起存 artifact。
- **C5 映射**：彙整表 → 方法 kwargs 用 `ai.draft_record`（既有）逐方法起草；價值判斷欄（WDM `weights／scores／scale`，`life-decision-v1.recipe.yaml:60-69`；toulmin `warrant／qualifier`）標 `human_required`，dashboard 未填不准 run；bindings 仍指 `source.*`（引擎不變）。
- **C6 報表**：sections = 彙整段落 + 各 step record 表 + gate 表；附錄「來源」= `[n] title — url — sha256[:12] — fetched_at`；「本報表的問題」= `invalid_refs／uncited_sections`；`report_state ∈ {AI_GENERATED, HUMAN_APPROVED}`；核准寫 `ReportApproved`（identity_id）。
- **C7 成本**：`POST /projects/{id}/collections` 先回 plan（查詢數×供應商單價 + 抓取上限）需 `confirm:true` 才執行；entitlement id `research.collect`（`main:1008-1009` 旁）；P5 前恆 true（`COS/ai_lego/platform/entitlement/check.py:5`）。
- **C8 harness 契約**：`score(case, output) → {metric: value}`，指標名固定（§3.7）；`thresholds.yaml` 每線每指標；harness 離線（來源快照，不連網、不用 collect）；報告含每案例每指標與 champion 差值；CI 紅 = commit 不得合併。
- **C9 演化契約**：候選 = `{kind, version, diff, evidence[run_ids, metrics], risk_tier}`；晉升條件 = `∀metric: challenger ≥ threshold ∧ challenger ≥ champion − ε` 且主指標 > champion；R3+ 或觸及門檻 → `requires_human=true`；晉升與回滾都寫 LEDGER + event；champion 指標檔是唯一切換點（程式讀它，不讀「最新版」）。
- **C11 解決方案契約**：`Solution = {options[{id, name, actions[], layer_refs[], time_to_effect, cost, durability, risk, citations[]}], recommended{option_id, rationale}, plan[{week_from, week_to, action, owner(human_required), evidence, target}], metrics[≤3 {name, baseline, target, due}], approvals_needed[], review_at}`；**方案來源四層（操作者 2026-09-23 問「解決方案怎麼來的」）**：① 方案框架來自方法契約的介入模式（冰山 = 回應／預測／設計／轉化，所以是 3 條路不是任意數），不由模型發明；② 每個 option／action 必須引 [n]（record 欄位或 Sources），引不到的只能進 `gaps`，不得進 plan；③ 力道與順序不由模型斷言，交給 `recommended_next` 的下一個方法算（槓桿點分析、因果迴路、實驗設計）；④ 案例庫：人核准／退回過的方案成為可演化資料（§3.8，R0–R2），初期為空；**模型禁止**：自創目標數字（目標由 baseline 或人定，示意稿的 62→75 只為示意）、填負責人／期限、無證據宣稱因果。由同一次 interpret 產生（AI_GENERATED），`owner／review_at` 未經人填確認不得存成任務；到期重跑 = Project 層級排程動作（Claude routine 或 Trigger），結果為 `SolutionReview{before, after, verdict}` artifact + event。
- **C10 解讀契約**：`MethodInterpretation = {interpretation_id, method_id, record_sha256（伺服器重跑 builder+gates 後的 record，與解讀同存）, findings[{id, title, text, citations[]}], recommendations[{level, action, expected, citations[]}], gaps[{text, needed_evidence}], visual{kind ∈ 8 種, bindings}（schema 每 kind 一個 oneOf；bindings 值 = record 葉路徑）, next_methods[] ⊆ catalog ACTIVE（`recommended_next` 只是偏好；`causal.dag`／`root_cause.fishbone` 指向無契約的 `validation.experiment`）, provenance{AI_INFERENCE, AI_GENERATED}, model, usage}`；manifest id = record **葉路徑** `r/<field>/<i>/<key>`（純量、dict、巢狀皆可引），排除系統參數 `id／version／provenance／generated_by_method`（`main.py:720-722`）+ Project Sources（有 project_id 時）；`∀citations ⊆ manifest`、`∀bindings ⊆ manifest` 否則 FAIL；`findings=∅` FAIL；**不含 state／核准**（核准／退回在 P4 加 `interpretation_state` + endpoint）；語言依 Project／session `language`；成本走 `ai_usage`，日預算 `COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET`（既有）。
### 3.5 租戶、身分、i18n、抹除
- 操作者用自己的真實 tenant；service-tenant 橋整套廢除（§8）。外部客戶：portal → provisioning（`agency-os/docs/System_Foundry_v1.6_ARTIFACT_COMPLETE/commercial/PROVISIONING_STANDARD.md`），P5。
- i18n：方法 registry 已 zh/en；synthesis prompt 依 Project `language`；報表欄位雙語預留。
- 抹除：**自然人來源在 P-P 之前不進系統**（ADR 011 §決策 10，`:79`）。P-P 前提：Source 內容以 per-subject DEK envelope 加密（`COS/ai_lego/security/key_vault/local_key_vault.py` 現為 synthetic-only、未接 API），CAS 定址改為含 subject key id（現為 tenant 級內容定址 `tenant_scoped_cas.py:56-64`，跨 Project 同內容共用 blob，銷毀 DEK 抹不到、unlink 會誤刪），抹除 = 銷毀 DEK + 驗證讀不回；殘留邊界依 README「Not proven」段誠實揭露。
### 3.6 安全邊界
- 抓取只在 NA（`NA/lib/collect/net/*`、`provenance.ts`）；COS egress allowlist 只加 NA 內部 host。
- synthesis prompt 資料塊包裹 + system prompt 宣告非指令；manifest 讓「引用了沒送進去的來源」不可能 PASS。
- grant 單 run、短效、hash 存；`complete` 後 grant 作廢。

### 3.7 品質評分 harness（把「完善」變成數字）
| 元素 | 內容 | 位置 |
|---|---|---|
| 黃金案例 | 每條線 ≥3 個案例（P2）→ ≥5（P-E 前）：固定來源快照（Source 檔＋sha256，不連網）+ 人工標註的**期望發現**（L1：關鍵事實／爭議／關聯人；L2：選項／準則／關鍵證據；L3：主張／方法／限制）+ 已知陷阱（同名混淆、購物頁、注入句、矛盾來源） | `COS/eval/cases/<line>/<id>/{sources/, expected.yaml, README.md}`；合成或已公開資料，不含自然人敏感內容 |
| 指標 | 引註精確率（每個 [n] 指向的來源真的支持該句，抽樣人審＋自動比對）、引註覆蓋率（期望發現被引到的比例）、幻覺率（越界／無來源主張）、矛盾偵出率、缺口誠實度（gaps 列出期望缺口的比例）、拒收正確率（陷阱被擋）、成本（查詢數／token）、時延 | `COS/eval/score.py`；輸出 `eval-report.json` + md |
| 門檻 | 每線每指標一個門檻，**由操作者定**（初始值 = 首次基準線）；低於門檻 = FAIL | `COS/eval/thresholds.yaml`（版本化） |
| 觸發 | 每個影響 synthesis／collect／recipe 的 commit（CI）；每夜對 champion 跑一次（漂移偵測，模型或供應商變了會先在這裡紅） | `COS/scripts/test-eval-harness.ps1`；夜跑走 Claude routine |
| 突變證明 | 拔引註閘 → 幻覺率飆 → 紅；把一個期望發現從來源刪掉 → 覆蓋率降 → 紅 | harness 自己的 mutation 腳本 |

### 3.8 演化迴圈（「應時俱進」的可執行定義）
不是 AI 改自己的程式。是一條**量測 → 提案 → 挑戰 → 晉升／回滾**的閉環，每一步都是既有原語：
```
量測   telemetry（每 run：引註率、拒收原因分布、角度產出率、人改了什麼、核准/退回、成本）→ ai_usage + events
提案   routine（夜跑）讀 telemetry + harness 報告 → 產出「候選資料版本」：新角度／來源分類新增／prompt 改寫／模型切換／recipe 預設；每個提案附證據（哪些 run、哪些指標）
挑戰   champion-challenger recipe：challenger 在 harness 全套 + 最近 N 個真實 Project 重放（replay.py）上跑；記分
晉升   不劣於 champion（所有門檻不降、主指標提升）→ 資料版本切換 + 事件；劣 → 丟棄並留紀錄
回滾   一鍵回上一版（rollback_plan.py 樣式）；夜跑漂移紅 = 自動回滾到最後綠版
人審   R3+ 風險（模型換供應商、成本上限、任何門檻）永遠停在提案，操作者批准才晉升；程式碼改動 = PR + critic + oracle
```
| 元件 | 位置 |
|---|---|
| Telemetry events | `repo` events 表新增 `RunScored`／`HumanEdited`／`ReportApproved|Rejected`；`ai_usage` 已有 |
| 回饋擷取 | dashboard 核准／退回附原因（chips）；draft 與人改後的 diff 存 `HumanEdited` |
| 版本化資料 | `SPEC/evolution/<kind>/<version>.yaml`（kind = angles／source-classes／synthesis-prompts／model-routing／recipe-defaults／**ux-defaults**（文案、預設值、步驟順序，§3.9））+ `champion.yaml` 指標指向現行版 |
| 提案 routine | Claude routine（`/schedule`）：讀 harness 報告 + telemetry 摘要 → 寫 `SPEC/evolution/proposals/<date>-<kind>.yaml` + PR；不直接切換 champion |
| 挑戰執行 | `COS/scripts/run-challenger.ps1` → harness + replay → `eval-report`；`champion-challenger.recipe.yaml` 記錄裁決 |
| 演化帳本 | `SPEC/evolution/LEDGER.md`：每次晉升／回滾一行（版本、指標前後、證據、批准者） |

### 3.9 首用即上手的 UX（第一次用的人不看文件能走完）
**現況證據（為什麼第一次用的人卡住）**
| 介面 | 證據 | 卡點 |
|---|---|---|
| `/ops/collect` | `page.tsx:25-27` 先選「客戶」；`CollectionSourcesPanel.tsx:426-476` 九種來源核取方格用實作語（`collect/entity-dossier`、「按次計費」、「缺少 SERPER_API_KEY」）；`:582`「先在左邊勾一個或多個來源」；`:906-944` 拒收原因字串 | 入口是「工具」不是「任務」；不知道該勾哪一個、填什麼、跑完去哪看 |
| 客戶中心「客服」分頁 | `ClientHubTabs.tsx` 12 個原生 `<select>`（違反操作者「禁 `<select>`」裁定）；`:1795-1811` 兩顆關鍵按鈕藏在「先點一個資料夾」之後 | 主要動作不可見；資料夾名稱是時間戳 |
| Cognitive OS dashboard | `dashboard.html:181-185` 空狀態要人「左邊選一個工作流或單一方法」（285 個）；`:212-217` `run_id`／「續跑既有 run」；`:1397-1410` 結果 = 閘門表 + 記錄 JSON；`:155` 有搜尋框但沒有「你要做什麼」 | 285 選 1 的牆；術語（工作流／方法／閘門／run）；結果不是報表 |
| HCI | `index.html:302,494` 有「這個系統怎麼運作？」說明頁 | 唯一有解釋層的介面，當樣板 |

**原則（U1–U12，每條可驗）**
| # | 原則 | 落點 |
|---|---|---|
| U1 | 入口 = 任務，不是工具：首頁三張卡「查一家公司／組織」「評估一個決定」「整理文獻」 | 首頁 |
| U2 | 一條線性流程 + 進度條：建立 → 蒐集 → 彙整 → 分析 → 報表 → 核准；每步**一顆**主按鈕 | 每個 Project 頁 |
| U3 | 白話優先：預設介面不出現 recipe／method／gate／capability／binding／run_id；術語只在「專家模式」與 hover 詞彙表 | 文案 registry |
| U4 | 漸進揭露：角度、預算、模型、嚴格模式收在「進階」，預設值可直接跑 | 建立步 |
| U5 | 花錢前先講：「會做 12 次搜尋，約 $0.3，3–5 分鐘」+ 確認（§3.4-C7） | 建立步 |
| U6 | 空狀態教學：每個空面板說「這裡會出現什麼」+ 讓它出現的那顆按鈕 | 每步 |
| U7 | 拒收用人話 + 一個可做的動作（沿 `explainReason`，`CollectionSourcesPanel.tsx:880-904`） | 蒐集步 |
| U8 | 狀態是「地方」不是「分頁」：關掉視窗再開，Project 頁顯示走到哪、下一步是什麼（事件驅動，§3.2） | Project 頁 |
| U9 | 首次登入有一個**已完成的示範 Project**（L2），先看到終點再開始 | 首登 seed |
| U10 | 每步右側「這一步在做什麼／為什麼」由 registry 資料生成（`why_zh`／`method-form-examples.yaml` 慣例），不手寫 HTML | 說明面板 |
| U11 | 控制項：按鈕／chips／核取方格，**禁原生 `<select>`**；鍵盤可操作；狀態不只靠顏色 | 元件庫 |
| U12 | zh-TW／en 切換；文案外部化（同 registry） | i18n |
| U13 | 同一骨架：每個方法的結果頁固定七段（§3.10），首用者第二次就能預測 | 結果頁 |
| U14 | 頁首「怎麼讀這一頁」三步；術語首次出現附一句白話（`<dfn>`） | 結果頁 |
| U15 | **先上課再動手**：每個方法第一次使用前一堂 ≤5 分鐘的課，固定六步：這是什麼（何時用／不用）→ 各層／各欄位配日常例子 → 看一個做完的例子 → 怎麼填（每步好例／壞例）→ 常見錯誤 → 開始（準備清單＋「用示範案例試一次」＋「開始填我的」）；每人每方法只自動出現一次，可跳過，方法頁「怎麼用？」隨時重開；示意稿 `COS/docs/mockups/iceberg-lesson-mock.html`（線上版 https://claude.ai/artifact/653Kt4JtExaujnffNDvygY ，私人）；課程結構參考 thesystemsthinking.com 冰山教學（定義→四層→例子→步驟→常見錯誤），內容改寫非轉載 | 方法頁前置 |

**首用流程（螢幕級）**：0 首頁三卡 → 0.5 該線預設方法的 5 分鐘課（U15，可跳過）→ 1 建立（名稱、類型、定位詞；預設角度已勾；成本預覽；主按鈕「開始蒐集」）→ 2 蒐集中（進度、已收 N、擋下 M 與原因、可停）→ 3 彙整（草稿每句 [n] 可點開原文；「有缺口」「來源互相矛盾」用卡片）→ 4 分析（預設方法已選；需要你填的欄位標紅，例如權重；主按鈕「執行分析」）→ 5 報表（預覽、「核准」、匯出 md／pdf）。任何一步失敗：一句人話 + 一個按鈕（重試／調整／跳過）。

**量測（沒有數字不算做完）**
- 首用測試協定 `COS/eval/ux/FIRST_RUN_PROTOCOL.md`：一位非操作者測試者，L2 從零（含 5 分鐘課）到核准報表，**≤20 分鐘、零求助**；記錄每步秒數與卡點；SUS ≥ 70。P3 DoD。
- 漏斗事件：`started→collected→synthesized→ran→reported→approved`，含每步耗時與放棄點；進 §3.8 遙測。
- UX 文案／預設值／步驟順序 = §3.8 第 6 種可演化資料 kind（`ux-defaults`），卡點是提案輸入；門檻同 I10 由人定。

### 3.10 解讀層（方法執行後要有分析，不是 JSON）
- 現況：`main:758-788` invoke = builder + gates，無 LLM；`iceberg_model.py:56-109` 原樣回填輸入；結果頁 `dashboard.html:1394-1410` = 通過行＋閘門表＋JSON；AI 只在起草填格（`draft.py:1-10`）。操作者 2026-09-23 截圖確認。
- 做法：一個 context-bound capability（D4 同類）吃 invoke kwargs，伺服器重跑 builder+gates（`invoke` 不持久化 record，`main.py:788` 回傳即丟，客戶端給的 record 不可信），用契約＋display-metadata 生成 prompt，產出 C10 typed object，過 gates，record＋解讀同存 artifact；202 + 輪詢。方法專屬知識只來自契約 YAML 與可演化 prompt 片段（`SPEC/evolution/interpretation-prompts/`），**不寫 285 支程式**。
- 結果頁（web）**固定七段骨架**（操作者 2026-09-23 駁回第一版「無邏輯、無系統性」，依 NPC 冰山工作單與 Anderson & Johnson 理解層次表重做）：(0) 方法一句話＋「怎麼用？」（重開 U15 課程）＋「怎麼讀這一頁」三步＋**明確文字結論（一句話＋三個發現＋建議＋證據缺口，每句 [n]）** → (1) 結構圖：方法原生圖形（冰山／矩陣／樹…），左＝每層要回答的問題＋你填的，右＝該層介入方式，可見／不可見分線；**＋圖表分析（每張圖回答一個問題：趨勢／因果迴路／槓桿對比，資料只綁 record 與 Sources，無資料時標示意）** → (2) 逐層卡，同骨架：這層問什麼 → 你填的 [n] → 這代表什麼 → 在這層出手＋效果＋槓桿 → (3) 總結：在哪層出手＋證據缺口 → (4) 對照表（層 × 介入方式 × 時間取向 × 問題 × 你的案例 × 建議）→ **(5b) 解決方案（操作者 2026-09-23：「要分析問題也要解決問題」）：A 選方案（2–3 個方案 × 見效／成本／持久度／風險／建議；即 L2 決策線，可接 `life-decision-v1` WDM）→ B 行動計畫（週次／行動／負責／證明方式／目標；負責人與期限 `human_required`）→ C 追蹤驗證（≤3 個指標：現況／目標／期限；`review_at` 到期自動用新 Sources 重跑同一 interpret 並比較前後；改善→案例庫，未改善→回 A）** → (5) 下一步方法（標明加深哪一層；第一顆 = 契約 `recommended_next`）→ (6) 引註 → (7) 來源標記／模型／費用／核准／專家模式。每層的問題、介入動詞、時間取向、可見性 = 方法資料（display-metadata + `SPEC/evolution/interpretation-prompts/`），不寫進程式；沒有「層」的方法（矩陣、清單）以其原生單位（象限、項目）套同一骨架。示意稿 `COS/docs/mockups/iceberg-result-mock.html`（操作者冰山案例，v2.1；線上版 https://claude.ai/artifact/7JLjM7mGyqTMLJmCMUmWqq ，私人連結，同檔重發即更新）。
- 驗收：同一支程式對兩個不同 family（`systems.iceberg_model` → layered、`decision.eisenhower_matrix` → quadrant）產出不同視覺；突變：拔 citation gate → 無引註主張 PASS → 紅；拔 `next_methods_resolvable` → 幻覺方法 id PASS → 紅；拔 `visual_bindings_resolvable` → 綁到不存在路徑 PASS → 紅；改 family→kind 表 → 視覺跟著變；送一份閘門會 FAIL 的 kwargs → 422、不呼叫模型、`ai_usage` 無新列。

## 4. 決策紀錄（D1–D22）
| # | 決策 | 為什麼 | 淘汰 |
|---|---|---|---|
| D1 | 產品殼 = Cognitive OS | `BP/12:143-151` `app ≠ portal`；COS 已有租戶／身分／entitlement／journal／商業計畫 | next-admin `/ops/research` |
| D2 | 研究來源系統紀錄 = COS Sources | ADR 011 §脈絡 `:14-20` 三類別不共儲存；產品擁有租戶資料 | KB-as-service（ADR 011 §決策 3 末項 `:57-61` 講的是 KB 服務化，與引擎共用無關） |
| D3 | 蒐集引擎留在 NA，經內部 API 服務化 | ADR 011 §決策 1（`:50` 取得＋抽取是共用層）；零重工 | 移植到 Python |
| D4 | 彙整 = context-bound capability（注入 repo + AI gateway），不是 method、不是 NA 的 LLM 呼叫 | method handler 是純 builder（`rt:48-52`）、capability registry 純函式表（`rt:77`）；需要依賴注入就開新一類，不改既有兩類 | synthesis 當 method（v1） |
| D5 | 蒐集與彙整是 **Project 層級動作**，Recipe 引擎零改動 | `exec:236-250` 只能 resume SUCCEEDED/FAILED；`main:131-133` journal 不含 source；母文件 §78 順序 | collect 當 Recipe step（v1） |
| D6 | 三條線 = Project.purpose 決定「彙整 schema + 預設 recipe」；只新增 1 個 recipe | L2／L3 既有 recipe 已可用（`life-decision-v1` 真跑 PASS） | 三個新 recipe（v1） |
| D7 | 報表 `AI_GENERATED→HUMAN_APPROVED` | 決策記錄 X6 | 直接最終版 |
| D8 | HCI 不在關鍵路徑 | 決策記錄 X1/X2 | — |
| D9 | P1–P4 SQLite 單租戶；P5 Postgres | repository 介面已隔離（`repo:1`） | 先換 DB |
| D10 | 自然人來源獨立 P-P（High-STOP），P1–P4 的 L1 只做公司／組織／事件 | ADR 011 §決策 10；CAS／vault 現況（§3.5） | L1 含人一起做（v1） |
| D11 | 「自行進化」= 量測→提案→挑戰→晉升／回滾的閉環，只改版本化資料；程式碼永遠人審 | 30 年紀律：無界爆炸半徑不可接受；既有原語（champion-challenger、prompt replay／rollback、golden harness）已是這個形狀 | 讓 agent 直接改 prompt／碼並部署 |
| D12 | 分數是閘不是目標；門檻只能人改 | Goodhart：迴圈會學會討好指標；操作者既有裁定禁止改門檻消音偵測器 | 讓迴圈自調門檻「提高通過率」 |
| D13 | **前端殼 = 新 Web app `COS/apps/cognitive-web`（Next.js 15，與 next-admin／portal 同技術棧；Playwright 在 `lobster-factory/infra/hetzner-phase1-core/tests/` + `scripts/playwright-runner.ps1`）**，操作者 2026-09-23 拍板 B；§3.9 首用流程 + §3.10 結果頁；`dashboard.html` 降為「專家模式」直到 parity 後退場；API 不變 | `BP/12:9-16` Web／API 分離；1443 行單檔 vanilla JS 做不到 i18n、元件庫、a11y、可測；零重工：表單仍由 `method_form.py` 產生 | A 續改 `dashboard.html`（每加一步都是 DOM 手拼，無測試）|
| D14 | 解讀層 = **一個**通用 context-bound capability + 8 種視覺原語；方法知識只來自契約 YAML 與可演化 prompt 片段 | 285 方法不可能各寫一支；契約已有 `purpose／inputs／outputs／recommended_next`（`systems.iceberg_model.contract.yaml:34-70`）；D4 同類、I2／I3 同規則 | 每方法手寫解讀／圖表（`dashboard.html:1320-1345` 那種）；在 builder 內呼叫 LLM（builder 必須純，`rt:48-52`） |
| D15 | ⑦ 執行順序 P0 → PI-a → PI-b → P1；**⑧ P0 部署與 PI-b 同窗**（一次 prod 變更、一次 go-ahead） | 操作者 2026-09-23 授權「你是專家你決定而且要記錄下來」；P0 單獨上線無操作者可見價值、多一次 prod 風險；橋在關掉前只有操作者會按且已知凍結；部署當次仍照 AGENTS §3 要 go-ahead | P0 先獨立部署；⑦ 等操作者 |
| D16 | 每個方法結果頁都接「解決方案」三步（選方案→行動計畫→追蹤驗證）；工具負責想清楚、排出來、盯著看，執行是人；負責人／期限人填；到期自動重跑比較 | 操作者 2026-09-23「要分析問題也要解決問題啊」；分析停在診斷 = 無處方；選方案就是 L2 線，零重工；追蹤重跑重用 interpret + Sources + 排程 | 只出分析；AI 自填負責人與期限；工具假裝能執行 |
| D18 | **教學例子跟著使用者進來的那條線走，不預設商業場景**：`lessons` 每方法四組例子 `{edd_research, partnership_risk, decision, everyday}`；顯示 Project.purpose 對應那組，可切換；「這是什麼」步用 everyday（零領域知識）；操作者預設 = 教育研究；示範 Project（U9）與課程用同一組例子；**永不**拿使用者真實填過的案例當教材 | 操作者 2026-09-23「所有帶入的例子應該以哪一種類型為主？像這個你是用商業行為」——客服例子是她測試輸入被我誤當教材；主要使用者是 EdD 研究者兼工作室經營者，商業通用例最不貼身 | 單一商業例；用真實案例當教材 |
| D19 | **L4 = 同一引擎上的方法家族**：一個 Airtable 工具 = 一個 `art_reflection.*` 契約＋一堂課＋帶領腳本；五生階段 = `wusheng-journey-v1`；八步反思循環 = `reflective-cycle-v1`；Airtable 是作者端唯一正本，單向同步到 SPEC（Canonical ID 為鍵、Content Hash 偵漂移、只同步 Active）；她 registry 裡規劃的 Supabase 遷移 = 對映到 COS P5 Postgres 同一套 schema，**不另建第三個資料庫** | 工具庫欄位與方法契約幾乎一對一（§1）；零重工；她的治理欄位已足夠做同步與漂移 | 第四套獨立系統；手工重打 200 個工具；Airtable 與 SPEC 雙向同步 |
| D20 | **判斷主權核心原則 → 機械閘**（EdD Core Integrity Specification）：`participant_final_judgment`（參與者原話是記錄，AI／帶領者輸出只能 AI_SUGGESTED 附掛，不得覆寫）；`no_preset_conclusion`（輸出無「正確結論」欄，只描述判斷形成過程）；`influence_inventory`（影響來源清單必含 facilitator 與 framework 本身）；`evidence_conditions`（「什麼證據會讓我改判斷」必填，答「沒有」= 標 unrevisable 供研究，不算失敗）；`revisit_scheduled`；`stop_signals`（Airtable 停止訊號 → session 中止）；`no_belief_scoring`（任何評估 artifact 只准量 process visibility／revisability／evidence articulation，禁對 belief 打分）。閘與版本化資料走既有演化迴圈＋LEDGER = 「framework 可被檢查、可被推翻」 | 操作者 EdD 文件 §8 八條不可妥協原則；閘門是這個系統既有原語；讓「原則」變成「機器會擋」而非宣言 | 原則只寫在文件；AI 生成「成熟度分數」 |
| D21 | **個案 = 自然人 → P-P 前置**：ARF 真實參與者資料（她 registry 標 Personal Data／Sensitive Clinical Data 的 Clients／Assessment Results／Treatment Plans）在 P-P（加密、抹除、同意）完成前**不進系統**；之前只有「帶領者／自我模式」（操作者本人或合成資料）；soulfulexpression.org 只出 Public／Reference 類內容 | D10 同一條線；她自己的 Data Sensitivity 欄位已標明 | 先接參與者再補個資 |
| D22 | **順序**：共用引擎（PI）→ P-ARF-data（2d，純資料：同步腳本＋五生階段各前 2 個工具 ≈10 支契約＋課，人審）→ P1–P4 → P-P（High-STOP）→ P-ARF-participant（5d：`reflective-cycle-v1`、圖像 artifact、參與者模式頁、WuSheng 互動流程接 soulfulexpression.org）。電商後台 `app.aware-wave.com`：本計畫不動（P0 凍結除外），進度本 session 未查證 | 操作者「所有的事情都在進行中都沒完成」→ 一次只讓一條線到「可用」；ARF 是主力但依賴引擎與 P-P；資料層工作可先做且零風險 | 平行開 4 條線；ARF 另起爐灶 |
| D17 | 課程層 = 資料驅動：課文由 display-metadata（blurb／why zh+en）+ 契約 `purpose／inputs／preconditions` + `method-form-examples.yaml`（示範案例）+ 第 8 種可演化 kind `lessons`（每方法的日常例子／好例壞例／常見錯誤）生成；三條線的預設方法（冰山、WDM、Toulmin、文獻矩陣等 ≤10 個）人審定稿，其餘 275 個由模型起草標 AI_SUGGESTED、首次被開啟時送人審佇列 | 操作者 2026-09-23「使用者之前沒有使用過這個工具，所以你要先幫他上課」；285 支課不可能手寫；課文錯誤的爆炸半徑 = 誤導一次使用，可回滾 | 只給示範 Project（U9）不教方法；285 支全部手寫；課文寫死在前端 |

## 5. 分期
| 期 | 內容 | 風險 | 完成定義（缺一不算） | Rollback | 估工 |
|---|---|---|---|---|---|
| **P0 凍結** | 三顆「送去 X」按鈕與兩條橋 feature-flag OFF（不刪碼、**不搬資料**）；`lib/hci/client.ts:6-9`、`CollectionSourcesPanel.tsx:991-993`、`ClientHubTabs.tsx:1880-1888` 過期註解改事實 | Low | NA 頁面無「送去 X」；`npx tsc` 綠 | flag ON | 0.5d |
| **PI-a 解讀層 + 新殼第一片（碼＋本機）** | context-bound adapter 類（`rt:70-100`）；`interpret.method_record` + typed object + 3 gates + `POST /methods/{id}/interpret`（202）+ `GET /interpretations/{id}`；`repo.append_event`；`COS/apps/cognitive-web` 骨架（Next.js 15；同源 `/api/` 呼叫 COS，登入頁；方法挑選最小版；表單渲染移植 `dashboard.html:901-1255` 的 variant／rows／fixedRows／upstream／json／pills／conditions；**結果頁 §3.10** + layered／quadrant／table 三種視覺 + 專家模式 JSON）；Dockerfile；`deploy.sh` 擴成多服務；Playwright `cognitive` project + `COS_TEST_{TENANT_ID,EMAIL,PASSWORD}` env | Medium | 本機 `docker compose up`（api+web）：操作者的冰山案例 → 結果頁如示意稿，每句主張有 [n]；`decision.eisenhower_matrix` 同一支程式出 quadrant；三個突變（§3.10）各紅；閘門 FAIL 的 kwargs → 422 且不呼叫模型；COS unittest + golden 綠；web `tsc` + vitest 綠；Playwright 登入→執行→結果一條；`ai_usage` 有該次記錄 | 契約→DRAFT 即消失；web 目錄獨立可刪；`deploy.sh` 多服務段落為附加 | 5d |
| **PI-b 上 prod** | nginx `/api/`／`/expert/`／`/` 分流（`safe-infra-patch.sh nginx`）；`dashboard.html:299` `API_PREFIX`；`deploy.sh:15` smoke → `/api/health`；`/opt/cognitive-os` pull + `deploy.sh`（api+web）；P0 的 next-admin 經 `sg-deploy.sh`（D15 同窗） | **High-STOP**（prod 部署，每次 go-ahead） | `app.aware-wave.com/ops/collect` 無「送去 X」按鈕；`https://cognitive.aware-wave.com/api/health` 200、`/expert/` 舊頁可登入、`/` 新頁跑完冰山案例；deploy.sh 全綠；`printenv` 驗 web 容器 env | nginx 還原（safe-infra-patch 自動）；`cognitive-web:rollback` tag；api 不動 | 0.5d |
| **P1 Source + Collection Service** | §3.3 前六列 + egress allowlist + `--tenant-id` bootstrap + journal key mode | Medium | curl 觸發一次真實 company run（操作者真 tenant）→ COS Sources 帶 provenance／fetched_at／collector identity；重跑同 seeds → 全 `unchanged`、0 新列；改一頁內容重跑 → supersede 列 + event；壞 hash → 400；過期 grant → 401；NA `tsc`+vitest 綠；COS pytest + golden 綠；`printenv COGNITIVE_OS_JOURNAL_KEY_MODE` ≠ disabled | 新欄位 nullable；端點下線；sink 檔刪；allowlist 還原 | 3d |
| **P2 彙整 + 引註閘 + harness** | 重用 PI 的 adapter 類與 `citation_integrity`；三個 synthesis + typed objects + manifest + gate；`literature_search` v2；**§3.7 harness：每線 3 個黃金案例（P-E 前補到 5）、score.py、thresholds.yaml（首次基準線）、CI 接入、突變腳本** | Medium | 對 P1 的 Project 跑 `dossier_brief`（company）：每主張引註 ⊆ manifest；突變（拔閘）→ 假引註 PASS → 紅；`literature_search` v2 回真 Sources、`edd-research-evidence-v1` 用它跑 PASS；golden 全綠；**harness 9 案例全部跑出分數、基準線寫入、拔閘突變讓幻覺率變紅** | 契約 status→DRAFT 即從 catalog 消失；harness 目錄獨立可刪 | 3d |
| **P3 三線端到端 + 首用流程** | web 三卡 + §3.9 六步流程（骨架與路由已在 PI）+ 其餘 5 種視覺原語（matrix／graph／tree／timeline／scorecard）+ **課程層（U15／D17：課程頁元件、`lessons` 資料 kind、≤10 個預設方法人審課文、其餘模型起草＋人審佇列、每人每方法一次的已看紀錄）** + 示範 Project seed + 說明面板（registry 生成）；draft-from-synthesis + `human_required`；`async:true`；run 分類伺服器端；`partnership-risk-v1` | Medium | L1（公司）／L2／L3 各一次真跑到方法輸出；未填權重不准 run；長 run 走 202 + 輪詢；成本預覽 = 實際查詢數；**首用測試協定通過（非操作者、L2 ≤15 分鐘零求助、SUS ≥ 70）**；Playwright 走完六步；零原生 `<select>`（grep = 0） | recipe→DRAFT；旗標移除；三卡頁下線回 PI 結果頁；課程層 = 資料，刪 `lessons` 目錄即無課 | 5d |
| **P4 報表 + 解決方案** | `artifact.generate_report` + export + 核准；解讀的 `interpretation_state` + 核准／退回 endpoint（C10 移來）；**C11：方案比較／行動計畫（`human_required` 負責人與期限）／指標／`review_at` 排程重跑與前後比較（D16）** | Medium | 三線各一份 md（+pdf），[n] 全解析到 id/sha256/url/fetched_at；核准翻轉 + 事件含 identity；再跑 = 新版本；**冰山案例：方案表 3 列、計畫表含 owner 待確認、指標 3、排程一筆；owner 未填 → 存任務被拒；模擬到期 → 重跑產 SolutionReview** | capability 移除；排程刪除即停 | 3d |
| **P4b 回饋與遙測** | `RunScored`／`HumanEdited`／`ReportApproved|Rejected` events；核准／退回原因 chips；draft-vs-人改 diff；夜跑 harness 漂移偵測 routine | Low | 每個 run 都有分數事件；退回一次 → 事件含原因；夜跑連續 3 晚有報告 | 事件為附加，關 routine 即停 | 1d |
| **P-E 演化迴圈** | §3.8：版本化資料目錄 + champion 指標、提案 routine、`run-challenger.ps1`、LEDGER；第一批可演化資料 = 角度表、來源分類、synthesis prompt、模型路由 | Medium（資料級自動晉升需操作者同意範圍） | 一次真實循環：routine 產生提案 → challenger 在 harness + 3 個真實 Project 重放 → 不劣於 champion → 晉升 → LEDGER 一行 → 一鍵回滾成功；劣化提案被丟棄且留紀錄；夜跑紅 → 自動回滾到最後綠版 | 刪 champion 指標即回到硬編預設 | 3d |
| **P-ARF-data（L4 資料層）** | `sync-art-reflection.py`（唯讀 Airtable，Canonical ID 鍵，Active 過濾，Content Hash 漂移）→ 五生階段各前 2 個工具 ≈10 支 `art_reflection.*` 契約＋lessons（教育／合作／決定／日常四組例子）＋`wusheng-journey-v1` recipe；D20 七閘 + golden case | Low（資料＋唯讀同步） | 10 支契約通過 golden；`wusheng-journey-v1` 在 recipe engine 真跑 PASS（合成資料）；改 Airtable 一筆 → 重跑同步 → 該契約 `source.content_hash` 變且標 drift；突變：拔 `no_belief_scoring` → 含分數的評估 artifact PASS → 紅 | 刪 SPEC 產出檔；Airtable 不受影響 | 2d |
| **P-ARF-participant（L4 參與者層，P-P 後）** | `reflective-cycle-v1`（八步）；圖像 artifact（照片／作品，object storage）；`cognitive-web` 參與者模式（停止訊號 UI、同意、抹除入口）；soulfulexpression.org WuSheng 頁 → 參與者流程；facilitator drift 遙測（journal） | **High-STOP**（自然人資料；依賴 P-P 與 P5 object storage） | 一位帶領者＋一位同意的參與者跑完一個 session：參與者原話為記錄、AI 附掛皆 AI_SUGGESTED；evidence_conditions 空白 → 閘標 unrevisable；停止訊號觸發 → session 中止且事件留存；抹除 → 三處讀不回 | 參與者模式旗標 OFF | 5d |
| **P5 Production Trust** | Postgres + RLS Tier A、object storage、`.runtime` 進 backup routine、SLO／告警、rate limit、restore drill、run lease、portal provisioning、entitlement 真閘 | **High-STOP** | 第二 tenant 端到端 + 跨租戶負向測試綠；restore drill 過；`/check-drift` 綠 | 回 SQLite 映像 + 回填 | 5d+ |
| **P-P 自然人** | Source envelope 加密 + subject 級定址 + 抹除驗證 + ADR 011 §決策 10 解除的新 ADR + 操作者明示批准 | **High-STOP** | 抹除後 CAS／journal／artifact 三處讀不回；負向測試；ADR 落地 | 不上線即無資料 | 5d+ |
| **P6 選配** | `apps/collector` 容器；HCI adapter（`BP/10:83`） | Medium／High | 觸發：第二 tenant／要開 HCI 案 | — | — |

**執行順序** P0 → PI-a → PI-b → **P-ARF-data** → P1 → P2 → P3 → P4 → P4b → P-E；P5／P-P／P6 觸發式；**P-ARF-participant 在 P-P 之後**。**核心 P0–P4 = 20d；含 P4b + P-E = 24d**（1d = 一個完整工作 session，單一工程師；v1.4 的 15.5d 被 critic 以碼量駁回：表單渲染 355 行、`draft.py` 354 行同構、多服務 deploy、Playwright 新 project）。里程碑（操作者看得到的）：PI-b 完 = 第一次在正式站看到真分析（第 6 天）；P1 完 = 真來源進系統（第 9 天）；P2 完 = 引註彙整（第 12 天）；P3 完 = 三線端到端 + 課程 + 首用測試（第 17 天）；P4 完 = 報表 + 解決方案（第 20 天）。

## 6. 驗證矩陣（每期四動作 + 突變）
| 動作 | PI-a | P1 | P2 | P3 | P4 |
|---|---|---|---|---|---|
| 實測 | 操作者冰山案例真跑（真模型）；兩 family 兩種視覺；`docker exec` 讀 `ai_usage` 列 | curl + `docker exec` 讀 COS sqlite 列數／events | 真 Project + 真模型 | 三線真跑；202 輪詢；容器重啟後新 run 重跑 | 下載 md/pdf、核准事件 |
| Review | critic 1 + `/codex-review`（PY、TS 各一 artifact） | 同 | 同 | 同 | 同 |
| 抓蟲 | grep `renderQuadrantChartForMethod\|gate_results\|記錄 JSON`（舊渲染呼叫點） | grep `sink/kb\|cognitive_os_project_id\|import-sources` | grep `enforceCitations\|REPORT_SECTIONS\|offline_literature_search` | grep `importOrganizationSources\|hci-import\|data_classification\", \"INTERNAL` | grep `dossier_report\|build_dossier` |
| 突變 | 拔 citation gate → 無引註 PASS → 紅；拔 next_methods gate → 假方法 id PASS → 紅；拔 visual_bindings gate → 亂綁 PASS → 紅；改 family→kind 表 → 視覺跟著變 | 拔冪等鍵 → 重複列 → 紅；拔 hash 比對 → 壞 hash 200 → 紅；拔 grant project 綁定 → 跨 project 寫入 → 紅 | 拔閘 → 假引註 PASS → 紅；harness：刪一個期望發現的來源 → 覆蓋率降 → 紅 | 拔 `human_required` → 空權重 run → 紅 | 拔 [n] 解析 → 未解析引註 → 紅 |

- P4b／P-E 突變（不在上表）：夜跑把 champion prompt 換成故意劣化版 → 漂移紅 → 自動回滾；提案 routine 塞一個劣化提案 → 挑戰失敗 → 不晉升且留紀錄；拔 `requires_human` → R3 提案自動晉升 → 紅。

## 7. 風險與待驗證
| # | 風險 | 處置 |
|---|---|---|
| R1 | 長 run（synthesis／recipe）超過 Cloudflare ~100s | 背景 thread + 202 + 既有 journal 狀態端點；RUNNING 中斷以新 run_id 重跑（冪等）；lease 進 P5 |
| R2 | SQLite 單寫入者：ingest 批次 + dashboard 同時寫 | ingest 單交易批次；P5 前單 tenant；量測後決定 |
| R3 | 成本失控 | C7 plan+confirm；`MAX_QUERIES=16`（`NA/lib/collect/search/query-plan.ts:84`） |
| R4 | 注入內容 | 蒐集端隔離 + 資料塊包裹 + manifest 閘 + egress allowlist |
| R5 | 自然人法遵 | D10：P-P 前不進系統 |
| R6 | 學術全文只到 OA（`NA/lib/collect/collectors/academic.ts:8-13`） | L3 v1 = 摘要＋OA 全文；不假裝 |
| R7 | NA／COS 兩 deploy 單位漂移 | C1 `schema_version`；契約測試兩邊各一；`/check-drift` 比 env |
| R8 | `.runtime/` 未入備份 | P5 前先入既有 backup routine |
| R9 | context-bound adapter 破壞「registry side-effect-free」宣告（`rt:77`） | 分兩類、契約標 `binding: context`、純 Recipe 步驟禁用；golden test 守 |
| R10 | grant 經 Trigger payload 外洩 | 只傳參照，token 於 NA route 內換取；短效；complete 後作廢 |
| R11 | Goodhart：迴圈學會討好指標（例如少寫主張以拉高引註精確率） | 指標成對（精確率×覆蓋率×缺口誠實度）、主指標需人定；門檻只人改（I10）；抽樣人審每月一次 |
| R12 | 黃金案例過時、模型／供應商漂移 | 夜跑漂移偵測；案例每季由真實 Project 補 1 個；案例來源為快照不連網 |
| R13 | 演化成本（夜跑 token） | harness 用小模型跑結構指標、人審抽樣用大模型；`ai_usage` 計量 + 月上限 |
| R14 | 演化把「行為即資料」擴大成第二套程式（YAML 裡寫邏輯） | 可演化資料只限 §3.8 表列六種 kind；新增 kind 走 ADR |
| R15 | 兩個前端並存期（web + 舊 dashboard）功能分叉 | 舊 dashboard 只讀不加功能；parity 清單在 §0 追蹤；退場日期 = P4 驗收 |
| R16 | 首用測試只做一次、只有一位測試者 | 每期 DoD 重跑同協定；測試者輪替；卡點進遙測而非只靠一次觀察 |
| R17 | 解讀層幻覺：主張超出 record 與 Sources | manifest 只含 record 欄位 + Sources；`citation_integrity` FAIL；`gaps[]` 讓「不知道」有地方寫（缺口誠實度指標，§3.7） |
| R18 | 新 compose 服務 + nginx 路由 = prod 改動 | PI-b High-STOP；compose 走 `COS/deploy/deploy.sh`（`safe-infra-patch.sh compose` 只認 `/root/lobster-phase1`），nginx 走 `safe-infra-patch.sh nginx` + 手動 cognitive smoke；`/expert/` 保留舊頁；rollback = nginx 還原 + `cognitive-web:rollback` |
| R19 | 解讀單次呼叫 > 60s（provider `provider.py:45` 與 nginx `default.conf:431` 皆 60s）→ 504 但 token 已扣 | 202 + 輪詢；單次呼叫不做修復回合；`ai_usage` 先記後回 |
| R20 | ARF 外化步驟產出作品照片；COS artifact 現只有 JSON、Sources 只有文字 | 圖像 artifact 型別 + object storage 在 P5；P-ARF-data 階段只用文字紀錄（反應紀錄建議方式）；參與者層等 P5 |
| R21 | Airtable 與 SPEC 漂移；停止訊號欄多筆為空 | 單向同步＋Content Hash 標 drift；`stop_signals` 為空的工具在 recipe 中標 `requires_facilitator_review`，不上參與者模式 |

## 8. 退場清單（P0 flag OFF；P4 驗收後刪）
`NA/lib/cognitive-os/{client,import-sources}.ts`、`NA/lib/hci/{client,import-sources}.ts`、`NA/app/api/ops/clients/[slug]/{cognitive-os-import,hci-import}/route.ts`、`NA/app/api/internal/cognitive-os/import-project-sources/route.ts`、`NA/app/api/cognitive-os/open/route.ts`、`NA/lib/dossier/folder.ts`（`report.ts` 移植後整層刪）、`CollectionSourcesPanel.tsx:545-568`、`ClientHubTabs.tsx:1795-1811`、`SPEC/recipes/validated/edd-literature-search-v1.recipe.yaml`（fixture）、`rt:80-88` offline adapter；migrations 0087／0088／0089 欄位保留標 deprecated 不 drop；`bootstrap_service_identity.py` 的 service tenant 用法退場（改 `--tenant-id`）。`/ops/collect` 與客戶 KB **維持**。

## 9. 操作者已拍板／待拍板
- 已拍板：頂級國際規格；不補丁；LEGO；文件 AI 極簡；每 commit 1 critic；HCI 退出三條線；報表停在 AI 草稿；L1 自然人 Confidential（現改為 P-P 前不進系統，更嚴）；**品質評分 harness 進 P2、演化迴圈進計畫（2026-09-23 操作者：「補進去！…會自行進化的工具」）**。
- 已拍板（2026-09-23）：**UI/UX 納入計畫，首用者不看文件要能走完**（§3.9，P3 DoD 含首用測試）。
- 已拍板（2026-09-23 操作者回覆「1 是 2 是 3 是 4 是 5 是 6 要討論」）：
  ① P0（凍結三顆按鈕、改註解，Low）＋ P1（Source 溯源 + Collection Service，Medium）開工。
  ② L1 在 P-P 前只做公司／組織／事件，自然人等 P-P（D10）。
  ③ L3 第一版產物 = 文獻矩陣＋證據矩陣＋Toulmin，不含文獻回顧章節草稿。
  ④ P5（多租戶 Production Trust）與 P-P（自然人）在第二個租戶或真實人物需求出現時才啟動。
  ⑤ 演化迴圈自動晉升範圍 = 只有 R0–R2 資料級；模型切換與任何門檻永遠人審。
- 已拍板（2026-09-23，稍後）：⑥ = **B**，前端殼 = 新 `apps/cognitive-web`（D13），舊 dashboard 降為專家模式；解讀層（§3.10、D14）排在 PI 期，先於殼的其餘功能。
- 已定案（2026-09-23，操作者授權工程師決定並記錄，D15）：⑦ 執行順序 P0 → PI-a → PI-b → P1…（是）；⑧ P0 部署時機 = 與 PI-b 同窗。
- 待拍板：無。

## 10. 文件關係、維護規則、變更紀錄
- 本檔 = 計畫正本。`COS/docs/feature-cognitive-os-completion.md` 指回；`COS/plan.md` 勾選隨 §0；決策記錄 §10 指回；`agency-os/TASKS.md` 一列 = 進度指針；WORKLOG = 過程。
- 維護：改 §3.3 元件的 commit 必同步 §3.3／§3.4；`:line` 只在 §0／§2／§3／§7 出現；每完成 §5 一期更新 §0；契約變更走 ADR（`SPEC/docs/adr/`）。
- **v1.9（同日）**：操作者提出 Art Reflection Framework（Airtable `appbQ5ACPPxMybVvM`）＋ WuSheng Healing Module（soulfulexpression.org）＋ EdD「判斷主權教育架構」文件，問「應該怎麼加入」並說「所有事情都在進行中都沒完成」→ §1 L4 定位、§3.3 同步與判斷主權閘、D19–D22、P-ARF-data／P-ARF-participant、執行順序、R20／R21；電商後台不動。
- **v1.8.1（同日）**：操作者「例子應該以哪一種類型為主？像這個你是用商業行為」→ D18 例子跟線走（四組：教育研究／合作對象／決定／日常，預設教育研究，可切換，永不用真實案例）；課程示意稿改為教育例＋領域切換 chips，做完的例子改教師研習出席率。
- **v1.8（同日）**：操作者「使用者之前沒有使用過這個工具，所以你要先幫他上課」＋參考 thesystemsthinking.com 冰山教學（定義→四層→例子→步驟→常見錯誤）→ U15 課程層六步、D17 資料驅動課文、首用流程加 0.5 步、P3 +1d（核心 20d／含演化 24d）、首用測試 ≤20 分鐘含課；示意稿 `iceberg-lesson-mock.html`。
- **v1.7（同日）**：操作者「要分析問題也要解決問題啊！解決問題你打算怎麼做？」→ §3.10 (5b) 解決方案三步、C11、D16、P4 擴為報表＋解決方案（2d→3d，核心 19d／含演化 23d）；示意稿 v2.2 加 ⑦ 解決方案（方案比較、90 天行動計畫、三指標、到期重跑）。
- **v1.6（同日）**：操作者駁回示意稿（無邏輯、無系統性、首用者看不懂）並附 4 張參考圖（NPC 冰山工作單、可見／不可見金字塔、四問冰山、Anderson & Johnson 理解層次表）→ 示意稿重做為固定七段骨架、§3.10 結果頁骨架改寫、U13／U14；操作者授權「1 和 2 你決定並記錄」→ D15、§9 ⑦⑧ 定案。
- **v1.5（同日）**：critic（1 個，plan v1.4 接手審）2C/6M/4m 全折入：C1 nginx 分流改 `/api/` 前綴（FastAPI 全在根路徑）；C2 web 放 `COS/apps/`、compose 走 deploy.sh 多服務、nginx 走 safe-infra-patch；M3 interpret 202+輪詢；M4 伺服器重跑 builder+gates；M5 manifest 葉路徑；M6 visual bindings；M7 PI 拆 a/b（b High-STOP）+ §9 ⑦；M8 估工 PI 5.5d、P3 4d、總 18d/22d；m9 next_methods ⊆ ACTIVE + display-metadata；m10 `append_event` 公開、核准移 P4；m11 chart 3 種、compose env 覆蓋 env_file；m12 §6 表修正。
- **v1.4（同日）**：操作者截圖「執行並驗證只出 JSON，沒有分析」+ 拍板 ⑥=B + 「誰都可以直接接手」→ 補 §3.10 解讀層、C10、D14、PI 期（排在 P1 前）、§6 PI 欄、R17／R18、§11 接手指南；P2／P3 估工因骨架與閘門前移而減（4d→3d、5d→3d）；D13 Playwright 位置更正；§3.7 黃金案例 P2 先 3 個。
- **2026-09-23 拍板**：①–⑤ 是；⑥ = B（同日稍後）。
- **v1.3（同日）**：操作者「原來的工具 UI/UX 很爛，第一次使用的人根本無法知道要怎麼使用」→ 補 §3.9（現況證據三表、U1–U12、六步首用流程、首用測試協定與漏斗遙測）、D13 前端殼、P3 改為含首用流程與 UX DoD（5d）、`ux-defaults` 第 6 種可演化 kind、R15／R16、§9 ⑥。
- **v1.2（同日）**：操作者問「這樣就是最完美完整完善的工具了嗎」→ 答否，缺量尺與演化。補 §3.7 品質評分 harness（進 P2）、§3.8 演化迴圈（P4b 遙測 + P-E 迴圈）、I9／I10、C8／C9、D11／D12、R11–R14、§9 ⑤。
- 2026-09-23 v1：Recipe 中心。**v1.1（同日，critic 3C/8M/1m 全折入）**：C1 自然人→P-P；C2 collect 移出 Recipe 成 Project 動作；C3 grant + collector identity + egress；M4 synthesis 改 context-bound capability；M5 顯式映射 + `human_required`；M6 necessity 只用 `REQUIRED_BY_RISK`；M7 `literature_search` v2 取代新 capability；M8 manifest 為引註集合 + 擴充既有 gate；M9 P0 不搬資料；M10 supersede 列 + hash 比對；M11 run 分類伺服器端 + journal key mode；m12 檔數、`draft.py:195-206`、C1 欄位、D3 依據改 §決策 1、token 改名。

## 11. 接手指南（陌生 agent 從零開工）
- **讀序**：§0（現況）→ §5 找「目前」期 → §3.3 該期元件列 → §3.4 契約 → §9（不重問）→ §4 淘汰欄（不重提）。
- **路徑縮寫**：檔頭（COS／SPEC／NA／WF／BP）。spec root 對 runtime 唯讀（`COS/README.md`）。
- **本機跑**：COS 測試 `cd COS && python -m unittest discover -s tests -t . -v`；golden `python SPEC/tests/run_golden_tests.py`；API `uvicorn ai_lego.apps.api.main:app --port 8420`（= Dockerfile CMD）；NA `npm test` + `npm run typecheck`；Playwright `scripts/playwright-runner.ps1`。
- **環境變數**：`COS/deploy/.env`（不進 git）= `COGNITIVE_OS_ANTHROPIC_API_KEY`、`COGNITIVE_OS_AI_MODEL`、`COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET`、`COGNITIVE_OS_JOURNAL_KEY_MODE`；`COS/docker-compose.yml` `environment:`（**覆蓋 env_file，改 .env 無效**）= `COGNITIVE_OS_DB_PATH`、`COGNITIVE_OS_NETWORK_EGRESS_ALLOWLIST`；實值在各機 `mcp/user-env.ps1`，不硬編。
- **部署**：COS = ks-aw-01 的 sparse clone `/opt/cognitive-os`（只含 COS+SPEC）：`git pull --ff-only` 後 `bash Projects/internal/cognitive-engineering-os/deploy/deploy.sh`（test→health→smoke→rollback→notify；compose 檔即 prod 檔，多服務由它套用）；NA = `sg-deploy.sh`；nginx（在 `/root/lobster-phase1`）只走 `safe-infra-patch.sh nginx`（AGENTS §0），`cognitive.aware-wave.com` 區塊分流 = `/api/`→api（去前綴）、`/expert/`→api `/`、其餘→web；每次 prod 部署 = High-STOP，先要 go-ahead。
- **每期工作卡**（開工前寫，AI 極簡）：`files`（§3.3 列）／`tests`（新測試檔）／`verify`（一條指令 + 預期輸出）／`mutation`（§6 該欄）／`commit`（根因 + 驗證）／WORKLOG 四行（REALTEST／REVIEW／BUGHUNT／WORKLOG）。
- **進度指針**：§0 計畫列 + `agency-os/TASKS.md` 研究線一列 + WORKLOG 當日「續N」；三處只寫指標，細節在本檔。
- **不做**：不改 Recipe 引擎（I8）；不在 builder 內叫 LLM（D14）；不加原生 `<select>`（U11）；不碰自然人（D10）；不調門檻（I10）；每 commit 最多 1 個 critic（AGENTS §4）。
- **卡住**：架構衝突／缺資訊／無法驗證 → 停，§7 加一列，問操作者一題。
