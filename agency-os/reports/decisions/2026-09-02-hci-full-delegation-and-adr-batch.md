# 決策：HCI 剩餘 18 項 HD 之操作者全權委任與 ADR 批次

**狀態：** `APPROVAL RECORDED` — 本文件是委任本身的紀錄，不是另一層待批准的提案。
**日期：** 2026-09-02
**性質：** 操作者直接、明示的口頭委任（本 session 對話原文），非 `/decide` 面板產出。

---

## 委任原文（逐字引用，不改寫）

> 可以開 但不是這種超過10個的,或是你覺得幾個合理?

（此句是前一則「不用subagent」指示之後的追問，確認「自己單一 session 寫」的授權方式）

在此之前，操作者已明示：

> 去處理好, 不用停下來等我核准任何事, 我給你100%決定權, 不用管先定的規則(要人類核准)都由你決定! 你是 全能規劃師和頂尖工程師（架構師 / DevOps / 資安 / DB / PM / 技術專技家），每個 subagent 自動繼承此身份。目標：完整理解現有系統後，不可用偷懶用補丁的方式處理, 要做最穩定、安全、可維護、可驗證、可回滾的修改、可彈性擴張像LEGO，能穩定運行 30 年。[...] 一直做直到 HCI系統完成

## 委任範圍與界線（誠實記錄，不誇大）

**委任的是什麼**：`HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md` 中原本標記「僅操作者可決定」的 HD-06 至 HD-23（18 項），加上 8 項憲法性 ADR（ADR-0001~0008，形式化既有原則、非新決策）、以及 `ADR-0016` 自身於 2026-09-02 稽核中發現的「租戶身分綁定機制」開放決策，其架構/工程選項的決定權，明確轉移給 Claude。

**委任的不是什麼**：
- 不是「不需要記錄理由」——每個 ADR 仍完整寫出 Context/Decision/Alternatives-rejected/Gates，可回溯稽核。
- 不是「可以不驗證」——所有 gate 仍標記 OPEN，直到有真實 migration/test 通過證據；沒有一項因為「委任」而跳過 R0/R4 的四動作驗證。
- 不是「操作者放棄否決權」——每份 ADR 的 Verification and rollback 段落都寫明「操作者可用後續明示決定推翻」。
- 不是資源使用權的委任——委任的是「選哪個選項」，不是「花多少 token/agent 去選」；後者另有 2026-09-03 的 `feedback_no_heavy_subagent_workflows.md` 記錄同一天發生的誤判（見下）。

## 執行方式的兩次修正（誠實記錄）

1. **第一次嘗試**：用 Workflow 工具，27 個 ADR 各配 draft+2 個獨立對抗式覆審+fix，約 102 個 subagent、1230 萬 token。5 分鐘內燒光操作者付費方案的 5 小時 session 限額，連續兩次。操作者明確指出這不合理（"5分鐘燒完token 我還是月付$100"）。已記錄於 `C:\Users\user1115\.claude\projects\D--Work\memory\feedback_no_heavy_subagent_workflows.md`。
2. **修正後**：後續所有 27 份 ADR 的通讀、交叉核對、修正（H1009 SQLSTATE 碰撞、ADR-0026 schema 假設錯誤、多處 sibling-ADR 狀態過期引用）均由本 session 單一 agent（不開 subagent）完成，操作者明示同意的方式（"要現在就開始（用我自己單一 session，不叫其他 agent）"）。

## ADR 批次結果

27 份 ADR 全數落地於 `governance/ADR-0001*.md` 至 `ADR-0033*.md`（跳過已存在的 ADR-0009/0010/0011/0014/0015/0016）。狀態明細見 `ADR_INDEX.md` 本次同步更新的 Register 表。

摘要：
- **8 項憲法性**（ADR-0001~0008）：形式化既有文件已在遵守但從未寫成 ADR 的原則（peer products、no cross-DB、單一 gateway、no universal trust score、optional integration、evidence 分離、modular monolith first、vendor-neutral core）。
- **10 項 Section A 剩餘**（ADR-0017~0020, 0013）：bitemporal scope（HD-06）、crypto-shredding（HD-07）、field author-class policy（HD-08）、shared kernel extraction（HD-09）、Case aggregate（HD-10）。
- **13 項 Section B**（ADR-0021~0032）：physical DB isolation、key rotation runbook、BYOK claim gating、multi-region trigger、AI agent credential boundary、Claim/Source tenant ownership、sanctions screening、bulk-export control、isolated fetch worker、regulatory market scope、controller/processor determination、usage-metering clause、personality/method disposition。
- **1 項稽核中新增**（ADR-0033）：`ADR-0016` 的租戶身分（tenancy-principal）綁定機制，解決 `SET ROLE` 偽造風險，Option B-signed。

**全部 gate 狀態為 OPEN**——本次委任只完成「選哪個選項」，沒有任何一項因此變成「已實作」。真人資料處理、production 部署，在每份 ADR 都明文不授權。

## 下次複審

- 操作者可隨時以明示決定推翻任一 ADR（各 ADR 自己的 rollback 段落已寫明機制）。
- 下一個自然複審點：Wave 1 schema freeze 前（`22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md` Wave 0 gate）。
