---
slug: tomo-critic-findings
created_utc: 2026-05-25T06:18:00Z
hint: "補完 tomo critic findings apply — 驗收 2 Critical + 6 Major 全修完"
source_session_summary: "實作 /tomo v2，跑 critic review，apply 2C+6M+6m fixes 到 tomo.md/SCHEMA.md/README.md"
---

### 1. 任務目標
`/tomo` v2 所有 critic findings（2 Critical + 6 Major + 6 Minor）已 apply，需完成 E2E 驗收、
commit/push，並修補一個在 E2E 實測中新發現的 Minor（Write tool Read-first edge case），讓
feature 正式進入 production-ready 狀態。

### 2. 為什麼做
C1（phantom `consumed`）和 C2（hint injection）是真實 bug：C1 讓 spec 謊稱有實作行為；
C2 讓含 `"` 或 `$(...)` 的 hint 可能靜默損毀掃描輸入或執行非預期指令。M 系列修了
reliability + UX（collision、rollback、WORKLOG append、CJK slug、section anchor、secret escape hatch）。

### 3. 已試過
- tomo.md 完整重寫（Write tool Step 1、consumed 移除、M1-M6、m1/m5/m6 全 apply）
- SCHEMA.md：移除 consumed + 去重 pattern list
- README.md：移除 phantom apply-closeout claim
- E2E test Step 1-4 已跑完（Write tool PASS、secret scan PASS、propose 呈現正確）
- 新 Minor 發現：`tomo.md:18` 固定 temp filename → Write tool Read-first trap（跨 session）

### 4. 卡在哪
新 Minor 尚未修進 tomo.md：Step 1 需補一句「若 Write tool 回 read-first 錯誤，先 Read
`$env:TEMP\tomo-hint-scan.txt` 再重試 Write」，或改用每次唯一的 temp filename（更乾淨）。

### 5. 下一步指令
1. 本 E2E test 完成後（Step 6 checkpoint + push 跑完）確認 3 個檔案都正確寫入
2. 修 `tomo.md` Step 1：加 fallback — 「若 Write tool 回 "File has not been read yet"，先 Read temp file 再 Write」
3. 更新 `project_tomo_command.md` memory：移除 consumed field mention
4. 補 WORKLOG 2026-05-25 entry：E2E 4 動作完整結果（實測全鏈 PASS、Review 三角確認、抓蟲新 Minor、WORKLOG 本條）
5. git push origin main（auto-checkpoint 可能已 commit，但確認 push）

### 6. 相關資源
- **Files**: `$WORK_ROOT/.claude/commands/tomo.md` (Step 1 L18)、`$WORK_ROOT/agency-os/handoffs/SCHEMA.md`、`$WORK_ROOT/agency-os/handoffs/README.md`
- **Commits**: dirty（tomo.md + SCHEMA.md + README.md 未 push）；最近 clean `5af7e41`
- **Known landmines**: Write tool + 固定 temp filename = Read-first trap；下次 `/tomo` 在新 session 若 `$env:TEMP\tomo-hint-scan.txt` 存在就觸發
