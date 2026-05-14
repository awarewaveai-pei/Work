Follow the AO-RESUME protocol (AGENTS.md §快速續接關鍵字).

The hook has already run `scripts/ao-resume.ps1 -FullMainlineParity` and written results to `agency-os/.agency-state/ao-resume-hook-last.json`. Check the `finished_utc` timestamp — if within 120 seconds, skip re-running the script.

Read these files in order:
1. `agency-os/.agency-state/ao-resume-hook-last.json` (log_tail + auto_checkpoint fields)
2. `agency-os/.agency-state/external-signals-digest.json` (Telegram + Slack digest; written by fetch-external-signals.ps1)
3. `agency-os/.agency-state/open-tasks-snapshot.md`
4. `agency-os/TASKS.md`
5. `agency-os/WORKLOG.md` (last 30 lines)
6. `agency-os/memory/CONVERSATION_MEMORY.md`

Then output the **AO-RESUME 七段式** response:

---

**1. 系統快照**
One-line status: SG/EU 服務狀態 (UP/DOWN) | deploy drift commits | Git ahead/behind/dirty
Source: ao-resume-hook-last.json log_tail + health check output.

**2. 外部信號**
Telegram @awarewave_ops_bot: 未讀數量 + 可操作項條列（無則寫「本輪無未讀」）
Slack #ops-incidents / #infra-alerts: 未讀數量 + 最新一筆（無法讀取時寫「無法讀取 — 請手動確認」）
Only include actionable items; skip routine noise.

**3. 已完成**
What was delivered last session (from WORKLOG + CONVERSATION_MEMORY).
If nothing definitive, state that clearly and point to WORKLOG for reference.

**4. 目前進度**
- Lobster Factory Milestone (M1~M5) + 今日 DoD
- Git/Audit: exit code | AUDIT RESULT: PASS? | ahead=N behind=N
- 阻塞/風險: list specific blockers with evidence; do NOT write just「無」— if none found, write「本次盤點：未見需立即處理之阻塞」and state the basis.

**5. 未完成待辦（TASKS）**
Group tasks by their `####` category header from TASKS.md. Output every open `- [ ]` item — do NOT summarize, skip, or flatten into a single list.

Format:
#### 雙機環境 / 日常開工
- [ ] …

#### 客戶試點 — Soulful Expression
- [ ] …

#### 龍蝦工廠（lobster-factory）
- [ ] …

（以此類推，依 TASKS.md 中的 #### 順序輸出所有分類，空分類省略）

Task count must match `open-tasks-snapshot.md` Total open. If it doesn't, explain why.

**6. 需決策**（選填 — 整節只在有內容時輸出）
Items that cannot proceed without a human choice or action. Each entry must include:
- 類型：[資源 / 策略 / 權限 / 外部]
- 說明：what decision is needed
- 影響：what is blocked until resolved

**7. 下一步**
Concrete first action. If a 需決策 item is blocking, state it first.

---

Do NOT ask the user to manually pull or run any command if the script already ran successfully.
