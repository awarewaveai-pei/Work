---
name: feedback-bilingual-jargon
description: 業界術語 / 技術 jargon 必須英文 + 中文並列說明，使用者喜歡學東西
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 637e44fc-72ed-46e9-9744-60868918cda3
---

遇到下列任何一種情況，必須**英文 + 中文並列**並簡短解釋出處 / 場景：

- 矽谷 / 工程業界慣用語（例：dogfooding 吃狗食、yak shaving 削犛牛、bus factor 巴士因子、shaving the yak、bikeshedding 自行車棚效應）
- 縮寫 / 術語（例：SSOT, RACI, SLO, SLA, SLI, MTTR, MTBF, RCA, ADR, BCP, DR, PII, PHI, RPO, RTO）
- 設計模式 / 架構名稱（例：Saga pattern, Outbox pattern, Circuit Breaker, Bulkhead, Event Sourcing, CQRS, BFF）
- 半成熟翻譯（例：observability 可觀測性、idempotent 冪等、reentrancy 可重入）

**Why**：使用者明示「我喜歡學東西」(2026-05-22)。本次「吃狗食」我直接用中譯就帶過，使用者反問才解釋。代理預設應假設使用者**樂於學新詞**，不應為了「簡單易懂」就閹割掉學習機會。

**How to apply**：
- 第一次出現該術語時，格式：「**dogfooding（吃自己的狗食 / 吃狗食）** — 矽谷術語，意思是『自己訂的規則，自己第一個遵守』」
- 同段後續再用該詞可省略，只用中譯或英文
- 出處 / 場景 1-2 句講完，不要長篇
- 不確定的中譯就明寫「無公認中譯，直譯為 X」

**反例（不要這樣做）**：
- ❌ 只寫「吃狗食」假設使用者懂
- ❌ 只寫「dogfooding」假設使用者懂
- ❌ 寫「Microsoft 1980 年代…」5 段歷史脈絡塞滿（過量）

**相關**：[[feedback-verify-four-actions]]、[[feedback-read-before-recommend]]
