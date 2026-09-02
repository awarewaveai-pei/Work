# 需要你說的 23 個工具

> 其他所有工具都自動跑。這裡只列**你開口才會動**的。
> 不需要全部記。需要時翻這頁。

---

## 第一類：你說「可以」之後我才動

我會自己準備好，然後等你點頭。你不說，我不動。

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `/sg-deploy` | 「部署」「go」「推上去」 | 把程式推到 SG 伺服器上線 |
| `/ks-aw-01-reboot` | 「重啟 VPS」 | 安全重新啟動唯一現役 ks-aw-01 |

---

## 第二類：你有一個目標，告訴我

我無法幫你發明這些目標。你有想做的事，說一句就好。

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `/tomo` | `/tomo 今天在做 XXX` | 把今天的工作脈絡存起來，明天繼續 |
| `/client-onboarding` | 「幫我上線新客戶 XXX」 | 把新客戶加進系統 |
| `/build-tenant` | 「幫我佈建新 tenant XXX」 | 建立新客戶的完整環境 |
| `posthog-analyst` | 「看一下轉換率」「有人用 XXX 嗎」 | 查使用者行為數據 |
| `site-builder` | 「建立租戶」「provision new client」 | 同上，用另一種方式執行 |

---

## 第三類：你遇到這個情況時說

平時不需要。遇到對應的事情時開口。

### 程式碼品質

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `simplify` | 「這段太複雜了」「幫我簡化」 | 找出可以刪掉/合併的冗餘程式碼 |
| `level-check` | 「幫我 level check」 | 檢查這個專案有沒有符合系統架構規範 |
| `fewer-permission-prompts` | 「一直在問 allow，幫我減少」 | 分析後自動加入允許清單 |

---

### 自動化設定

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `update-config` | 「從現在開始每次 X 就做 Y」 | 把你要的自動化行為寫進系統設定 |
| `loop` | 「每 5 分鐘跑一次 XXX」 | 讓一個指令定時重複執行 |
| `schedule` | 「每天早上 8 點跑 XXX」 | 建立固定時間自動執行的任務 |

---

### 開發環境

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `run` | 「跑起來看看」 | 啟動 app，確認改動有沒有壞掉 |
| `init` | 「初始化新專案」 | 建立新 repo 的基礎設定 |
| `claude-api` | 「幫我用 Claude API 做 XXX」 | 建立用 Anthropic SDK 的程式 |

---

### 環境調整

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `keybindings-help` | 「幫我改快捷鍵」 | 修改 Claude Code 的鍵盤快捷鍵 |
| `statusline-setup` | 「設定 status line」 | 調整底部狀態列顯示的內容 |
| `fix-sidebars` | 「sidebar 壞了」「Codex 側欄不見了」 | 修復 VSCode 裡消失的側邊欄 |

---

### 稀有情況

遇到才需要，平時完全不用記。

| 工具 | 你說 | 它做什麼 |
|-----|------|---------|
| `tool-expert` | 「這個工具怎麼串」「MCP 出問題了」 | 解決工具鏈或 MCP 的複雜問題 |
| `/audit-cross-machine-bom` | 「跑 bom 稽核」 | 修復跨電腦同步的 .md 檔案出現的亂碼問題 |
| `ADD-PERIODIC-HEALTH-CHECK` | 「我要新增一個健康監控」 | 按 SOP 建立新的定時健康檢查 |

---

## 快速翻查

```
你說「可以」系列（3）
    → sg-deploy / sg-reboot / eu-reboot

你給目標系列（5）
    → tomo / client-onboarding / build-tenant / posthog-analyst / site-builder

你遇到事情系列（15）
    程式品質  → simplify / level-check / fewer-permission-prompts
    自動化    → update-config / loop / schedule
    開發環境  → run / init / claude-api
    環境調整  → keybindings-help / statusline-setup / fix-sidebars
    稀有      → tool-expert / audit-cross-machine-bom / ADD-PERIODIC-HEALTH-CHECK
```
