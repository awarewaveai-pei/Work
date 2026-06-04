---
name: feedback-tomo-skip-propose
description: /tomo 應跳過 propose 步驟，直接寫入，不問確認
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 480ca719-3c67-4ca8-8f9d-16d5ad83808a
---

`/tomo <hint>`（無 bang）執行時，跳過 Step 4（Propose preview + 等待 go/補/重抓/取消）。

直接執行 Steps 5-7（寫檔 + commit + push），行為等同於 `/tomo!`。

**Why:** 使用者不需要預覽確認步驟；每次額外往返浪費時間。2026-05-28 明確指示。

**How to apply:** 收到 `/tomo <hint>` 後，secret scan 通過 → 抽取 context → 直接寫三個檔案，不顯示 preview 也不等 "go"。
