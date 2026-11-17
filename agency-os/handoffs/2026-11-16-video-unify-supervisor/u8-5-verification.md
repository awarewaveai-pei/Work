# U8.5 驗證（2026-11-17）

根因：剪輯器片頭表單每個剪輯檔都從空值開始，插入只平移軌道，沒有把選擇寫回本集，也沒有設定轉場。

修正：表單初始化讀 episode.intro 的模板、欄位、媒體與長度；生成相同參數時重用既有任務。插入前經 runtime spine-set-bookends 寫回；所有軌道同步後移，主片第一段帶預設 0.5 秒溶解（已設定淡黑／無轉場則沿用），片頭標記避免輸出再加一次。阻擋重複插入與主軌開頭空隙。插入使用該次渲染的設定快照，避免等待期間改欄位造成設定與影片不一致。

驗證：`node tests/u8-bookends.cjs` 實跑片頭表單初始化及插入函式，驗證讀回儲存欄位、主片及旁白同步、15 frame 轉場、runtime 寫回、重複插入拒絕；`node tests/paid-price.cjs` 通過；`node tests/gate.cjs` 全過；`git diff --check` 通過。沿用剪輯器置中轉場語意，沒有改既有時間軸長度規則。

自審核對 title-generate、title-insert、edExportWithBookends 三條路，原場景／配音不重生。ORACLE_WAIVED：Claude weekly limit 的 critic quota block 仍有效，未宣稱跨模型審查通過；未部署／未在正式登入瀏覽器點擊。依接手規則不改共享 WORKLOG。
