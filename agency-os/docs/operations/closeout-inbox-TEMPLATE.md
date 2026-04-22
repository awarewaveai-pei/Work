# Closeout inbox（本地、gitignore）

**用途**：並行協作 AI 只對本檔 **append** 區塊；**Cursor 收關者**合併進 `WORKLOG.md`／`memory` 後清空本檔。  
**實際路徑**（勿改檔名）：`agency-os/.agency-state/closeout-inbox.md`  
**說明**：本檔為範本（可版控）；實際 `closeout-inbox.md` 在 `.gitignore`，不進遠端。

---

## 使用方式

1. 在 monorepo 根執行 `.\scripts\init-closeout-inbox.ps1` 可從本範本建立 `closeout-inbox.md`（若尚不存在）。  
2. 協作代理每完成一段工作，在檔案**末尾**追加一區：

```markdown
### <AGENT_ID> <yyyy-MM-dd HH:mm>

- **完成（一句）**:
- **變更路徑**:
  - ``
- **Git**:
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
```

3. 收關者勿長期保留已合併內容；push 後刪除或清空本檔。

---

（以下可刪除；為當日第一則範例占位）

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
