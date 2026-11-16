ED.13 階段 1＋2 已提交：後端 POST /editor/agent（走 text()）、白名單驗證、浮動視窗、頂列 ✦ 剪輯 Agent；剪輯動作改成吃參數的函式，按鈕與 Agent 共用。
驗收：tests/ed13-agent-ui.cjs（真 Edge、假模型）9/9＋ tests/ed13-agent.cjs（進 gate）；回歸 ed1/ed2/ed3/tools-editor/ed6/ed7/ed12 綠。
R4（2026-11-16）：付費卡片「前往確認」開分頁並等待；分頁送出付費請求前發 ed:paid started，結束時發一次 succeeded／failed，結果用分頁自己的套用放回（一個復原點），並在 Agent 對話回報；送出前可取消（對話說明、沒有扣點）。
