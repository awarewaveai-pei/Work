# RESEARCH_LINES_MASTER_PLAN 未完成盤點

日期：2026-09-30
範圍：`Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md`

## 明確阻塞

- P2-09 完整期末閘：DOD-2 被指定 prod project 缺失阻塞；完整驗收仍非 8/8。證據：Master Plan:11、774。
- P1 WC-15 ⑤：prod project 抹除未驗。證據：Master Plan:12、15。
- PI-b 05：操作者尚未親眼驗收正式結果頁。證據：Master Plan:12、16。
- P2-09 thresholds：仍未設定，維持 operator-owned null。證據：Master Plan:11、16。

## P4 尚未完成

- PDF export。
- C11 方案比較。
- 行動計畫：`human_required` owner／期限／目標。
- metrics（最多 3 個）。
- `review_at` 排程、到期重跑、`SolutionReview{before,after,verdict}`。
- 教材 Markdown／PDF export。
- project-level recipe-run binding。
- 跨專案來源搜尋尚未正式提交並回填主線；目前只有隔離 worktree 實作與測試。

規格證據：Master Plan:122、254、715-716。

## P-ARF-data（操作者暫緩）

- Airtable → SPEC／契約同步。
- `art_reflection.*` 契約家族。
- `wusheng-journey-v1`、`reflective-cycle-v1` recipe。
- 判斷主權閘。
- ARF lessons／examples。

證據：Master Plan:16、24、257、263。

## UI／課程／方法知識層

- PI-b 結果頁完整九段與圖表原語。
- U15 首用 5 分鐘課程。
- 每方法 lesson／result skeleton／prompt dossier。
- 285 方法的 M1–M10／M12 知識完整度。
- U21 `/ops/domains` 管理頁與覆蓋表。
- 完整結果頁固定骨架與教材串接。

證據：Master Plan:63、91、213。

## 平台後續層

- P5 Postgres／object storage。
- 自然人來源 per-subject encryption、DEK deletion proof。
- L4 ARF participant mode、圖像 artifact、P-P 第二租戶。
- 完整品質評分 harness、evolution loop。
- `partnership-risk-v1` recipe。
- production collection run、ingest grant、service identity。

證據：Master Plan:24、127、297。

## 目前結論

- P2／P3 核心工程切片：大部分完成。
- P4：report renderer + report API 第一切片完成；完整 P4 未完成。
- Production／正式驗收：仍有 live-state blocker。
- ARF、課程、完整結果頁、C11、PDF、平台升級：未完成。

## Claude Code 檢查要求

1. 逐項核對 Master Plan 與實際程式／測試，不因文件標記完成就視為產品完成。
2. 先檢查 P4 的 project-level run binding，再檢查 C11 與 `review_at`。
3. 不以替代 prod project、假資料或 Airtable 猜測解除 blocker。
4. 不 reset／restore／clean 共用工作樹的其他 session 變更。
