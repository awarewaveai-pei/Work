# 剪輯器 MOV／MP4 選擇器修正

原因：剪輯器素材庫漏傳 kind，套用預設 image 篩選，影片因此全部被隱藏。上傳選擇器只寫 MIME 萬用字元，未明列 MOV／MP4 副檔名。

修正：剪輯素材庫明確使用 all；兩個影片上傳入口明列 MOV／MP4／M4V／WebM。瀏覽器未提供有效媒體 MIME 時，依已知影片副檔名補上 MIME；有效的圖片／音訊／影片 MIME 保留，僅修正 data URL 類型標頭，檔案位元組不變。

驗證：editor-media-picker.cjs 通過；空 MIME 的大寫 MOV 真實上傳，檔案位元組完全相同；素材庫列出並加入影片時間軸；實際 MP4 file chooser 上傳並加入時間軸。已宣告音訊的 MP4 仍維持音訊分類。這項測試未宣稱所有 MOV 內含編碼均可由瀏覽器播放。

只更新正在使用的兩個前端檔案，4178 實際提供內容已核對 SHA256；不重啟、不重新打包。Claude 首輪指出 MIME 優先順序會影響音訊分類，已修正，複查 approve。

## 首輪審查原文

```json
{"verdict":"request_changes","findings":[{"severity":"medium","file":"shared/assets-ui.js","line":30,"title":"The extension check replaces a correct browser MIME type, so audio-only .webm files are saved as video","detail":"`type` comes from the file extension even when the browser already gave a valid media MIME type. An audio-only WebM file (for example a MediaRecorder voice recording) has file.type 'audio/webm' and used to upload as audio. Now it gets 'video/webm', so the data-URL header, the stored type and the mediaKind classification all say video. That changes the existing audio behavior the fix was supposed to leave alone. The same thing happens to any file whose extension doesn't match its real type.","suggestion":"Only use the extension when the browser's type is missing or isn't a media type, e.g. `const type = /^(image|video|audio)\\//.test(file.type) ? file.type : (Object.hasOwn(videoTypes, extension) ? videoTypes[extension] : file.type);`. The empty-MIME Windows MOV case still works, and correctly typed audio/webm keeps its type. The data-URL header rewrite only replaces the text before the first comma and keeps the bytes, which is correct."}]}
```


## 修正後複查

{"verdict":"approve","findings":[]}
