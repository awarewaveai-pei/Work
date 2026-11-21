# 算命站 WordPress 階段：派工計畫

續接語：我是這個階段的監工。讀本檔 → `data.mjs`（唯一狀態）→ `mcp__ccd_session_mgmt__list_sessions {linked:true}` 看工人；工人交回照 §4 驗收；操作者授權監工自己派工、選模型、判 RISKS，已定的事不再問她（`ORACLE-WP-SPEC.md` §0、§7）。回報繁中、金額 NT$。建議模型：Fable 5.2 或 Opus 5.5。

監工台：https://claude.ai/artifact/9PGQAU9kFciKoTJT3UxZGi（來源 `data.mjs`；改後 `node build.mjs && node check.mjs`，再以同一個檔案路徑重新發布；別的對話要帶 `url=` 才不會開新網址）。

設計正本：產品 `briefs/ORACLE-WP-SPEC.md`；平台 `briefs/SITE-FLOW-COMPLETION-PLAN.md`；決策 `agency-os/reports/decisions/2026-11-21-oracle-wp-front-door-architecture.md`。本檔只寫「誰做、何時做、怎麼收」，不重述做法。

## 1. 批次

同一批內的卡同時做（各自 worktree、檔案不重疊）；一條線＝一個工人 session，線內依序。批與批之間做一次「一起看 RISKS」（§5）。

| 批 | 線 1（引擎） | 線 2（引擎→外掛） | 線 3（主機腳本） | 線 4（next-admin） | 監工自己 |
|---|---|---|---|---|---|
| 1 | E1 → E3 | E4 | SF-C → SF-D | SF-B | A1、SF-A |
| 2 | E2 | P1 | SF-E → SF-F | SF-G | 套 migration（SF-B，需同意） |
| 3 | — | P2 ∥ P3（P3 用線 1 的 session） | SF-H | SF-I ∥ SF-J（SF-J 用新的設計 session） | SF-I0（需同意） |
| 4 | — | P4 | SF-K | SF-P | 一次部署 next-admin＋smoke；SF-L（需同意） |
| 5 | — | — | — | — | GO-1 → GO-2 → GO-3（每步需同意）；SF-O |

- 關鍵路徑：E1 → P1 → P3 → GO-3；平台 SF-C → SF-D → SF-E → SF-H → SF-L → GO-2。
- 批 1 派出時 E3、SF-D 不另開 session：同一條線的工人交回前一張、監工併入後，用 `SendMessage` 派下一張（context 過長先 `clear_session`）。

## 2. 卡片一覽

| 卡 | 內容（一句） | 正本 | brief | 模型 | 等級 |
|---|---|---|---|---|---|
| E1 | 引擎嵌入版頁面 | SPEC §2-2、§2-4 | `briefs/WP-E1-embed-page.md` | Opus 5.5 | Medium |
| E3 | 既有工具網址轉到 WordPress 頁；sitemap／robots 讓位 | SPEC §2-3、§2-12 | `briefs/WP-E3-front-redirect.md` | Opus 5.5 | Low |
| E4 | 會員票與 AI 每日上限 | SPEC §2-7 | `briefs/WP-E4-member-ticket.md` | Opus 5.5 | Medium（auth） |
| E2 | 引擎全站 CSP | SPEC §2-14 | 批 2 前寫 | Opus 5.5 | Medium（安全） |
| P1 | 外掛修 1M/6n＋同網域嵌入輸出 | SPEC §3 P1′ | 批 2 前寫 | Opus 5.5 | Medium |
| P2 | 命盤與「我存的對象」、加密、隱私匯出刪除 | SPEC §3 P2′ | 批 3 前寫 | Opus 5.5 | High（個資） |
| P3 | 每日信、Resend 退信 webhook、會員票 REST | SPEC §3 P3′ | 批 3 前寫 | Opus 5.5 | High（寄信、個資） |
| P4 | 外掛發佈管道 | SPEC §3 P4 | 批 4 前寫 | Sonnet 5.5 | Medium |
| A1 | ADR 015、017、018 修訂 | SPEC §2-15 | 監工 | 監工 | Medium |
| SF-A | 平台文件更正 | SITE-FLOW §1 第 7 列 | 監工 | 監工 | Low |
| SF-B | 資料模型與紀錄（migration 檔，不套用） | SITE-FLOW §1-4、§3 | `briefs/WP-SF-B-records.md` | Opus 5.5＋`db-expert` | Medium |
| SF-C | `safe-infra-patch.sh` 新建型 | SITE-FLOW §1-3、§3 | `briefs/WP-SF-C-patch-create.md` | Opus 5.5＋`critic` Deep | High |
| SF-D | 站台範本、主機登記、cron、拆除 | SITE-FLOW §1-3、§3 | `briefs/WP-SF-D-site-template.md` | Opus 5.5 | High |
| SF-E | 閘門新動詞（固定子動詞） | SITE-FLOW §1-3、§3 | 批 2 前寫 | Opus 5.5＋`critic` Deep | High |
| SF-F | 備份讀登記 | SITE-FLOW §3 | 批 2 前寫 | Opus 5.5 | High |
| SF-G | 步驟引擎＋API（失敗就不做） | SITE-FLOW §0 I6、§3 | 批 2 前寫 | Opus 5.5 | Medium |
| SF-H | 主機步驟實作 | SITE-FLOW §3 | 批 3 前寫 | Opus 5.5 | High |
| SF-I0 | MainWP 金鑰進 next-admin | SITE-FLOW §3 | 監工 | 監工 | High |
| SF-I | MainWP、wp-bridge、寫 `wp_sites` | SITE-FLOW §3 | 批 3 前寫 | Opus 5.5＋`critic` ×2（憑證） | High |
| SF-J | 兩個頁面 | SITE-FLOW §2、§3 | 批 3 前寫 | Sonnet 5.5（`frontend-designer`） | Medium |
| SF-K | 假狀態清除 | SITE-FLOW §1-5 | 批 4 前寫 | Sonnet 5.5 | Low–Medium |
| SF-P | 舊頁退場 | SITE-FLOW §1 第 2 列 | 批 4 前寫 | Sonnet 5.5 | Medium |
| SF-L | 拋棄式網域全流程 | SITE-FLOW §3 | 監工 | 監工 | High |
| SF-O | 手冊＋可跑示範 | SITE-FLOW §3 | 監工 | 監工 | Low |
| GO-1…3 | oracle 上線三步 | SPEC §3 上線 | 監工 | 監工 | High |

後面批次的 brief 在該批開始前寫，因為它們要引用前一批實際定下的東西（E1 的工具根元素 id、SF-C 的型別名稱、SF-D 的登記檔欄位）。先寫會寫錯。

模型選擇：會進 commit 且錯了很貴的（安全、主機、個資、資料模型）＝Opus 5.5；照既有元件搬的頁面與文件＝Sonnet 5.5；純資料填寫本階段沒有，不用 Haiku。

## 3. 工人 session

| 線 | name | 模型 | worktree | 現在的卡 |
|---|---|---|---|---|
| 1 | `wp-engine-a` | Opus 5.5 | 各自（app 建立） | 見 `data.mjs` |
| 2 | `wp-engine-b` | Opus 5.5 | 同上 | 同上 |
| 3 | `wp-host` | Opus 5.5 | 同上 | 同上 |
| 4 | `wp-admin` | Opus 5.5 | 同上 | 同上 |

- 同時最多 4 個工人。session id 寫在 `data.mjs` 各卡的 `session`。
- 沿用同一條線的 session 派下一張（`SendMessage`）；上一張 context 已長就先 `mcp__ccd_session_mgmt__clear_session` 再派。工人自己接近上限時照 `COMMON-WP.md` 的 Context 條。
- 工人不 push、不部署、不連主機、不套 migration；這些全在監工。

## 4. 驗收與併入（每張卡）

1. 讀工人的 FILES／TESTS／RISKS → `git -C <worktree> diff origin/main...HEAD` 讀 diff；回報裡的 `file:line` grep 驗真。
2. 併入：引擎卡 `bash agency-os/handoffs/2026-11-20-oracle-skills-supervisor/pick.sh <sha>`（`D:/Worktrees/Work/oracle-int`；程式檔衝突手動合）→ 專案目錄 `npx tsc --noEmit`＋全套 `npx vitest run` → `git rebase main` → D:\Work `git merge --ff-only` → push。next-admin 與主機腳本卡同法，測試改跑該卡 brief 的指令＋next-admin `npx tsc --noEmit`。
3. 有畫面的卡：監工用預覽實看繁中、英文、375px 各一次。
4. `data.mjs` 改該卡狀態與 commit → `node build.mjs && node check.mjs` → 重新發布同一個監工台網址。
5. WORKLOG：`scripts/worklog-insert-entry.py`＋`scripts/git-partial-worktree-commit.py`（私有 index）。
6. 派該線下一張，或清空／封存 session。

next-admin 每天 03:00 自動部署 main：SF-G、SF-H、SF-I、SF-J 併入後按鈕由 catalog 開關與主機開關檔擋著（SITE-FLOW §0 I6），不需要 `DEPLOY_HOLD`。含 migration 的 commit 必須在 migration 套用後才推（`check-migrations-applied.sh`）：SF-B 的 migration 檔留在工人分支，等操作者同意套用當天再併。

## 5. 一起看 RISKS（每批交回後獨立一步）

- 全批卡都交回才做。把各卡 RISKS 並排，每條三選一：現在修（回派原工人或監工修）、實測驗證、記錄不處理的理由。
- 結果寫進 `data.mjs` `RISKS`（每批一張表，每列必有處置，`check.mjs` 擋空白）與 WORKLOG；監工台重新發布。
- 下一批的 brief 這時才寫，把上一批的結果帶進去。

## 6. 要操作者點頭的時刻（到時一次問一件）

| # | 事 | 在哪張卡之前 |
|---|---|---|
| 1 | 套用 SF-B 的 migration 到正式庫 | 批 2 併 SF-G 之前 |
| 2 | MainWP 金鑰放進 next-admin 容器（主機 compose 變更） | SF-I0 |
| 3 | 開主機開關檔與 catalog、建測試網域 DNS，跑拋棄式全流程 | SF-L |
| 4 | 部署引擎（含目前 main 上所有未部署的引擎卡） | GO-1 |
| 5 | 改 `lobster-nginx` 的 oracle 區塊，讓 WordPress 接非引擎路徑 | GO-2 |
| 6 | 首頁換到 WordPress、正式開放 | GO-3 |

## 7. 已知未驗證（帶進對應的卡）

SPEC §6 全部；Resend 網域 `oracle.aware-wave.com` 驗證狀態（建立於 2026-11-22，當時 pending，P3 開工前 `get-domain` 確認）；經 FluentSMTP 能否帶 Resend 標籤（P3）。
