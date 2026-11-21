# 計畫對抗審查：WP-front-door-plan.md × SITE-FLOW-COMPLETION-PLAN.md（2026-11-21，critic，唯讀）

縮寫：`FD`＝`briefs/WP-front-door-plan.md`；`SF`＝`briefs/SITE-FLOW-COMPLETION-PLAN.md`；`NA/`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；`INFRA/`＝`lobster-factory/infra/hetzner-phase1-core/`；`MIG/`＝`lobster-factory/packages/db/migrations/`；`ENG/`＝`Projects/internal/ziwei-doushu/`。
範圍：兩份計畫全文、`SYSTEM-OPERABILITY-AUDIT.md`、`X1`、`B8`、`DISPATCH.md:90-146`；查證的程式與 ADR 標在各條。未連主機、未讀 `.env*`。

## §1 判定

- **FD：需修改後才可做。** 引擎與外掛部分（W1–W3、P1–P4、postMessage 協定）方向對。問題有三：檔頭「私人合盤」修訂沒有改寫正文；§3 開站 S1–S6 已被 SF 取代卻還留著；G-ADR 會重犯已撤回的 `products.ts` 錯誤。
- **SF：需修改後才可做。** 骨架對：閘門動詞白名單、safe-infra-patch 新建型、計畫雜湊＋確認、拆除路徑。問題有三：資料模型漏了既有的站台登記表（`wp_sites`、`seller_sites`）；oracle 上線順序會讓現有網站中斷，而且沒有時間上限；監控步驟依賴一個不存在的 API。
- 兩份都不必重寫，要改成「單一事實來源＋明確分工」（見 §3）。

## §2 發現

### Critical

- **C1 兩份計畫同時有效、內容互相矛盾，派工會照舊卡做錯事。**
  - 開站做法互相衝突：
    - SF `:3`、`:145` 說 S1–S6 已由 SF 取代。
    - FD 正文沒改：`:43` 先開 staging 再搬、`:45` 內部埠＋Host 標頭驗收後一次切換、`:101` WP 加入 lobster-net、`:172-177` S1–S6。
    - SF 的寫法正好相反：`:26` 直接在正式機建、先顯示建置中；`:203` 預設不加入 lobster-net。
    - `DISPATCH.md:142` 仍把「S1–S6、G-GAP」列為待派。
  - 私人合盤只改了檔頭：
    - FD `:4` 取消了邀請與遮蔽。
    - 正文仍是舊設計：`:42`（決定 6）、`:128-132`（嵌入票「好友資料不外流」）、W2 驗收 `:154`（「好友模式回應不含對方出生欄位」）、P2 `:162`（`friend_links`、`invite_hash`）、§4 `:218`。
    - W2 是要派給工人的卡，照卡做就會做出操作者已否決的功能。
  - 違反：零重工、不產生矛盾、完整閉環。
  - 修法：
    - 照 §3 合併。
    - FD 正文刪掉 S1–S6、G1–G4，改成一行指向 SF。
    - 決定 6、嵌入票、W2、P2、§4-4 照私人合盤重寫（見 M11）。
    - `DISPATCH.md` 的待派清單同步更新。

- **C2 一個網站已經分散在 8 份以上的登記表；兩份計畫又各自新增，總共多 3 份，而且彼此沒有對應。**
  - 已有的登記表：
    - `wp_sites`：記錄每個站屬於哪個組織。
      - `NA/lib/payments/woo.ts:53-74` 的 `bridgeSiteOrg` 用它判斷 bridge 能不能寫入。
      - `provision-staging/route.ts:211-214` 明寫「租戶歸屬走 `wp_sites.organization_id`」。
      - 內容工具、會員電子報、排程也讀它（`lib/crm/member-newsletter.ts`、`lib/schedules/jobs.ts`）。
    - `seller_sites`：站台金鑰登記表。每站一列，有 Ed25519 公鑰、所屬組織、狀態，不同用途用不同金鑰（`MIG/0133_seller_sites.sql:1-30`、`NA/lib/payments/sites.ts:1-14`）。
    - 其他：`client_config.site_url/staging_url`、`sites.primary_domain`、`WPBRIDGE_SITE_n` 環境變數、`ENVIRONMENT_REGISTRY.md`、`backup-inventory.json`。
  - 兩份計畫新增的：
    - SF：`environments` 表與主機的 `sites.d/<slug>.json`（SF `:64-67`）。
    - FD／W1：`ORACLE_SITES` 環境變數 JSON（FD `:111`，已實作在 `ENG/lib/sites/registry.ts:4`）。
  - 後果一：頁面建出來的站等於沒接上系統。
    - SF `:171` 明說「本計畫不新增 `wp_sites` 寫入」。
    - 照 `woo.ts:69-73`，沒有 `wp_sites` 列的站只能走全域模式，內容工具也選不到它。
  - 後果二：操作者無法從頁面「接入客戶」。
    - 每接一個客戶站，都要上主機改含密鑰的 `.env.production`，再重啟容器（`ENG/deploy/DEPLOY.md:51-55`：「輪替金鑰＝改該筆後重啟容器」）。
    - 這違反 ADR 005 §4（`005-…:16`：WP 與系統紀錄的對應要放在 Supabase 可稽核的欄位）。
    - FD `:74` 自己也承認之後要「搬進控制面」，等於事先排好的重工。
  - 修法：
    - SF §1-4 加一張「站台身分對照表」，每個事實只歸一處：
      - `environments`：網址、主機類型、容器。
      - `wp_sites`：組織歸屬，建站步驟一定要寫入。
      - 站台公鑰：沿用 `seller_sites` 的形狀。可以泛化成通用的「站台金鑰」表、每種用途一欄，或加一種 `purpose=oracle`。
    - 引擎改從「簽章的站台清單端點」讀，或在建置時注入，不再手改 `.env`。流程頁加一步「登記算命外掛金鑰」。
    - `sites.d` 只當主機端快取，由 `site-preflight` 比對。

- **C3 照目前的上線順序，現有算命站會中斷而且沒有時間上限；正式開放前也不檢查工具能不能用。**
  - 開放前不檢查工具：SF-N（`SF:142`）只依賴 SF-L、SF-M。它沒有依賴 W2 已部署，也沒要求 P1–P3 在真的 WP 上可用。
  - 會中斷：
    - SF-M（`SF:141`）先把 `oracle` 從引擎移除。
    - 接著第 5 步掛網址、顯示維護頁，操作者慢慢建頁面，到第 10 步才開放（`SF:114-117`）。
    - 這整段期間，現有使用者只看得到維護頁。
  - 前提不成立：SF `:26` 假設「新網域沒人來」。oracle 現在就有網站在服務，所以不成立；長期的主要情境「客戶用原來的網站」也不成立。
  - 漏了憑證：
    - SF-M 只照 FD §1-1b 的 ①②④⑥ 做（`SF:141`），**沒有 ③ 憑證**。
    - 規定的 Cloudflare 模式是 Full (strict)（`runbooks/CLOUDFLARE-WAF-SETUP.md:11`）。只要現有憑證沒涵蓋 `oracle-engine`，TLS 就會失敗。
  - 違反：最小爆炸半徑、可回滾、完整閉環。FD `:45` 原本「不設長並行期、一次切換」的好處被 SF 拿掉了。
  - 修法：
    - 流程加一個一般性的「預覽網址」步驟，不是 oracle 特例，每個要搬家的客戶都用得到：
      - `<slug>-preview.aware-wave.com` 由同一個 vhost 服務。
      - wp-config 只允許這兩個 host。
      - 預覽網址一律 noindex，並加 Basic Auth。
    - oracle 在預覽網址把頁面與外掛設好。確認 W2 嵌入與 P3 訂閱都能用之後，SF-M、第 5 步、第 10 步一次連續做完。
    - SF-N 驗收加「WP 頁內的 iframe 可用」（FD `:176` 原本就有這項）。
    - SF-M 補上 ③。

### Major

- **M1 catalog 開關可能被系統自己打開；執行紀錄寫入失敗時仍繼續執行，與 I1、I6 矛盾。**
  - 會自己打開：action_key 沒有 catalog 列時，`NA/lib/ops-actions/record.ts:7-9,38-58` 會自動 upsert 一列 `enabled: true`。
  - 寫入失敗仍繼續：`:34-36`、`:69-72` 寫入失敗只回 `null`，主機動作照做。
  - 與設計的衝突：
    - SF I6（`:16`）要求 catalog 與開關檔都打開才生效。但 migration 沒套用或列被刪掉時，catalog 會被自動補成開。
    - SF I1（`:11`）說頁面狀態由 `ops_action_runs` 最後一筆推出。紀錄寫失敗時，頁面狀態就和主機實況不一致。
  - 「沿用既有慣例」不成立：既有的修復引擎根本不讀 `catalog.enabled`（`NA/lib/repair-center/remediations/engine.ts:91-93` 只看 `AUTO_REMEDIATE_ENABLED`）。SF `:12` 說沿用，但 I6 其實是第三種開關寫法。
  - 修法：
    - SF-G 不走 `beginOpsActionRun` 的自動補列。
    - `site.*` 沒有 catalog 列就拒絕；紀錄寫不進去就不執行。主機動作一律 fail-closed（失敗就不做）。
    - I6 寫清楚兩個開關各管什麼：
      - 主機開關檔是總閘，因為主機腳本一推上 main 就會同步到主機（`INFRA/scripts/sync-host-scripts.sh:3-6`）。
      - catalog 用來逐步驟開放。
    - 改 `/etc/default/aw-hosting-gate.local` 時，照 CLAUDE.md「VPS drop-in 並行」做 mtime 檢查。

- **M2 第 8 步「加入監控」依賴一個 Uptime Kuma 沒提供的 REST API。**
  - SF `:55` 用的是 `registerUptimeKumaMonitor`（`lobster-factory/packages/workflows/src/integrations/integration-steps.ts:97-123`，呼叫 `POST /api/v1/monitor`）。
  - 同一個 repo 的 `packages/workflows/src/lib/tenant-provisioning/providers/uptimeKuma.ts:5-7` 寫明：「Uptime Kuma does not ship a first-party REST create monitor API…monitors via UI or a socket.io sidecar」。
  - Uptime Kuma 官方 Internal API 文件也只列出 push、badge、metrics、status page 這幾種 REST。
  - 修法：本輪把監控改成第 9 步的手動勾選項，或另開一張卡做 socket.io 側車。先到主機確認 Uptime Kuma 版本（見 §4）。

- **M3 G-ADR 要「現在就用 `new-product.mjs` 登記 oracle、migration 以後再做」，這正是之前已撤回的錯。**
  - 證據：
    - FD `:73-74`、`:190`。
    - 撤回 commit `f41ca1bbe` 的說明。
    - `NA/lib/entitlements/__tests__/expiry.test.ts:171-175` 要求每個登記的產品都必須出現在 0110 的三個 CHECK 清單裡。
    - `DISPATCH.md:96`。
  - 修法：G-ADR 只改 ADR 文字，不動 `products.ts`。登記產品與 0110 migration 一起放到帳號／計量那張卡。

- **M4 搜尋曝光：照 FD 的設定，引擎內容完全不會被搜尋引擎收錄，連不屬於個人的公開內容也一樣。**
  - 證據：
    - W3（`FD:155`）讓引擎的 `robots.txt` 全擋。robots.txt 擋掉的網址，搜尋引擎連抓都抓不到。
    - W2（`FD:154`）在嵌入頁加 `noindex`。依 Google 官方說明（Search Central 2022-01），要搭配 `indexifembedded`，iframe 內容才會算進父頁。
    - FD `:53` 只說「工具結果本來就是個人化的」。但黃曆和每日運勢（`ENG/app/[lang]/daily/page.tsx`）、塔羅牌義、易經卦辭這類公開內容，正是全球搜尋量所在，計畫對這部分沒有論證。
  - 修法：
    - 嵌入頁改送 `noindex, indexifembedded`。
    - robots.txt 只擋 `/api/`，不擋 `/embed/`。
    - 公開參考內容（每日黃曆、64 卦、78 張牌義）改由 WP 頁面本體在伺服器端輸出：外掛向引擎取 JSON，寫成 WP 內容或快取。
    - 每頁的介紹文與 FAQ 列入 S3 對應步驟的驗收。

- **M5 `site-wp` 允許執行任意 bash／wp eval。套到正式客戶站後，只要 next-admin 的一把金鑰外洩，就能讀走所有站的會員出生資料。**
  - 證據：
    - 既有的 `INFRA/scripts/aw-hosting-gate.sh:13-15` 已經註明「www-data code…wp-cli eval = PHP anyway」，但那只用在 staging。
    - SF `:50`、`:56` 把同樣的 stdin 腳本延伸到正式站。
    - SF `:162` 的風險表只寫「可建站、改 vhost」，沒寫「可讀所有客戶 WP 的資料庫」。
    - FD `:17`、`:40` 卻把「個資留在網站」當成隱私賣點，兩邊矛盾。
  - 修法：正式站的 `site-wp` 改成固定的子動詞（`install`、`open`、`close`、`set-mainwp-id`、`put-bridge-pubkey`），參數走白名單，腳本內建在主機端，不再收任意 stdin 腳本。

- **M6 個資的實際存放與外洩途徑沒有寫：出生資料是明文、有兩份異地備份，金鑰也跟著一起備份。**
  - 證據：
    - FD P2、P3 的資料表（`:162-163`）沒有靜態加密。
    - 主機備份只加密 `.env`（`lobster-factory/infra/ks-aw-01-backup/backup-ks-aw-01.sh:3,29`）。資料庫 dump 是明文 gzip（`:98`），傳到 R2。
    - WPvivid 另把遠端備份放到 Google Drive（`agency-os/TASKS.md:221`）。
    - 外掛私鑰與假名鹽存在 `wp_options`（`lobster-factory/packages/oracle-wp-plugin/includes/Settings/Options.php:5-6`），會一起進備份。
    - 刪除權只處理線上資料表（FD `:162`），備份要保存多久沒寫。
    - `/api/interpret` 會把命盤內容送到 OpenAI，但 `CROSS_BORDER_GOVERNANCE`（FD `:172`）沒有把 OpenAI 列為次處理者。
  - 修法：
    - 出生欄位用 libsodium secretbox 加密，金鑰放 wp-config 常數，不進資料庫。
    - 備份檔加密，或寫明保存期限。
    - 隱私說明列出次處理者（OpenAI、寄信服務）。
    - P2、P3 驗收加一項：「資料庫 dump 裡查不到明文出生日期」。

- **M7 寄信供應商與寄件網域：FD 建議另開 SES 或 Brevo，卻沒提平台現有的 Resend。**
  - 證據：
    - FD `:216`、`:177`。
    - 平台現在寄信用 Resend，寄件人 `noreply@aware-wave.com`（`agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md:127`）。
    - `WP_CLIENT_PLUGIN_STACK.md:221-227` 的供應商表也沒有 Resend。
  - 多一家供應商，就多一套 DKIM、退信回報和帳單。
  - 修法：§4-2 把 Resend 列為第一選項，比較費用（以 NT$ 計）和 FluentCRM 的退信回報支援。寄件網域定案後寫進 S6 驗收。

- **M8 FluentCRM 的關鍵行為還沒查證，卻已經是整個寄信設計的主幹；而且違反 ADR 017 的「CRM 接頭」規定。**
  - 未查證的部分：
    - FD `:245-248` 自己列出三項待查：Tag Applied 能否對同一人重複觸發、用 PHP 觸發雙重確認的方法、smartcode 在什麼時間點計算。
    - FD `:41`、`:108` 的整條流程（貼標籤 → 觸發自動化 → smartcode 讀佇列 → 移除標籤）全靠這三項成立。
    - 官方文件只在 List Applied 下說明可重複觸發（`docs.fluentcrm.com/fluentcrm-automation-triggers`），Tag Applied 沒寫。
  - 違反 ADR 017：
    - ADR 017 §0b-5、§0b-6（`017-…:52-53`）要求 CRM 是可切換的設定值（`crm: fluentcrm | none`），核心程式不直接 import Fluent。
    - FD 的 ADR 修訂表（`:65-69`）只改 §0b-1 和 §0b-6，沒提 §0b-5。
    - 外掛預設要能裝在「任一客戶 WP」（FD `:5`、`:16`），但客戶沒裝 FluentCRM Pro 時每日信怎麼辦，計畫沒寫；Pro 的授權費也沒列。
  - 修法：
    - P3 開工前，先在拋棄式 WP 上實測上述三項（見 §4）。
    - 外掛的寄信層做成接頭，值為 `fluentcrm` 或 `none`；`none` 時不顯示訂閱區塊。
    - 把授權費列進 §4。

- **M9 每日信需要主機 cron，但建站範本沒有建 cron。**
  - 證據：
    - FD `:106` 寫「主機 cron 觸發 wp cron，不靠訪客流量」。
    - SF-D 範本（`SF:130`）與第 3 步（`SF:50`）都沒有 `DISABLE_WP_CRON`，也沒有主機 cron。
    - FluentCRM 寄信和 WPvivid 排程也要靠同一個 cron。
    - 客戶自己的主機（G5）無法由我們裝 cron。
  - 修法：
    - SF-D 範本加「每站每 1 分鐘執行 `wp cron event run --due-now`」。由主機登記檔產生，拆站時一起移除。
    - 外掛後台顯示「cron 最後執行時間」，超過 2 小時沒跑就警示。

- **M10 舊頁退場：「加橫幅、下一輪再刪」就是操作者禁止的兩套並存，而且要清的地方沒列全。**
  - 證據：
    - SF `:27`。
    - `/build` 的入口除了 SF 列的，還有 `NA/app/sidebar-sections.ts:43`、`NA/app/(shell)/ops-console/page.tsx:131`、`ClientHubTabs.tsx:664`。SF §1-5（`:74-85`）只列了 `page.tsx:57-59` 和 `repairs/page.tsx`。
    - 退場工作沒有卡片編號。
  - 修法：本輪加一張卡 SF-P：
    - 部門選型與外部服務搬進客戶頁的分頁。
    - `/onboard`、`/build` 頁面刪除，改成 308 轉到新流程；API 留給測試用。
    - 驗收：`grep` 確認全站沒有 `href="/build"`。
    - 不再留「下一輪」。

- **M11 改成私人合盤後，「AES 加密嵌入票＋伺服器解票遮蔽」已經是多餘的設計。**
  - 嵌入票的主要理由是「對方的資料不進邀請者的瀏覽器」（FD `:42`、`:128`）。
  - 私人合盤的對方資料本來就是使用者自己輸入的（FD `:4`），這個理由已不存在。
  - 剩下的用途只有兩個：預填使用者自己的命盤（本來就是他的資料），以及按會員限制 AI 用量。
  - 修法：
    - W2 改成「站台簽章的短效身分票」，內容只有假名、到期時間、key_id，只用來算 AI 額度。
    - 命盤預填改由 `oracle:init` 訊息帶入。
    - 刪掉 `embed-tickets` 的加密，以及 `embed/resolve` 的遮蔽邏輯。
    - 驗收改成「偽造或過期的票拿不到 AI 額度」。

- **M12 擴充共用憑證的 SAN 會影響所有產品；新子網域要憑證這件事應該一次解決整類問題。**
  - 證據：
    - `INFRA/nginx/system-sites/sg-stack.aware-wave.com.conf:30-31`：15 個主機名共用 `live/aware-wave.com` 這一張憑證。
    - 之前查過，它不是萬用字元憑證（`agency-os/docs/operations/PORTAL_AWARE_WAVE_DESIGN_PROPOSAL.md:141`）。
    - FD `:37` ③、SF `:168`、`:187` 都打算「手動擴 SAN／手動簽一次」。每次 `--expand` 都會動到全部產品的 TLS。
  - 修法：
    - 先查現況（§4-1）。
    - 如果 Cloudflare 是 Full (strict)：`*.aware-wave.com` 改用 Cloudflare Origin CA 萬用憑證，以後新增子網域都不用再簽；或者每個新站用自己的 `--cert-name` 單獨簽。
    - 客戶自己的網域照 ADR 018 §2（`018-…:31`）走 Cloudflare for SaaS，列為「之後」的卡。

### Minor

- **m1 行號漂移。**
  - 備份腳本：FD `:195` 寫 `:94-123`，SF `:52` 寫 `:92-121`。
  - 實際位置：soulful 在 `backup-ks-aw-01.sh:93-121`，chatwoot 在 `:124-147`。
  - 卡片照抄會錯位，請重新抽驗。
- **m2 拿 repo 裡的對照檔當正式環境的證據。**
  - SF `:48`、`:55` 用 repo 的 `docker-compose.yml:476,483-484` 證明「已在 next-admin」。
  - AGENTS §0 規定唯一可信的驗證是 `docker exec next-admin printenv`。
  - `CLOUDFLARE_API_TOKEN` 的權限 SF 也自列為未知（`:217`）。已列入 §4。
- **m3 每日信的寄送時間定義不完整。**
  - FD `:163` 的測試沒有半小時或 45 分的時區（例如 Asia/Kolkata、Asia/Kathmandu）。
  - 每小時整點掃描時，「到了 07:00」要定義成「當地時間 ≥ 07:00，且今天還沒寄」。
  - cron 停了幾小時後是補寄還是跳過，也要寫明。
- **m4 WP 管理員密碼不需要存進 Vault。**
  - SF `:50`、`:65`、`:112`：wp-cli 經閘門執行，不需要密碼。
  - 存著反而等於 next-admin 能登入每個客戶站的後台。
  - 改成只顯示一次；忘記就經閘門重設。
- **m5 staging 子目錄轉接只為測試而存在，是多出來的第二條程式路徑。**
  - 見 SF `:92`、`:133`。SF-L 已經涵蓋全流程。
  - 建議刪掉，或寫明保留到哪一天。
- **m6 把 MainWP 金鑰放進 next-admin，會讓更多地方持有它。**
  - 見 SF-I0（`SF:135`）。金鑰已經在 Trigger 工人端（`integration-steps.ts:60-65`）。
  - 改成派一個 Trigger 工作來做就好，也符合現行「Trigger＝worker」的分工。
  - 至少把這個替代方案寫進 §4-3，讓操作者選。
- **m7 iframe 在手機上的體驗沒處理。**
  - 協定（FD `:117-124`）沒有 `oracle:scroll` 訊息：結果出現在 iframe 下方時，父頁不會自動捲過去。
  - iframe 高度自動撐開後，iframe 內 `position:fixed` 的浮層（城市搜尋結果、放大的牌圖）會跑到畫面外。
  - W2 的 Playwright 測試要加手機尺寸下的這兩項。
- **m8 私人合盤的法律依據沒寫。**
  - FD `:4`：合盤對象的出生資料屬於第三人的個資。
  - 隱私說明要寫清楚處理依據與刪除方式，`CROSS_BORDER_GOVERNANCE` 也要列入。
- **m9 每站每日的 AI 上限還沒實作。**
  - FD `:46`、`:133` 說「每站每日上限寫在登記表」。
  - W1 實作的登記表只有 `requests_per_minute`（`ENG/lib/sites/registry.ts:19-27`），沒有成本上限。
  - W2 要補這個欄位。
- **m10 引擎改名會讓已公告的 MCP 與 API 網址失效。**
  - `ENG/deploy/DEPLOY.md:39` 公告了 `https://oracle.aware-wave.com/api/mcp`，請使用者填進 Claude、ChatGPT。
  - SF-M、W3 都沒處理這件事。
  - 目前還沒部署：X1、X2 第一次部署前，先把公告網址改成 `oracle-engine`，就不必等公開後再改。
- **m11 子網域的意思與 ADR 018 不一致。**
  - FD `:73` 用 `subdomain: "oracle-engine"` 登記。
  - ADR 018 §2 的 `subdomain` 指的是「產品門」（`018-…:29`），而引擎不是門。
  - 修訂 ADR 時要寫明嵌入件的子網域代表什麼。
- **m12 B8 的未來卡與嵌入方式衝突。**
  - `B8:47` T5 打算「先存在瀏覽器本機」。
  - 嵌入後，iframe 的 localStorage 會依頂層網站分開存，Safari ITP 也可能把它清掉。
  - 改成經由父頁存到 WP 會員資料。
- **m13 「客戶組織＋自用 0 元」這個組合需要確認。**
  - FD `:27` 用的組合是 `kind=customer`＋`comp`，不在 ADR 017 的五種方式表裡（`017-…:30-36`）。
  - 要確認新建的 customer 組織不會自動長出 trial 或 contract，也不會被算進收款報表（見 §4-7）。

### 監工疑慮逐條結論

| # | 結論 |
|---|---|
| 1 重複、矛盾 | **成立**。見 C1、C2；合併建議見 §3。 |
| 2 憑證與 DNS 不做成按鈕 | **大致多慮**。oracle 的 DNS 記錄已經存在，現有憑證也曾涵蓋 oracle（`PORTAL_…:141`），操作者這次練習不會卡在這兩件事。真正的問題是 SF-M 漏了 `oracle-engine` 的憑證（C3），以及應該用萬用 Origin 憑證一次解決（M12）。客戶網域延到之後是合理的範圍切割。 |
| 3 舊頁加橫幅 | **成立**。見 M10。 |
| 4 iframe 與搜尋曝光 | **成立**。見 M4。X-Frame-Options 已處理（FD `:37` ④）；不用 cookie，沒問題；高度已處理；捲動與浮層沒處理（m7）。 |
| 5 個資 | **成立**。見 M5、M6、m8。 |
| 6 FluentCRM 每小時掃描 | **部分成立**。同一人同一天只寄一次的唯一鍵有了，也打算用主機 cron。但 cron 實際沒建（M9），FluentCRM 的行為沒查證（M8），半小時時區沒處理（m3）。規模本身不是問題：每次批次 200 筆、每小時跑一次。 |
| 7 兩把開關 | **主機開關檔有必要**，因為主機腳本不受 DEPLOY_HOLD 管。真正的漏洞是 catalog 會被自動補成「開」（M1）。 |
| 8 `environments` 表 | **表本身的欄位適用**（`MIG/0001_core.sql:134-151`）。RLS 在 `0004:41,67`、`0136:50-53`，寫入只限 service role。問題在於它和 `wp_sites`、`seller_sites`、`client_config` 重複記錄同一件事（C2）；`sites.primary_domain` 也和 `environments.base_url` 重複。 |
| 9 直接建在正式機、先顯示建置中 | 容器之間有隔離，這部分安全。**但現有網站會中斷，而且沒有時間上限**，見 C3。 |
| 10 會推翻設計的待查項 | 見 §4 前四項。 |
| 11 有沒有更簡單的路線 | 見 §3「順序」。把產品上線（W、P 卡）和平台補完（SF 卡）拆開，用「預覽網址」讓兩條線互不卡。SF-I 的 bridge 自動化與監控可以先改成手動勾選，縮小這一輪的範圍。 |
| 12 ADR | 015、017 §0b-1 與 §0b-6、018 §1 與 `:70` 都有點名並附修訂。**沒點名的**：017 §0b-5 CRM 接頭（M8）、005 §4 對應關係要放 Supabase（C2）、018 §2 子網域的意思（m11）。另外 G-ADR 會違反已撤回的決定（M3）。 |

## §3 合併成單一事實來源的建議結構

- **分工：一件事只寫在一份文件**
  - `WP-front-door-plan.md` 改名為「算命產品規格」，只寫引擎、外掛、協定與 ADR 修訂。
  - `SITE-FLOW-COMPLETION-PLAN.md` 是「客戶建站平台」，只寫 next-admin 與主機。
  - 新增一節「oracle 上線」，放在 SF §2 之後，是唯一寫 oracle 切換順序的地方。
  - `DISPATCH.md` 只放指向這兩份文件的連結。
- **FD 保留**：
  - §0 框架。
  - §1 決定 1–5、7a、9（依 M7、M8 修正）。
  - 嵌入方式比較（依 M4 修正）。
  - §2 架構圖：刪掉 `:101` 的 lobster-net，改成「依 SF 範本」。
  - postMessage 協定：加 `oracle:scroll`。
  - W1–W3、P1–P4、§5 查證紀錄。
- **FD 刪除或改寫**：
  - 決定 6、P2、嵌入票、§4-4：依私人合盤重寫（M11）。
  - 決定 7、8 與 §3「開站」S1–S6：刪掉，改一行指向 SF。
  - G-GAP：G1–G4、G6 已被 SF 吸收，刪掉；G5、G7、G8 移到 SF 的「之後」清單。
  - G-ADR：拿掉 `products.ts` 登記（M3）。
- **SF 補上**：
  - §1-4 站台身分對照表（C2），並加「登記算命外掛金鑰」步驟。
  - 預覽網址步驟（C3）。
  - 主機 cron（M9）。
  - 正式站的固定子動詞（M5）。
  - 寫不進紀錄就不執行（M1）。
  - 監控改成手動勾選（M2）。
  - SF-P 舊頁退場（M10）。
- **卡片重編**：
  - 產品線：`W1`（已併入）、`W2'`（瘦身版）、`W3`、`P1`（已併入，還沒過 critic、沒在真 WP 安裝過）、`P2'`、`P3`、`P4`、`ADR`。
  - 平台線：`SF-A`～`SF-L`、`SF-O`，新增 `SF-P`（舊頁退場）、`SF-Q`（站台金鑰登記＋寫入 `wp_sites`）、`SF-R`（預覽網址）。
  - 上線：
    - `GO-1`：SF-M 的 ①②③④⑥（補上 ③）。依賴 W1–W3 已部署。
    - `GO-2`：在預覽網址建好內容，驗收嵌入與訂閱。依賴 P1–P3 與 SF 全部完成。
    - `GO-3`：掛網址並正式開放，取代原本的 SF-N。依賴 GO-1、GO-2。
- **順序**：
  - SF 平台線與 W、P 產品線同時進行。
  - oracle 只在 GO-3 那一刻切換；在那之前，現有網站一直正常服務。
  - 操作者先在 SF-L 的拋棄式網域練習，再到 oracle 的預覽網址實際操作。

## §4 動工前必查（依「會不會推翻設計」排序）

1. **`aware-wave.com` 憑證涵蓋哪些網域，以及 Cloudflare 的 SSL 模式。**
   - 影響：決定 M12 怎麼做，也決定 SF-M ③ 怎麼做。
   - 查法：在主機執行 `openssl x509 -in /etc/letsencrypt/live/aware-wave.com/fullchain.pem -noout -ext subjectAltName`；用 Cloudflare API 唯讀查 `GET /zones/<id>/settings/ssl`。
2. **站台登記表要不要統一（C2）。**
   - 影響：決定 SF-B 的資料表設計，以及 W1 要不要改成讀控制面。
   - 查法：讀 `MIG/0133_seller_sites.sql` 全文、`NA/lib/content/wp-sites.ts`、`woo.ts:53-74`。由監工定案「站台金鑰表」的形狀後，再派 SF-B。
3. **FluentCRM Pro 的三項行為，以及選定寄信商的退信回報支援。**
   - 三項：Tag Applied 能否對同一人重複觸發、smartcode 在什麼時間點計算、能否用 PHP 觸發雙重確認。
   - 影響：決定 P3 整條寄信路徑。
   - 查法：在拋棄式 WP 上（docker，產物放 `$env:TEMP`）安裝 FluentCRM Pro。對同一聯絡人連續兩天貼標籤、再移除，看自動化紀錄與實際寄出的內容。
4. **Uptime Kuma 的版本，以及能不能用 API 建監控。**
   - 影響：決定第 8 步怎麼做。
   - 查法：執行 `docker exec uptime-kuma cat /app/package.json`，看 version 欄；再對 `/api/v1/monitor` 送一次請求，看是否回 404。
5. **現有 oracle 網站的實際流量。**
   - 影響：決定 C3 能接受中斷多久。
   - 查法：從 lobster-nginx 的 access log 篩出 oracle 的請求，統計近 30 天的不重複 IP；或查 PostHog。
6. **正式 next-admin 的環境變數與權限。**
   - 影響：決定第 1、6、8 步能不能自動化。
   - 查法：`docker exec next-admin printenv CLOUDFLARE_API_TOKEN UPTIME_KUMA_URL`（只確認有沒有值，不印內容）；用 Cloudflare `GET /user/tokens/verify` 查 token 權限。
7. **新建 `kind=customer` 組織時，會不會自動產生 trial、contract 或計費列（m13）。**
   - 查法：`grep -rn trial` 搜 `NA/lib/entitlements`、`MIG/0110*`、`MIG/0062*`，再追組織建立的程式路徑。
8. **主機上的容器連自己的公開網址，會不會因繞回同一台主機而變慢或逾時。**
   - 影響：決定 oracle 的 WP 要不要開 `same_host_products`。
   - 查法：GO-1 完成後，在任一容器內量 `https://oracle-engine.aware-wave.com/api/health` 的回應時間。

## §5 給操作者的話

- **做得好的地方**：兩份計畫都把「怎麼安全地動主機」想清楚了。每個動作都先給您看清單、您按確認才做；出錯會自動還原；建好的東西也都有拆除方法。
- **問題一**：兩份計畫有好幾處互相打架。您改成「私人合盤」之後，舊的好友邀請設計還留在要派出去的卡裡。不先合成一份，工程師會照舊卡做白工。
- **問題二**：照現在的順序，算命站會先關成「建置中」，等您慢慢把 WordPress 建好才重新開放，中間現有的使用者都用不了。建議加一個「預覽網址」：您在預覽網址裡練習、把站建好，確認算命工具都能用，再一次切換過去。
- **問題三**：系統裡本來就有記錄「哪個網站屬於哪個客戶」的地方，新計畫又另外開了幾個。以後接客戶網站時資料會對不上，要先統一。
- **結論**：不用重寫。把兩份文件合併整理，再補四、五張卡，就可以開工。

參考：[Google indexifembedded](https://developers.google.com/search/blog/2022/01/robots-meta-tag-indexifembedded)、[Google 2023-12 SEO office hours（iframe）](https://developers.google.com/search/help/office-hours/2023/december)、[FluentCRM 自動化觸發器](https://docs.fluentcrm.com/fluentcrm-automation-triggers)、[Uptime Kuma Internal API](https://github.com/louislam/uptime-kuma/wiki/Internal-API)
