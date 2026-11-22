# SF-E2 主機腳本加固（第二批 RISKS 的主機項，一次修完）

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0、§1-3。整檔讀：`INFRA/scripts/aw-hosting-gate.sh`、`INFRA/scripts/templates/client-wp/render.sh`、`INFRA/scripts/deprovision-site.sh`、`lobster-factory/infra/ks-aw-01-backup/backup-ks-aw-01.sh`、同目錄 `verify-backup-ks-aw-01.sh`、`INFRA/scripts/backup-coverage-check.py`。`INFRA`＝`lobster-factory/infra/hetzner-phase1-core`。模型 Opus 5.5（完成後 `critic` Deep）。

每一項＝一個不變量加一個測試。既有測試（`hosting-gate.test.sh`、`hosting-gate-site.test.sh`、`client-wp-template.test.sh`、`backup-ks-aw-01-sites.test.sh`、`backup-coverage-check.test.py`、三支 `safe-infra-patch-*`）全部原樣通過。

| # | 問題（出處） | 不變量 |
|---|---|---|
| 1 | 鎖檔目錄 `/run/lock/awarewave-sites` 全體可寫（SF-E critic m4；定義在 `render.sh`） | 鎖與埠鎖只在 root 擁有、他人不可寫的目錄；目錄不合規時拒絕，不沿用 |
| 2 | `site-create <slug> <domain> product-gateway` 把新容器接上共用的 `lobster-net`，由呼叫端決定（m8） | 只有開關檔列出的 slug 才能用 `product-gateway`（鍵名自定，讀法同 `AW_SITE_VERBS`：只讀不 source）；不在清單就拒絕 |
| 3 | 網址占用檢查只掃 `sites-enabled`（m9） | 以 `nginx -T` 實際生效的 `server_name` 為準 |
| 4 | 自有外掛一律 `--force` 安裝，可被降版（m7） | 已裝版本不低於要裝的版本時不動；重跑為 no-op |
| 5 | SITE-FLOW §1-3「裝外掛前先 `wp db export`，失敗就還原」未做（m10） | `site-wp plugins` 之前有一份匯出；該步失敗時還原並回報；匯出檔放站台目錄、權限 0600、只留最近一份 |
| 6 | `site-wp` 各子動詞沒有持 slug 鎖（SF-G：逾時回收後新舊執行可能重疊） | 同一個 slug 的任何會改東西的動詞互斥；讀取型動詞不上鎖 |
| 7 | 客戶站 `.env`（資料庫密碼）沒進加密備份（SF-F critic #7） | 登記的每個站的 `.env` 與既有站一樣加密後進備份；密碼不出現在 log |
| 8 | WordPress 還沒裝好的站，每晚驗證報「低於最低門檻」（SF-F critic #4） | `paused.<slug>-wp` 存在的站，驗證與覆蓋檢查標「尚未安裝」，不算失敗；旗標移除後照常要求 |
| 9 | `deprovision-site.sh` 沒清掉 `render.sh` 的測試用路徑覆蓋，可能拿到不同的鎖（m5） | 正式執行時不接受測試用的路徑覆蓋（明確的測試開關才接受） |
| 10 | 拆站保留 volume 後，同網域被別的站接手，就無法再清掉那些 volume（m6） | 已封存登記檔加標記存在時，`--purge-volumes` 不因網域現況而被擋；仍只刪標有該 slug 的 volume |

## 邊界
本卡可以改上列腳本的行為（這張卡就是為此開的），但 `safe-infra-patch.sh` 不動。不連主機、不開開關檔、不 push。主機腳本併入 main 即同步到主機：開關檔缺時新動詞仍必須 126。備份三支不自動同步（見該目錄 README）。
交回時逐項對照上表 10 列。
