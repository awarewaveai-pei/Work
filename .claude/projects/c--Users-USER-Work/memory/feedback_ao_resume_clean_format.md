---
name: feedback-ao-resume-clean-format
description: "AO-RESUME reports must keep 7-segment structure but be cleaned up — tables, main-line grouping, no raw machine dump"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c5aa3e4f-25ac-4315-9fd0-200454e33747
---

AO-RESUME 開工報告（及任何 `reports/ao-resume/*.md`）必須**保留七段式結構**，但內容要整理乾淨，不能直接倒原始 hook 輸出。

**Why:** 2026-06-08 使用者明確抱怨原始報告「像一坨垃圾，看不懂」。但同時強調七段式是固定格式不可拆 — 整理 ≠ 改結構。

**How to apply:**
1. 七段編號（§1–§7）不可拆，無內容的段省略，禁止自創段號（曾誤加 §6 被罵）
2. §1 用精簡狀態表（項目|狀態）；非問題的 WARN 當列註明「非問題+原因」（如 CF 規則=0 → LLAR 替代）
3. §5 待辦**按主題歸類** — 核心用意：使用者會在不同天/臨時想到就加一段，同一件事散落 TASKS 各處；報告要把**同主題的併在一起**（① 一鍵架站 / ② 內容引擎 / ③ wp-bridge / 客戶試點 / 維運治理 / 雜項），不論當初哪天加、原本哪個 #### 分類；每項一行去冗字；**一項不漏**，count 要對得上
4. 機器欄位（log_tail 原文、原始時戳串、source flag）翻白話或省略
5. 不重複：同資訊只出現一段
6. 目標：比原始 hook 短，但待辦一項不少

SSOT 已寫入 `.claude/commands/ao-resume.md`（「輸出風格規範」block + §1/§5 規則）。相關：[[feedback-caveman-default]]（同屬輸出精簡偏好）。
