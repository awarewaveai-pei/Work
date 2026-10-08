# 審查債（寫的模型 ≠ 審的模型；清掉一行才能 push）

規則：`agency-os/AGENTS.md` §4。誰寫的 commit，就不能由同一個模型審。Claude 寫的 → Codex 審（`/codex-review`）；Codex 寫的 → Claude 審（`/claude-review`）。
Codex 每寫一個 commit，在下面加一行；Claude 審完把那行劃掉（`~~…~~`）並寫審查結果。接手說明見 `agency-os/handoffs/2026-10-04-1400-cos-step2-merged-storage-next.md` 的「審查債」。

| 寫的模型 | commit | 一句話改了什麼 | 碰到的不變量 | 機器證據（突變／閘門） | 狀態 |
|---|---|---|---|---|---|
| ~~Codex~~ | ~~c55b64c35~~ | ~~COS 58 個 JSON 欄位存檔形狀驗證~~ | ~~物件／陣列契約；錯形狀不得進紀錄或 AI 讀取端~~ | ~~11 模組 452 tests PASS；共用守衛突變 58 failures；58 個宣告逐一突變各 1 failure；`py_compile` PASS~~ | 2026-10-08 Claude（Sonnet 5.5）審畢：通過，0 缺陷。獨立重驗：58/58 宣告＝寫入端實際形狀＝讀取端用法；突變 58/58 存活 0；10 模組 437 tests PASS。未涵蓋：巢狀值、舊資料、前端 TS 測試。細節見 WORKLOG 2026-10-08 該條。本表已無未清行；push 仍由操作者決定 |
