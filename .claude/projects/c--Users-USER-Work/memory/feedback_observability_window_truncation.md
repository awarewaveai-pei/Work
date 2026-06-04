---
name: observability-window-truncation
description: Claude 讀 hook state log_tail 看不到的 step ≠ step 沒跑；觀察視窗短於 emitter 輸出量會 hallucinate；fix = structured summary + 加大 tail (defense-in-depth)
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d05f5f68-b9c1-4a20-adea-ef210de2254d
---

當 hook / wrapper script 把 child process 的輸出截 tail-N 行寫進 state file 給 Claude 讀時，**N 必須 ≥ child 實際輸出行數，否則 Claude 對 truncated 段會 hallucinate「沒跑」**。

**Why**：2026-05-23 ao-resume hook log_tail=48，但 ao-resume.ps1 實際 emit 354 行 / 37 個 sub-step。Claude 讀 log_tail grep 不到「cross-machine import」字串就在 `agency-os/reports/ao-resume/2026-05-23-1848.md:24` 寫「本輪 hook 未跑 import script」— hallucination，實際 import 完整成功（13 檔案 unchanged，state file mtime 證據）。同類 bug 過去半年可能多次低嚴重度誤報（user-level sync / mcp sync / backup health 都在 truncated 區），因不 block 流程未被注意。

**How to apply**：
1. **設計階段**：任何 hook/wrapper 要 emit `log_tail` 給 Claude 讀，先量化 child 實際輸出行數，tail size 取 **3x headroom**（將來 child 加 sub-step 才不會立刻撞牆）
2. **同時 emit structured summary**：parse child 輸出的 step headers（regex 找 `== xxx ==` 或同類分隔符）寫進 state file 的 array 欄位（`steps_summary: [{name, detail}]`），Claude 讀 array 不靠 grep
3. **Defense-in-depth**：(2) 給 Claude 機械讀；(1) 給人類 debug；任一壞另一兜底
4. **驗證 pattern**：寫 mini test 餵真實 log 給新 parser → 確認所有期望 step 都進 summary
5. **檢查既有 hook**：類似機制（任何 `Get-Content -Tail N`、`tail -n N`、`head -n N` 後丟給 LLM 讀）都該套用此原則

**反例**（這次踩過的）：相信 log_tail 看不到 = 沒跑 → 寫進 daily report → 污染下次 AO-RESUME context

Fix commit：見 WORKLOG `## 2026-05-23 ### AO-RESUME hook log_tail 觀察視窗修正`

關聯：[[bug-hunt-protocol]] / [[verify-four-actions]] — 屬「觀察邊界誤判」bug class，應在 BUG_HUNT_PROTOCOL.md 5-tier 偵測列為一條（待補）。
