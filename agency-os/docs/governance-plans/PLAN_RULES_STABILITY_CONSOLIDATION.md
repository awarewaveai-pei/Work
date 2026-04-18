> **Owner**：規則整併「分階段執行」視角。對應舊 Cursor 檔名 **`rules-stability-consolidation_*.plan.md`**。  
> **憲法正文**：[`rules-version-and-enforcement.md`](../operations/rules-version-and-enforcement.md)。**收斂目標與 DoD**見同軌 [`PLAN_30_YEAR_RULE_CONSOLIDATION.md`](PLAN_30_YEAR_RULE_CONSOLIDATION.md)。

# Rules 長期穩定整併計畫

## 目標

把目前規則與治理文件收斂成「單一真相 + 可機器驗證 + 可回滾」的體系，確保：

- 不會因新增規則而沿用舊習慣
- 不會因多份規則/文件分叉而衝突
- 不會因一次大改造成系統壞掉

## 執行策略（安全分三階段）

### 階段 1：建立單一真相（不拆大結構）

- Owner 文件固定為：[`rules-version-and-enforcement.md`](../operations/rules-version-and-enforcement.md)
- 只在索引層補入口，不新增第二套正文：
  - [`cursor-enterprise-rules-index.md`](../operations/cursor-enterprise-rules-index.md)
  - `.cursor/rules/README.md`
  - `agency-os/.cursor/rules/README.md`
- 將 AO-RESUME 的無效回覆判定明文化：
  - `agency-os/.cursor/rules/30-resume-keyword.mdc`
  - `.cursor/rules/30-resume-keyword.mdc`

**驗收**：「規則版本/優先級/Hard-fail」只有一份正文（Owner）；其他檔案只有摘要 + 連結，不複製正文。

### 階段 2：把規則變成硬閘道（防漂移）

- 在 [`scripts/ao-resume.ps1`](../../../scripts/ao-resume.ps1) 加入 preflight 前置檢查：
  - Owner 檔版本標記存在
  - 規則鏡像一致性 [`sync-enterprise-cursor-rules-to-monorepo-root.ps1`](../../../scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1) `-VerifyOnly`
  - 失敗即中止 + 單行 quick-fix
- 保持 `agency-os/scripts/ao-resume.ps1` 為 wrapper（單一程式 Owner 在 root）

**驗收**：任一規則分叉時，AO-RESUME 必定 fail-fast；不會出現「表面 PASS 但實際沿用舊規則」。

### 階段 3：清理重複與衝突（最小變更）

- 針對 AO 關鍵路徑文件做「Owner化清理」：
  - monorepo 根 `README.md`
  - [`AGENTS.md`](../../AGENTS.md)
  - [`REMOTE_WORKSTATION_STARTUP.md`](../overview/REMOTE_WORKSTATION_STARTUP.md)
  - [`end-of-day-checklist.md`](../operations/end-of-day-checklist.md)
  - [`memory/CONVERSATION_MEMORY.md`](../../memory/CONVERSATION_MEMORY.md)
- 只刪「重複規則正文」，保留導引與操作入口

**驗收**：關鍵規則敘述不再多頭版本；搜尋舊規則語句時，僅剩 Owner 或合法摘要連結。

## 驗證與保險

每階段都跑：

- `scripts/doc-sync-automation.ps1 -AutoDetect`
- `scripts/system-health-check.ps1`
- `scripts/verify-build-gates.ps1`

每階段完成打一顆 checkpoint commit（不急著大合併）；任一階段 fail 即停在當前 checkpoint，不往下一階段。

## 影響檔案（核心）

- [`rules-version-and-enforcement.md`](../operations/rules-version-and-enforcement.md)
- [`scripts/ao-resume.ps1`](../../../scripts/ao-resume.ps1)
- [`agency-os/.cursor/rules/30-resume-keyword.mdc`](../../.cursor/rules/30-resume-keyword.mdc)
- [`.cursor/rules/30-resume-keyword.mdc`](../../../.cursor/rules/30-resume-keyword.mdc)
- [`sync-enterprise-cursor-rules-to-monorepo-root.ps1`](../../../scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1)
- [`cursor-enterprise-rules-index.md`](../operations/cursor-enterprise-rules-index.md)

## 風險控制

- 不做 Big Bang 重寫，不一次搬動所有文件
- 不改生產密鑰流程，不觸碰 secrets 資料
- 先建立檢查，再做清理，避免「清理後才發現漏規則」

## 執行待辦（Checklist）

- [ ] **階段 1**：鎖定 Owner、索引改摘要+連結。
- [ ] **階段 2**：`ao-resume.ps1` 版本與鏡像 hard-fail。
- [ ] **階段 3**：AO 路徑重複敘述清理。
- [ ] **階段 4**：每階段 doc-sync / health / verify + checkpoint。
