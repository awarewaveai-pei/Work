---
title: /tomo feature v2 implementation plan
status: pending implementation (planning complete, awaiting GO)
created_utc: 2026-05-24T00:00Z
session_origin: 2026-05-23 evening planning session with peijing
trigger_to_resume: AO-RESUME tomorrow → read this file → ask user 「從哪開始」→ Phase 0
---

# `/tomo` Feature — v2 Implementation Plan

> **Resume contract**: read this file fully before any action. v2 plan supersedes v1 (which had 10 holes — see §v2 漏洞拍板). Do NOT regenerate the plan from conversation memory; trust this file as SSOT.

## 0. 任務理解

`/tomo <hint>` 一句話觸發 → agent 抽脈絡 + 寫 handoff packet + 寫 TASKS.md → 隔天 AO-RESUME 在第 7 段 inline 完整 packet，AI 直接接手。

**痛點來源（user 原話）**：「告一段落，我通常都說『明天提醒我做 X 並寫入 task』，但我就是不想一直重複這句話」+「希望他整理出內容，隔天給 AI 讀，他就知道要怎麼繼續往下做」。

**設計層級**：不只是 reminder（TASKS.md 一行），也不是純 handoff packet（6 段脈絡），是**兩者合體**，靠單一 trigger 達成。

## 1. 拍板的設計決策（7 條）

| # | 決策 | 拍板 | 理由 |
|---|---|---|---|
| 1 | Trigger 字 | **`/tomo` + `/tomo!`** | 4 字短；跟 `/recap`/`/tasks` 同類短 command；`!` 後綴跳過 propose |
| 2 | 自然語言偵測 | **v1 不做** | 誤抓風險 > 收益；user 可手動 `/tomo` |
| 3 | Propose-before-write | **預設 propose；`/tomo!` 跳過** | 簡單；user 自己選快/穩；無 autopilot detection 開銷 |
| 4 | Pending state SSOT | **TASKS.md `- [ ]` = pending；`[x]` = consumed**（單一來源）| 零新狀態檔；複用既有 `AUTO_TASK_DONE` 流程 |
| 5 | Pending packet 路徑 | **`agency-os/handoffs/YYYY-MM-DD-HHmm-<slug>.md`** | repo 內 git-tracked → 跨機天然同步；`.agency-state/` 不可用因 gitignored |
| 6 | TASKS.md 落點 | **新建固定分類 `#### 待釐清 / 明日提醒`，位於 `### 未完成` 最前面** | 易掃描；不污染既有分類 |
| 7 | Packet 格式 SSOT | **新建 `agency-os/handoffs/SCHEMA.md`，tomo.md + ao-resume.md 都 reference 它** | 避免 write-side 和 read-side 各自定義 → drift |

## 2. v2 10 漏洞拍板（v1 漏掉的全部補完）

| # | 漏洞 | 拍板方案 |
|---|---|---|
| 1 | Propose-before-write 在 autopilot 會 hang | 預設 propose；`/tomo!` bang 後綴跳過 |
| 2 | 多 pending packet 顯示策略 | **0**：第 7 段預設邏輯；**1-3**：每份 inline 全文 + 分隔線；**4+**：最新 3 份全文，其餘列 title+pointer+age，提示「回『展開 packet <slug>』」 |
| 3 | Packet 檔遺失 graceful degradation | ao-resume.md 第 7 段 spec：missing packet → 印 `⚠️ packet 不見 (handoffs/<file>.md)`，只顯示 TASKS.md 行描述，不 fail AO-RESUME |
| 4 | Hint 含 secret | `/tomo` 第一步：hint pattern match `scripts/scan-local-config-for-secrets.ps1` 同一套 regex；命中 → ABORT + 印「hint 含疑似 secret，請改寫」 |
| 5 | Packet 絕對路徑跨機破 | Spec 強制：repo 內路徑用 `$WORK_ROOT/...` placeholder；絕對路徑只准外部資源（VPS、系統路徑）；agent 寫入前自動 normalize；ao-resume.md 第 7 段讀時 replace `$WORK_ROOT` → 當下 cwd |
| 6 | 跨機 race | `/tomo` 最後一步呼叫 `scripts/checkpoint.ps1`；**Phase 0 須驗證該腳本是否會 push**；若否，spec 補 `git push origin main` |
| 7 | Packet 格式 SSOT 落點 | `agency-os/handoffs/SCHEMA.md`（見決策 #7）|
| 8 | Packet 生命週期 | **不 move、不 consumed/ 目錄**；TASKS.md state 就是 SSOT；統一 prune `handoffs/*.md` >90 天 → 刪（不論 consumed），由 ao-resume.md Step 3 既有 prune 邏輯延伸 |
| 9 | WORKLOG 寫入 | **Create**: append `- TOMORROW_CAPTURED: <slug>` 到當日 WORKLOG；**Consumed**: 走既有 `AUTO_TASK_DONE` 流程（不重複寫）|
| 10 | Memory 寫入 | 實作完寫 `~/.claude/projects/d--Work/memory/project_tomo_command.md`（type: project）+ MEMORY.md 加 index 行 |

## 3. 實作計畫

### Phase 0 — 驗證假設（動筆前必做，5 分鐘）

```
1. Read scripts/checkpoint.ps1 → 確認是否 push（commit + push vs commit-only）
   - 不 push → tomo.md spec 內補 push step
2. Read scripts/scan-local-config-for-secrets.ps1 → 確認 regex 介面（檔案 vs 字串）
   - 若只支援檔案 → tomo.md 寫一個臨時檔再 scan，或內聯複製 regex
3. Glob agency-os/.cursor/rules/ + .cursor/rules/ → 確認無 mirror 衝突
4. Read scripts/print-open-tasks.ps1 → 確認新 #### sub-category 不破其 parsing
```

### Phase 1 — 新建 4 個檔（依序，依依賴）

| # | 檔案 | 核心內容 |
|---|---|---|
| 1 | `agency-os/handoffs/SCHEMA.md` | 6 段格式（任務目標 / 為什麼做 / 已試過 / 卡在哪 / 下一步指令 / 相關 files+commits+地雷）+ frontmatter（slug / created_utc / hint / source_session_summary）+ 路徑規範（`$WORK_ROOT` placeholder）+ secret redact 規則（reference scan-local-config-for-secrets regex）|
| 2 | `agency-os/handoffs/README.md` | 目錄用途 + 命名規約（`YYYY-MM-DD-HHmm-<slug>.md`）+ pending vs consumed 由 TASKS.md SSOT 判斷 + prune policy（>90 天）+ link 到 SCHEMA.md |
| 3 | `.claude/commands/tomo.md` | trigger 規範（`/tomo` vs `/tomo!`）+ 完整流程（secret check → 抽取 → propose → 寫入 → checkpoint）+ 抽取 data source 對照表（git status/log/diff、TodoWrite、conversation hint、本 session Read/Edit/Write files）+ propose 流程細節（user 回 `go`/`補:...`/`重抓`/`取消`）+ reference SCHEMA.md |
| 4 | `~/.claude/projects/d--Work/memory/project_tomo_command.md` | （**Phase 3 才寫**，等實作完）feature 簡述 + trigger + 檔案位置 + consumed 方式 + 跨機同步路徑 |

### Phase 2 — 改 3 個檔

| # | 檔案 | 改動 |
|---|---|---|
| 5 | `agency-os/TASKS.md` | 新增固定分類 `#### 待釐清 / 明日提醒` 於 `### 未完成` 最前面 + 一句說明「`/tomo` 自動寫入此分類；handoff packet 路徑見 `agency-os/handoffs/`」|
| 6 | `.claude/commands/ao-resume.md` | 第 7 段加條件式邏輯：(a) 掃 TASKS.md open `- [ ]` 行找 `→ handoffs/` pointer；(b) 套用多 pending 顯示策略（0/1-3/4+）；(c) missing packet graceful；(d) Step 3 prune 邏輯擴張到 `handoffs/*.md` >90 天 |
| 7 | `agency-os/AGENTS.md` | 「代理自動工具使用規則」表加 1 列：`/tomo` trigger + secret check 強制 + propose-before-write 規範 + 引用 SCHEMA.md |

### Phase 3 — 自驗 + memory + commit

```
8. 跑 §4 驗證計畫 4 動作
9. 寫 project_tomo_command.md memory + MEMORY.md index
10. Single commit (rollback friendly)
```

## 4. 驗證計畫（R0+R4 四動作 — **抓蟲段已 v1→v2 補完**）

### 4.1 實測 end-to-end

```
(a) /tomo 測試 v2 完整流程 → 走 propose 流程 → 回 go
(b) Read 生成的 handoffs/<file>.md 確認 6 段齊全
    - grep "D:\\" "C:\\" → 0 hit in repo paths (正常 $WORK_ROOT)
    - grep secret pattern → 0 hit
(c) Read TASKS.md 確認新分類 `#### 待釐清 / 明日提醒` 有新行 + pointer 正確
(d) Read WORKLOG.md 確認當日有 `- TOMORROW_CAPTURED: <slug>` 行
(e) git log -1 確認 checkpoint 自動 commit + push 完成
(f) 模擬 AO-RESUME 第 7 段：手動 grep TASKS.md → Read packet → 確認 inline 邏輯能執行
(g) 測 secret abort：/tomo 修 token=ghp_abc123def456 → 應 ABORT + 印警告
(h) 測 missing packet：手動 rm 一個 packet 模擬 AO-RESUME → 應印警告不 fail
(i) 測 ! bang：/tomo! 不要 propose 直接寫 → 應跳 propose 直接執行
(j) 測多 pending：連續 5 次 /tomo → 模擬 AO-RESUME → 應只 inline 3 份、其餘列 pointer
```

### 4.2 Review（讀回改後產物）

```
- Read 4 新檔 + 3 改檔
- markdown lint：code-fence paired、heading 層次正確
- 三角 cross-reference 完整：SCHEMA.md ↔ tomo.md ↔ ao-resume.md
- AGENTS.md trigger row 與既有 row 體例一致
```

### 4.3 抓蟲（v2 補完 — 不只 grep）

**先讀 SSOT 不靠常識**（CLAUDE.md trigger 規則）:
- `agency-os/docs/operations/BUG_HUNT_PROTOCOL.md` — 5-tier 觸發 + 9-step playbook
- `agency-os/docs/operations/AUDIT_REGISTRY.md` — 看是否該新增 entry

**Step 1: Cross-file grep**（依 AGENTS.md R0 第 3 動作）
```
範圍：agency-os/、docs/、scripts/、.claude/、lobster-factory/、runbooks/、.cursor/

關鍵字（並行 grep）：
- "handoff|carryover|reminder|明日提醒|tomorrow|/tomo" → 找重工 / 既有半實作
- "第七段|第 7 段|第7段|下一步" → 找 ao-resume 第7段格式 dependents
- "handoffs/" → 找任何已有的 path references
- "TOMORROW_CAPTURED" → 找 WORKLOG marker 是否與其他 marker 衝突
- "#### 待釐清|#### 明日提醒" → 找 TASKS.md sub-category 衝突
```

**Step 2: BUG_HUNT_PROTOCOL.md 9-step playbook applied**
```
1. Bug class 定義：「跨 session 工作 carry-over 失敗」class
2. Find all instances in current scope：本 plan 變動的 7 個檔
3. Find related instances in other modules：
   - .agency-state/ pending state patterns（auto-reboot-LATEST.md / closeout-inbox.md）
   - reports/ao-resume/ 歸檔機制
4. Find downstream consumers：
   - print-open-tasks.ps1 (parse TASKS.md)
   - apply-closeout-task-checkmarks.ps1 (handle AUTO_TASK_DONE)
   - ao-resume.ps1 hook log_tail content
5. Find stale references in docs：grep 所有 .md 找對 ao-resume 七段式格式描述
6. Find similar patterns that may have same bug：
   - 既有 carry-over: WORKLOG 內 in-progress markers? closeout-inbox.md?
7. Verify fix doesn't introduce regressions：
   - 測 AO-RESUME 第 7 段 in 「無 pending」case 仍是原行為
   - 測 既有 TASKS.md `[x]` 流程不受新分類影響
8. Document the class in AUDIT_REGISTRY.md：判斷是否值得 entry（可能 No — 是 feature build 不是 bug class）
9. Create reusable tooling if pattern repeats：N/A（單一 feature）
```

**Step 3: audit-cross-machine-bom skill**（依 AGENTS.md R0：「本次改動含 .md 檔案」）
- 雖然本次 .md 全在 repo 內（不走 Google Drive），仍跑 skill 當 oracle
- exit 0 = 放行；exit 非 0 = 按 fix template 處理

**Step 4: critic agent review**（依 memory `feedback_test_review_default`：「Every non-trivial code change: syntax → critic → real exec test」）
- Spec 是 logic-heavy markdown（接近 code）
- 跑 critic 看 tomo.md spec 邏輯漏洞、edge case 漏處理、race condition

**Step 5: CHANGE_IMPACT_MATRIX.md check**
- Read `agency-os/docs/CHANGE_IMPACT_MATRIX.md`
- 確認改動的 3 個既有檔（AGENTS.md / ao-resume.md / TASKS.md）若在 matrix 內 → 同步 matrix entries

**Step 6: cross-machine sync sanity**
- 確認所有新增檔在 git tracked（無被 .gitignore 攔截）
- packet 機制依賴 git pull 同步 → 兩台都能看到

### 4.4 WORKLOG

寫 `agency-os/WORKLOG.md` 當日 entry，格式對齊既有體例：
- **根本問題** / **修改檔案** / **結合既有** / **[驗證結果] R0+R4 四動作**（含 file:line 引用）/ **剩餘風險** / **Rollback** / **Memory update**
- 4 動作各自結果摘要必須具體（不可寫「測試通過」這種抽象詞）

## 5. 風險清單

| # | 風險 | 嚴重度 | 緩解 |
|---|---|---|---|
| R1 | `.agency-state/` git-ignore → pending flag 跨機不見 | High | 已解：TASKS.md + handoffs/ 為 SSOT，全 tracked |
| R2 | 改 ao-resume.md 第 7 段格式 → 影響歷史 archive 一致性 | Medium | 條件式擴張（無 pending 時 = 原行為，向後相容）|
| R3 | Agent 生 packet 可能含 secret | Medium | 4.3 抓蟲 + tomo.md spec 內 secret check gate |
| R4 | TASKS.md 加 task 沒對應 `####` category → 結構崩 | Low | 新建固定分類 |
| R5 | 多視窗同時跑 `/tomo` → 檔名衝突 | Low | 檔名含 HH:mm；若碰撞 slug 後加 `-2` |
| R6 | Packet 品質差（user 沒想清楚下一步）| Medium | propose-before-write |
| R7 | 中文 slash command 檔名不穩 | Low | 用英文 `/tomo` |
| R8 | `/tomo!` bang 被 typo 誤觸 | Low | bang 仍印 packet summary，user 可手動 revert |
| R9 | 多視窗併發寫 TASKS.md → merge conflict | Low-Medium | append 到固定 sub-category，行級衝突；checkpoint hook 既有 conflict policy |
| R10 | `$WORK_ROOT` placeholder 讀時要展開 | Low | spec 內定 read-time replace |
| R11 | SCHEMA.md 改後 tomo.md / ao-resume.md 沒同步 | Low | cross-reference + CHANGE_IMPACT_MATRIX 加 row |

## 6. Rollback

Single commit；`git revert <commit-hash>` 即還原。Packet 檔保留無破壞性（最壞情況：handoffs/ 目錄成為孤兒，可手動刪除）。

## 7. 預估範圍

- 新檔：**4 個**（SCHEMA + README + tomo.md + memory）
- 改檔：**3 個**（TASKS / ao-resume / AGENTS）
- memory entry：**1 個 + 1 行 index**
- 預估時間：**50-70 分鐘**含 4 動作驗證
- 風險等級：**Low-Medium**（doc + governance + 1 個 ps1 行為依賴 [checkpoint]）

## 8. Resume Instructions（明天打開這檔的人）

1. **跟 user 對齊**：問「從 Phase 0 開始？還是有要改的決策？」
2. **若 user 回 go**：依序 Phase 0 → 1 → 2 → 3，每 Phase 完成回報
3. **每個檔修改前**：跑 `git log --oneline -10` 看並行 session 是否搶先動過
4. **每個檔修改後**：依 §4 驗證 4 動作（不可跳）
5. **commit message 含**：根因 + 驗證 + plan file pointer

**禁止**：
- 不讀本 plan 直接動手
- 從對話 memory 重生 plan（記憶會錯過 v2 的 10 漏洞 fix）
- 跳過 Phase 0 假設 checkpoint.ps1 行為
- 跳過 4.3 抓蟲（v2 補完版有 6 個 Step，不是只 grep）

---

**Status**: Planning complete. Awaiting user GO to start Phase 0.
**Session origin**: 2026-05-23 evening, peijing requested 一勞永逸 30-year-stable design.
**Iterations**: v1 → v2（補 10 漏洞）→ v2 corrected（補 4.3 抓蟲完整 6 step，per user push-back: 「抓蟲：grep 太少」）.
