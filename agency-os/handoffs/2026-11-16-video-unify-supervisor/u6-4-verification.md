# U6.4 驗證（2026-11-17）

根因：步驟分散，完成後沒有共用下一步；既有發布狀態只知道核准，不能代表已存草稿。

修正：EpisodeSpine.stepStates 接主系統真實審片／草稿結果，nextAction 只讀這個陣列，依序回寫腳本、一鍵成片、審片、發布、完成；未知回 null。一集頁頂、成片卡、任務完成通知共用 renderNext，主系統更新時一起刷新。按一鍵成片只開含報價的確認框，沒有自動提交付費工作。

四項 QA 都通過且 checksum 是目前選片才亮「繼續到發布」，在同頁捲到發布面板。發布成功讀回真實草稿數／網站文章名稱與連結；完成回執不等同對外發布。影片社群草稿的既有 source_url 欄位記影片 URL，讀取仍限本組織；WordPress 回執沿用既有表，補文章標題與編輯連結。

驗證：
- `node tests/u6-next-action.cjs`：五種狀態、未知、只有核准但沒草稿，全部正確。
- `node tests/u6-next-ui.cjs`：本機 Edge Playwright 真實載入工作台；一集頁、成片卡、完成通知同步從審片→發布→完成；主系統 503 後都不顯示下一步，沒有 POST 付費任務、沒有頁面例外。
- `node tests/gate.cjs` 全過；`npx tsc --noEmit` 通過。
- 整合 gate 再次全過；批 2 NA `npm test`：564 個檔案通過、19 skipped；4,762 案通過、60 skipped、2 todo（30.02 秒，僅程序 PATH 前置 Git Bash）。
- 畫面用字與堆疊收尾（1f66f2cf2）後，整合 gate 全過，NA 全套同為 4,762 pass（29.72 秒）；另見 u6-4-ui-verification.md。
- NA 受影響測試：draft-outcome 2、social-drafts 4、embed-in-post 12、embed-to-wp 4、embed-poster 6、review-release 原 4＋新 QA checksum 1，共 33 案通過。
- 擁有權突變：僅記憶體移除 draft-outcome 的 primary organization_id 篩選，跨組織案例變紅（1 fail／1 pass）；原檔 2 pass。沒有移除正式守衛。
- `git diff --check` 通過；自審對照下一步、步驟徽章、QA checksum、草稿來源、刪除狀態與回執 checksum、通知／跨 frame 更新、只開確認框的 intent 路徑。

舊社群草稿未記 source_url 時無法可靠反查這支影片，不會猜已完成；新建立的草稿可準確讀回。未改 schema，未部署，登入正式站整趟驗收仍待當下同意。ORACLE_WAIVED：Claude weekly limit quota block 仍有效，未宣稱跨模型審查通過。共享 WORKLOG／TASKS 依接手規則留給 Claude。
