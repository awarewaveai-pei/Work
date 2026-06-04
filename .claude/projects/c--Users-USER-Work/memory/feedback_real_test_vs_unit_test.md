---
name: real-test-vs-unit-test
description: "R0 [驗證計畫] real exec test 是「真實 invoke + 觀察 production behavior」，不是「拿既有資料餵 algorithm」；test artifact 必須寫 $env:TEMP"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: d05f5f68-b9c1-4a20-adea-ef210de2254d
---

R0 [驗證計畫] 第 1 動作「實測（end-to-end real test）」**不**接受 algorithmic unit test 充數。

**Why**：2026-05-23 ao-resume hook fix，Round 1+2 我宣稱有「實測」實際是拿既有 354 行 log 餵新 regex parsing logic 驗 37 step parsed — 那是 unit test 不是 real exec test。使用者 push back「有實測嗎？鐵律理不是有說嗎？」我承認跳過 → 補做 real exec test → 立即暴露 2 個 bug：(a) `ao-resume.ps1` `git push 2>&1` stderr 觸發 NativeCommandError throw 害 hook 5.6s 早 exit；(b) test backup file 被 auto-checkpoint hook 順手 commit 進 git。**Unit test 抓不到這兩個** — 因為 git push 行為只在真 invoke 時暴露、auto-checkpoint 只在真寫 repo 時觸發。

**How to apply**（任何 hook / wrapper / sub-script 改動）：

1. **Real exec test 定義**：模擬該機制的「真實 invoke 路徑」端到端跑一次：
   - hook → echo JSON stdin to deployed hook script，觀察 state file 產出
   - 子 script → 給真實參數跑、觀察 stdout/stderr/exit code/副作用
   - service → curl 真端點、觀察 HTTP status/payload
   - DB migration → 跑 up + down + 重 up 在真 DB（或 staging）

2. **Unit test ≠ Real test**：餵既有資料給隔離邏輯**算 unit test**，是 round 1 的事；real test 是 round 2-之後的事。**鐵律的「實測」永遠指 real exec**。

3. **Test artifact 一律寫 `$env:TEMP\<ProjectTag>-<ts>\`**：
   - **Why**：repo 內的 auto-checkpoint hook 會偵測 dirty tree 並順手 commit 進 git，連 `.gitignore` 外的 artifact 都會中招（artifact 名字不在 ignore list → git add → commit）
   - **How**：`$artifactRoot = Join-Path $env:TEMP ("AgencyOS-realtest-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))` → 全部 artifact 寫進去
   - **Why not workspace `.gitignore`**：要記得加 ignore pattern + 維護成本高 + 容易漏

4. **驗證 real test 真的觸發了**：對照「期望副作用」應該發生（state file mtime 推進、log 行數增加、HTTP response 收到、container restart）；如果 5.6 秒就跑完原本應該 30+秒的流程，那是 early exit 不是成功

**反例**：用「跑過 syntax check」+「跑過 critic」+「regex 餵舊 log 驗 37 step」充當 real test → 鐵律違反，且必踩坑後才會被使用者抓出來

**機械閘（2026-05-25 部署）**：`verify-closeout-completeness.ps1` REALTEST gate — AO-CLOSE 自動擋沒有 REALTEST_EVIDENCE: 或 REALTEST_WAIVED: 的 code session。不再只靠 LLM 自律。

關聯：[[verify-four-actions]] / [[test-artifact-isolation]]（既有 memory 已說 bash heredoc 吃 PS 變數；本條補的是 artifact 路徑與 git auto-checkpoint 互動）
