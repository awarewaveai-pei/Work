# 知識庫與資料蒐集器：要成為一流工具還缺什麼

> 2026-09-12。讀者是接手的 agent。每一條都對照實際程式，不是通用 RAG 清單。
> 觸發：操作者提供 GPT 的《低成本高速 RAG 系統建議》並要求「補進去 + 研究還要加什麼」。

## 0. 現況（已查證）

| 有 | 位置 |
|---|---|
| pgvector + hybrid（向量 ⊕ 關鍵字，RRF 融合） | `lib/kb/rag.ts:105-114`、`lib/kb/rrf.ts` |
| 六謂詞可見性，兩半逐字相同 | migration 0072／0075／0076，`kb-predicate-parity.test.ts` 機械守 |
| 版本化（同內容不產新版、舊版查不到） | `lib/kb/rag.ts`、`collect-c1-live.test.ts` 實測 |
| 出處三軸 + 引用 + 鎖 | migration 0075 |
| 引用文字在提示詞裡被包成不可信 | `lib/cs/cis.ts` `renderPassage` |
| 蒐集器九個來源、品質閘、robots、預算 | `lib/collect/` |
| **排名的關鍵字檢索** | migration 0076（本次補上，見 §1） |

## 1. 本次補上的缺口：關鍵字半邊根本沒在運作

`lib/kb/rag.ts:107` 把**使用者的整句問題**當 `p_term` 傳給 `cs_match_chunks_keyword`，而 0075 的實作是
`strpos(lower(c.content), lower(btrim(p_term))) > 0`。沒有任何 chunk 會包含一整句問題，所以**關鍵字半邊對任何真實提問都回零筆**，hybrid 自 0051 起實質上只有向量在跑，而且外部看不出來——「沒有關鍵字命中」和「這一半壞了」長得一模一樣。就算命中，`ORDER BY last_modified` 排的是「最近改過」不是「最相關」。

修法：`pgroonga`（supabase/postgres 鏡像已內建，實測載得起來、join 後 `pgroonga_score` 仍有效）＋ `lib/kb/keyword-query.ts` 把問題轉成可比對的詞：CJK 出字元 bigram、拉丁保留整詞。0051 當初留下 `bm25_tsv` 不用並寫明原因（Postgres FTS 切不好中文），這是那個懸而未決四個月的決定的收尾。

`bm25_tsv` 與 `idx_cs_chunks_bm25` 未刪——刪欄位不可逆，本 migration 已經改了檢索行為，一次只改一件。進 TASKS。

## 2. 下一步的第一順位：檢索品質沒有任何量測

`cs_eval_cases` 只評**答案**（`lib/cs/db.ts:19`）。檢索層沒有 recall@k、MRR、nDCG 任何一個指標，全 repo grep 不到。

**後果**：0076 到底讓檢索變好還是變壞，今天無法回答。再往下做的每一項（reranker、chunking、query expansion）都是猜測，而且互相抵銷時看不出來。**沒有量測就不可能是一流**，這一項優先於所有其他優化。

最小可用形狀：`kb_eval_queries` 表（query, expected_chunk_ids, organization_id），一支算 recall@k／MRR 的腳本，登記進 RUNNABLE_DEMOS。20 條真實問題就足以偵測退步。

## 3. 排序後的候選項

| # | 項目 | 為什麼 | 取代什麼 |
|---|---|---|---|
| 1 | 檢索評測集（§2） | 沒它其他都是猜 | 無 |
| 2 | Contextual Retrieval | `contextual_prefix` 欄位 0051 就宣告了、至今 null（`lib/kb/rag.ts:208` 自己註明）。切塊後每塊加一句「這段在講什麼」再嵌入，公開評測普遍降低 30%+ 檢索失敗 | 死欄位 |
| 3 | Reranker（cross-encoder，top-20 → top-5） | 不是省 token，是 `CS_THRESHOLDS.minRetrievalScore`（`lib/cs/config.ts:35`）拿檢索分數決定要不要轉真人。排序品質直接改變轉真人的時機 | 無 |
| 4 | 結構感知切塊 | 現行 `chunkText`（`lib/kb/rag.ts:164`）按空行打包到 500 字。表格、條列、標題階層會被切爛，而政策類文件正好都是這些 | 目前的段落打包 |
| 5 | 查詢擴展（多問法／HyDE） | 客人問「我要退錢」，文件寫「退款作業流程」。向量半邊能救一部分，擴展是便宜的補強 | 無 |
| 6 | 跨來源去重 | 同一份公告出現在官網與 PDF，會是兩個 family、兩份 chunk，檢索回兩次佔掉名額 | 無 |
| 7 | 句級引用 | 現在引用到文件；一流系統引用到句子，讓人一眼查證 | 無 |

## 4. 明確拒絕（GPT 建議裡的）

- **Semantic cache**：快取鍵必須含六個謂詞，少一個就是跨租戶洩漏；且「意思夠接近」會把改版前的答案繼續發出去，直接抵消整套版本化的目的。量體到了再談。
- **SQL 優先分層**：前提是結構化資料，我們的知識庫裝的是政策散文，加了是五層永不命中。
- **Redis 熱層／本地嵌入模型**：現在線上 1 筆文件，這是換一個有常駐成本的東西。另有陷阱：`embed_model` 是檢索謂詞的一部分，換嵌入模型＝整庫重嵌，未重嵌期間檢索**靜默回零**。

## 5. 蒐集器側

已排在 `DATA_COLLECTION_PLAN.md`：C3 排程、C3b webhook、C4、C5、C6。額外發現：

- **排程可以不用自己寫**。n8n 有 Schedule Trigger，定時打執行 API 即可。唯一擋著的是該端點只吃登入 session，要加 token 認證路徑——動 auth，需操作者拍板。
- **搜尋供應商已雙軌**（Perplexity／Brave），但兩把金鑰目前都不可用：Perplexity 的失效（401，兩個端點皆同），Brave 未申請。Google Custom Search JSON API **已對新客戶關閉**、2027-01-01 落日，不是選項。

## 6. 下一個動作

§2 的檢索評測集。它是唯一一個「做完之後其他每一項才能被證明有效」的項目。
