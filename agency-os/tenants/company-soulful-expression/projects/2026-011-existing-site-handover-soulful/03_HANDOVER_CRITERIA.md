# Handover Criteria - 2026-011 Existing Site Handover Soulful Expression

> 此項目為「接手」類型，Handover = 本 Agency 完整掌握該站的維運責任鏈。

## 技術準備度
- [ ] `core/ENVIRONMENT_REGISTRY.md` production + staging 欄位全部填入
- [ ] `core/BACKUP_RESTORE_PROOF.md` 第一次備份記錄 + 還原演練通過
- [ ] Staging 環境可操作（可登入後台、核心頁可開啟）
- [ ] Release Gate checklist 首次執行通過

## 操作準備度
- [ ] WordPress 管理員帳號已移交（非共用）
- [ ] Hostinger 帳號有 Agency OS 存取
- [ ] DNS 管理權限確認（可建 staging 子網域）
- [ ] 回滾路徑測試完成（staging 可還原到已知狀態）

## 知識移轉
- [ ] `10_DISCOVERY.md` 外掛清單與第三方整合完整
- [ ] 風險 Top 3 記錄且對策確認
- [ ] 客戶維護窗時間確認（見 ENVIRONMENT_REGISTRY）

## 持續維運進入條件（全部 ✅ 才算 Handover 完成）
- 每次 production 變更前必有 staging gate
- WORKLOG 必有備份時間戳
- Ops Inbox 已接入 soulfulexpression.org 監控（若有自架監控）
