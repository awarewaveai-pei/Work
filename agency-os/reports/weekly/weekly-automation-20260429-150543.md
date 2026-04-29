# Weekly automation report

- Generated: 2026-04-29 15:05:43
- Work root: C:\Users\USER\Work
- Config: C:\Users\USER\Work\scripts\weekly-automation-config.json
- Result: FAIL

## Job results

### weekly-system-review - FAIL
- Description: Run weekly build gates and integrated status report.
- Type: powershellFile
- Started: 2026-04-29T15:05:43
- Ended: 2026-04-29T15:05:43
- Exit code: 1
- Command: powershell.exe 

#### stderr
```text
無法驗證 'ArgumentList' 參數上的引數。引數為 Null 或空的。請提供一個不為 Null 或空白的引數，然後嘗試重新執行該命令。
```

### workflows-security-audit - FAIL
- Description: Run workflows npm audit and emit security report.
- Type: process
- Started: 2026-04-29T15:05:43
- Ended: 2026-04-29T15:05:43
- Exit code: 1
- Command: npm 

#### stderr
```text
無法驗證 'ArgumentList' 參數上的引數。引數為 Null 或空的。請提供一個不為 Null 或空白的引數，然後嘗試重新執行該命令。
```


