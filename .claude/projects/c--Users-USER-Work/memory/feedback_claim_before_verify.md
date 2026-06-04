---
name: feedback_claim_before_verify
description: "VBC (Verify Before Conclude) — never declare \"X is broken/missing/not done\" from a single data point. Always read WORKLOG first when another session's work is in question."
metadata: 
  node_type: memory
  type: feedback
  originSessionId: cb5a4902-7e2c-47d9-bd6b-fd7100a9a06c
---

**Rule:** 宣告「X 缺失 / X 無保護 / X 沒做完」前，必須先查「是否有替代方案已補上」。單一數據源缺失 ≠ 整體未完成。

**Why:** 2026-06-04 CF WAF 案例：看到 CF WAF Custom Rules = 0 rules → 立刻宣告「wp-login 無保護」。但另一個 session 已裝 LLAR 外掛接手保護。兩件事放在一起才是完整畫面。這個錯誤發生過多次。

**How to apply:**

1. 使用者說「別的 AI / 另一個 session 處理好了」→ **先讀 WORKLOG**（最近 3 個 `## YYYY-MM-DD` 區塊）→ 找 `[已修改]` / `AUTO_TASK_DONE` / `REALTEST_EVIDENCE` → 完整理解做了什麼 → 才做正向驗證

2. 看到任何「A 層消失」（WAF 規則 / DB 設定 / 容器 / endpoint / 設定檔）→ 先問「誰接手了？」→ 查 B 層是否補上 → 再下結論

3. 禁止流程：查單一系統 → 看到缺失 → 馬上說「沒做好」

4. 正確流程：查單一系統 → 看到缺失 → 讀 WORKLOG → 確認全貌 → 結論

**Trigger phrases:** 「別的 AI」「另一個 session」「之前做過了」「似乎完成了」「處理好了」

**SSOT:** `agency-os/AGENTS.md` R4 §VBC + 觸發表 VBC 協議 row
