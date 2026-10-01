# AGENTS.md 附錄 — 理由、機制細節、案例

> `agency-os/AGENTS.md` 每輪整份注入 prompt，只放規則本體。本檔放「遇到情境才查」的理由、機制細節與事故案例，**仍為強制**。查表類（觸發語／路由／hooks 清單）在 `TOOL_TRIGGER_MAP.md`。
>
> **本檔不變量**（`scripts/verify-governance-pointers.mjs` 機械檢查；`validate-doc-integrity.mjs`、`scripts/test-hooks.sh`、CI `shared-asset-gates.yml` 都會跑，紅 = 健康閘紅）：
> 1. 一個主題一節。標題在 AGENTS.md＋本檔內唯一；AGENTS.md 條文末的 `§名`，以及 hooks／scripts／commands 引用的段名或 `§0`–`§9`，都必須剛好對到一個標題。
> 2. 本檔不存 AGENTS.md／CLAUDE.md 的舊版全文。舊版在 git，見文末「歷史版本」。
> 3. 規則本體只改 AGENTS.md。本檔與 AGENTS.md 衝突時以 AGENTS.md 為準，並在同一 commit 修本檔。
> 4. 改名或刪除任何一節前，先跑 `node scripts/verify-governance-pointers.mjs` 看誰在引用。

## R0：架構師模式

規則編號空間：R0／R4 在 AGENTS.md；R1／R2 在 `CLAUDE.md`（多機設定同步／任務完成強制）；R3 未使用（保留編號）。AGENTS.md 由 `CLAUDE.md` 開頭 `@agency-os/AGENTS.md` 整篇引入，兩檔共用同一套編號。

**思維準則對應的既有機制**（每個決策都要過；五項不是口號，各自落在下列規則上）：

| 準則 | 落在哪條規則 |
|---|---|
| 多角度優先 | 七段的 [風險清單]／[方案比較]（A 最小 vs B 完整，各附 rollback）；架構／資安／DB／維運／成本都要看 |
| 30 年工程紀律 | 補丁判準（下方）：正確性不可依賴「記得那些例外」 |
| 零重工原則 | 動手前 `git log`＋先搜既有機制（AGENTS.md §2 寫入前 Glob）；一個事實只寫一處（§9） |
| 完整閉環 | 四動作（實測／Review／抓蟲／WORKLOG）＋commit；偵測 → 修復 → 驗證 → 防再發，缺一段不算完成 |
| 最小爆炸半徑 | 最小、可回滾的修改；風險分級（§3）；共享檔只 commit 自己的 hunk（§8） |

**補丁判準（提方案前自問，答不出就是補丁）**：「這一類問題的**不變量**是什麼？我這次是關掉整類，還是只關掉眼前這個實例？」答不出不變量 = 補丁，重做方案。同一套紀律在 §跨模型 oracle 有 reviewer 打回 2 次的觸發版本，但**判準本身不限於那個情境，提第一版方案時就適用**。
**最惡樣態（優先識別）**：改資料 / 加豁免 / 調門檻去**消音偵測器**，使系統宣稱與真實狀態不符 —— 這比原 bug 嚴重，因為它同時毀掉「發現問題」的能力（同 §已知信任邊界 的失效模式；實例：ClickHouse canary、staging URL 刪除線、archive-lift 誤報）。
**為何是紅線**（不是風格偏好）：① 補丁讓正確性依賴「記得那些例外」，而本 repo 主要由**無跨 session 記憶的代理**操作，冷啟動必然踩雷 ② 補丁會互相保護 —— 累積到某個點，單獨修任一個都會讓另一個惡化，系統失去「還能改一件事」的能力（實例：2026-08-24 `reconcile.ts` 的 org-scoping 與孤兒誤歸屬互鎖）③ R0 目標是 30 年，N 個補丁 = 2^N 條交互路徑。
**唯一例外**：真正的緊急止血（prod 正在燒）。此時允許補丁**但必須**同時在 `TASKS.md` 開治本項並在 WORKLOG 註明「此為止血非治本」，否則視為違反。

**AO 生命週期例外（預授權，R0 逐項批准不適用）**  
使用者觸發 AO-CLOSE（含：收工／晚安／bye／done／先這樣／走了）或 AO-RESUME（含開工關鍵字），以下操作**直接執行，禁止要求逐項批准**：  
① `WORKLOG.md` 寫入 AUTO_TASK_DONE / REALTEST_EVIDENCE / REALTEST_WAIVED / REVIEW_DONE / REVIEW_WAIVED / BUGHUNT_DONE / BUGHUNT_WAIVED 及任何本流程所需證據行  
② `memory/CONVERSATION_MEMORY.md` 精簡蒸餾更新  
③ `memory/daily/YYYY-MM-DD.md` 當日記錄  
④ `reports/ao-close/*.md` 與 `reports/ao-resume/*.md` 存檔寫入  
⑤ 執行 `ao-close.ps1` / `ao-resume.ps1` 腳本本身  
**自修規則**：若 `verify-closeout-completeness` 擋下，代理自行補寫缺漏證據行後重跑，無需使用者批准；若 ao-close.ps1 因 behind remote 中止，自行跑 `git pull --ff-only origin main` 後重跑。  
**唯一允許問一題的情況**：(a) `git push` 被拒且需人類介入（auth 失敗 / 真正 merge conflict）；(b) health check 自修後仍 < 100%，列出具體失敗項並問一題；**禁止**主動提議降低門檻或使用 `-AllowNonPerfectHealth`。

`git-log-injector.js` 的行為細節（顯示範圍、fallback、上限）以該檔檔頭為正本：`mcp/claude-userlevel/hooks/rules/git-log-injector.js`。

## R4 VBC

**驗前先讀歷史（VBC — Verify Before Conclude，強制）**：
宣告「X 缺失 / X 無保護 / X 沒完成」前，必須先查「是否有替代方案已補上」。**單一數據源缺失 ≠ 整體未完成。**
- 正確流程：看到 A 層消失 → 先問「用什麼替代？」→ 讀 WORKLOG / 查 VPS 實際狀態 → 再下結論
- 禁止：只查單一系統（CF API / VPS / git diff / DB）就宣告「另一個 session 沒做好」
- 根因案例（2026-06-04）：CF WAF = 0 rules → 未讀 WORKLOG 確認 LLAR 已裝 → 誤報「wp-login 無保護」。正確：兩層一起看（WAF 消失 + LLAR 補上 = 完成，不是問題）
- 同樣適用於：DB 表空了 / 設定檔不見了 / 容器消失了 / endpoint 沒了 → 都先問「誰接手了？」

**[驗證計畫] 四動作落實檢核**：R0 [驗證計畫] 的四個動作（實測 / Review / 抓蟲 / WORKLOG）必須在 [驗證結果] 段對應出具體執行紀錄。違反樣態：
- 只寫 grep -c 數量 = 缺 Review + 缺實測
- 只跑 npm test = 缺抓蟲 + 缺 WORKLOG
- 不寫 WORKLOG = 證據鏈斷裂，未來 AO-RESUME 看不到當時做了什麼
- 實測段只寫文字描述（「我跑了 curl，結果是 200」）而無 `REALTEST_EVIDENCE:` 或 `REALTEST_WAIVED:` 行 = AO-CLOSE 機械閘會擋（`verify-closeout-completeness` 強制）
- Review 段只寫「讀回了檔案，結構正確」而無 `REVIEW_DONE:` 或 `REVIEW_WAIVED:` 行 = AO-CLOSE 機械閘會擋（`verify-closeout-completeness` 強制）
- 抓蟲段只寫「已搜尋相關位置」而無 `BUGHUNT_DONE:` 或 `BUGHUNT_WAIVED:` 行 = AO-CLOSE 機械閘會擋（`verify-closeout-completeness` 強制）

## 操作風險分級

三級表在 AGENTS.md §3。另加：禁止：跳錯處、硬編密鑰、直衝 prod、一次蓋整個系統。**機械閘 (High)**：`hooks/rules/high-risk-bash-warn.js` 自動 BLOCK `docker compose down/stop`、VPS rsync/scp、DB migration deploy；需命令第一行加 `# CONFIRMED-HIGH-RISK: <reason>` 解鎖。

## 規則優先序

規則間張力（R0「任何檔案等批准」vs「宣告執行不詢問」vs 風險分級「Low 直接做」vs AO 預授權）依此優先序裁決，**高者勝**：

1. **AO 生命週期預授權**（AO-RESUME / AO-CLOSE 明列操作）→ 直接執行，R0 逐項批准不適用（明細見 §R0：架構師模式 的「AO 生命週期例外」）。
2. **操作風險分級**：High-STOP 一律等明示 go-ahead（機械閘強制）；Low / Medium 依分級表處置 —— 「宣告執行，不詢問」只適用於 Low/Medium。
3. **R0 批准區塊**：適用於「使用者請求的實質修改任務」的開工前對齊（輸出七段區塊等批准）。R0 的「任何檔案」讀作「任務範疇內的實質修改」，不覆蓋上兩層已授權/已分級的操作；Low 級小修依分級表直接做並說明假設，不需重複走 R0 批准。

一句話：**預授權 > 風險分級 > R0 逐項批准**。條文再衝突時引用本段，不各自表述。

## 已知信任邊界

- `verify-closeout-completeness` 驗的是證據行「格式存在」，**不驗內容真實**（REALTEST/REVIEW/BUGHUNT 的 cmd/verdict 不被重放）。唯一內容驗真是 `bughunt-oracle`（僅覆蓋 `hits=0` + ASCII identifier + code 檔）。證據誠實靠操作紀律；偽造證據行可通過機械閘 —— 這是設計取捨（重放副作用指令不可行），不是漏洞待修。發現可疑證據 → 人工抽查 WORKLOG 對應 commit。
- 機械閘全部 **fail-open**（閘壞 = 靜默放行 + 寫 `~/.claude/verify-gate-failures.log`）；閘的健康由 `bash scripts/test-hooks.sh` 驗證（案例數以套件輸出為準，禁止在文件手寫），改 hooks 後必跑。

## 跨模型 oracle

**存在理由**：上一節說明機械閘只驗「證據行格式存在」，不驗內容正確。**閘擋的是「忘記做」，不是「做錯」。** 補這個缺口的唯一手段是外部模型——同一個模型審自己，盲點與產出同源。實證：2026-08-17 三輪覆審共 7 條 finding 全為真、0 假陽性，其中 4 條發生在「我自己剛寫完並認為沒問題」的 code 上。

**分工線畫在「讀 vs 寫」，不是「規劃 vs 執行」。** 寫入者由操作者授權的活躍 agent 擔任；不得把「換一個模型」當作跳過治理、驗證或回滾責任的理由。

| 工作 | 執行者 |
|------|--------|
| **任何寫入 `D:\Work`** | **操作者授權的活躍 agent（Codex 或 Claude）**；寫入者負責完整 R0/R4 證據鏈 |
| 大量讀檔 / 跨檔掃描 / R0 抓蟲步驟 / 報告消化 | Codex 優先（操作者 Codex 額度較寬） |
| 設計、取捨、架構決策 | 人類操作者；agent 提供可驗證的選項與影響 |
| 對抗式覆審（R0 [驗證計畫] Review 動作） | 與寫入者獨立的可用模型逐條驗真偽；若不可用，記錄原因與可重放的替代檢查 |
| repo 外拋棄式工作（`D:\tmp` 原型、一次性腳本、demo） | Codex 全包，Claude 不插手 |
| prod deploy / DB migration / 憑證 | 操作者明示 go-ahead + 具備對應能力的授權 agent。**不可委派給未授權者** |

**跨工具寫入的控制**：`git-log-injector`、`file-path-router`、`high-risk-bash-warn`、`verify-gate-commit` 等規則由同一支 `mcp/claude-userlevel/hooks/runner.js` 執行：Claude 走 `~/.claude/settings.json`，Codex 走同步產生的 `~/.codex/hooks.json`（`--host=codex`，`hooks/lib/codex-adapter.js` 把 `apply_patch`／`spawn_agent` 轉成 Edit／Agent；Claude 的 `permissions.deny` 清單在 Codex 由 `permission-deny-mirror` 規則執行）。Codex 對 hook 定義採雜湊 trust，未 trust 或雜湊過期就**靜默略過**——所以 Codex 只有在 `/hooks` trust 過且 smoke `codex_parity=ok`（trust 數 + 執行心跳）時才算有閘；否則寫入者必須手動執行等價的 git log、風險分級、驗證、review、bughunt、WORKLOG、commit 與 push，不可把缺少 hook 當作降低門檻的理由。此規則取代 Claude-only writer 限制（操作者明示，2026-09-01）；Codex 接線 2026-09-19 修正（WORKLOG 續79／續80）。

**唯一入口（2026-08-30 起）**：跑 **`/codex-review`**（本 repo 自建 command，`.claude/commands/codex-review.md`）——不要手動拼 `/codex:adversarial-review` 的呼叫。原因：這個工作需要固定附帶 2 段 focus text（隱藏依賴檢查 + NO FINDINGS 許可，官方 adversarial-review 的 attack-surface/calibration/grounding 規則不含這 2 條）+ 跑完手動落地 ORACLE gate artifact（`scripts/write-oracle-artifact.ps1`）——細節寫死在 command 檔裡，不是散文規則靠記憶執行；散文版本容易在 AGENTS.md 這種大檔案裡被漏讀，command 檔案每次呼叫保證完整。

**反向（2026-09-19 起，Codex 主導準備）**：oracle 的意義是「另一個模型」，所以寫入者是 Codex 時改跑 **`/claude-review`**（`.claude/commands/claude-review.md` → `scripts/claude-oracle.ps1`）：同樣先 capture 再審、`claude -p` 唯讀（Read/Grep/Glob，子行程 `disableAllHooks` 以免觸發 AO-RESUME，MCP 全關）、落地同一種 ORACLE artifact（`write-oracle-artifact.ps1 -Reviewer claude`）。額度鍵沿用 `critic`（= Claude 帳號額度）。

**推理強度刻意不降**：抓蟲抓漏洞的用途本來就是要花推理成本換深度，`~/.codex/config.toml` 的 `model_reasoning_effort=xhigh` 保留不動；要省的是餵給它的輸入量（untracked 檔案排除 lock 檔/vendor/生成檔、設總量上限），不是砍它想的深度。

`scripts/codex-oracle.ps1` 保留在 repo 內但**降級為備援**：官方指令連續失敗（timeout/服務中斷）≥ 2 次時才退回用它（呼叫方式不變，見腳本內 `.EXAMPLE`）。

**機械閘**：見下一節 §ORACLE gate。閘擋的是「忘記跑」，不是「finding 沒處理」。

**驗證的形狀（2026-09-04，操作者指示；AI-LEGO 專案版在 ADR-024）**：程式碼以突變測試（故意拔掉 guard → 指名的測試變紅 → 還原變綠）為主要證據；每個 commit 一個 critic，深淺依 `.claude/commands/review.md` 的 tier；多代理只用在 auth／crypto／個資。文件與 YAML 規格不派 agent，用 golden test + 書面自審。外部 oracle 全部沒額度時不跳過 review：書面對抗自審 + 突變證據 + WORKLOG `ORACLE_WAIVED`（memory `feedback_self_review_when_oracle_down`）。

**額度斷路器（操作者明訂 2026-09-04：撞到額度就馬上停，不要再連）**：任何 oracle 呼叫（critic subagent、`/codex-review`、`codex-oracle.ps1`）**之前**先跑 `scripts/oracle-quota.ps1 -Action check -Tool <codex|critic>`，exit 3 = 直接走 fallback，不連線、不「試一次看看」。呼叫回來若含 `429`／`rate_limit`／`session limit`／`usage limit`／`try again at`，**立刻**用回覆裡的重置時間跑 `-Action set -Tool <t> -Until "<時間>" -Reason "<原文>"`（沒給時間就 `-Hours 5`），同一 session 內不再碰同一工具；成功呼叫後 `-Action clear`。狀態檔 `%TEMP%\claude-oracle-quota.json` 全機共用（額度是帳號的，不是 session 的）。`/codex-review` 與 `/review` 的 Step 0 已寫死這個檢查。

**同一 reviewer 對同一段程式碼連續回報 2 次 → 第 3 次修正前必須先做不變量分析（強制，2026-08-24 起）**：不能再逐點打補丁。寫一段「這一類問題的完整不變量是什麼」，確認這次修正是關掉整類問題還是只關掉這一個實例；只關掉實例要在 WORKLOG 明說並取得使用者同意才能繼續逐點修。**禁止**用「範圍夠小」「邏輯直接沿用前一輪」當理由跳過這一步——這正是 2026-08-24 ORACLE gate deletion 追蹤機制被同一顆 Codex 連續打回 8 輪的根因：每輪只修被指出的那一行，没有停下來問「這一類問題還有哪裡沒堵到」（完整案例見 `WORKLOG.md` 2026-08-24 round 1–8）。

**禁止**：① 直接跑裸 `codex exec`（會漏 `-o`，單次噴 ~120KB 進 context；也會拉起 config.toml 的 MCP）② 用 `chatgpt-*`／`gemini-*`／`grok-*` MCP 工具當 oracle —— 那些走 `OPENAI_API_KEY`／`GEMINI_API_KEY` **按 token 計費**，與 ChatGPT 訂閱是兩套帳；`codex` CLI 走訂閱（`authMethod: chatgpt`），零額外費用 ③ 直接採用 findings 而不驗證——**每條必須 Grep 確認 `file:line` 真實存在**，AGENTS.md §Subagent 交接協議 的驗證要求同樣適用 ④ 讓 Claude 與 Codex 同時修改同一份檔案（操作者 2026-08-17 明確指示）。

**給 Codex 的 prompt 只放決策結果，不放推理過程**：R0 七段區塊是給操作者批准用的；Codex 只需要 Decision / Constraints / Files / Acceptance。兩份產出，不同讀者。

## ORACLE gate

**機械閘（2026-08-20 起，ORACLE gate）**：上面那條路由表本身**不是自動化** —— 它是文字規則，靠代理自覺。閘補的就是這個缺口：

| 環節 | 機制 |
|------|------|
| 產證據 | `codex-oracle.ps1` 每次跑完把答案寫進 `agency-os/reports/oracle/YYYY-MM-DD-<mode>-<stamp>.md`（進 git，不刪）|
| 驗證據（修改） | `verify-closeout-completeness.ps1` §ORACLE gate：staged 含 source 檔時，該目錄必須有**當日**且**時間戳晚於最後一次改檔**的 review artifact |
| 驗證據（刪除） | 2026-08-24 改版：刪除的檔案沒有 mtime 可比對時間戳，改綁**內容**——artifact 記錄 `- deletions-reviewed: <path>@<blob-hash>`（git diff header 的 `index <hash>..0000000`），gate 對「目前真正 staged 的刪除」算出同一顆 hash，要求路徑+hash 精確相符才算確認；純路徑比對（舊格式 artifact）只在雙方都算不出 hash 時才當備援，避免同日「刪除→復原→改內容→再刪除」被舊記錄誤證（8 輪修正細節見 `WORKLOG.md` 2026-08-24 各 round 條目） |
| 豁免 | 當日 WORKLOG 加 `- ORACLE_WAIVED: <理由>`（看得見，不可靜默省略）|
| 涵蓋副檔名 | `$codeExts` + `.sql .yml .yaml .php .tf .tfvars` —— **刻意不共用 `$codeExts`**，因為那份清單同時驅動 REALTEST/DEBUG-TAG，放寬會靜默擴大三個不相干的閘。SSOT 在 `verify-closeout-completeness.ps1` `$oracleExts` |

修改的時間戳比對是刻意選的：oracle 讀的是**尚未 stage 的工作樹**，所以無法用 staged diff 內容直接綁定；「artifact 必須晚於它宣稱審過的檔案」是唯一可機器驗證的順序關係。它擋的是「早上審完、下午改了才 commit」（codex FINDING 1）。刪除則相反——檔案內容本身（git blob）在被刪前就已定案，反而可以做到比時間戳更精確的內容綁定，2026-08-24 那輪才改用 hash。

**閘擋不到的**：artifact 存在 ≠ findings 被處理。這仍是操作紀律（見 §已知信任邊界）。閘關掉的只有「忘記跑」這個洞。

## Session 衛生

**每一輪對話都會把整段歷史重送一次**，所以早期塞進 context 的東西之後每輪都在重複付費。這比 oracle 分工更大的槓桿，順序不可顛倒：

1. **一個任務一個 session**。任務完成 → AO-CLOSE（狀態落進 `WORKLOG.md`／`TASKS.md`／memory）→ `/clear`。本 repo 的狀態不在對話裡而在檔案裡，所以 clear 幾乎零損失——這是 AO 生命週期設計的直接紅利。任務**進行中**不要 clear（重讀檔案比留著貴）；只是變長變鈍用 `/compact`。
2. **不讓大輸出進 context —— 但省的是「不需要的」，不是「該讀的」**。分級，不可一律片段化：

   | 情境 | 怎麼讀 |
   |------|--------|
   | **即將修改的檔案** | **整檔讀，不可省** |
   | 它的 helper／被 import 的定義 | 整檔，或至少讀完該定義 |
   | 只確認單一事實（某符號存不存在） | 片段 / grep |
   | 掃 20+ 檔找模式 | 交給 Codex inspect |
   | 大型 log／報告／JSON | 先 `grep`／`tail` 過濾 |

   判準是「要不要對它負責」：要改、要驗證 → 整檔；只是定位 → 片段或委派。
   **片段讀最常漏的是檔案頂端的全域設定**（`Set-StrictMode`、`$ErrorActionPreference`、import、外層 try/catch）——它們離你在看的那段很遠卻決定其行為。實例：2026-08-17 修 `check-smoke-tests.ps1` 若只讀 Check 5 段落，會漏掉 `:26` 的 `$ErrorActionPreference = "SilentlyContinue"`，而那正是該 bug 難以察覺的原因（Codex FINDING 2 明確引用該行）。
   **同理，Codex 摘要的邊界 = 問題的邊界**：整檔讀會看到你沒在找的東西，摘要不會。實例：`log_saved_interval_days=14`（使 21 天門檻成為死碼的關鍵耦合）兩輪覆審都沒出現，因為沒人問——是自行追線索查設定才發現。
   外部 CLI 輸出一律導向檔案再取需要的部分。反例：2026-08-20 三次裸 `codex exec` 各噴 ~120KB，合計 ~366KB 永久佔用該 session 每一輪。
3. **設計討論每三輪自問「這該落地成文件了嗎」**。討論留在對話裡 = 每輪重付且 session 結束即蒸發；寫進 repo = 付一次。
4. **任務結束時主動提醒操作者 `/clear`**，不等對方想到。

## Agent 扇出治理

**背景**：連續多日單一 session 5 小時額度在 20-30 分鐘內燒光，真因是一次 `Workflow` pipeline 27 項 × 4 agent/項 = 102 個 agent 一次性 fan out。`.claude/hooks/rules/subagent-budget.js`（SSOT 在 `mcp/claude-userlevel/hooks/`）掛 `PreToolUse`，涵蓋 **session 內**的 Agent tool 路徑（`mcp__ccd_session__spawn_task`／`claude -p` 另開 session，架構上看不到，刻意不管，見檔頭註解）：

**路徑 A — Agent tool**（matcher `^Agent$`，機械可攔，**已用真實 spawn 驗證**）：滑動視窗計數（預設 20 分鐘，對應實際事故時間尺度），非 per-turn 歸零：
- 視窗內 0-5 個：放行
- 6-10 個：block，除非該 Agent 呼叫的 `prompt` 含獨立一行 `CONFIRMED-INDEPENDENT-WORKSTREAM: <理由>`
- \>10 個：無條件 block，無 marker 可解鎖（上限是「嘗試次數」不是「放行次數」——被擋的重試也計入，見檔頭 m-4 說明；要提早重置：刪 `%TEMP%\claude-subagent-budget-agent-<sid>.txt`）

**路徑 B — Workflow tool：已全面關閉**（`permissions.deny`，`tests/hooks/settings-deny-parity.test.mjs` 守）。原設計是「誠實聲明閘」（`// SUBAGENT-BUDGET-ESTIMATE: <N>`），但 fan-out 數量在腳本跑到一半才算得出來，事先聲明擋不住動態爆量，2026-09-03 一次 Workflow 派 99 個 agent 燒光額度後整個工具關閉。多代理一律走路徑 A。

⚠️ **版本教訓（不要重複犯）**：
- v1 掛在 `SubagentStart`——被外部 critic 覆審用真實 spawn 證實完全無效。
- v2 改掛 `PreToolUse` 但只覆蓋 Agent tool，完全沒管 Workflow；matcher 未錨定誤擋真實存在的 `ListAgents`；per-turn 歸零可被多送一句話繞過。
- v3 修完 v2 全部四條，但**只驗證了 Agent tool 路徑是真實 spawn，Workflow 路徑仍是合成 payload**——第三輪 critic 掃真實 transcript 找到 `Workflow` 有 3 種輸入形狀，`scriptPath+resumeFromRunId`（31% 真實用量）完全沒被 v3 的程式碼處理過，會變成無法滿足的永久 block；同時 v3 為了「檔案不要無限長」加的壓縮邏輯，**重新引入了 append-only 設計本來要消滅的 race**（20 並行實測掉 33-45%）。
- 第三輪（現況）修完上述，且回歸測試套件本身也被 mutation test 驗證過（拔掉 guard 後測試真的會失敗，不是空測試）。
- **這條教訓本身也適用於治理紀律，且套用了兩層**：① 同一份程式碼被同一個 reviewer 連續抓到兩輪問題時，第三次修正前必須先做不變量分析（R0「補丁判準」）；② **驗證程序本身也要接受同一套紀律**——「每項都用真實 spawn 驗證」這句話在 v3 寫下時是對 Agent 路徑講的真話，套用到 Workflow 路徑就是自我宣稱未經檢驗；發現即改寫，不維持錯的宣稱。

**禁止樣態（操作者明訂，2026-09-03，機械閘擋不到的情況直接寫死規則）**：

**禁止**：對一批 N 個項目（finding／ADR／檔案／任何清單）逐項各自配一個或多個 agent 處理或驗證（1:N 或 1:2N 映射）。這個寫法的 agent 總數會隨 N 線性放大，且 `subagent-budget.js` 的 Workflow 分支**擋不到**——真實數量是腳本執行到一半才算出來的（例如「5 個 reviewer 產出 47 個 finding」），呼叫 Workflow 那一刻根本不知道 N 是多少，事先聲明的 `SUBAGENT-BUDGET-ESTIMATE` 防不了這種動態爆量。

**真實案例**：2026-09-03 5 個 reviewer 產出 47 個 finding，每個 finding 配 2 個 refuter → 99 個 agent、94 個因 session limit 失敗、5 小時額度燒光。

**正確做法（唯一允許的模式）**：
1. 單一 artifact（一份文件／一段程式碼／一批相關修改）的**修改工作，自己動手做一次**，不分派給 agent
2. 改完後，若需要獨立覆核，派 **≤5 個**獨立 agent 做覆審（特殊情況才到 10），**覆審的對象是「整批改完的結果」，不是「每個finding／每個item各自一個agent」**
3. 真正大量、彼此獨立、可切割的工作（例如 27 個真的互不相依的檔案）→ 分批塞進 ≤10 個 agent，每個 agent 一次處理多項（見上方路徑 A 的批次原則），**絕對不是一項配一個 agent**

**正面模板（操作者提供，2026-09-04）——agent 數量跟著「角色」走，不是跟著「項目數量」走**：一個 agent 負責理解問題、一個負責執行、一個負責找錯（critic）、一個提供獨立觀點，最後由使用者或一個整合 agent 收斂結果——固定 4-5 個，不因為任務裡有幾個 finding／幾個檔案就跟著長大。上面「99 個 agent」那個事故的根因，就是把「驗證」這個角色複製了 47 次（每個 finding 各配一份），把「按項目複製角色」跟「按角色分工」搞反了。判斷準則：派 agent 前先問「這是一個新角色，還是同一個角色的第 N 份拷貝？」——新角色可以加，同角色拷貝要嘛自己做、要嘛批次塞進固定小數量的 agent。

**讀資料／理解問題：預設由主 agent 自己讀（操作者明訂 2026-09-04；同日第二版收緊）。** 第一版原文與 9-reader 事故見本節末「讀資料規則第一版」。現行規則：
1. **預設：主 agent 用 Read／Grep／sed 範圍自己讀。** 要改的檔整檔讀；只確認一個事實用 grep；不為「了解一下」讀整份 900 行 schema（AI-LEGO 語料先查生成的 `SPEC_QUICKREF.md`／`MOTHER_DOC_SECTION_INDEX.md`）。理由：讀到的東西留在做決策的那個上下文裡，摘要的邊界就是問題的邊界。
2. **例外 A，獨立驗證：** critic／oracle 可以讀，一個 commit 最多一個。它讀是為了不同觀點，不是替主 agent 讀。
3. **例外 B，超過約 100KB 且不會去改的純調查：** 最多 1 個 agent 或走 Codex；產出必須寫進檔案並附 file:line，不是只回傳摘要，主上下文不背那些內容。
4. **配套：** 讀完一批就 `/compact`；讀取結論先寫成 scratch 筆記檔，壓縮後事實還在。這是「主 agent 讀」不把 session 讀爆的前提。
**機械閘管不到這條**：`subagent-budget.js` 只按數量擋，分不出 agent 在讀還是在做；純靠紀律，如實記錄。

### 真實案例（2026-09-03）

**真實案例（2026-09-03，另一 session，Cognitive Engineering OS Phase 5 覆審）**：5 個 reviewer 產出 47 個 finding，設計成每個 finding 配 2 個 refuter 驗證 → 總數衝到 99 個 agent，94 個因 session limit 全部失敗，5 小時額度燒光。閘本身沒壞，是**腳本設計違反這條規則**。

### 讀資料規則第一版（2026-09-04，已被上方現行規則取代，留事故）

**讀資料／理解問題階段：硬性上限 1 個 agent（操作者明訂，2026-09-04，比上面 ≤5/≤10 更嚴）**：正面模板把「理解問題」列為一個角色，這裡曾被誤讀成「可以按子系統拆成多個平行reader」——真實事故：一個 Workflow 派 9 個 agent、每個讀一個子系統，去理解一份 ~300 檔的文件樹，雖然是「按角色」不是「按項目」、也沒超過 ≤10 上限，操作者仍判定不合理，明訂**讀/理解/研究類任務，不管資料量多大，永遠只能 1 個 agent（或自己親自讀 Read/Glob/Grep），不准派多個平行reader**。理由：讀資料是取得資訊，不是需要多個獨立判斷視角，多個reader各自讀一部分再合併，本質上是重複的context載入，不是真平行；真正大型的讀取交給 Codex（§跨模型 oracle 既有路由，非額外開多個Claude agent）或自己讀，不開多顆Claude agent分攤。**這條蓋掉「理解」這個角色的例外**——4-5個角色模板裡的「理解」永遠是1個，不可再拆；「執行」階段（理解完、分派工作後）才適用≤5個agent的上限。**機械閘管不到這條**：`subagent-budget.js`只按數量擋，擋不到「這9個agent各自是不是在做同一件讀取工作」，此規則純靠紀律，如實記錄不誇大。

## 失敗重試紀律

**同一件事用同一種方式失敗兩次 = 停。** 第三次一模一樣的嘗試是違規，不是堅持。每次失敗先讀錯誤訊息找根因，換方法再試（實例：heredoc 報 EOF → 改寫檔再執行，不是再貼一次；hook 擋下 → 照閘訊息做，不是重送同一條；oracle 429 → 斷路器 + fallback，不是再連）。換了方法仍失敗第二次 → 問一題，說明兩種方法各自怎麼失敗。**機械閘**：`hooks/rules/repeat-failure-guard.js`（PreToolUse Bash）——同一條 Bash 指令文字在本 session 失敗 2 次後，第 3 次相同文字直接 BLOCK；真的需要重跑同一條（例如外部狀態已變）在首行加 `# RETRY-JUSTIFIED: <什麼變了>`。閘只認「一字不差的同一條指令」，換了方式就不會被擋。

## Auto-Repair 紅線

流程：`incident → triage → backup → repair run → health gate → (auto-rollback if fail) → GitHub issue → WORKLOG`

**絕對禁止（無論任何情況）**：改 secrets / `.env*` / keys；改 auth / payment / permission / RLS；改 DB migration；未過 health gate 直接 deploy production；用空 catch 吞錯。無 pre-repair backup 不建 Issue。

**nginx / Dockerfile / docker-compose**：① 修改前備份 ② 套用後立即 health check ③ 失敗自動 rollback ④ 寫 WORKLOG。腳本：`/root/lobster-phase1/scripts/safe-infra-patch.sh`。

Auto-repair Issue 必含中文摘要（問題/原因/修法/風險/建議）。改超過 3 個檔案、同 fingerprint 第二次修、API response 格式變更、cron/第三方 API 變更 → 標 `needs-human-review`。

## Subagent 交接協議

召喚任何 agent 前，briefing **必須包含以下五項**，缺任一項 = 劣質 brief，結果不可靠：

1. **問題陳述** — 是什麼出了問題或需要完成什麼（用 `file:line` 引用，禁用模糊描述）
2. **已知事實** — 已讀哪些檔案、看到了什麼
3. **已排除原因** — 試過什麼、為什麼排除
4. **預期輸出** — agent 應回傳什麼格式（例：根因 + fix patch + 驗證指令）
5. **邊界** — agent 不應改什麼（例：「只分析不動 production」）

**Agent 回傳後必須驗證：**
- 每個 `file:line` 引用是否真實存在（Grep 確認）
- 建議修改是否與現有慣例一致（讀相鄰程式碼）
- 有「可能是」「大概」→ 要求用證據支撐，不接受猜測

**禁止**：直接採用 agent 輸出而不驗證；以「agent 說了」取代自己的判斷。

## AO-RESUME 判讀規則

`ao-resume.ps1` 同時自動執行 `scripts/check-smoke-tests.ps1`（application-layer smoke：n8n MCP + Repair Center health + 客戶網站健康 + n8n workflow 失敗 + **客戶站外寄信失敗**）→ 寫 `reports/status/smoke-LATEST.json` → Claude 在 §1 系統快照回報。使用者不需要記得跑 `/smoke-test`。  
`client_mail` 檢查的存在理由：soulful 的 FluentSMTP 曾指向不接受連線的 `pop.hostinger.com:587`，`wp_mail()` 從 2026-08-03 到 2026-08-16 全部靜默失敗無人察覺。**外掛自帶的失敗通知本身也走 `wp_mail`，警報與被監控的通道一起死**，故監控必須來自站外。  
**判讀 smoke 結果（2026-08-17 起）**：`smoke-LATEST.json` 自帶 `overall` 與 `blind_spots` 兩個欄位，**直接讀，不要自己心算**。`blind_spots` 非空 = 某個關鍵偵測器這輪「什麼都沒量到」（SSH 掛了 / 金鑰不見 / 解析失敗），此時 `overall` 一律 WARN —— 因為「偵測器啞了」不可以長得像「一切正常」，那正是 2026-08-03 事故的形狀。`client_mail` 除了近 7 天失敗數，另查**距上次成功寄信天數**（門檻 `-MailQuietDayLimit`，預設 10）：只數失敗無法分辨「健康」與「已壞但還沒人用到」。門檻**必須低於 14** —— FluentSMTP 的 `log_saved_interval_days=14` 每日清舊日誌，設 14 以上該分支永遠觸發不到。  
每 30 天自動執行月度五項檢查（warn-only，2026-08-24 訂正：原文寫「三項」但 `ao-resume.ps1` 早就是四項，今天再加第五項）：`monthly-system-review.ps1` / `check-supabase-memory-monthly.ps1` / `check-governance-docs-drift.ps1`（4 份核心治理文件一致性）/ `refresh-cf-origin-ips.ps1` / `check-change-impact-matrix-drift.ps1`（`docs/CHANGE_IMPACT_MATRIX.md` 全部 ~85 條關係的 mtime 漂移，不只 4 份核心文件）。結果寫 `reports/`，Claude 在 §1 回報。

**2026-09-23 addendum — `blockers[]`：十個 sibling 偵測器統一入口**。稽核發現 `check-ci-health.ps1`（GitHub Actions 連續失敗 workflow）與夜間 `AgencyOS-SystemGuard-Daily`（`reports/health/health-*.json` 的 `critical_gate`／`score`）**完全沒有進 AO-RESUME**——前者只靠 `TOOL_TRIGGER_MAP.md` 一條散文觸發列（使用者要問「CI 過了嗎」才會被查到），後者連散文觸發列都沒有；當時 `LAST_SYSTEM_STATUS.md` 已連續兩週顯示「Doc integrity failed」FAIL，`ci-LATEST.md` 有 3 個 workflow 連紅 8–16 天，都沒有任何一個 agent 看到。另外 8 份既有 sibling 報告（backup／auto-reboot／clickhouse／capacity／site-watch／staging-orphans／routine-freshness／cf-security）雖然各自寫了 `*-LATEST.{json,md}`，但只有 backup／auto-reboot／cf-security 在 §1「系統快照」的涵蓋清單裡被點名，其餘完全沒有機制讀取——staging-orphans 當時已 WARN 兩天（`sg_parse_empty`／`eu_parse_empty` 盲點）、routine-freshness 已 WARN（月報 41 天未更新），同樣沒人看到。

修法：`scripts/lib/smoke-status-digest.ps1` 讀完全部十份報告，攤平成 `smoke-LATEST.json` 的 `blockers[]` 陣列（每行已含來源標籤與原文，例：`CI: 'HCI-30 — Wave 1...' has been failing for 8 consecutive run(s) over 15 day(s)...`）；`ci_health`／`nightly_health` 併入 smoke 既有的 `criticalChecks`（缺報告視同 blind spot，`overall` 強制 WARN，語意與既有 `client_mail`／`docker_watchdog`／`codex_parity` 一致）。`blockers[]` 非空同樣把 `overall` 推成 WARN，讓 §0 燈號與 §6 逐行輸出永遠一致。`ao-resume.md` §1／§6 讀法見該檔本節對應規則；§6 source rules 新增 (d)。順手修：`ao-resume.ps1` 的 staging-orphans 12 小時節流原本讀檔案 mtime，但該檔是 git-tracked，git-align 的 stash/restore 每次 AO-RESUME 都會重寫 mtime 卻不改內容——改讀 JSON 自帶的 `generated_utc` 欄位。

## 新部署路徑強制清單

每次新增可部署服務時，必須同時完成以下 6 項：

| # | 項目 | 說明 |
|---|------|------|
| 1 | **Unit test gate** | 在 `sg-deploy.sh` 加入 `npm test`；失敗 → abort |
| 2 | **Docker healthcheck** | `docker-compose.yml` 必須有 `healthcheck:`；sg-deploy Step 6 等待 healthy |
| 3 | **HTTP smoke check** | sg-deploy Step 7 `_smoke_check` 加入新端點 curl 驗證 |
| 4 | **Rollback 指令** | `DEPLOY_ROLLBACK_RUNBOOK.md` 補充對應回滾步驟 |
| 5 | **Notification** | Slack/Telegram 通知涵蓋 SUCCESS/FAIL/SMOKE_WARN |
| 6 | **Typecheck gate** | `package.json` 加 `"typecheck": "tsc --noEmit"` + sg-deploy 加 `npm run typecheck` + `.github/workflows/<service>-typecheck.yml` |

## 共享檔 commit 機制

**共享檔 commit（2026-09-23 機械化）**：`git-commit-scope-guard.js`（2026-08-30）只擋「裸 commit 掃走別人 **staged** 的檔」；2026-09-23 三次掃走 WORKLOG／TASKS hunk 走的是 pathspec commit（git 語義：取 worktree 版本）與整檔 `git add`，六份 memory recipe 都是手工繞法。現在：`scripts/git-partial-worktree-commit.py stage <共享檔> (--worklog-entry N | --range | --keep-re) [-- 自己的檔]` 建**私有 index**（`GIT_INDEX_FILE`）= HEAD + 明確選取的 hunk，寫 marker `<index>.json`；`GIT_INDEX_FILE=<path> git commit -F msg` 時 scope guard 以 marker 驗證 index（blob 不符／own 檔在 stage 後又改／多出路徑 → BLOCK），commit 成功後 PostToolUse `git reset -q -- <paths>` 同步共享 index 並刪 index+marker；`git-shared-file-guard.js` 擋其餘所有路徑（pathspec 含共享檔且 worktree ≠ HEAD、裸 commit 共享 index 含整檔 add、私有 index 無 marker），首行 `# CONFIRMED-SHARED-FILE-COMMIT:` 解鎖。續號：`worklog-entry-number-guard.js` 擋 Edit/Write 新增已存在的 `（續N）`，配號一律 `scripts/worklog-insert-entry.py`。測試 `tests/hooks/shared-file-guard.test.mjs`、`tests/scripts/git_partial_worktree_commit_test.py`。

## 跨機 .md 編碼

走 Google Drive 同步的 `.md`（`memory/*.md`、`CREDENTIALS.md`）必須是 UTF-8 + BOM；否則 Big5 系統 CJK 亂碼。  
Repo 內 .md（WORKLOG / TASKS / runbooks）走 git，免 BOM。  
機械保障：export/import scripts 自動加 BOM；Claude 本機 Write 時不需手動加（例外：直接寫 Google Drive 路徑才需手動加）。

## 規則事故依據

為什麼有這幾條（規則本體在 AGENTS.md 對應段）：

- §4 critic 用量與深度依風險分級：2026-09-06 稽核，非金流的設定分類邏輯（System Foundry 付款閘門／mutation-coverage 分類器）兩輪各派 2 個平行 critic 並要求全面重新獨立推導，成本加倍卻未提升發現率，且違反既有「每 commit 最多 1 個 critic」。
- §5 Workflow tool 全關：2026-09-03 一次 Workflow 派 99 個 agent 燒光額度（見 §Agent 扇出治理 的「真實案例」）。
- §5 本機服務／Docker 探索：2026-09-06 案例一次調查連開 3 個 compose project，每次起停 10-20 秒。
- §8 細節只留一處：2026-09-06 稽核，單一 TASKS.md 條目膨脹到 2000+ 字且與 WORKLOG 重複。
- §9 書面產出壓縮：2026-09-06 實測，同一改動散文佔新增行數 62-65%，改一次要同步 4-5 個檔案是重工主因。
- §9 `file:line` 查證不可砍：2026-09-07 session 實例，差點引用不存在的檔案、critic 抓到「宣稱超出證據」，皆靠查證擋下。

## 已退場機制（勿重建）

> **Cursor 於 2026-08-26 退場**（操作者決定，單機單 IDE）。`.cursor/`、`agency-os/.cursor/`
> 及三支 cursor 專用腳本已刪除；`ao-resume.ps1` 的 rules 鏡像一致性檢查與
> Cursor 已退場；`machine-environment-audit.ps1` 的 `.cursor/mcp.json` 檢查一併移除（否則會變成永久
> 警告——永久警告等於被忽略的偵測器）。歷史 WORKLOG 與 report 中的 Cursor 敘述保留，
> 它們描述的是當時為真的事。

- Workflow tool：見 §Agent 扇出治理 路徑 B。
- 多機同步：單機運作中，機制休眠保留（`CLAUDE.md` R1）。

## 歷史版本

舊版全文不存本檔。取回方式：`git show <commit>^:<path>`（該次改動前的版本）。

| 日期 | commit | 改動 | 取回改動前全文 |
|---|---|---|---|
| 2026-09-04 | `bfa017bcc` | 第一次瘦身：表格 → `TOOL_TRIGGER_MAP.md`，機制 → 本檔 | `git show bfa017bcc^:agency-os/AGENTS.md` |
| 2026-09-04 | `66b763f98` | 第二次瘦身：48.7 KB → 20.5 KB（含 `CLAUDE.md`） | `git show 66b763f98^:agency-os/AGENTS.md`、`git show 66b763f98^:CLAUDE.md` |
| 2026-09-07 | `2ef05af22` | 第三次瘦身：事故敘事移出 | `git show 2ef05af22^:agency-os/AGENTS.md` |
| 2026-10-01 | `e026d09d4` | 第四次瘦身＋模型路由表 | `git show e026d09d4^:agency-os/AGENTS.md`、`git show e026d09d4^:CLAUDE.md` |
| 2026-10-01 | 本次 | 本檔重建為「只留現行細節」；四份全文存檔移除（87% 篇幅、18 個重複標題） | `git show cac6d8a0d:agency-os/docs/operations/AGENTS_APPENDIX.md`（重建前、含四份存檔的版本） |

第二次瘦身弄丟過一條規則本體（「思維準則」五項，2026-10-01 操作者發現後補回 AGENTS.md §1）。之後瘦身：逐句比對舊版，每一句被移除的規則在 commit message 寫明去向（併入哪一條／移到哪一節／刪除理由）。

## Related Documents (Auto-Synced)
- `AGENTS.md`
- `docs/operations/TOOL_TRIGGER_MAP.md`

_Last synced: 2026-10-01 08:17:19 UTC_

