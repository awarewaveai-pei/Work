# ED.6 共用曲庫：正式站部署步驟（交監工排程；worker 沒有執行）

程式：`backend/library.cjs`。網址 `/library/<名>`，檔名白名單 `(sfx|amb|mus)-….mp3`，只准 GET／HEAD，任何已簽身分都可讀，其餘一律 404。
- 讀檔：`server.cjs` 提供網址，`backend/api.cjs` localFile 給匯出與任務用，兩處都呼叫 `library.fromUrl`。
- 匯出端：`backend/editor-export.cjs:466` 只有 `/assets/` 走特別處理，其他網址走 `file(url)`＝localFile，所以 editor-export.cjs 沒改。
- 資料夾：`VW_LIBRARY_DIR`，沒設時是 `<VW_DATA_DIR>/library`。正式站 compose 已有 `VW_DATA_DIR: /data`（`docker-compose.yml` video-workbench 服務），所以預設就是磁碟區上的 `/data/library`，**不用改 compose**。

1. **nginx**（走 `scripts/safe-infra-patch.sh`）：`nginx/default.conf:622` 的 `location ~ ^/(api/vw|media|generated|reference)/` 改成 `^/(api/vw|media|generated|reference|library)/`。不改的話，正式站的 `/library/` 到不了 workbench（Codex 2026-11-10 也指出這點）。
2. **放檔案**：筆電的檔案在 `apps/video-workbench/.data/library/`（106 個 mp3＝36 音效／環境音＋70 配樂，約 285 MB，另有來源紀錄 `.import.json`，要一起放；原檔在 `D:\tmp\ed6-audio-src`）。
   - `scp -P 58122 -r lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/.data/library root@145.239.195.47:/root/vw-library`
   - 主機上：`docker exec lobster-video-workbench mkdir -p /data/library && docker cp /root/vw-library/. lobster-video-workbench:/data/library/`
3. **驗證**：
   - `docker exec lobster-video-workbench sh -c 'ls /data/library | wc -l'` 應等於清單首數＋1（目前 106 首＋`.import.json`＝107）。
   - 登入後打開剪輯器 › 音訊 › 音效，試聽一首，再匯出一次。
4. **還原**：拿掉 nginx 的 `library`。資料夾留著不影響任何功能。
5. **以後新增曲子**：在筆電跑 `node scripts/import-audio-library.cjs --from <原檔資料夾>`，清單和 `.data/library` 會一起更新；commit 清單，再照第 2 步把新檔放上去。
