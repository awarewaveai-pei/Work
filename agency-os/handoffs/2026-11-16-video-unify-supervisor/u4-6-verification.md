# U4.6 驗證（2026-11-17）

- 根因：工作台 p.style 存 0–8 索引，與 VideoStudio 的 3 個影片 preset＋Tarot 103 項是兩份清單。
- 改動：103 項資料移到 `NA/public/editor-shared/art-styles.js`，原 tarotStyles.ts 保留相容匯出；video-styles.js 合併 3＋103＋9＝115 項，穩定 id，完整保存舊標籤與提示詞。VideoStudio 直接讀；VW 後端讀同檔，在 capabilities 下發；打包清單與 CI 路徑同步。
- 舊資料：工作台 loadState 將數字 p.style 對應 styleId=legacy-0…8，保留舊數字 p.style、customStyle、id、集、鏡頭；建立與修改保存新 id，新風格的舊數字欄位為自訂=8，提示完整保留。自訂提示優先，未知 id 不刪。新選擇立即換成該風格提示，避免沿用上一款提示。
- 刪除：工作台九項獨立清單、VideoStudio 三項獨立清單；Tarot 資料只搬移，不留第二份。
- REALTEST_EVIDENCE: tool=Bash | cmd=npx tsc --noEmit; npx vitest run visual-styles style-contract model-specs | exit=0 | ms=7559
- Edge `node tests/u4-visual-styles.cjs` exit=0：九個舊專案全部遷移，原自訂與鏡頭不變；115 按鈕；選紀錄片後新提示與 id 正確，重開保留。已看實際截圖：分組、換行、捲動與保存列可見。
- VW `node tests/gate.cjs` 全過；awarewave-files 16 檔全部覆蓋。
- 103 項搬移前後逐位元組對照：只移除 TypeScript 型別，資料與提示詞完全相同。103 個解析結果逐一與原 resolveStylePrompt 對照全同；舊索引、標籤與新 id 相容。
- REVIEW_DONE: critic=Standard | verdict=warn | findings=0c/0m/1n
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory | grep=VIDEO_STYLE_CATALOG|VideoWorkbenchStyles|video-styles.js|art-styles.js | hits=23
- ORACLE_WAIVED: Claude weekly limit／critic 斷路仍有效，未重試外部審查或付費 API。書面自審已查資料搬移、解析、打包、舊專案及新值保存；此卡無擁有權／隱私／同意等守衛改動，不做無效突變。
- BOM 稽核延續 U6.5：operator memory 既有缺 BOM，未改該批檔案；repo Markdown 不需 BOM。
- 未部署。回滾 source commit 可還原清單；舊版仍可讀數字 p.style 與完整 customStyle，新風格顯示自訂，毋須逆向改資料。共享 WORKLOG／TASKS 留給 Claude。
