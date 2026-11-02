# 影音工作台：交接（給另一個 Claude 帳號）

寫於 2026-11-02，交接時 HEAD 為 `8c0020691`（影音工作台最後一個 commit）。讀者是接手的 AI。這份檔只是索引，事實的正本在下表各檔；細節不在這裡重述。

**開場句**（貼進新 session 第一句）：
> 續做 影音工作台：先讀 `agency-os/handoffs/2026-11-02-video-workbench-supervisor/HANDOFF.md` 全文。第一步照其 §5 重新產生並發布監工台，把新網址給我；第二步問我 P1 要不要開工，同意後照 §3 用 cc.py SDK 派工。P1 完成＝建專案→編輯→保存→重開→輸出→成品成素材並帶來源。建議模型：Opus 5.5

## 1. 正本（全部在 repo，`VW` = `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`）

| 要知道什麼 | 讀哪裡 |
|---|---|
| 卡片順序、做法、驗收、架構不變量、已定案（含路線 C） | `VW/docs/creative-suite-plan-20261102.md`（§0 定案、§3 不變量、§4 卡片表） |
| 操作者需求逐項與最低驗收 | `VW/handoff/Claude_Code_handoff_20261102.md`（頂部告示：舊 `D:\Video` 路徑 = VW；3D 要做） |
| **每張卡的狀態、完成 commit、白話說明、待決事項** | `agency-os/handoffs/2026-11-02-video-workbench-supervisor/data.mjs`（狀態唯一來源） |
| 監工台畫面 | 同資料夾 `supervisor.html`（`node build.mjs` 產生；本機瀏覽器直接開即可看） |
| P0 試驗證據與路線判定 | `VW/docs/p0-effectcraft-gate-20261102.md`＋`VW/docs/p0-evidence/` |
| 每張卡的根因、Codex 發現、驗證證據 | `agency-os/WORKLOG.md` 2026-11-02 續19、20、22、24、25、26、27、30、37、43、45 |
| 工作台啟動、哪些檔不在 git | `VW/README.md` 頂段 |

舊監工台網址（`data.mjs` 的 `META.url`）是前一個帳號的私人 artifact，**新帳號打不開**。要給操作者看時，見 §5。

## 2. 現況

- 已完成：0 → M1 → M2 → M3 → S3a＋S2 → P0（commit 見 `data.mjs` 頂部常數 C0、M1、M2、M3、S3、P0）。共 41 項工作，完成 23 項。
- **路線 = C**（P0 判定）：EffectCraft 不採用。原因與重評條件見計畫 §0 那一列。
- **下一張 = P1**：延伸現有五軌編輯器，補 Remotion 片頭與動態字幕模板（經 `next-admin/lib/content/video/remotion-client.ts:7`），做存檔閉環。之後依序 P2 → P3 → P4 → P5 → P6。
- 待決：只剩 P6 上線（High，要操作者明確同意）。
- 操作者 2026-11-02 說「先不要」P1：**開工前先問一次**。
- 本機實機：`127.0.0.1:4178`，從 VW 用 `node scripts\launch.cjs` 啟動（交接時 PID 70660），跑的是 S3a＋S2 那版。
  - 資料只有 `VW/.data/`（約 152 MB，不在 git，是唯一一份）。Downloads 與 `D:\Video` 副本已刪。
  - 還剩一份 `C:\Users\user1115\Downloads\SeedStar_AwareWave_20261030_修正版`（`.data` 是空的，操作者尚未決定是否刪）。

## 3. 每張卡的流程（操作者同意過的精簡版）

1. **寫 brief**：先讀要改的檔，把 file:line 事實寫死。結構固定為 FACTS／DESIGN（已定，照做）／TESTS（只寫卡片點名的）／BOUNDARIES／OUTPUT。
   - OUTPUT 只要極簡區塊：`FILES:`／`TESTS: <file> <exit>`／`CHANGED_ASSERTS:`／`RISKS:`。操作者不要散文報告。
   - 範例：前幾張卡的 brief 不在 repo，照 WORKLOG 續37、43 的寫法即可。
2. **派工**（背景）：
   ```
   C:/Users/user1115/ClaudeAgent/.venv/Scripts/python.exe C:/Users/user1115/ClaudeAgent/cc.py --quiet --project "D:\\Work" --model claude-opus-5-5 --budget 10 --turns 160 < brief.txt > result.txt
   ```
   - 預設 `--turns` 只有 61，一定要加大。
   - 工人只改 VW、不 commit。
3. **驗收**：
   - 自己讀 diff。
   - Codex 審查：先跑 `powershell -File scripts/oracle-quota.ps1 -Action check -Tool codex`，再跑 `powershell -File scripts/codex-oracle.ps1 -Mode review -Path <VW> -Context "<一句目的＋最怕的失敗>"`。
   - 逐項查證 Codex 的發現，修屬實的，每項補測試。
   - **只重跑**新測試和你修過的檔相關的測試。全套測試由工人跑，不重複。
4. **提交**：
   - `git commit -F <msg> -- <pathspec>`，commit 訊息檔放 scratchpad，不要放 `$TEMP`。
   - WORKLOG：`python scripts/worklog-insert-entry.py <entry.md> --date <日>` → `python scripts/git-partial-worktree-commit.py stage agency-os/WORKLOG.md --worklog-entry <N> --date <日>` → `GIT_INDEX_FILE=<idx> git commit -F <msg>`。entry 內要有四行證據。
5. **監工台**：
   - 在 `data.mjs` 加 commit 常數，把該卡 items 改成 `done(...)`，step 改 `status:'done', commit, result`，NOW 列也一併更新。
   - 跑 `node build.mjs && node check.mjs`（check 會比對計畫 §4 的卡號順序），再 commit。
6. **重啟 4178**（不必問）：
   - `.data/jobs.json` 沒有 queued／running 任務才重啟。
   - 只停 4178 那一個 PID，用 `Start-Process node scripts\launch.cjs` 從 VW 起，再驗新路由。
7. `git push origin main`，push 與 commit 要分兩個指令。

## 4. 陷阱（都踩過）

- `job.providerId` 在 `VW/backend/api.cjs` 代表「OpenAI 影片」，refresh 與重啟恢復都靠它。其他供應商的 id 另用欄位，例如去背用 `replicateId`。
- 工人結束或被停後，它的 file-claim 還在。Edit 會被 hook 擋。**要操作者一句話**才能 `node C:\Users\user1115\.claude\hooks\lib\file-claims.js release <檔>`，不可繞過。另一個做法是把新測試放進新檔。
- **不要在這台筆電跑 EffectCraft 的 WebGPU**：約 54 秒後顯示卡裝置斷線，GPU 重設會讓操作者的 Edge 當掉。任何試驗一律 Playwright headless，加 `--disable-features=WebGPU`。
- cc.py 工人被 kill 後 `--resume` 不會續跑（花費 0、輪數 0）。要改開新工人，在 brief 寫明「已完成、別重做」的檔。
- 負載高時會不穩的測試（不是 bug）：
  - `VW/tests/generation-flows.cjs:155` 拖曳位置：HEAD 上也失敗。
  - `VW/tests/media-store.cjs:89` Edge 播放 0.7 秒的時間窗：單獨跑會過。
- hook 的「另一個 session 正在改」警告常是誤認：同時間有外聯、mockup 等 session 在跑。先 `git diff -- <檔>` 看 hunk 再判斷。
- 分鏡六檔不准動，`VW/tests/storyboards-design-baseline.json` 列出它們，`generator-deep-actions.cjs` 會驗雜湊。
- 不用中國 AI 模型；介面不用下拉選單；付費 AI 只能放在按鈕上，按之前先顯示成本。
- 主系統契約檔（`next-admin/lib/content/video/{asset-origin,platform-ratio,delivery-contract,caption-formats,timeline-v1}.ts`）一律直接 `import()`，禁止複製。`bg-remover.ts` 例外（它依賴 gateway），工作台自己呼叫 Replicate，版本由測試核對。
- 回報操作者一律繁中、短句；給 AI 的檔一律事實密集。

## 5. 讓操作者看到監工台（新帳號的第一步，做完才做別的）

0. `cd agency-os/handoffs/2026-11-02-video-workbench-supervisor && node build.mjs && node check.mjs`（check 必須 ok）。
1. 用 Artifact 工具發布 `agency-os/handoffs/2026-11-02-video-workbench-supervisor/supervisor.html`，會得到新帳號自己的網址。
2. 把新網址寫進 `data.mjs` 的 `META.url`，跑 `node build.mjs && node check.mjs`，再用同一路徑重發一次，然後 commit。
3. 之後每次改 `data.mjs` 都重建、重發同一路徑，網址不變。

## 6. 花費（SDK API，2026-11-02）

| 卡 | 花費 |
|---|---|
| 0 | US$1.10 |
| M1 | US$2.66 |
| M2 | US$10.09（兩輪） |
| M3 | US$4.10 |
| S3a＋S2 | US$3.04 |
| P0 | 約 US$4.5 |
| 合計 | 約 US$25.5 |

月預算約 US$100（AGENTS §5）。
