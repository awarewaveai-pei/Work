ED.13 階段 1 已提交：POST /editor/agent（走 text()、PAID_ROUTES video.script）、shared/editor-agent-plan.js 白名單驗證、scripts/editor-agent.js 浮動視窗（先在副本試跑、門檻確認、一次 checkpoint）；tests/ed13-agent.cjs 進 gate。
階段 2 待做：tools-editor.js 的 edAgentTools（把 edAction 分支改成吃參數的函式）＋頂列 Agent 按鈕；要等預覽補齊卡提交 tools-editor.js 後才開始。
驗收閘（五個快捷實跑、Ctrl+Z 一次、不合法整輪不套用、注入擋確認框）在階段 2 用真 Edge＋假模型補。
