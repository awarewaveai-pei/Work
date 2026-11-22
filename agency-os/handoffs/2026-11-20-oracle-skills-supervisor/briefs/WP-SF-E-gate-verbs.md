# SF-E 閘門新動詞（後台對主機的固定動作）

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0（I1–I6）、§1-3 全節、§3 的 SF-E 列（`:134`）。整檔讀：`INFRA/scripts/aw-hosting-gate.sh`、`INFRA/scripts/templates/client-wp/render.sh`（`:20-52` 是你必須遵守的 caller contract）、`INFRA/scripts/safe-infra-patch.sh`、`INFRA/scripts/deprovision-site.sh`、`NA/lib/site-flow/gate-client.ts`（已在 main，定義了它期待你輸出的格式）。`INFRA`＝`lobster-factory/infra/hetzner-phase1-core`，`NA`＝其下 `apps/next-admin`。模型 Opus 5.5（完成後 `critic` Deep）。

## 目的
後台只能請主機做幾個固定動作，不能送指令內容。不變量：經閘門進來的任何輸入都不會變成被執行的程式碼或任意路徑；容器名、埠、volume、檔案路徑一律由 slug 經 `render.sh` 的函式算出或讀登記檔，不從參數帶入。

## 已知事實（第一批定下的）
- `safe-infra-patch.sh` 有 `compose-new <file> <service>`、`host-nginx-new <file> <vhost>`（main `5a1dae31d`）。同名 project 有殘留 volume 時 `compose-new` 拒絕，除非 `SAFE_PATCH_REUSE_VOLUMES=1`。它自己沒有互斥鎖。
- `render.sh`（main `380b3cec1`）：範本渲染、登記檔格式（`/etc/awarewave/sites.d/<slug>.json`）、鎖檔與埠鎖的位置、映像名、caller contract 1–5 與 3b。`deprovision-site.sh` 用同一把 slug 鎖。
- `gate-client.ts`（main `8fba2dcb7`）：動詞名稱、參數、輸出契約（最後一行 JSON、exit 126＝不允許）。兩邊不一致時以 SITE-FLOW §1-3 為準，並在 RISKS 列出要改 `gate-client.ts` 的地方（不要自己改 NA 的程式，測試檔除外）。
- 開關：`/etc/default/aw-hosting-gate.local` 內 `AW_SITE_VERBS=on` 才允許新動詞，否則 126；既有 `staging-*` 動詞行為不變。

## 要做
照 SITE-FLOW `:134` 與 §1-3，一項不少。另外，`render.sh` caller contract 的每一條都要落在這張卡：
1. 鎖：`site-create`、`site-vhost` 整段持有 slug 鎖；選埠另持埠鎖直到登記檔寫完。
2. 映像：`compose-new` 之前，映像不存在就先建。
3. `.env` 只在不存在時建立；volume 還在時絕不重產。
4. wp-cron-runner：`compose-new` 之前 touch `paused.<slug>-wp`，`site-wp install` 成功後才移除；中途失敗的處理要寫清楚（留著暫停旗標，不讓整台主機的心跳中斷）。
5. volume 四種情形照 contract 4 判斷：全新 → `compose-new`；失敗殘留 → 帶 `SAFE_PATCH_REUSE_VOLUMES=1` 重試；有 `DEPROVISIONED` 標記 → 拒絕並說明兩條出路；其他 → 拒絕。
6. 登記檔原子寫入；`vhost_file` 只在這個站的 `host-nginx-new` 成功後才寫（SF-D 的 C1）。
7. 長動作用 `systemd-run` 背景執行並回 job id；`site-job <id>` 讀狀態。job 狀態檔不含密碼與金鑰。
8. `site-wp` 只收固定子動詞與白名單參數；管理員密碼由主機產生、只回給呼叫端一次，不寫入任何 log、job 檔、登記檔。
9. 訪客真實位址：客戶站 vhost 目前靠 soulful 的檔（`lobster-factory/infra/soulful/nginx/soulful-security.conf:28` 的 `real_ip_header`）才拿得到真實位址。把這段設定搬成平台自己的一份（主機 nginx 的共用設定，經 `safe-infra-patch.sh` 建立，soulful 的檔改成引用它或保持不變但不再是唯一來源），讓新站不依賴 soulful 存在。做法寫進回報；若會動到 soulful 現行設定的行為，停下回報，不自己改。

## 檔案
改：`INFRA/scripts/aw-hosting-gate.sh`；`NA/lib/hosting/__tests__/hosting-gate-contract.test.ts`（擴充）。新：`INFRA/tests/host-scripts/` 下本卡的測試。可改 `render.sh` 的註解與輔助函式（不改既有函式的輸出）；不改 `safe-infra-patch.sh`、`deprovision-site.sh` 的行為（要改先回報）。

## 驗收
- SITE-FLOW `:134` 點名的每一條都有測試：`--check` 每個動詞 ALLOW；畸形輸入 DENY（tab、雙空白、超長網域、`..`、大寫）；開關檔缺 → 126；`site-wp` 未知子動詞與任何 stdin 腳本 DENY；容器名只取自登記檔；job 狀態可讀。
- 加：volume 四種情形各一個測試；`paused.<slug>-wp` 在失敗路徑上仍存在；`vhost_file` 在 `host-nginx-new` 失敗時維持 null；兩個 `site-create` 同時跑同一個 slug 只有一個進得去；密碼不出現在 log 與 job 檔（grep 驗）。
- 既有 `staging-*` 動詞：既有測試全部原樣通過。
- 突變兩次：拿掉開關檔檢查、拿掉 `site-wp` 子動詞白名單 → 指名測試變紅 → 還原變綠。
- `bash -n`；`npx vitest run lib/hosting`＋結構檢查 `npx vitest run lib/portal lib/system-modes`；`npx tsc --noEmit`。
- `critic` Deep 的範圍包含 `render.sh` 與 `deprovision-site.sh`（SF-D 修完 Critical 後沒有再審第二輪，這次一起補）。

## 邊界
不連主機、不開開關檔、不 push。主機腳本一併入 main 就會同步到主機，所以開關檔缺時必須 126，這是本卡的安全底線。
