# 入口第一段：清單

- 設計：agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-entry-design.html（artifact https://claude.ai/artifact/K87dfPssnznHjSWfiBB4hc）
- 2026-10-11 操作者定：正式名稱「認知工程系統」、英文「Cognitive Engineering OS」；首頁兩道門「直接分析／陪我思考」；帶領給帶領者和系統管理員；舊專案保留、可永久刪除；登入改自己申請（另一張卡）；不要「跳過練習」按鈕。
- 規則：每一行做完改成 `=> built: <file:line>`；這一段不做的寫 `=> LATER: <去哪一張卡>`。全部是 built 或 LATER 才算這一段做完。

## 這一段要做完的（13 項）

1. 站名：登入頁、選單、瀏覽器分頁三處都是「認知工程系統」，英文「Cognitive Engineering OS」。 => built: apps/cognitive-web/lib/strings.ts:3-4（唯一一處）；apps/cognitive-web/app/layout.tsx:7、apps/cognitive-web/app/login/page.tsx:15、apps/cognitive-web/components/AppNav.tsx:62 都讀它
2. 首頁：標題「把一件事想清楚」、副標一句、一個輸入框（可以不寫）、兩道門（左「陪我思考」主按鈕，右「直接分析」）、「繼續上次的案子」（有案子才出現）。 => built: apps/cognitive-web/app/(shell)/page.tsx:11-15；apps/cognitive-web/components/HomeStart.tsx:44（輸入框）、:47（陪我思考）、:58（直接分析）、:69（繼續上次的案子，只列案子）；測試 apps/cognitive-web/components/HomeStart.test.tsx
3. 首頁不再有：工具總數、12 類卡片、熱門工具。 => built: apps/cognitive-web/app/(shell)/page.tsx 整頁只剩標題和 HomeStart；apps/cognitive-web/app/(shell)/layout.tsx 選單不再讀工具數
4. 直接分析頁：「先說你卡在哪」（首頁寫的那一句自動帶入）、按問句分類、熱門工具。 => built: apps/cognitive-web/app/(shell)/analyze/page.tsx:27（帶入 ?q=）、:17（分類去掉工程）、:49（熱門工具）；舊連結改指這裡：apps/cognitive-web/components/result/ResultPage.tsx（⑧ 不確定選哪個）、apps/cognitive-web/app/(shell)/methods/[id]/page.tsx:33
5. 工程的工具不出現在：推薦、直接分析的分類、工具目錄、工具目錄的總數；內部用的 4 條工作流也不列出（它們跑的是工程工具）。屬於哪一塊只來自 blocks.py。 => built: ai_lego/platform/catalog/display_catalog.py:211（internal_goals，一類混兩種就擋）、:230（每個工具的 block 來自 blocks.block_of_family）；apps/cognitive-web/lib/catalog.ts isUserTool/userGoals/userToolCount；apps/cognitive-web/components/StuckBox.tsx:29、apps/cognitive-web/components/ToolDirectory.tsx:18,27、apps/cognitive-web/app/(shell)/workflows/page.tsx:34；一般工具的「建議下一步」不推薦工程工具：ai_lego/apps/api/main.py:1708-1711；測試 tests/unit/test_display_catalog.py、tests/unit/test_api_interpret.py、apps/cognitive-web/lib/catalog.test.ts
6. 陪我思考：按下去直接開一個案子，進開案頁，首頁寫的那一句帶進「你想釐清什麼」。不用先跑工具。 => built: apps/cognitive-web/components/HomeStart.tsx:32-37（POST /projects 後進開案頁，帶 ?q=）；apps/cognitive-web/app/(shell)/projects/[id]/start/page.tsx:7；apps/cognitive-web/components/blocks/IntakePage.tsx:32-34（只在還沒有開案資料時帶入）
7. 我的案子：分成兩區，「案子」（有開案資料的）和「我的分析」（跑工具留下、還沒開案的）。以前「每跑一次開一個」的舊專案沒有開案資料，自動歸在「我的分析」，不搬資料。 => built: ai_lego/data/repositories/case_docs.py:280（owners_with，一次查完）、ai_lego/apps/api/main.py:2729（GET /projects 的 is_case）與 GET /projects/{id}；apps/cognitive-web/components/ProjectList.tsx:74（案子）、:81（我的分析）；還沒填開案資料的空案子算案子，規則只寫在 apps/cognitive-web/lib/projects.ts:82-83，「我的案子」和首頁「繼續上次的案子」都用它；測試 tests/unit/test_api_interpret.py、apps/cognitive-web/components/Projects.test.tsx
8. 我的分析：可以勾選，按「永久刪除」；刪之前在頁面上寫清楚刪了就回不來、每晚的備份最多再留 7 天。 => built: apps/cognitive-web/components/ProjectList.tsx:100-106（勾選、頁面上確認、寫明回不來和備份 7 天，才逐一 DELETE /projects/{id}；檔案還在清理時照實說，:106）；測試 apps/cognitive-web/components/Projects.test.tsx
9. 直接分析的結果頁最下面：三個選擇「用這份結果開案」「留在我的分析」「永久刪除」（還沒開案的才出現）。 => built: apps/cognitive-web/components/result/ResultChoices.tsx（還不是案子才出現）、apps/cognitive-web/components/result/ResultPage.tsx:581；測試 apps/cognitive-web/components/result/ResultChoices.test.tsx
10. 用這份結果開案：同一個專案補上開案資料就變成案子，原本的分析留在裡面，標「AI 做的」。 => built: 開案連結回同一個專案的開案頁（apps/cognitive-web/components/result/ResultChoices.tsx）；案子頁的分析標「AI 做的，不是你的判斷」（apps/cognitive-web/components/ProjectPage.tsx:349）
11. 選單：首頁／我的案子（底下有我的群組）／直接分析（底下有工具目錄、工作流）／練習（底下有課程、校準）／帶領（只有帶領者看得到）；最下面：我的資料、設定、求助。 => built: apps/cognitive-web/components/AppNav.tsx:17-28（5 項＋帳號 3 項；子項目 :20,:22,:24）、:51（帶領只給帶領者，GET /facilitate/me；自己打網址進 /lead 也不會出現）；apps/cognitive-web/app/globals.css（子項目和底部樣式）；測試 apps/cognitive-web/components/AppNav.test.tsx、apps/cognitive-web/lib/catalog.test.ts
12. 原本 11 個頁面都還找得到：每一頁在選單上都有歸屬，網址不變。 => built: apps/cognitive-web/components/AppNav.test.tsx:30（舊選單 11 頁，每一頁在自己的區塊都點得到）
13. 「我的專案」這個名稱全站改成「我的案子」：選單、頁首、每一頁上方的路徑、提示文字。 => built: apps/cognitive-web/ 底下 14 個檔案的「我的專案」全部改成「我的案子」（grep 剩 0）；測試裡的路徑文字一起改

## 這一段不做的（各自去哪）

- 自己申請帳號、拿掉 Tenant ID => LATER: 新卡「自行申請帳號」（身分與權限，高風險，先出計畫）
- 系統管理員角色，和它看得到「帶領」 => LATER: 新卡「系統管理員角色」（高風險）
- 案子頁換成一圈的地圖、地圖下「這個案子的 5 條規則」、每站上的八步小標 => LATER: 第二段
- 每一站都能挑做法（今天只有拆解） => LATER: 第二段
- 開案頁欄位分「建議現在填／之後再補」，團隊或高風險時必填 => LATER: 第二段
- 開案頁上直接勾 AI 這次能做什麼（今天在「協作合約」那一頁設） => LATER: 第二段
- 把結果放進已經有的案子 => LATER: 第二段（要能把分析搬到另一個專案）
- 直接分析的推薦改用 AI 挑（今天是比對字） => LATER: 已在 StuckBox.tsx:3-5 的 P3
- 頁面走查、接到新 main 之後的網頁測試、跨積木檢查 => LATER: 操作者 2026-10-11 指定留到後面一起做
- 上線 => LATER: 高風險，另外要操作者說 go

## Codex 審查（2026-10-11，agency-os/reports/oracle/2026-10-11-partialreview-b800c499.md）

7 點，逐點對過原始碼：
- F3 從結果頁進直接分析，點分類或熱門工具會掉了原本的專案 => 修：apps/cognitive-web/app/(shell)/analyze/page.tsx 的工具連結帶 project
- F4 刪除後檔案還在清理（HTTP 202），畫面當成全刪完 => 修：apps/cognitive-web/components/ProjectList.tsx:106
- F5 剛開、還沒填開案資料的案子，首頁「繼續上次的案子」看不到 => 修：apps/cognitive-web/lib/projects.ts:82-83 一處規則，兩邊共用
- F6 不是帶領者，自己打網址進 /lead，選單會冒出「帶領」 => 修：apps/cognitive-web/components/AppNav.tsx:51
- F7 一般工具跑完的「建議下一步」可能推薦工程工具 => 修：ai_lego/apps/api/main.py:1708-1711
- F1 有多個工作區的租戶開不了案 => LATER: 這一段之前就有（跑工具一樣不帶 workspace_id，main.py:2695-2702）；今天每個租戶只有一個工作區。併入「自行申請帳號」那張卡一起定
- F2 以前跑過的工程工具分析，在「我的分析」還連得到工具頁 => 不改：那是使用者自己的紀錄；清單要擋的是推薦和選單，不是自己的歷史
