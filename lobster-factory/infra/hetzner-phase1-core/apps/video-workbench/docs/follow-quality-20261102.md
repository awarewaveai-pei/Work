# 人物跟拍可靠性修正（2026-11-02）

使用者指出兩個孩子的實拍影片抓人差，要求對照 SeedStar follow-cut，點數先不處理。本次沒有改扣點、分鏡靈感、主題、API 或模型供應商。

## 重現與根因

在現有資料找到與截圖相符的 22.4 秒、1920×1080 影片，解碼畫面確認一致。取 11–22.3 秒，選左側站起來的孩子。

原追蹤 92 個取樣有 55 個 lost；第 14 秒仍把右下方偵測當成匹配（中心 x≈0.758），後面又漂到 x≈0.841。原程式主要比較位置、框面積與整個框的顏色；模板大小固定、相關性門檻低，而且弱匹配會污染後續外觀，因此可能把背景或其他人當原人物。

舊驗收使用平移人物圖片，不能代表真人轉身、接近鏡頭、相似穿著、遮擋或離開畫面的可靠性。

## 修改內容

- `shared/follow-math.js`：加入畫面特徵相關性、已知其他人物的排除特徵、弱偵測／歧義排除；保留既有平滑與裁切。lost 位置不因後面的修正點而平滑漂移。
- `scripts/follow-worker.js`：模板增加尺度搜尋，要求較強的近期及選取時原始特徵一致性，避免把弱模板一路當成成功；保留本機離線處理。
- `scripts/tools-follow.js`：記住選取畫面中的其他人物；連續四個取樣無法確認後停止自動重新認人，必須使用修正點；列出待檢查區間，可跳回更新選人或明確選擇保留位置。未確認時禁止跟拍輸出，直接呼叫輸出函式亦有同一守衛。
- 追蹤 fingerprint 升版，舊結果不能直接冒充新版本已驗證的結果；重新追蹤清除舊確認。
- 無可解碼影像尺寸時提供明確錯誤，不讓零寬畫面進入 createImageBitmap。

## 能力邊界：不能宣稱已完成高品質遮擋重識別

這次改善錯誤匹配、漂移與不確定區間的處理，**不是新的人物重識別模型**。真實影片的後段有鏡頭大幅移動、近距離模糊、遮擋與人物離開；目前仍需要手動修正或確認保留位置。

修正後此案例 74／92 個取樣保守標成無法確認，多於舊版 55／92。這是降低「錯誤判成成功」的結果，不是人物偵測率提高，不能用它宣稱全程跟拍已解決。人物清楚可見的 11–13 秒仍可跟隨；14 秒後不再把新偵測當成原人物。

若要顯著減少此類影片的人工修正，需要下一階段評估更強的選定目標追蹤／遮擋後重識別與場景變動處理，並保留此實拍測試作門檻；不能只反覆調門檻或把 lost 提示藏掉。

來源為 HEVC Main10 MOV，測試機 headless Edge 的解碼路徑不可靠。本次只在 TEMP 建立本機 H.264／AAC 代理進行模型與輸出測試，保留原片；沒有實作全站自動代理轉換，也沒有把影片上傳官網或辨識服務。瀏覽器無法解碼原片時仍需轉成可用格式。

## 實測

- `tests/follow-identity.cjs`：相近衣著／距離的另一人、已知干擾人物、低信心偵測、歧義、分開的待確認區間，以及 lost 保留位置。
- `tests/follow-controls.cjs`：取消、改區間、離開工具、按鍵恢復及既有預覽結束行為。
- `tests/follow-tracking.cjs`：離線真實模型、平移圖像跟拍、直接點身體、修正點、預覽拖曳，以及實際音畫輸出；此測試仍只是控制案例，不代表實拍遮擋已解決。
- `tests/follow-rotation.cjs`：手機旋轉資訊、裁切方向與真實輸出。
- 實拍影片 TEMP 驗證：人物清楚時跟隨；不漂到原先錯誤右下位置；失去確認後不自動重新配對；未檢查禁止輸出；跳回檢查時間正確；明確確認保留位置後輸出 720×1280、11.3 秒、含音訊。
- 獨立 FFmpeg 解碼第 10 秒輸出影格與來源對應裁切比較，像素平均絕對差約 1.10；與舊錯誤位置比較約 61.63。這證明輸出使用新軌跡，不代表丟失的人重新找回。

證據目錄：`C:\Users\user1115\AppData\Local\Temp\seedstar-follow-quality-27b5495be98d4fcb9552ebab8d513788`。原檔備份在其 `before`，實拍測試為 `quality.cjs`，資料在 `baseline.json`、`improved.json`、`detections.json`；實拍含私人影像，僅本機保存。

## 接手方向

Claude Code 應以「降低錯認且提高實拍中連續正確跟隨」為下一個目標，不能把本次保守停止當成追蹤品質已全面完成。至少用同一支影片的接近、遮擋、離開與兩人同框情境驗證；不重開點數開發。

復原：把 before 中三個原始 JS 檔還原到開發與實際服務副本，保留使用者資料；舊 fingerprint 結果會要求重新追蹤。此次前端修正不需要重啟 4178 後端。

## 審查與最終交付

Claude 首次唯讀審查 request_changes，指出固定原始參考、描述子大小、確認狀態綁定、手動選取干擾與累積縮放等問題；均已修正並限定複核 approve。保留資訊級限制：弱參考仍非完整重識別；本機 localhost 支援 crypto.randomUUID，遠端必須 HTTPS。不是對實拍追蹤品質作全面認證。

- REALTEST_EVIDENCE: tool=exec_command | cmd=tests/follow-identity.cjs,tests/follow-controls.cjs,tests/follow-tracking.cjs,tests/follow-rotation.cjs,TEMP/quality.cjs,TEMP/verify-pixels.cjs | exit=0
- REVIEW_DONE: critic=Claude | verdict=approve | scope=四個凍結程式檔；首次問題修正後複核，剩餘兩項資訊級限制
- BUGHUNT_DONE: scope=SeedStar-app/scripts/tools-follow.js,scripts/follow-worker.js,shared/follow-math.js,tests/follow-identity.cjs | checks=identity-reference,confirmation-fingerprint,manual-selection,miss-lock,scale-bounds,export-guard
- BUGHUNT_SCOPE_NARROW: 變更僅本機跟拍功能；未改 D:/Work/agency-os 或全域 scripts。

D:/Video 為修改與交接副本，4178 仍從 Downloads/SeedStar_AwareWave_20261102_完整最新版 執行；已同步經審查的前端程式，不重啟後端。之前的完整 ZIP 是修改前快照，沒有在此修正中重新壓縮。
