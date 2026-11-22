# AI 訂閱通道（API／訂閱並存）— 定案方案 2026-11-22

操作者定案（2026-11-22 對話）：文字與圖都要能選 API 或訂閱；兩條都做：①本人按、筆電跑 ②主機排程。寫字偏好 GPT。開發期 Claude US$100＋ChatGPT US$20；完工後 ChatGPT 升 US$100，屆時文字與圖以 Codex 訂閱為主。5–10 個自有網站同一主機，每站各自選通道。

App root = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`（下列相對路徑以此為根，`scripts/` 為 repo 根）。

## 1. 現況（已驗證）

| 事實 | 證據 |
|---|---|
| 付費 AI 只經三個 seam，皆收 Grant | `lib/ai/gateway.ts:17,23,39` |
| 圖已有訂閱路：筆電 worker 長輪詢，in-memory 佇列，僅擁有者 | `lib/tarot/codex-bridge.ts:72,90,121,187`；`scripts/codex-image-worker.mjs:92,196` |
| worker 驗證＝單一 secret | `app/api/internal/codex-images/worker-auth.ts`；`claim/route.ts:16`、`complete/route.ts:29` |
| 瀏覽器不等 worker：202＋輪詢 | `codex-bridge.ts:187 deferCodexWork`、`:199 deferIfCodex`；前端 `lib/studio/codex-wait.ts`、`public/editor-shared/codex-wait.js` |
| 文字模型目錄單一來源 | `lib/ai/text-model-options.ts:7 AI_TEXT_MODELS`；價目 `lib/ai/cost-model.ts:54 TEXT_RATES`（已有 `fallback` 欄 `:47`） |
| 文字三個主要呼叫點皆「system＋prompt → 純文字」，無 tool、無 schema | 文章 `lib/content/article/generate-core.ts:694-708`；劇本工坊 `app/api/tools/script-forge/route.ts:196-204`；影片腳本 `lib/content/video/video-script-core.ts:208-219` |
| 排程文章不帶 model → 預設 Opus | `lib/content/topics/make.ts:106 articleInput`、`:130 runContentPipeline` |
| 每站設定是 JSON 欄（加欄位免 migration） | `lib/content/brand-voice.ts:43 SiteContentDefaults`；`app/api/content/sites/route.ts:64` |
| 排程一輪預算 200 s，route 上限 300 s | `lib/content/topics/tick.ts:26`；`app/api/internal/schedules/run-due/route.ts:34` |
| 帳本已記 Codex 圖（usd 0＋額度 %） | `lib/ai/codex-usage.ts:8`；`public/editor-shared/image-models.js:61` |

實測 2026-11-22（筆電）：`claude -p --model haiku --system-prompt … --tools "" --setting-sources "" --strict-mcp-config --disable-slash-commands --no-session-persistence --output-format json` → success，wall 11.9 s（api 0.84 s），系統提示開銷 1,068 tokens。`codex exec` 文字 → `usage limit … try again at Nov 24th, 2026 11:02 AM`（ChatGPT Plus 週額度用完）。Codex 0.165 `codex features list` 有 `shell_tool`、`unified_exec`、`browser_use`、`computer_use`、`apps`、`plugins`、`image_generation`、`view_image` 可關。

近 30 天實付（`ai_call_logs`）：合計約 NT$508；圖 NT$180（可換約 132）、三個文字功能 NT$93.5、開發信 NT$210（測試，11-12 起 0）。

## 2. 條款邊界（2026-11-22 查證，設計的硬限制）

| 用法 | 結論 | 來源 |
|---|---|---|
| 本人用未修改的 Claude Code＋自己的訂閱 | 可 | code.claude.com/docs/en/legal-and-compliance |
| 產品代他人走 Claude 訂閱憑證、存其憑證 | 禁 | 同上 |
| Claude 訂閱無人排程 | 消費者條款 3(7) 未明許 → **不做** | anthropic.com/legal/consumer-terms |
| Codex `codex exec` 用 ChatGPT 登入跑排程／CI（受信任 runner） | 官方文件有專節 | learn.chatgpt.com/docs/non-interactive-mode「Use ChatGPT-managed auth in CI/CD (advanced)」 |
| 帳號給他人用 | 禁（兩家） | openai.com/policies/terms-of-use |

不變量（程式強制，非慣例）：
- I1 `owner` lane 只服務擁有者本人（`codexAllowed`）；`schedule` lane 只接 `tool=codex`。Claude 訂閱永不進 schedule lane。
- I2 lane 由「驗證通過的是哪一把 secret」決定，不由 worker 自報。
- I3 文字 job 的 CLI 一律無工具（Claude `--tools ""`；Codex 關 shell/exec/browser/computer/apps/plugins/image/view_image＋`mcp_servers={}`＋空白暫存 cwd）。提示詞含外部抓來的內容＝不可信。
- I4 worker 交回前掃描輸出：含本機任何憑證字串（`~/.codex/auth.json` 的 token、worker secret、Claude OAuth token）→ 丟棄並回 `sub_output_blocked`。
- I5 瀏覽器請求永不等 worker（沿用 202＋輪詢）；排程在 tick 預算內等，逾時視同失敗。
- I6 訂閱 job 不扣點、帳本記 usd 0＋實際 tokens／額度 %；失敗不記帳。
- I7 額度用完＝狀態（到 `resetsAt` 前該 tool 直接回 `sub_quota_exhausted`），不是 worker 結束；通知一次。

## 3. 設計

**模型目錄即通道。** `AI_TEXT_MODELS` 加一組「訂閱」：`sub-codex`（Codex 預設模型）、`sub-claude-opus`、`sub-claude-sonnet`、`sub-claude-haiku`。每列帶 `sub: { tool, cliModel }` 與 `apiFallback`（訂閱失敗時改走的 API 模型：codex→`gpt-5.4`，claude→同級 Claude）。`TEXT_RATES` 加同名列：價 0、vendor `訂閱`。Codex 可選模型清單待 11-24 額度恢復後由 M1 實查再加列，不先猜。

**「API／訂閱／訂閱優先」＝兩個值**：`model`（目錄任一列）＋`subFallback: boolean`（訂閱失敗時是否改走 `apiFallback`）。API＝選 API 模型；訂閱＝sub 模型＋false；訂閱優先＝sub 模型＋true。

**一個入口** `lib/ai/sub-text.ts`：`runSubText({ grant, model, system, prompt, lane, signal, route, jobId, tool })` → `{ ok:true, text, answeredModel, usage } | { ok:false, error }`；內部排入 bridge、等結果、`logAiCall`（usd 0）。`withSubFallback(model, allow, runSub, runApi)`：sub 失敗且 allow → 以 `apiFallback` 跑 runApi，並在結果標 `fellBack: <error>`。呼叫點各加一個分支（它們本來就分 Claude／OpenAI）。

**bridge 就地擴充（不改檔名、不改 URL）。** job 加 `kind: "image"|"text"`、`tool`、`lane`；worker 註冊表以 lane 為鍵（各自 `lastPollAt`、`tools`、`quotaBlockedUntil[tool]`）；claim 只發給「lane 相符且 worker 有該 tool 且未被額度擋」的 job。圖 job 的對外形狀與行為不變。
- 改名債（明記不做）：`codex-bridge`／`codex-images`／`codex-image-worker`／`codex-wait`／`codex-laptop` 約 30 檔引用，改名零行為收益且製造部署空窗 → 僅在檔頭註解更正職責。

**wire contract（K1、K2 共同依據）**
- `POST /api/internal/codex-images/claim` body `{ waitMs?, leaving?, tools: ("codex"|"claude")[] }`（缺 `tools` ＝ `["codex"]`，相容舊 worker）。Bearer：`CODEX_WORKER_SECRET` → lane `owner`；`SUB_WORKER_HOST_SECRET` → lane `schedule`。
- 回 `{ ok, job }`；job＝`{ id, kind:"image", prompt, aspectRatio, refs, timeLeftMs }`（原樣）或 `{ id, kind:"text", tool, cliModel|null, system, prompt, timeLeftMs }`。舊 worker 收到沒有 `kind` 的 job＝image。
- `POST …/complete` body：image 原樣；text `{ id, text, usage?, answeredModel? }`；失敗 `{ id, error, quotaResetsAt? }`（`error` 規則同現行 `^[a-z0-9_]{1,60}$`）。text 上限 400,000 字元。
- 錯誤碼新增：`sub_worker_offline`、`sub_worker_busy`、`sub_worker_timeout`、`sub_quota_exhausted`、`sub_not_logged_in`、`sub_exec_failed`、`sub_empty_output`、`sub_output_blocked`、`sub_lane_refused`。圖沿用 `codex_*`。

**每站設定**：`SiteContentDefaults` 加 `textModel?: string`、`subFallback?: boolean`（缺＝現行為：Opus API）。`articleInput` 帶入 `model`；排程走 lane `schedule`，本人按鈕走 lane `owner`。社群改寫／每月選題／每日打分（Haiku，單次 < NT$0.3）不搬。

**主機 worker**：ks-aw-01 專用低權限使用者＋systemd 服務跑同一支 `scripts/codex-image-worker.mjs --lane schedule --idle-min 0`；只裝 Codex。`SUB_WORKER_HOST_SECRET` 進 next-admin 容器走 `safe-infra-patch.sh compose`。登入由操作者本人在主機執行 `codex login`（不複製筆電的 `auth.json`：兩機共用同一份 refresh token 會互相作廢）。

## 4. 卡與批次

| 批 | 卡 | 內容 | 模型 | 依賴 |
|---|---|---|---|---|
| 1 | K1 | bridge：kind／tool／lane／額度狀態；claim／complete／worker-auth | Opus 5.5 | — |
| 1 | K2 | worker：文字 job（codex、claude）、無工具、憑證掃描、`--lane`、額度不退出 | Opus 5.5 | wire contract |
| 1 | K3 | 目錄＋價目＋帳本：sub 模型列、`isSubTextModel`、`apiFallback`、usd 0 記帳 | Sonnet 5.5 | — |
| 2 | K4 | `lib/ai/sub-text.ts`＋文章（route＋ContentStudio 202 輪詢）＋劇本工坊（route＋ScriptForge） | Opus 5.5 | K1 K3 |
| 2 | K6 | 選模型按鈕：「訂閱」組、NT$0、離線／額度用完狀態、僅擁有者可見 | Sonnet 5.5 | K3 |
| 3 | K5 | 影片腳本接 sub-text | Sonnet 5.5 | K4 |
| 3 | K7 | 每站 `textModel`＋`subFallback`（設定頁按鈕＋PATCH）＋排程帶入＋lane schedule | Opus 5.5 | K4 |
| 3 | K8 | 成本頁：訂閱用量卡（圖＋文字、各 tool 額度 %）＋每站本月 訂閱／API 篇數與金額 | Sonnet 5.5 | K3 |
| — | 部署 A | 批 1–3 併入後一次 `sg-deploy.sh next-admin`＋smoke；筆電實跑 Claude 訂閱文章一篇 | 監工 | 批 3 |
| 4 | K9 | 主機 worker：使用者、Codex、systemd、secret 進 compose、過期／額度 Telegram | Opus 5.5（devops） | 部署 A；待決 1、2 |
| 4 | M1 | 11-24 後實測：Codex 關工具實跑、圖回歸一張、文章一篇耗時與額度 %、可選模型清單 | 監工 | K9 |

M1 的判定：Codex 文章 p90 > 150 s → 另開卡把排程文章步驟改兩段式（本輪送出、下輪收件）；否則不做。量到每篇額度 % 後才回答「方案一天幾篇」。

## 5. 風險與 rollback

| 風險 | 處置 |
|---|---|
| 提示詞注入讓 CLI 讀檔外洩到文章 | I3＋I4；主機另有 OS 使用者隔離；K2 突變測試拔掉掃描必紅 |
| 兩把 secret 混用使 Claude 進排程 | I1＋I2；K1 測試：host secret 的 claim 永遠拿不到 claude job |
| 既有 Codex 生圖壞掉 | 圖 job 形狀與 URL 不變；K1 既有測試不改斷言全綠；M1 實畫一張 |
| Codex 額度用完（現況到 11-24） | I7＋`subFallback`；Claude lane 現在即可實測 |
| app 重啟丟 in-memory job | 現行為沿用：無扣款；排程下一輪重做（`tick.ts:24` 30 分鐘視為 stale） |
| 條款變動 | I1 集中在一處；關閉＝目錄拿掉 sub 列或 worker 停掉，全部回 API |

rollback：每卡獨立 commit；批 1–3 無 migration、無主機改動 → `git revert`＋部署。K9：`systemctl disable --now`＋`safe-infra-patch.sh` 自動備份還原。

## 6. 驗證

每卡：`npx tsc --noEmit`、`npx vitest run <受影響路徑>`；批末 main 上全套 `npm test` 一次。實測：部署 A 後筆電 worker 用 Claude 訂閱產一篇真文章（看內容，不是看 log）；M1 列於上表。Codex 到 11-24 無額度 → 每批 `critic` 一次審整批 diff，WORKLOG 記 `ORACLE_WAIVED`。
