# Project Kit Master Checklist

**Schedule / Gantt (optional):** Copy [`PROGRAM_SCHEDULE.example.json`](PROGRAM_SCHEDULE.example.json) into the project folder, rename, add tasks and dates, then run `agency-os/scripts/render-program-timeline-from-schedule.ps1` with `-SchedulePath` and `-TimelinePath` to emit markdown tables + Mermaid (or rely on **AO-CLOSE** when using the main `docs/overview/PROGRAM_SCHEDULE.json` in agency-os).

## A. Pre-sales
- [ ] 完成需求訪談
- [ ] 完成複雜度分級（L1-L4）
- [ ] 報價與時程確認
- [ ] 合約文件齊備（MSA/SOW）

## B. Kickoff
- [ ] 取得必要帳號與權限
- [ ] 建立風險清單
- [ ] 建立溝通節奏（週會/月會）

## C. Build
- [ ] 架構與資料設計確認
- [ ] 客製功能規格與驗收標準確認
- [ ] 測試計畫完成

## D. Launch
- [ ] 上線檢查清單完成
- [ ] 回滾方案驗證
- [ ] UAT 驗收簽核

## E. Operate/Growth
- [ ] 週報流程啟用
- [ ] 月報流程啟用
- [ ] 事件應變窗口確認
