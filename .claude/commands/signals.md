---
name: signals
description: Fetch Slack and Telegram messages for a time range.
argument-hint: [from-datetime] [to-datetime]
---

# /signals — Fetch Slack + Telegram messages for a time range

## 自動觸發條件（Claude 主動使用，不等使用者開口）
當使用者提到任何以下情境時，Claude **必須**在回覆前自動執行此命令：
- 問某段時間的 Slack / Telegram 訊息（「上午幾點有什麼告警」「昨天晚上的訊息」「5/14 以後有什麼」）
- 問某個時間段是否有告警或 incident（「有沒有 502」「昨天有什麼事」）
- AO-RESUME 報告的「外部信號」段落，如果 external-signals-digest.json 的 `since_utc` 比使用者需要的範圍還晚，自動補查

## 用法
```
/signals
/signals 2026-05-14 18:00
/signals 2026-05-14 18:00 2026-05-15 16:00
```

- 無參數：使用 ao-close-last.txt 時間戳（同 AO-RESUME 預設行為）
- 一個參數：指定起始時間（CST，格式 `yyyy-MM-dd HH:mm` 或 ISO 8601）
- 兩個參數：指定起始 + 結束時間

## 執行方式
```powershell
# 無參數
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-external-signals.ps1

# 指定起始
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-external-signals.ps1 -From "2026-05-14 18:00"

# 指定範圍
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/fetch-external-signals.ps1 -From "2026-05-14 18:00" -To "2026-05-15 16:00"
```

執行完畢後讀取 `agency-os/.agency-state/external-signals-digest.json`，
並以結構化表格呈現：

```
### Slack #ops-incidents（N 則）
| 時間 (CST) | 內容 |
|-----------|------|
| HH:mm     | ...  |

### Slack #infra-alerts（N 則）
…

### Telegram（N 則）
…
```

無訊息時寫：「此時段 Slack / Telegram 無訊息」。

## 注意事項
- 時間未帶時區預設為 CST（UTC+8）
- Slack token 需有 `channels:history` scope（User registry `SLACK_BOT_TOKEN` 優先）
- Telegram 0 則不代表異常，可能只是沒有人傳訊息
- 輸出格式：先 Slack（#ops-incidents → #infra-alerts），再 Telegram
