---
slug: cognitive-sovereignty-platform
created_utc: 2026-10-02T11:05:00Z
hint: "雲端 session 改回本機繼續：認知主權平台 13 塊積木骨架討論、監工台、每個案子的紀錄最低標準"
source_session_summary: "操作者以藍圖 v0.6/v0.7 重新定義產品：Cognitive OS 退為引擎，新平台由 13 塊積木組成；本 session 只做討論與監工台，無程式變更。"
---

# 認知主權平台：本機接手包

> 讀者：操作者筆電上的下一個 session。先讀本檔，再開監工台，不要重新發明骨架。
> 本 session 在雲端 container 跑，打不到 `cognitive.aware-wave.com`（網路政策 403）、沒有帳密、沒有 pwsh、hooks 未裝；所以改回本機。

## 1. 任務目標

把 `BLUEPRINT_v0.7.md`（操作者的「認知主權平台整合藍圖」）落成一個完整成熟的全功能平台的骨架：13 塊積木各一份合約（九個欄位），再照順序蓋內部。現有 Cognitive OS（285 方法、16 工作流、蒐集器、彙整＋引註閘）退為引擎，只是其中一到兩塊積木的內容。

## 2. 為什麼做

操作者 2026-10-02 裁定：現有系統是「把原文變成有引註的分析」的機器，但沒有「人形成自己判斷」的外殼——沒有人的思考的位置、順序反了（AI 先產人後看）、AI 無合約、迴路沒閉、無組裝器、無外化、規範脈絡沒有軸、完整性核心只套藝術反思 14 個方法。藍圖要的是完整迴路，不是只有「建立→蒐集→彙整→分析→報表→核准」。

## 3. 已試過

- 讀過：`RESEARCH_LINES_MASTER_PLAN.md`、`feature-cognitive-os-completion.md`、`COGNITIVE_OS_DEPLOYMENT_BLUEPRINT.md`、`AI_LEGO_OS_Program_Plan_v1.md`、`reports/decisions/2026-09-23-research-pipeline-architecture.md`（§10.1 七個矛盾）、ADR 011、KB／Collection 計畫、HCI delivery plan／C1–C10、WORKLOG 2026-09-29 續7（專案頁的任務卡／歷程／短期長期計畫）。
- 做錯過（勿重蹈）：① 把藍圖塞回舊計畫、拚命「省工」；② 寫了一份 600 行工程規格（`REJECTED_DRAFT_system_design_v1.md`，操作者：「唬扯」「看不懂」）；③ 開 30 個 agent 跑藍圖對程式碼的逐條 gap check（操作者：「蠢事」，已停）。操作者要的是**討論**：一次一件事、白話、看得懂的圖。
- 做對的：監工台 artifact（見 §6），四張圖（全地圖／流程圖／進度圖／時間軸）＋「一個案子的紀錄」歷程圖；單欄、單字體、無色塊（操作者有 OCD／ASD／ADHD、空間與視覺潔癖）。

## 4. 卡在哪

- 雲端打不到正式站，操作者要我親自看 `https://cognitive.aware-wave.com/methods/systems.iceberg_model` 與 `https://cognitive.aware-wave.com/projects/b1964684-7bde-47bf-b64b-6e72e1c9f913`，對照「每個案子的紀錄最低標準」。本機有帳密與網路，直接看。
- 13 份合約只寫了 SENSE 草稿（在監工台資料裡），其餘 12 份待逐塊討論。

## 5. 下一步指令

1. 本機開 Claude Code 於 `$WORK_ROOT`，`git fetch origin claude/festive-sagan-getiwm && git merge --ff-only origin/claude/festive-sagan-getiwm`（或合併 PR）。
2. 用瀏覽器登入正式站，親自走 iceberg 工具頁與上述專案頁，記下紀錄功能實況（歷程、任務卡、短期／長期計畫、現在重跑並比較、⑧ 只推沒做過的工具），對照監工台「三、一個案子的紀錄長什麼樣」與「共用紀錄」合約，不符就改合約文字。
3. 監工台更新方式：Artifact tool `action: read` `url: https://claude.ai/artifact/E8VKViRmycqsXySHdnhUSJ` 一次，再以 `$WORK_ROOT/agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/platform-supervisor.html` 為檔案、同一 `url` 發布（網址不變）。資料全在該檔 `<script>` 的 `BLOCKS`／`CROSS` 陣列。
4. 接著一塊一塊跟操作者談合約（九欄：解決什麼問題／使用者做什麼／系統做什麼／AI 能做什麼／AI 不准做什麼／讀什麼／寫什麼／產出給誰／現在有沒有），每談完一塊更新監工台。建議順序：GATHER（已有，最快寫完）→ MAP → THINK → DECIDE → ACT → LEARN。
5. 13 份合約齊了再動 RLMP（§1 L4 升格、§3.3 閘作用域、§9 定案、§5 分期）與 ADR；之前不要改任何 plan／code。

## 6. 相關資源

- **Files**（本接手包資料夾 `$WORK_ROOT/agency-os/handoffs/2026-10-02-cognitive-sovereignty-platform/`）：
  - `BLUEPRINT_v0.7.md`、`BLUEPRINT_v0.6.md`：操作者藍圖，意圖正本。
  - `platform-supervisor.html`：監工台原始碼（artifact 同步）。
  - `REJECTED_DRAFT_system_design_v1.md`：被否決的工程規格，只供日後拆零件，不要拿給操作者看。
- **Artifact**：監工台 https://claude.ai/artifact/E8VKViRmycqsXySHdnhUSJ （v6）。
- **已談定（2026-10-02）**：
  1. 平台是新東西；Cognitive OS 退為引擎。
  2. 13 塊積木：SENSE 外化／GATHER 蒐集來源／MAP 拆解／THINK 共思考／VERIFY 查證主張／COMPUTE 計算與模擬／DECIDE 判斷／ACT 行動與觀察／LEARN 回顧校準／EXPRESS 產出與表達／TEACH 課程與演練／COLLAB 共同程序／GOVERN 治理與研究。VERIFY 由藍圖的一塊拆成 GATHER＋VERIFY；COMPUTE／EXPRESS／TEACH／ACT 為新增。
  3. 個人歷程（跨案子記憶）不算積木，是共用紀錄的一部分。
  4. 骨架＝13 份合約；任務容器、協作合約、完整性核心從合約推出。不做「先放 13 個有畫面沒合約的空頁」。
  5. **ACT 獨立成一塊**；短期觀察按週、長期觀察按月／季／年。
  6. 每個案子都有完整紀錄，最低標準＝今天的專案頁（歷程、任務卡、短期長期計畫、換方法再做、重跑比較、只推沒做過的工具）。
  7. 現有工具去向：蒐集器＝GATHER 引擎；方法庫＝MAP／THINK／DECIDE／COMPUTE 裡的做法（64 個軟體工程方法不給一般使用者看）；彙整＋引註閘＝VERIFY 一半；知識庫與 HCI 不在平台內；portal 第二使用者才接。
- **未定**：第一圈是否「個人複雜決策」；外化媒介先文字卡＋關係圖；其餘 12 份合約。
- **Commits**：本 session 無程式變更；本接手包是唯一提交。
- **Known landmines**：操作者要討論不要文件；要圖不要表；一次只談一件；回覆短；不要再提「省工／最小改動」當理由；不要擅自跑大規模 agent 扇出。
