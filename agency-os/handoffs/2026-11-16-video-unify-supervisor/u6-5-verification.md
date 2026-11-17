# U6.5 驗證（2026-11-17）

根因：工作台沒有話題佇列入口，舊排程專案只有唯讀審片入口；排程影片製作後只留下旁白全文，逐場景描述隨暫存消失。

做法：側欄「自動排程」讀同組織既有 content_topics 最近更新 200 筆，顯示排隊、進行中、已發布、停下原因，連到有權使用的內容工具設定；不另建排程或發布器。內容工具未開通時明示由品牌管理者設定。專案頁 content_topic 卡加「接手編輯」，經現有組織檢查的專案 API 讀場景，走 spine-create 建一集；相同來源重送開回同一集，不啟動 autoRun。畫面明示原排程依原設定繼續，若要停發布須到內容設定。

舊資料：既有專案與成片不改，保留查看／審片。保存過 production.scenes 的舊資料可接手；沒有逐場景資料的舊片明示無法還原，不以旁白句子冒充原場景。後續排程產片把實際旁白及畫面描述寫入原專案 brief_json.videoScenes；組織與來源條件、updated_at 比對，並保留既有 topicId 等欄位。只保存描述，臨時圖片仍按原流程清除；接手後按需生成畫面。

- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit; npx vitest run schedule route/component style-contract topic-scenes start-project | exit=0 | ms=9219
- Edge 與總閘：`node tests/u6-schedule.cjs`、`node tests/gate.cjs` exit=0；各自耗時未另記。
- REVIEW_DONE: critic=Standard | verdict=warn | findings=0c/0m/1n
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=videoScenes|sourceProjectId|scheduleNav|saveTopicVideoScenes | hits=28
- ORACLE_WAIVED: Claude weekly limit 與 critic 額度斷路仍有效；未重試付費 API，書面對抗自審與擁有權突變替代，未宣稱跨模型通過。
- BOM 稽核以 `-ProjectKey D--Work -WorkRoot D:/Work` 跑過，回報既有 operator memory 多檔缺 BOM；本卡未改 memory，repo Markdown 不在該稽核範圍，未替其他檔補寫。

實測：NA 5 檔 14 案通過；隊列四種狀態及錯誤、連結、讀取失敗、跨品牌拒絕、兩個實際場景、無場景舊資料不建立副本、保存場景保留既有欄位及併發重試。Edge 隔離站實際點側欄與排程卡、建立兩鏡頭、重送同一集且無 autoRun；工作台總閘通過。權限突變只在記憶體拔 assertOrgAccess，外組織測試由拒絕變成繼續查 DB，1 fail／1 pass；正式來源兩案綠。

對抗自審：查證門頁 API 許可沿用 /api/video；直接開 schedule 仍由工作台框架接管；讀取失敗不保留舊品牌資料；hydration 初次輸出一致；來源去重欄位經 Models.project 與 legacyProject 保留。限制：無歷史場景的舊片不可還原，介面明示；未部署／未做正式站登入驗收。回滾整張 source commit 即可，無 migration；已保存的 brief_json 新欄位可保留。共享 WORKLOG／TASKS 按接手文件留給 Claude。
