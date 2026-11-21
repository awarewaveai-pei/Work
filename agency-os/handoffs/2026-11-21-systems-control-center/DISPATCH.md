# 系統總控中心 派工表（監工用）

續接語：我是 /ops/systems 的監工。讀本檔＋PLAN.md；`list_sessions {linked:true}` 看工人；工人交回照「驗收」做。操作者 2026-11-21 授權：監工派工、選模型、自己判 RISKS、清工人，不問她；回報繁中。

## 批次
| 批 | 卡 | 內容 | 模型 | 狀態 |
|---|---|---|---|---|
| 1 | W1 | 主機匯入器（python）＋cron.d＋測試 | Opus 5.5 | 整合 `08816df48`；審查修正中 |
| 1 | W2 | 0174＋ingest route＋投影＋/ops/systems 頁 | Opus 5.5 | 整合 `08816df48`；審查修正中 |
| 1 | W3 | registry（Outbound）＋遷移腳本＋new-product 接線 | Sonnet 5.5 | 整合；工人已 clear |
| 1 | W4 | 監工台頁 | Sonnet 5.5 | 整合；工人已 clear；頁面 https://claude.ai/artifact/2QN1ygisHD9xRprX1B2xZF |
| 2 | — | 整合：dry-run 匯入器對真 repo → 本機 ingest 實打 → 頁面實看；套 0174（High，問操作者）→ 推 → 裝排程 → 切換 Outbound | 監工 | 待批 1 |
| 3 | — | 系統盤點全部 registry（覆蓋率 100%）、其餘監工頁逐一切換 | 待定 | — |

brief：`briefs/`（`COMMON.md`＋各卡）。整合工作區：`D:\Worktrees\Work\systems-int`（detached；next-admin `node_modules` 是 junction，移除前先 rmdir）。工人在各自 worktree；契約在 COMMON。

## 驗收（每張卡）
1. 讀 FILES／TESTS／RISKS → `git -C <worktree> diff main...HEAD`，`file:line` grep 驗真。
2. 整批交回後 cherry-pick 進 main（pathspec），共用檔衝突監工解；`npx tsc --noEmit`＋相關 vitest＋`python -m unittest` 一次。
3. critic 審整批 diff（Codex 額度到 11/24）。
4. `clear_session` 工人；同線下一張 `send_message`。
5. **整批交回後獨立一步「一起看 RISKS」**：並排判（處理／實測驗證／記錄不處理理由），寫下表，更新監工台 data.mjs 並重發布。
6. 0174 先套後推（PLAN §6）。

## RISKS 紀錄
### 批 1
正本在 `data.mjs` 的 `RISKS`（監工台頁同步顯示），此處不重複。
