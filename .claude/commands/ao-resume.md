---
name: ao-resume
description: Run the AO-RESUME start-of-work report (sections 0-8) from the hook's state file: open tasks, mainline parity, smoke results, blockers, next steps. Trigger on a greeting or any opening message under ~15 characters with no clear goal.
---

> **[預授權]** AO-RESUME 為完整預授權操作。`reports/ao-resume/*.md` 存檔寫入及 handoff packet 修剪**直接執行**，R0 逐項批准不適用。

> **[CAVEMAN DEFAULT]** AO-RESUME 完成後，立即宣告：`🦴 Caveman mode ON — 本 session 全程壓縮回覆，直到你說 "stop caveman"。` 無需使用者觸發。

Follow the AO-RESUME protocol (AGENTS.md §8).

## Step 0-git — Git alignment pre-check (MANDATORY, runs before reading ANY state file)

**Purpose**: prevent stale-data garbage reports when the hook's git-align failed silently.

Run exactly these two commands (no retry loop, no ao-resume.ps1 re-run):

```bash
git fetch origin
git rev-list --count HEAD..origin/main
```

- **Count = 0** → local is aligned. Proceed to Step 0.
- **Count > 0** → local is behind. Run ONE pull attempt:
  ```bash
  git pull --ff-only origin main
  ```
  - **Pull succeeds** → set internal note `GIT_PULLED=true`. Proceed to Step 0.
  - **Pull fails** (conflict / non-ff / network) → **⛔ STOP. Do NOT output the AO-RESUME report.**
    Output exactly:
    ```
    ⛔ AO-RESUME ABORTED — git pull failed. Report would be based on stale data.
    Error: [paste exact git error]
    Fix: resolve manually (e.g. git pull --rebase origin main), then re-trigger AO-RESUME.
    ```

**Hard limits: one fetch, one conditional pull. No loops. No re-running ao-resume.ps1.**

---

## Step 0 — Hook state check (MANDATORY before reading anything)

Read `agency-os/.agency-state/ao-resume-hook-last.json`.

**Case A — File exists AND `finished_utc` is within 5 minutes of now AND `exit_code` is 0:**
Hook ran successfully. Proceed to Step 1 reading files below.

**Case B — File missing OR `finished_utc` is more than 5 minutes old OR file has errors OR `exit_code` is non-zero:**

**First: derive WORK_ROOT** — read `"work_root"` field from `ao-resume-hook-last.json`. If the file is missing, run `git rev-parse --show-toplevel` to get WORK_ROOT. All git and script commands below use `<WORK_ROOT>`.

**Then determine sub-type:**

---

### Case B1 — `finished_utc` is within 5 minutes AND `exit_code` is non-zero

First, scan `steps_summary` for a line containing `"main is now identical to origin/main"`:

**B1-aligned** (line FOUND — git-align succeeded, only health gates failed):
Since 2026-06-01 `ao-resume.ps1` generates ALL state files even when health gates fail (soft-exit design), state files ARE fresh.
→ Proceed to Step 1. ⚠️ banner MANDATORY (per Step 0a) — report health gate failures from `log_tail`.
→ Do NOT re-run any scripts. No Step 0b needed.

**B1-stale** (line NOT FOUND — git-align failed before state file generation):
State files are from the PRIOR run. Do NOT trust them as current.
→ Proceed to Step 1 using the stale state files (Step 0-git above has already pulled if needed).
→ Do NOT re-run ao-resume.ps1.
→ In Section 1, the following ⚠️ banner is MANDATORY as the FIRST LINE:
  `⚠️ STALE STATE — git-align failed this run; data below is from a prior session and may be outdated.`

---

### Case B2 — `finished_utc` is more than 5 minutes old OR file missing

`ao-resume.ps1` either did not run this session, or exited at git-align (L404, before state file generation). State files may be stale.

### Step 0b — Git alignment recovery (Case B2 only)

Read `log_tail` from `ao-resume-hook-last.json`. If it contains `"non-fast-forward"` OR `"git push failed"`:

1. **Check behind count** (run via Bash):
   ```bash
   git -C "<WORK_ROOT>" rev-list --count HEAD..origin/main
   ```
2. **If behind > 0** → run immediately:
   ```bash
   git -C "<WORK_ROOT>" pull --rebase origin main
   ```
3. **If rebase conflict** → check which files:
   - Conflict in `*-LATEST.md` / `*-LATEST.json` / `*-LATEST.txt` only → auto-resolve each with local version:
     ```bash
     git -C "<WORK_ROOT>" checkout --theirs -- <file>
     git -C "<WORK_ROOT>" add -- <file>
     ```
     Then: `git -C "<WORK_ROOT>" rebase --continue`
   - Conflict in ANY other file → `git -C "<WORK_ROOT>" rebase --abort` → list conflicts → stop and ask user
4. **After successful pull --rebase** → `git -C "<WORK_ROOT>" push origin main`
5. **Only after git state is clean**, proceed to Step 0c.

**Why Step 0b exists**: Since 2026-09-23 the hook never commits, stashes, resets or pushes. `ahead` means commits (this or another session's) that AO-CLOSE has not pushed yet; the automatic parity step (`Invoke-SharedWorktreeParity`: fetch + `merge --ff-only`) only reports `action=ahead|diverged|ff-refused` and continues, so state files ARE generated. Step 0b is for the operator to push or rebase when section 1 shows that state.

### Step 0c — Regenerate all state files (Case B2, after Step 0b)

```powershell
powershell -ExecutionPolicy Bypass -File <WORK_ROOT>\scripts\ao-resume.ps1 -FullMainlineParity
```

- **exit=0**: All state files are fresh. Proceed to Step 1 (same as Case A).
- **exit≠0 AND `ao-resume-hook-last.json` `finished_utc` is now within 5 minutes**: Health gates failed but state files were generated (soft-exit). → This is now Case B1. Proceed to Step 1 with ⚠️ banner.
- **exit≠0 AND log shows git-align failure**: git alignment still failing (auth/network). Report error to user; do not proceed to Step 1 until git is clean.

---

### Step 0a — Hook-failure prominence rule (Phase C2/C3 of plan Z, 2026-05-28)

If `exit_code` is non-zero OR `agency-os/.agency-state/git-fetch-last.json` shows `success: false`:

**§0 燈號必須反映此失敗**（依 D10 鐵則，hook exit≠0 → 不得🟢；git-align/fetch 失敗 → 🔴），**且 section 1 第一行 MUST be a ⚠️ banner**（§0 是 TL;DR 燈號，§1 放詳細 banner，兩者並存不衝突）。Format:

```
⚠️ HOOK FAILED (exit=N) — <one-line root cause from log_tail / steps_summary> — DO NOT TRUST "no new commits" or "Gap 期間" conclusions until git fetch succeeds.
```

Then list remediation steps right after (e.g., `nslookup github.com`, then `git fetch origin --prune`).

**Forbidden in section 3 (已完成) when hook failed**: writing `Gap 期間: repo 看起來無新 commit` or any analogous statement that treats "absence of evidence" as "evidence of absence". That conflation caused 4 days of desktop work to be invisible on 2026-05-28. Always qualify with `(local view only; remote state UNKNOWN due to fetch failure — see Step 0a banner)`.

Also read `agency-os/.agency-state/junction-last.json` if present:
- `verdict=ok` → silent.
- `verdict=repaired` → mention briefly in section 1 ("ℹ️ .claude junction was self-healed this run").
- `verdict=repaired-with-warning` or `verdict=error` → escalate to a banner in section 1 like `⚠️ .claude junction repair needs content review at $env:TEMP\claude-junction-autoheal-*\`.

## Step 1 — Read files in order:
1. `agency-os/.agency-state/ao-resume-hook-last.json` (log_tail + auto_checkpoint fields; may be absent in Case B)
2. `agency-os/.agency-state/external-signals-digest.json` (Telegram + Slack digest)
3. `agency-os/.agency-state/open-tasks-snapshot.md`
4. `agency-os/TASKS.md`
5. `agency-os/.agency-state/worklog-excerpt.md` (WORKLOG since last AO-CLOSE; generated by ao-resume.ps1 hook)
   Fallback: if the excerpt file is missing, read `agency-os/WORKLOG.md` last 30 lines
6. `agency-os/memory/CONVERSATION_MEMORY.md`
7. `agency-os/reports/status/smoke-LATEST.json` (if exists — daily, generated by check-smoke-tests.ps1)
8. `agency-os/reports/status/monthly-LATEST.json` (if exists — monthly, generated by ao-resume.ps1 monthly block)

Then output the **AO-RESUME 報告（§0–§8）** response:

> **輸出風格規範（強制，2026-06-08 使用者明示）— 「整理好，不要一坨」：**
> 1. **段落編號結構不可拆**（§0 + §1–§8）；**§0 TL;DR、§6 阻塞與風險、§7 需你決策必印**（即使空也印一行），其餘無內容的段省略，不新增自創段號。
> 2. **每段收短、可掃讀**：能用表格就用表格；機器欄位（log_tail 原文、原始時戳串、source flag）翻成白話或省略，不直接貼。
> 3. **§1 用精簡狀態表**（項目 | 狀態），一列一項；非問題的 WARN 要當場註明「非問題，原因…」（如 CF 規則=0 → LLAR 替代）。
> 4. **§5 按主線歸類**（見該段規則），不照 TASKS.md 原始 `####` 分類整坨倒；每項一行、去掉冗字。
> 5. **不重複**：同一份資訊只出現在一段，不要 §5 列完又在別段再列一次。
> 6. 目標：整份比原始 hook 輸出短、但**一項待辦都不能少**。
> 7. **雙層敘述（全報告適用）**：專業術語與白話**並存**，不可只留其一 — 保留術語讓進階者成長、附白話讓小白看懂；術語/縮寫首次出現加一次「英文全名 + 中文 + 1 句出處」。目的：讓小白逐次學成專家，而非永遠依賴翻譯。

---

**0. 一句話總結（TL;DR，必印，置頂）**
讓小白讀完**這一行**即掌握全局。格式固定三段，用 `｜` 分隔：
```
<燈號> 系統<一句健康狀態>・<告警摘要> ｜ 主線=<今日主線一句> ｜ 今天建議：<最該做的一件事>
```
- **燈號**：🟢（health **=100%** 且 hook **exit=0** 且無 fresh 告警）／🟡（health 95–99%、或 hook exit≠0 但非 git-align 失敗（如健康閘失分）、或有 WARN）／🔴（health <95%、或 critical／fresh incident、或 git-align／fetch 失敗（STALE STATE））。**鐵則**：只要 hook exit≠0 或有 health 失分，**不得**判🟢。
- **告警摘要**：本輪 fresh 外部信號數 + health 失分項合計；0 則寫「無告警」
- **主線**：從 §5 主線群 + handoff 推今日最重要的一條
- **今天建議**：§8 第一個具體動作，濃縮成一句
末尾固定附小白入口一行：
`📖 看不懂名詞／想知道哪台機器跑什麼 → docs/operations/AO_RESUME_BEGINNER_MAP.md`

**1. 系統快照**
輸出一張精簡狀態表（`| 項目 | 狀態 |`），一列一項，涵蓋：SG/EU 服務、Git 對齊、整體健康%、備份、VPS 自動重啟、Cloudflare、排程新鮮度、跨機 import。
Source: ao-resume-hook-last.json log_tail + health check output.
**可跑的 demo（2026-09-04 起 §1 必列一行，AGENTS.md DoD「Product work」列）**：讀 `agency-os/docs/operations/RUNNABLE_DEMOS.md` 最新一列，印「上次可跑的 demo：<指令>（<日期>，<結果一句>）」；檔案缺失或空表印「無登記的可跑 demo」。這是進度唯一看得見的面，不列 = 違規。
非問題的 WARN（如 CF 規則=0 已用 LLAR 替代）必須當列註明「非問題 + 原因」，不可只丟一個 ⚠️。
**雙層判讀（強制，小白可懂＋專家可學）**：每個 WARN／skip／非 100% 項採「**保留專業術語 + 並附白話**」雙層，**不可只留其一**：
- 保留原始機器字串／術語（讓進階讀者直接對照、可 grep、可成長為專家）
- 同列或下方附白話一句：「這代表什麼 + 要不要擔心 + 要不要你出手」
- **首次出現的術語／縮寫**加一次「英文全名 + 中文 + 1 句出處／作用」（對齊使用者學習偏好），同份報告之後不重複
- 例：`clients=skip:http401` →「HTTP 401 = Unauthorized（未授權）；客戶站健檢用的 token 過期，**不影響網站運作**，可稍後補」

Smoke tests (from `smoke-LATEST.json`):
- If file exists: 一行摘要 `🟢 Smoke PASS | n8n=ok | repair=ok` 或 `🔴 Smoke WARN | ...`
- If file missing: 靜默略過

**`blockers[]`（2026-09-23 起，CI／nightly health gate／8 個 sibling 偵測器統一入口）**：`smoke-LATEST.json` 的 `blockers` 陣列是 `scripts/lib/smoke-status-digest.ps1` 讀完 `ci-LATEST.json`（GitHub Actions）、夜間 system-guard 健康閘（`reports/health/health-*.json`，score／critical_gate）、`backup-health`／`auto-reboot`／`clickhouse`／`capacity`／`site-watch`／`staging-orphans`／`routine-freshness`／`cf-security` 十份報告後，攤平成的一份「照原文印」清單——**這是本節（§1）與 §6 共用的唯一資料源，非空必為 WARN（§0 燈號同步反映）**。§1 只印筆數摘要（`blockers=N`，0 則略過此行）；§6 逐行照印全文（見 §6 規則 (d)）。這條取代原本「CI health 靠 TOOL_TRIGGER_MAP.md 散文觸發」的機制——散文觸發列不可靠（agent 不一定會查表），機器欄位才可靠。

Monthly checks (from `monthly-LATEST.json`, 5 項，2026-08-24 補 impact_matrix_drift）:
- If file exists: 一行摘要 `📅 Monthly YYYY-MM-DD | system_review=ok | supabase=ok | governance=ok | cf_ip=ok | impact_matrix=ok`
- If file missing: 靜默略過（尚未跑過月度檢查）

Cross-machine import result (從 ao-resume-hook-last.json log_tail 或手動跑 import 的輸出讀取):
List every file checked, with one of these statuses:
- ✅ 覆蓋（updated）— vault 版本與本機不同，已寫入
- ✔ 未變動（unchanged）— SHA256 相同，未覆蓋
- 📋 本機領先（local-ahead）— 同機 vault，本機在上次 ao-close 後有修改，屬正常（下次 ao-close 會 export）
- ⚠ 衝突保留（local-modified/CONFLICT）— 跨機衝突，本機有改動與 vault 不同，保留本機版本
- — 來源不存在（skipped）— vault 檔案不在指定路徑
- ✔ 其他機器匯出較舊（skipped，屬正常）— 筆電 AO-SYNC 存在但日期早於桌機，跳過以保護本機較新資料；本機 MEMORY.md 是最新版。**這不是錯誤。** 下次從筆電 AO-CLOSE 後再切回桌機，才會觸發 import。
- — 同機工作流（skipped）— 只有單機在用，無跨機 AO-SYNC 資料夾

Files to report: `MEMORY.md`、`user-env.ps1`、`.ssh/id_ed25519`、`.ssh/hostinger_soulful`、`.ssh/config`、`AWARE_WAVE_CREDENTIALS.md`

**🔴 鐵則（強制，無例外）：7 檔表格必須每次出現，縮成一行 = 違規。**
- Import 正常執行 → 每列填實際狀態（✅/✔/📋/⚠/—）
- Import 未執行（hook 失敗 / vault 掛載缺失 / git-align 中止）→ 每列填 `— import 未執行 — [原因]`，並在表格後加一行說明需做什麼。
- **禁止**：把 7 檔表格壓縮為「跨機 import 未執行」一行（根因：2026-06-15 使用者反覆要求後仍缺失）

**2. 外部信號**
Read `agency-os/.agency-state/external-signals-digest.json`.

**First, output a single header line** showing the exact gap window and its reliability:
```
區間：[gap_window.start_utc → gap_window.end_utc, both converted to CST]（source: [gap_window.source]）
```
Then classify the digest before reporting any messages:

- **`gap_window.is_fresh = true`** AND **`fetch_status = "ok"`**：
  All signals below are from this session's gap (last AO-CLOSE → this AO-RESUME) and are by definition unprocessed. No ambiguity.

- **`gap_window.is_fresh = false`** (source is `ao-resume-last.txt` or `fallback-24h`）：
  ⚠️ **UNRELIABLE WINDOW** — the gap start anchor was missing (ao-close-last.txt not found). Signals may overlap with the previous session. Do NOT report as definitively unprocessed. Offer to re-run: `scripts/fetch-external-signals.ps1`.

- **`fetch_status = "partial"` or `"failed"`**：
  ⚠️ **FETCH FAILED** — one or both APIs returned errors. Show which channels failed and their status strings. Do not guess at content; write「無法讀取 — [channel]: [status]」.

- **Digest is stale** (hook `finished_utc` from ao-resume-hook-last.json is >10 min newer than digest `generated_utc`)：
  ⚠️ **STALE DIGEST** — fetch-signals ran during AO-RESUME but did not refresh the file (API failure or credential issue). Report what the stale digest contains but label every item `[from stale digest — may be already-seen]`. Offer to manually re-run.

ops_inbox_commands（使用者 Bot 指令）：區段訊息數 + 可操作項條列；**0 訊息 = 「操作者本輪無下指令」，正常；不代表無告警**
deploy_events（VPS 部署事件，source=deploy from ops_inbox）：區段筆數 + FAILED/SUCCESS 條列；無則寫「本輪無部署事件」；`endpoint_pending` = 新端點尚未部署，屬正常
Slack #ops-incidents / #infra-alerts: 區段訊息數（不過濾已讀）+ 最新一筆
Cloudflare security: report result from `agency-os/reports/status/cf-security-LATEST.md` (bot=ON/OFF, rules=N) — skip if file missing. **If Overall: BLIND** (CF API token rejected with 401 — different from WARN, means the check learned nothing this run): surface this in 阻塞與風險 (§6), not buried as routine noise — it is the same severity class as a `blind_spots` entry in smoke-LATEST.json.
Only include actionable items; skip routine noise.

**3. 已完成**
What was delivered last session (from WORKLOG + CONVERSATION_MEMORY).
If nothing definitive, state that clearly and point to WORKLOG for reference.

**4. 目前進度**
- Lobster Factory Milestone (M1~M5) + 今日 DoD
- Git/Audit: exit code | AUDIT RESULT: PASS? | ahead=N behind=N
（阻塞／風險已獨立為 §6，本段只講「進行到哪」，不重複列阻塞。）

**5. 未完成待辦（TASKS）**
**按邏輯動態歸納主題**：把**同一主題/同一 project 的待辦併在一起**，不論它當初哪天加的、原本寫在 TASKS.md 哪個 `####` 分類。使用者會隨 project 演進不斷加新主題、新項目 — 主題清單**不是固定的**，必須每次依「當下實際有哪些待辦」現場長出來。

**歸納方法（每次重新做，不靠寫死的清單）：**
1. 讀完所有 open `- [ ]`，依任務內容/handoff 指向/關鍵字，判斷每項屬於哪個 project 或主題。
2. 把指向同一 project / 同一目標的項目**聚成一個主題群**（群名直接用該 project 名，如「app.aware-wave 一鍵架站」「wp-bridge 外掛」「客戶試點 Soulful」…）。有新 project 就自然多一群；該 project 清空就不再出現。
3. 群的排序：**進行中 / 今日主線優先**，其次按項目多寡或急迫度，零散收不進任何 project 的放最後一個「雜項」群。
4. 每項收斂成一行、去冗字。

**鐵則：** 每個 open `- [ ]` 都要落到某一群，**一項不漏**；跳過所有 `- [x]`。
Task count（所有群加總）must match `open-tasks-snapshot.md` Total open。對不上就說明原因。

> 反例（禁止）：把六個固定桶寫死照抄。主題是浮動的，要靠當下任務內容歸納，不是套模板。

**6. 阻塞與風險**（**必印** — 一眼可見，不得埋進別段）
列出**現在卡住／有風險／需注意**的事（這是「診斷」，不是「要你做的事」——那是 §7）。
- 每項附 `file:line` 或具體證據；**禁止**只寫「無」二字。
- **Source rules**：阻塞只能來自 (a) TASKS.md 的 open `- [ ]`、(b) `is_fresh=true` 外部信號、(c) ao-resume-hook health check 失敗、(d) `smoke-LATEST.json` 的 `blockers[]`（CI 連續失敗 workflow、夜間健康閘 critical failure、以及 8 個 sibling 偵測器的 WARN/FAIL/BLIND，逐行照原文印，不摘要不改寫；空陣列則不提這條，不是「查過=無」的例外）。**禁止**從 `- [x]` 推導（已解決 ≠ 阻塞）。
- 盤點後確無 → 寫「本次盤點：未見需立即處理之阻塞」**並一句說明依據**（如 Strict 結果、WORKLOG／memory 是否曾標記風險）。
- **雙層**：技術阻塞保留術語＋附白話「這會擋住什麼、嚴不嚴重」。
- 與 §7 邊界：阻塞若需**你**拍板 → 在 §7 引用，不在此重複全文（同資訊只出現一段）。

**7. 需你決策 / 期限提醒**（**必印** — 即使空也要印一行，永久區分「查過=無」與「漏了」）

分兩部分：

**(a) 需決策** — 無法在無人類選擇／動作下推進的項目。每項含：
- 類型：[資源 / 策略 / 權限 / 外部]
- 說明：what decision is needed
- 影響：what is blocked until resolved

**(b) ⏰ 期限雷達** — 有明確時間死線的項目，從 §5 待辦 + handoff + WORKLOG 掃出（如「Phase 4 觀察期 X/XX 到期」「出國前 Termius 未設定」）。每項一行：`<項目> — 死線 <日期> — 剩 N 天`。

**空態規則（強制）**：若 (a)(b) 皆無，印一行 `§7：本輪無需你做決定，無迫近期限。` — **不得整節省略**（靜默省略會讓人分不清「已查無事」還是「漏寫」）。

**8. 下一步**

**建議模型（每個下一步必附，操作者不記模型分工）**：每一項具體下一步行末加 `建議模型：<Fable 5.1｜Opus 5.5｜Sonnet 5.5｜Haiku 5.5>`，依 `agency-os/AGENTS.md` §5 模型路由表判（想→Fable／做→Opus 或 Sonnet／填→Haiku）；來源計畫的「下一步」行已寫建議模型就照抄。第一項的建議模型與目前 session 模型不同 → 該行前加 `⚠ 先在模型選單切 <模型>`。

**Pending handoff packets (check before first action)**:

1. Scan **every** open `- [ ]` row in TASKS.md for lines containing `→ handoffs/` — do **not** restrict to one section.
   (2026-08-26: packets used to live only in `#### 待釐清 / 明日提醒`; that section was dissolved into the
   A-I blocker axis, so packets now sit in E/F/G and new ones land in `#### I. 📥 收件匣`. A section-scoped
   scan would silently miss them — the failure mode being that a packet exists but AO-RESUME never shows it.)
2. For each pointer found, read `agency-os/handoffs/<filename>`
3. Display by count:
   - **0 packets**: skip this sub-section entirely
   - **1–3 packets**: inline full packet markdown for each, separated by `---`
   - **4+ packets**: inline the 3 most recent (by `YYYY-MM-DD-HHmm` filename prefix) in full; for the rest, output a **白話表格**（不可只丟 slug 代號 — 使用者看不懂代號）：每列 `| 白話說明（一句，從 packet 的 hint/任務目標讀出）| 代號 slug |`，再加一行：「回覆「展開 packet <slug>」可查看完整內容」。
     白話說明取自 packet frontmatter 的 `hint` 或 §1 任務目標，翻成使用者能懂的一句（例：`wp-bridge 外掛 v0.5.6 驗收 7053/7056`），**禁止只印檔名 slug**。
4. **Missing packet file**: if pointer exists but file not found, print:
   `⚠️ packet 不見 (handoffs/<filename>) — 請確認 git pull 已完成`
   Do NOT fail AO-RESUME for a missing packet.
5. **Path expansion**: replace `$WORK_ROOT` in packet content with the current working directory before displaying.

**Skill Spotlight（依今日 TASKS 自動推薦）**

根據 TASKS.md open items，點名今日最相關的 3–5 個工具。只列今日 TASKS 真正涉及的，不要湊數：

| 今日 TASKS 涉及 | 推薦工具（依序） |
|--------------|--------------|
| 部署 / sg-deploy / 上線 | `/check-drift` → `/verify` → go-ahead → `/sg-deploy` → `/playwright smoke` |
| 客戶 / WP / soulful / 外掛更新 | `/client-status` → `/wp-maintenance` → `/playwright client <slug>` |
| 新功能規劃 / 要加什麼 | `/feature-plan` |
| audit 報告 / apply patch | `/apply-audit` → `/verify-recent` |
| 跨機 sync / hook / settings 改動 | `/sync-check` → `/doc-sync` |
| 技術選型 / 架構決策 / A vs B | `/decide` 或 `/strategy-review` |
| QA / 瀏覽器測試 | `/playwright smoke` 或 `/playwright qa` |
| 系統健康不明 | `/health` → （若 sync fail）`/sync-check` |

格式（輸出 2–4 行即可，不要列整張表）：
```
🔧 今日 Skill Spotlight：
- `/xxx` — [何時用，一句話]
- `/yyy` — [何時用，一句話]
```

Then: Concrete first action. If a 需決策 item is blocking, state it first.

---

Do NOT ask the user to manually pull or run any command if the script already ran successfully.

> ⚠️ **AO-RESUME 報告輸出完成後立即執行 Step 3（Archive）— 不得跳過。**

## Step 3 — Archive the report (MANDATORY after Step 1 output)

After printing the AO-RESUME report to chat, write the **exact same markdown** to:

```
agency-os/reports/ao-resume/YYYY-MM-DD-HHmm.md
```

Where `YYYY-MM-DD-HHmm` is the local time you began Step 1. Use the `Write` tool.
This is the only way the user can browse past AO-RESUME reports — skipping it
silently breaks the workflow.

> **Safety net (2026-06-08)**: `ao-resume.ps1` now auto-writes a clearly-marked
> `<!-- AUTO-SKELETON -->` placeholder at this exact path if none exists, so a
> forgotten Step 3 no longer hard-fails the next AO-CLOSE health gate. **This does
> NOT excuse Step 3** — you must still overwrite the skeleton with the real
> AO-RESUME report (same content as chat). A surviving skeleton = Step 3 was skipped.

### Prune old reports (>90 days)

After writing today's file, list `agency-os/reports/ao-resume/*.md` (Glob),
parse the date prefix of each filename, and delete any whose date is more than
90 days before today. Skip `README.md`. Use the `Bash` tool with `rm` — git
will track the deletions on the next commit.

If the archive folder doesn't exist yet, create it first.

### Prune old handoff packets (>90 days)

Also list `agency-os/handoffs/*.md` (Glob), parse the `YYYY-MM-DD` prefix of each filename,
and delete any whose date is more than 90 days before today.
Skip `SCHEMA.md` and `README.md`. Use the `Bash` tool with `rm`.

### Self-check

If you forgot Step 3, the user is allowed to re-prompt with「你忘了寫 archive」—
acknowledge the lapse and write the file immediately.

## Related Documents (Auto-Synced)
- `docs/operations/RUNNABLE_DEMOS.md`

_Last synced: 2026-09-23 03:45:07 UTC_

