# U5.5 驗證（2026-11-17）

根因：成片沒有可編輯的本集片頭入口；把新片頭直接疊到已含舊片頭的成片會重複，重新跑 quick-render 則會重做配音。

修正：成片卡與一集頁共用編輯／重新生成／加入影片，讀寫同一份 episode.intro。編輯儲存後自動渲染；相同欄位重用，明確重新生成才新增任務。主片和原配音不重生，重接走既有 editor-export，新增版本並記錄 derivedFrom。舊成片沒有片頭也可加入；已有片頭卻沒有主片或原時間軸時明確拒絕，要求從原剪輯輸出一次。複製連結說明需登入工作台。

video-service 有片頭時保留 voiced／captioned 主片到 videomain/（無片頭請求維持原路徑），NA 把 mainUrl／原字幕時間寫進資產 metadata；VW 下載並以真正 bytes 另行登記來源與權利，不把不同 bytes 偽裝成同一資產。重接後同步順延 QA／SRT／VTT 時間，第二次重接不累加舊位移。下載或登記失敗後重試重用伺服器已完成的票，不重新提交付費配音。

驗證：
- `node tests/u5-bookend-card.cjs`：舊主片加入片頭、新版保留舊版及血統、只有 editor-export／remotion 任務、同設定重用、明確重新生成、兩次重接只一層片頭、字幕只順延一次、主片另行登記、完成票重試不提交供應商，全過。
- `node tests/pj1-spine-unit.cjs`、`pj2-spine-settle.cjs`、`pj4-stale.cjs`、`paid-price.cjs` 通過；工作台 gate 通過，最後整合後重跑。
- NA `npx tsc --noEmit` 通過；finalize 8＋quick-render route 7，共 15 測試通過。正式 ownership 條件維持原樣，沒有新增需要突變的擁有權守衛。
- 本機 Linux 隔離容器 `codex-video-unify-test:20261117`：`python -m unittest discover -s tests -p test_bookends.py -v`，9 案全過（6.732 秒）。真 ffmpeg 驗證原配音主片長度、主片字幕從 0 開始／帶片頭版 2500ms、既有轉場及不帶片頭 concat。
- `git diff --check` 通過；自審逐處核對 metadata、任務快取、原時間軸、字幕時間、主片來源權利與版本過期後重接路徑。

ORACLE_WAIVED：Claude weekly limit 的 critic quota block 仍有效，僅有自審及實執行證據，未宣稱跨模型審查通過。未部署、未正式登入瀏覽器驗收；維持 DEPLOY_HOLD，部署步驟同步更新 bookend_main 健康檢查。依接手文件不改共享 WORKLOG／TASKS。
