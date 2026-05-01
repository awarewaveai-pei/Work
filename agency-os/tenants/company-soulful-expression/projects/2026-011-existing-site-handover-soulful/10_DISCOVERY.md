# Discovery - 2026-011 Existing Site Handover Soulful Expression

> 用途：記錄 Day 1 盤點結果（接手基線）。  
> 填寫方式：在 Hostinger + WordPress 後台執行後，逐欄填入。

> **Who fills this（重要）**  
> **§1.1–§1.2 的欄位（WP／PHP／外掛／第三方）須由持有 Hostinger + WP 管理員權限的「操作者」填入**；IDE 代理無法代登入。流程對照：`docs/operations/PRODUCTION_RUNBOOK_PILOT_A_EXISTING_SITE_SOULFUL_EXPRESSION.md` **§1.1 權限**、**§1.2 基線**。  
> 填完本檔後，請把同一組 **production** 基線數字抄到 `core/ENVIRONMENT_REGISTRY.md`（同一次 commit 最佳）。

## 客戶概況
- 客戶名稱：Soulful Expression Art Therapy
- Production URL：https://soulfulexpression.org/
- Hosting：Hostinger
- 目前狀態：上線中（接手前未執行 staging first）

## 盤點結果（Day 1 待填）

### 環境基線
- WP 版本：**待補**
- PHP 版本：**待補**
- 主題名稱 + 版本：**待補**
- DB 引擎：**待補**（MySQL / MariaDB + 版本）

### 外掛清單（待補）
| 外掛名稱 | 版本 | 啟用狀態 | 維護風險 |
|---------|------|---------|---------|
| (Day 1 填入) | | | |

### 第三方整合（待補）
| 服務 | 類型 | 用途 | 風險 |
|-----|------|------|------|
| (Day 1 填入) | | | |

### 排程 / Cron（待補）
- WP-Cron 設定：**待補**
- 自訂 cron：**待補**

## 風險 Top 3（Day 1 待填）
1. **待補**
2. **待補**
3. **待補**

## 盤點完成條件
- [ ] `core/ENVIRONMENT_REGISTRY.md` production 欄位全部填入
- [ ] `core/BACKUP_RESTORE_PROOF.md` 第一次備份記錄填入
- [ ] 本檔外掛清單與第三方整合欄位填入
- [ ] 風險 Top 3 確認且寫入 WORKLOG.md
