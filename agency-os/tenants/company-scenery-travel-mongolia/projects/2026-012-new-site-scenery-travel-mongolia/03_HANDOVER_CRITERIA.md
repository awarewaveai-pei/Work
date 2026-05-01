# Handover Criteria - 2026-012 New Site Scenery Travel Mongolia

> 此項目為「新站建置」類型，Handover = production 上線且客戶可自行更新內容。

## 技術準備度
- [ ] `core/ENVIRONMENT_REGISTRY.md` staging + production 欄位全部填入
- [ ] `core/BACKUP_RESTORE_PROOF.md` 備份記錄 + 還原演練 PASS
- [ ] Pre-Production Gate 全部 PASS（7 項：Backup/Security/Compatibility/Function/Legal/Rollback/International）
- [ ] Production URL 可達，速度 LCP < 4s（行動裝置）

## 內容準備度
- [ ] 首頁、行程頁（≥2）、詢問頁、關於我們、隱私政策、取消/退款政策 — 全部可達
- [ ] 詢問表單可送出並接收 email
- [ ] Analytics 追蹤碼安裝並驗證

## 法遵準備度
- [ ] 隱私政策頁面存在且為英文
- [ ] 取消/退款政策頁面存在且為英文
- [ ] Cookie 同意機制（如適用）
- [ ] `core/CROSS_BORDER_GOVERNANCE.md` 行動事項（上線前）全部完成

## 知識移轉
- [ ] 客戶知道如何登入 WP 後台更新內容
- [ ] 維護窗時間確認（見 ENVIRONMENT_REGISTRY）
- [ ] `10_DISCOVERY.md` 未解問題全部解決或明確記錄為 Phase 2

## 持續維運進入條件（全部 ✅ 才算 Handover 完成）
- 每次 production 變更前必有 staging gate
- WORKLOG 必有備份時間戳
- Uptime Kuma 已加入監控
- 月維運節奏已啟動（首次月報模板已確認）
