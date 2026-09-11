# ADR 013: 開放式 discovery 可以餵 Corpus，但只能產生「候選來源」，不能直接產生文件

- **狀態**：已接受（操作者 2026-09-11 決定：「進 Corpus + 第三條路」）
- **日期**：2026-09-11
- **管轄**：agency-os 命名空間（3 位數）。延伸 [ADR 011](011-collection-ingestion-boundary.md) 的 Signal/Corpus/Evidence 三分。

## 脈絡

ADR 011 之後落地的蒐集器（`lib/collect/`，commit `2873b10b7`）只有一種入口：**你給網址**。seed 加上同網域的連結發現，範圍由 `inScope` 擋住，所以進客戶 KB 的東西，來源永遠是被指名過的站。

操作者提供的 `data_collection_design_v0.1.md`（2026-09-11）提出第二種入口：**你給查詢**，由 Exa 之類的 search API 從全網回一批網址。這在 Content Studio 那條線（Signal）已經有等價物在跑（`search/*` 積木），但那條線用完即丟、不落地。

問題因此是：查詢驅動的 discovery，能不能餵**會變成客戶答案**的 Corpus。

### 為什麼不是「順手加一個積木」

| | Signal | Corpus |
|---|---|---|
| 抓錯的後果 | 你看了覺得沒用 | AI 拿它當客戶的政策回答客戶 |
| 保存 | 用完即丟 | 版本化、要保新鮮 |
| 現有保證 | 無（本來就是雜訊池） | 「只抓你指名的站」——discovery 會**依設計**移除這個保證 |

注入掃描（`lib/collect/provenance.ts`）擋得掉明目張膽地種指令的頁面，擋不掉「內容本身就是錯的／過期的／競爭對手的」。那不是安全問題，是正確性問題，而正確性沒有任何機械閘能代替人判斷「這個來源該不該代表這個客戶說話」。

## 決策

1. **開放式 discovery 允許進 Corpus**，不限制在 Signal。
2. **discovery 的產出是 `SourceCandidate`，不是 `RawDoc`**。它永遠不會直接變成 KB 文件。
3. **候選必須經人核准才成為 seed**。核准後走的是既有那條路：seed → orchestrator → 品質閘 → 注入掃描 → `sink/kb`。抓取那一段**完全不改**。
4. **核准的單位是「來源」不是「文件」**。操作者核准的是「這個網域／這個路徑前綴可以代表這個客戶說話」，之後該來源的內容更新自動跟上——否則每頁都要人看，等於沒有自動化。
5. **撤銷要能生效**：來源被取消核准後，由它產生的文件必須可以一次找出來並 archive。因此候選的 id 要跟著它產生的每一份文件走。
6. **discovery 供應商是可替換的積木**，與抽取供應商共用同一個 provider 機制（`lib/collect/net/providers.ts`），不得把任何廠商寫進業務邏輯。

## 後果

- 新增一個狀態機：`candidate → approved → active → revoked`，以及一張小表（C6 落地）。
- 新增一個 UI 步驟：ops 端的「待核准來源」清單。這是**刻意**的摩擦，不是待優化項。
- `RawDoc` 需要帶候選來源 id 以支援決策 5 的撤銷。
- **不做**：自動核准規則（「權威網域自動通過」）。那會把「誰能決定客戶 KB 裡有什麼」交回給演算法，等於繞過本 ADR 的唯一理由。
- discovery 的呼叫量屬 `RATE_LIMIT`／`QUOTA`（[ADR 012](012-shared-platform-layer.md) §決策 1），計費併入該層，不自建計量。

## 落地位置

[`DATA_COLLECTION_PLAN.md`](../../data-collection/DATA_COLLECTION_PLAN.md) 新增 **C6 階段**（discovery → 候選 → 人審 → seed）。在 C6 之前，`lib/collect/` 不得出現任何以查詢為入口的積木——今天的 `match(t: Target)` 契約是 URL 形狀的，塞查詢進去會讓兩種語意共用一個型別，那正是本 ADR 要避免的混淆。

## Related

- [011-collection-ingestion-boundary.md](011-collection-ingestion-boundary.md)
- [012-shared-platform-layer.md](012-shared-platform-layer.md)
- `docs/data-collection/DATA_COLLECTION_PLAN.md`
- `docs/knowledge-base/KNOWLEDGE_BASE_PLAN.md`
