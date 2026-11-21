# W8 每個系統的接續卡起始資料（Opus 5.5，唯讀調查＋產一個 JSON）

先讀 `COMMON.md`（契約 2 的 handoff payload）、`agency-os/systems/registry.json`。

問題：正式庫 0 筆 handoff，總控頁「下次從這裡繼續」全空。之後由 commit trailer `Next:` 補，但現在要一次性從既有紀錄建起點。

做：為 registry 每個系統（29 個）找出**有出處**的現況：
- `subject`：最近完成的一件事（一句）
- `next`：下一個具體步驟（可操作，一句）；真的沒有就省略
- `blocker`：卡點；沒有就省略
- `source`：出處 `file:line`（TASKS.md 條目、監工頁 DISPATCH／data.mjs、WORKLOG 日期區塊、memory 檔）
來源優先：該系統監工頁 `DISPATCH.md`／`data.mjs` NEXT → `agency-os/TASKS.md` 對應條目 → `agency-os/WORKLOG.md` 最近條目 → `C:\Users\user1115\.claude\projects\D--Work\memory\` 的 project_*.md。找不到出處的系統不要編，列進 `missing`。
已結束、無下一步的系統：`next` 省略，`subject` 寫最後完成的事。

產出：`agency-os/handoffs/2026-11-21-systems-control-center/seed/handoffs.json`
`{ "generated_at": "<ISO>", "items": [{ "system_slug", "subject", "next"?, "blocker"?, "source" }], "missing": ["<slug>", …] }`
文字繁中白話、每欄一句、不放秘密／個資／金額以外的敏感資訊。監工會逐條抽查出處再轉成 `handoff` 事件送入。

檔案：只有上述 JSON。不改其他檔。commit 在你的 worktree 分支、不推。
