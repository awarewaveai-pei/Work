# 還原設定的非有限音量錯誤修正

原因：短影音輸出的任務設定不含播放器音量等可選欄位；還原後直接設定 undefined，導致瀏覽器拒絕。

修正：還原及讀取已存專案時補上播放與變形的數字預設值；明確的 0 保留。播放器音量另做有限值保護。原任務輸入不變。

驗證：editor-restore.cjs 通過缺值、NaN／Infinity／不合法字串、零音量、保存重開及無 pageerror；4178 實際提供的兩份檔案與已審原始碼 SHA256 一致。分鏡靈感保護檔未變。直接更新現有下載版，不重啟、不重打 ZIP。

跨模型審查 approve。唯一低等級提醒是既存儲存資料若整體不是陣列，另一條載入分支的防護不一致；非本次音量錯誤的原因，未擴大修改。以下保留原文：

```json
{"verdict":"approve","findings":[{"severity":"low","file":"scripts/tools-0.js","line":579,"issue":"This branch calls .map on the preferences result without checking Array.isArray. The tools-editor.js loader at line 486 does check. If the stored value is ever not an array, this path now throws a TypeError. Before the change it assigned the bad value silently, which would probably have broken later anyway, so this is a small inconsistency rather than a real regression.","suggestion":"Use the same guard here: const rows = await ...; ed.projects = Array.isArray(rows) ? rows.map(edNormalizeProject) : [];"}]}
```
