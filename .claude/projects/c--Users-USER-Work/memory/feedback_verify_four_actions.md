---
name: feedback-verify-four-actions
description: "R0 [驗證計畫] 必須涵蓋實測+Review+抓蟲+WORKLOG 四動作，缺一不可"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 637e44fc-72ed-46e9-9744-60868918cda3
---

寫 R0 [驗證計畫] 段時，必須明列四個動作並各自有具體執行方式，缺一視為不合格：

1. **實測（end-to-end real test）**：gh api / curl / docker exec / SSH / npm test 對遠端真實狀態執行；不可只跑 `grep -c` 或閱讀文字
2. **Review（讀回改後產物）**：Read 檔案驗結構 + 上下文 + markdown lint（code-fence paired）
3. **抓蟲（cross-file bug hunt）**：Grep 跨檔搜本議題的相關位置（agency-os/、docs/、scripts/、.claude/、lobster-factory/、downstream consumers），找其他 stale 主張或副作用
4. **WORKLOG（留證據鏈）**：[驗證結果] 段以 file:line 引用實際指令與輸出；同日 WORKLOG.md entry 含「四動作各自結果」摘要

**Why（必含「為什麼」否則容易跳）**：
2026-05-22 GitHub App 議題自己漏掉 worklog 動作，使用者問「你有實測+review+抓蟲嗎」才發現之前只 grep -c 計數就交差。R0 [驗證計畫] 原文「測試、lint、build、手動檢查或其他驗證方式」太抽象，導致代理（包含我）習慣性簡化為「跑 grep 就好」。本規則為防範同類失誤的硬性檢核。

**How to apply**：
- 在 R0 [驗證計畫] 段，先打四個 header `1. 實測 / 2. Review / 3. 抓蟲 / 4. WORKLOG`，每個 header 下強制填具體動作（含工具 + 範圍 + 預期輸出）
- 在 R0 [驗證結果] 段，對應四個動作各列實際執行結果（含 file:line 證據）
- 若某個動作真的不適用（例：純 docs 改動無 remote 可測），須明寫「N/A — 純 docs / 0 runtime 影響」，不可省略 header

**機械閘（2026-05-25 部署）**：
- `verify-closeout-completeness.ps1` 已加 REALTEST gate：staged `.ps1/.ts/.tsx/.js/.jsx/.mjs/.sh/.py` → WORKLOG 今日段必須有：
  - `- REALTEST_EVIDENCE: tool=<Bash|SSH|curl|WebFetch> | cmd=<command> | exit=<code> | ms=<N>` **或**
  - `- REALTEST_WAIVED: <DOC_ONLY|SMOKE_COVERED|QUERY_ONLY|NA> -- <reason>`
- 缺失 → AO-CLOSE exit 1（Gate=strict 預設）；代理自補後重跑
- AO-CLOSE 每次印 REALTEST summary 供操作者 spot-check

**正本位置**：[agency-os/AGENTS.md](d:/Work/agency-os/AGENTS.md) R0 §[驗證計畫]（L20-24）+ R4 §[驗證計畫] 四動作落實檢核（L38-46）；gate：`scripts/verify-closeout-completeness.ps1:114-147`

**相關**：[[feedback-read-before-recommend]]、[[feedback-health-gate]]、[[real-test-vs-unit-test]]
