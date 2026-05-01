# Commander System Guide - Scenery Travel Mongolia

## Purpose
- 定義本 tenant 的操作節奏與決策檢查點。

## Current Priority
1. 完成 tenant/site/project 骨架（Day 1）
2. 建立 staging 環境（Day 2）
3. 上線前 gate 全部通過（Day 4）
4. Production 首次上線（Day 5）

## Daily Rhythm
- Startup：follow `AO-RESUME`
- Work：staging-first 所有變更
- Closeout：follow `AO-CLOSE`，記錄備份狀態與上線判定

## 關鍵邊界
- 任何 production 變更前，必須通過 `core/RELEASE_GATES_CHECKLIST.md`
- Discovery 資訊不足時，暫停 Build 並先補齊 `10_DISCOVERY.md`
