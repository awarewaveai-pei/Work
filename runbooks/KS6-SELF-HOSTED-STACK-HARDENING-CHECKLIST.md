# KS-6 整併主機——各服務已知坑清單（安全 / 吃資源 / 跑不順）

> **用途**：新機要跑 Supabase、ClickHouse、Chatwoot、Trigger.dev、n8n、WordPress×10、MainWP、Postiz、Uptime Kuma。這份是**每個服務的已知坑**，來源為官方文件 + GitHub issue + 社群報告（2026-08-19 查證，逐項附來源），不是憑印象列的通用建議。
>
> **接線**：安裝計畫 P2/P3/P5/P7 各步驟對照此清單逐項確認；上線前跑一次全表。正本連結見 [`agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md)。

---

## 通用主機層（P2，跨所有服務，先做）

| 坑 | 後果 | 修法 |
|---|---|---|
| Docker port 繞過 UFW | 資料庫直接暴露公網（2026-04-20 挖礦事件根因）| 已在 P2.4/4b/4c 修（DOCKER-USER chain + 127.0.0.1 綁定 + 密碼全換）|
| **Redis `vm.overcommit_memory=0`**（host 層 kernel 設定，不是 Redis 設定）| 低記憶體時 background save 失敗，Redis 資料可能遺失。**影響 Chatwoot + n8n(queue mode) + Postiz 三個服務的 Redis** | `/etc/sysctl.conf` 加 `vm.overcommit_memory = 1`，`sysctl -p` 生效。裝機當下一次設定，全站共用 |
| **Transparent Huge Pages（THP）啟用** | Redis 延遲升高、記憶體用量異常 | `echo never > /sys/kernel/mm/transparent_hugepage/enabled`，寫進開機腳本（THP 每次重開機會重置）|
| Docker 日誌/映像/build cache 無限增長 | 可吃掉 20–50GB+ 且不會主動提醒，1TB 天花板下更致命 | 已有 log rotation（P2.7）；另加**每週 `docker system prune -af`**（不加 `--volumes`，避免誤刪暫停容器的真實資料）|
| 資料庫 volume 跟系統碟混在一起 | 任何一個服務資料暴增會拖垮整台機器 | P7.1 多站設計已規劃；Docker volume 預設路徑 `/var/lib/docker`，若時間允許可考慮獨立掛載點 |
| **Docker compose 用 `restart: on-failure`**（2026-08-19 新增）| 誤以為比較「保守」，實際上：主機正常關機時 daemon 會主動停掉容器（非錯誤退出）→ 重開機後 `on-failure` **不會**把它拉回來，服務停在那裡沒人發現 | 全部服務統一用 `restart: unless-stopped`（不是 `always`、不是 `on-failure`）| [oneuptime](https://oneuptime.com/blog/post/2026-01-16-docker-restart-policies/view) |
| **Docker image 用 `:latest` tag**（2026-08-19 新增）| registry 隨時可能推新版到 `latest`，下次 `docker compose pull` 就在不知情下換了版本，可能是破壞性更新，rollback 也對不上舊 tag 內容 | compose 檔全部**明確釘版本號**（例如 `postgres:16.4` 不是 `postgres:latest`）；升級是刻意動作，不是意外 | [Medium](https://medium.com/@tofaau/pin-your-docker-images-to-a-digest-to-avoid-surprise-breaks-6607eee649a6) |
| **NVMe 沒排 TRIM**（2026-08-19 新增）| 沒有定期 TRIM，SSD 內部回收機制不知道哪些區塊已刪除，寫入延遲數週內可能惡化 50–200% | 排 `fstrim.timer`（Ubuntu 內建，預設每週跑一次即可，不建議 `discard` mount option 持續 trim，效能衝擊更大）；驗 `systemctl status fstrim.timer` | [dev.to](https://dev.to/lyraalishaikh/stop-letting-ssd-performance-rot-practical-fstrimtimer-on-linux-3ido) |
| **Ubuntu 24.04 用 `ssh.socket` systemd socket activation，`sshd_config` 的 `Port` 指令完全不生效**（2026-08-26 KS-aw-01 實機踩到）| 照 P2.5 範本改 `Port` 後重啟 `ssh` service 顯示 active，`sshd -t` 也過，但實際只聽舊 port——**看起來改好了，其實沒改**，若沒有另開連線驗證會誤判硬化已完成 | `systemctl status ssh.socket` 若顯示 `Listen: 0.0.0.0:22`，改用 `systemctl edit ssh.socket` 寫 `/etc/systemd/system/ssh.socket.d/override.conf`：`[Socket]` 下先 `ListenStream=`（清空繼承值）再列新 port，`daemon-reload` + `restart ssh.socket`。**分兩階段**：先新舊 port 併聽、驗證新 port 能連、再拔掉舊 port，不要一步到位改完就重啟，避免鎖死自己 | 本檔案 §KS-aw-01 建置紀錄 |
| **DOCKER-USER chain 規則若用 `-I`（insert）疊加，最後一條會被推到最前面**（2026-08-26 KS-aw-01 實機踩到）| 依序 `-I ESTABLISHED` → `-I 443` → `-I 80` → `-I DROP` 四條，結果 DROP 變成第一條，後面的 ACCEPT 全部檢查不到——**規則看起來四條都在，`iptables -L` 顯示正常，但邏輯已失效，會擋掉所有 Docker 對外流量（含合法的 80/443）**，且空機階段（無容器發布 port）不會有任何症狀，要到真正部署服務才會爆炸性發現全擋 | 改用 `-A`（append）依「想要的判斷順序」由上到下依序加：ESTABLISHED/RELATED → 80 → 443 → DROP（DROP 必須最後一條）。加完立即 `iptables -L DOCKER-USER -v -n --line-numbers` 核對順序，不能只看規則存不存在 | 本檔案 §KS-aw-01 建置紀錄 |
| 🔴 **`apt-get install iptables-persistent` 會靜默移除 `ufw`（套件層級衝突，安裝過程零警告）**（**非新坑，`SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` §「UFW 與 iptables-persistent 不相容」＋`HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md:136` 早就寫過同一句話——2026-08-26 KS-aw-01 建置時重複踩到，根因是讀那兩份文件時只 grep 指令片段，沒讀到緊鄰的警告 prose，P2.8 rescue mode 驗證重開機後才發現）**| 裝機當下 `ufw status` 顯示 active、`ufw enable` 成功、`netfilter-persistent save` 也成功——**一路看起來全部正常**。實際發生的事：`apt install iptables-persistent` 的依賴解算把 `ufw` 標記為要移除並自動執行（`apt history.log` 精確記錄 `Install: iptables-persistent... Remove: ufw`），`ufw.service` 消失、`ufw-reject-input`/`ufw-after-input` 這兩條真正負責擋預設流量的鏈變空、`INPUT` chain policy 從 `DROP` 變回 `ACCEPT`。**空機階段（無服務監聽任何危險 port）用 TCP connect 測試量不出差異**——filtered（真的被擋）跟 closed（單純沒人聽）從外部探測結果幾乎一樣，必須靠重開機後檢查 `iptables -L INPUT -v -n` 的 **policy 欄位**（不是規則存不存在）才抓得到，這正是 P2.8「必須實際重開機驗證，不能只信裝機當下的狀態」存在的理由——這次是被自己親身證實 | **不要裝 `iptables-persistent`**。UFW 自己的 `ufw.service` 已經處理 INPUT 層規則的開機還原；`DOCKER-USER` chain（ufw 管不到的自訂鏈）改用獨立 systemd oneshot service（`After=docker.service`）在開機時重新下規則，兩條持久化路徑分開，不要用同一個套件通吃，避免此類衝突。發現後修法：`apt purge iptables-persistent netfilter-persistent` → 重裝 `ufw` → 重跑 `ufw` 規則 → 建 `docker-user-chain.service` → **再重開機一次**驗證兩者都撐過去（`INPUT policy DROP` 且有真實 drop 封包計數、`DOCKER-USER` 規則順序正確）| 本檔案 §KS-aw-01 建置紀錄 |
| **主網卡名稱不是範本寫的 `eth0`**（2026-08-26 KS-aw-01 實機踩到，OVH 常見 `enp1s0f0`/`ens3` 等 predictable network interface naming）| 若照抄範本用 `-i eth0` 下防火牆規則，介面不存在時 iptables 不會報錯（規則只是永遠不匹配），DOCKER-USER chain 規則形同虛設，看起來設定了實際零保護 | 下任何 `-i <interface>` 規則前先 `ip -brief addr show` 或 `ip route \| grep default` 確認真實網卡名稱，不要假設是 `eth0` | 本檔案 §KS-aw-01 建置紀錄 |

---

## 🔴 既有服務搬遷（非新裝）專屬坑（2026-08-19 新增）

> 上面所有節都是「在新機從零裝一個服務」的角度寫的。**SG 五個服務（next-admin/WordPress+DB/Node API/oracle-web/Redis）是「把已經在跑的東西搬過去」，性質不同**——舊設定、舊憑證、舊資料原封不動搬過來，反而會把舊機的問題一起帶過去。EU 六服務也適用（雖然那邊多數走 dump/restore 不是整個 volume 搬，風險略低，但同樣要過這節）。

| 坑 | 後果 | 修法 |
|---|---|---|
| **密碼/憑證原封不動搬過去** | 舊密碼如果早就外洩或太弱，搬機是唯一低成本的換密碼時機——不換等於把舊風險原樣帶到新機 | 每個服務搬遷時**評估是否可以順手轉一輪密碼**（DB 密碼、內部服務間的 API key）。**只轉你控制兩端的**（例如 WordPress↔MariaDB 之間的密碼）；**對外共用的憑證（第三方 API key、client 看得到的東西）先不要動**，避免搬遷當天同時處理「憑證失效」的額外變數 |
| **檔案權限在還原/rsync 後跑掉** | WordPress 最常見的搬機事故之一：擁有者變成 `root`，PHP-FPM 用 `www-data` 讀不到，直接 403/500 | 搬完立即 `chown -R www-data:www-data`（或對應的 docker 內部使用者）跑一次，不要假設 rsync/tar 會保留正確權限 |
| **設定檔裡寫死舊 IP / hostname** | nginx upstream、DB host、內部服務間呼叫如果寫的是舊機 IP（不是 service name 或環境變數），DNS 都切好了，內部呼叫還是打不通 | 搬遷前 `grep -r` 舊機 IP 找出所有寫死的地方，改成 docker network 內的 service name 或環境變數，不要在新機上複製舊機那份原封不動的設定 |
| **SSH known_hosts 沒更新** | 任何原本會 SSH 進舊機的腳本/cron（例如跨機備份、部署腳本），搬機後對到新 IP 會撞 `Host key verification failed` 卡住，且錯誤不會直接顯示成「服務壞了」，容易誤判 | 搬遷後盤點所有會 SSH 到這台機器的腳本（`grep -rl` repo 內的 IP），更新目標 IP + 讓對方機器的 `known_hosts` 接受新機指紋 |
| **Cron / WP-Cron 路徑寫死** | P7.1 的多站設計是 `/srv/sites/<slug>/`，如果舊機路徑結構不同（例如舊路徑是 `/var/www/html`），照抄的 cron entry 會指向不存在的路徑，靜默失敗 | 搬遷後 `crontab -l` 逐條核對路徑；WordPress 站另外 `wp cron event list` 確認排程存在且會執行（呼應既有 P7.8 驗證項）|
| **舊帳號/舊 key 沒有一起關掉** | 搬遷常見心態是「先讓新機跑起來再說」，舊機上的 SSH key、admin 帳號、deploy key 就這樣被遺忘留著，新機也可能因為複製了舊機的 `authorized_keys` 而帶著不再需要的信任關係 | 搬遷完成、確認新機穩定運作後，**明確列出舊機上所有的存取憑證，逐一確認去留**，不要讓「反正舊機要退役了」變成沒人處理的藉口 |

### SG 七項服務逐一對照（2026-08-19 SSH 實查，非通用原則的抽象套用）

> **觀測堆疊與 oracle-web 已查證用途，非待確認項**：oracle-web 是真實產品（紫微斗數命理 app「Oracle」，`Projects/internal/ziwei-doushu/`，有 DNS + TLS + `/api/health` 健康檢查）；觀測堆疊（Loki/Promtail/Grafana）是 SG 主機自己的日誌監控（loopback-only + SSH tunnel 存取，正式文件 [`OBSERVABILITY_P1_P2_ROLLOUT.md`](../agency-os/docs/operations/OBSERVABILITY_P1_P2_ROLLOUT.md)，為防過去的 502 事故而建）。**兩個都搬，不是要退役的東西。**

| 服務 | 密碼/憑證 | 檔案權限 | 寫死 IP | SSH known_hosts | Cron | 舊帳號 |
|---|---|---|---|---|---|---|
| **next-admin** | 檢查是否有獨立 API key（非 Supabase 那組，這組已走 vault）| 低風險（standalone build，少量本機寫入）| 確認 `NEXT_PUBLIC_*` 沒寫死 SG IP | N/A | N/A | 檢查是否有測試/除錯用的殘留帳號 |
| **WordPress + WordPress-DB** | **建議轉**（MariaDB 密碼，WP↔DB 內部關係，你控制兩端）| 🔴 **高風險，必做**：`chown -R www-data:www-data` | `wp-config.php` 的 `DB_HOST` 確認走 docker network name 不是 IP | N/A（除非有 SFTP 部署腳本）| 🔴 **高風險**：`wp cron event list` 逐條核對 | WP admin 帳號 + 舊 MainWP child 連線 key |
| **Node API** | 檢查其環境變數的資料庫/服務憑證是否可轉 | 低風險 | 檢查是否呼叫其他 SG 服務用寫死 IP 而非 service name | N/A | 檢查是否有排程任務 | API key 盤點 |
| **oracle-web** | 🔴 **已查證：環境變數含明文 OpenAI API key**（`docker inspect` 直接看得到），**搬遷時務必改走 vault 引用，不要原封不動複製 env**| 低風險（standalone build）| `NEXT_PUBLIC_SITE_URL` 是網域非 IP，安全；檢查有無其他硬編碼 | N/A | 此類應用通常無排程，仍需確認 | 單一服務，風險低 |
| **Redis** | 檢查現況是否有設密碼（loopback-only 常見「反正外部連不到」而空密碼，**新機多服務共用同一個 Redis，建議補上密碼**）| RDB/AOF 持久化檔案擁有者需比照新機使用者 | 連線方為 IP 或 service name | N/A | N/A | N/A |
| **觀測堆疊（Grafana）** | 🔴 **建議轉**：`GF_SECURITY_ADMIN_USER`/密碼組是獨立於其他服務的憑證，搬遷是低成本換密碼時機 | Loki data volume 擁有者 | Grafana datasource 設定檢查是否寫死 SG IP | 現有存取模式是 SSH tunnel 到 `127.0.0.1:3009`——**新機的 tunnel 指令要更新成新 IP**，不是 known_hosts 問題但同一類「換機後忘記更新存取方式」的坑 | N/A | Grafana 使用者帳號盤點 |

---

## Supabase（承載客戶主資料，風險等級最高）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| **`.env.example` 的預設密碼/JWT secret 沒改** | 這組預設值是公開文件，任何看過 Supabase 文件的人都知道——攻擊者會主動掃這個 | 每個密鑰用 `openssl rand` 重新產生，逐項核對不是 demo 值 | [Meetrix](https://www.meetrix.io/blogs/supabase-self-hosted-security/) |
| Postgres/Studio 綁 `0.0.0.0` | 資料庫直接暴露（跟 4/20 事件同類，Supabase 官方文件自己都警告）| 已在 P2.4b 覆蓋，這裡再次確認 Supabase 的 5432/5433/6543/Studio port 全部走內部 network，不對外 | [Supabase 官方文件](https://supabase.com/docs/guides/deployment/going-into-prod) |
| **新建的 table 預設 RLS 關閉**（CVE-2025-48757 模式，2025 年造成 170+ 專案資料外洩）| 任何持有 anon key 的人都能直接讀寫沒開 RLS 的表 | ① Supabase 專案設定開「Enable RLS on new tables」② 每個既有 table 逐一確認 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` ③ 上線前跑一次全表稽核 | [vibeappscanner CVE 分析](https://vibeappscanner.com/supabase-row-level-security) |
| `service_role` key 洩漏到前端/client code | 完全繞過 RLS，等於資料庫 root | 明確規定 service_role 只能出現在 server-side code（Edge Functions/後端 API），前端只用 anon key | [Supabase 官方文件](https://supabase.com/docs/guides/deployment/going-into-prod) |
| 沒有 HTTPS | 憑證/token 明文傳輸 | Cloudflare origin cert 已在計畫內，確認 Supabase 服務走同一層 | 同上 |

---

## ClickHouse（已有 4 次復發史，本清單優先核對）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| 預設記憶體上限 = 90% 總 RAM | 在共用主機（這台還跑 Supabase/Chatwoot/WP）留白不夠，容易被系統直接 OOM kill | 設定降到 **80%**，留給 OS 與其他服務 | [oneuptime](https://oneuptime.com/blog/post/2026-03-31-clickhouse-common-memory-config-mistakes/view) |
| 單一 query 可吃掉大部分伺服器記憶體 | 一個失控 query 把全部快取擠掉 | 設定 per-query memory limit（`max_memory_usage`）|同上|
| **背景系統遙測 merge 佔用閒置 CPU**（Trigger.dev 官方 issue 記載的確切問題）| **這正是這台機器已經復發 4 次、system/app 資料比曾到 345:1 的同一種病灶**，只是這次是 Trigger.dev 官方也在別的部署上撞到同款問題，證實不是單一環境的巧合 | 沿用既有計畫：搬 ClickHouse **前**先修 `override.xml` 產生源設定，不要先搬上去再說。這是 Trigger.dev v4 自架的已知社群問題，非她的環境獨有 | [Trigger.dev GitHub issue #4343](https://github.com/triggerdotdev/trigger.dev/issues/4343) |
| 本機磁碟低估（以為資料都在物件儲存）| merge/TTL 搬移執行時本機碟被撐爆，系統直接降級 | **維持本機磁碟 30–50% 空閒**，批次寫入避免產生大量小 part | [Severalnines](https://severalnines.com/blog/clickhouse-storage-architecture-and-optimization/) |
| Part 數量爆增（小批次頻繁寫入）| 查詢變慢、啟動變慢，嚴重時觸發 `parts_to_throw_insert` 內部限制直接拒寫 | 寫入一律走批次，不要逐筆 insert | 同上 |
| **Trigger.dev 官方 compose 預設用 `bitnamilegacy/clickhouse:latest`**（凍結在 25.5.2）| webapp 送的 client 設定 25.5 版不接受，**所有 insert 失敗，Dashboard 完全看不到任何 run 紀錄**（表面看起來像壞掉但其實是版本不合） | 若重裝 Trigger.dev stack，**改用官方 tag（≥25.8，如 26.2）**，不要用 Bitnami legacy 標籤 | [Trigger.dev GitHub issue #4325](https://github.com/triggerdotdev/trigger.dev/issues/4325) |
| MinIO 當 ClickHouse 儲存後端時開 bucket versioning | ClickHouse merge 過程會頻繁寫入/更新同一批檔案，開版本控制會讓儲存量暴增且回不去 | **不要**對 ClickHouse 用的 MinIO bucket 開 versioning（跟 P3.2 R2 備份桶開 versioning 是不同的桶，不要混淆）| [Altinity](https://altinity.com/blog/integrating-clickhouse-with-minio) |
| 🔴 **`system.query_log`/`trace_log`/`part_log`/`metric_log` 這些系統自己的紀錄表，預設沒有 TTL，會無限長大**（2026-08-19 新增，**跟上面「系統遙測吃 CPU」是不同問題，這個是吃磁碟**）| 真實案例：`system.trace_log` 六週長到 **97GB**，把整個磁碟塞滿。這是**除了 override.xml 產生源之外，1TB 天花板下第二個必須先設的 ClickHouse 項目** | 在 `config.d/` 逐一對系統表設 TTL（建議 7–14 天）。**已知陷阱**：升級或重啟後 ClickHouse 有時會建新表（`query_log_2`、`query_log_3`...），新表**不會繼承**舊表的 TTL 設定，要重新對新表逐一設定，不能設一次就當永久 | [langfuse-k8s issue #333](https://github.com/langfuse/langfuse-k8s/issues/333)、[Altinity clickhouse-operator issue #1241](https://github.com/Altinity/clickhouse-operator/issues/1241) |
| 🔴 **並非每張系統表都吃這套 `config.d` 宣告式寫法**（2026-08-19 EU 實機驗證發現，非文件推測）| 在 EU 現有機器上實測：`query_log`/`metric_log`/`text_log`/`processors_profile_log`/`latency_log`/`error_log` 六張表用 `<table><ttl>...</ttl></table>` 宣告式寫法正常生效且撐過重啟；但 `part_log`/`opentelemetry_span_log`/`query_views_log`/`query_metric_log` 四張表用同樣寫法**直接讓 ClickHouse 開機崩潰**（`BAD_ARGUMENTS: ttl setting doesn't make sense`），查過 base config.xml 確認十張表定義方式完全一致、無法從設定檔本身看出差異原因，根因未完全查明 | **KS-6 裝機時比照辦理**：先用宣告式寫法**一張一張加、一張一張重啟驗證**，不要一次全加後才重啟（那樣崩潰時不知道是哪張表的問題）。若某張表宣告式寫法導致崩潰，改用 `ALTER TABLE system.<table> MODIFY TTL ...` 直接對已建立的表下 SQL（不進 config.d），**但這種表的 TTL 不保證撐過未來的表重建循環**，必須額外接上監控（見下方驗收項）| 本次事故：`agency-os/WORKLOG.md` 2026-08-19、`lobster-factory/infra/trigger/clickhouse/override.xml` 內部註解 |
| 🟡 **系統表被 ClickHouse 自動重建成 `_0`/`_1`/`_2`... 分身後，舊分身不會自動清掉**（2026-08-19 實測發現）| 每次重建循環都留下一個孤兒表，長期下來會累積一堆沒人用但佔磁碟空間的分身表 | 定期（或每次裝機驗收時）用 `SELECT name FROM system.tables WHERE database='system' AND name LIKE '%\_0' OR name LIKE '%\_1'` 抓出來，確認目前使用中的表 TTL 正常後，`DROP TABLE` 清掉分身 | 同上 |

---

## Chatwoot

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| Redis < 7.0 | Sidekiq 容器反覆自動停止，看起來像裝壞了 | 確認 compose 裡 Redis image 版本 ≥7.0 | [GitHub #10740](https://github.com/orgs/chatwoot/discussions/10740) |
| Sidekiq 長期執行後記憶體漲到 1GB+（已知 memory 增長模式）| 若 mem_limit 抓太緊會被 OOM-kill，太鬆會排擠其他服務 | 現有計畫 Sidekiq 併入 Chatwoot 8G 額度內，需實測後微調；**觀察 30 天後的實際峰值再調整 mem_limit，不要一開始猜死** | [官方系統需求文件](https://developers.chatwoot.com/self-hosted/deployment/requirements) |
| Redis `vm.overcommit_memory` 未設（同通用主機層那條）| Chatwoot 對話資料是「唯一真相源」，background save 失敗風險影響最大 | 已在通用主機層第一項處理，這裡標記為 Chatwoot 適用 | [Our Code World](https://ourcodeworld.com/articles/read/2083/how-to-remove-redis-warning-on-docker-memory-overcommit-must-be-enabled) |
| 🟡 **社群版現存 bug（2026 年 2 月回報，未明確修復狀態）：建新收件匣可能報 `Account limit exceeded`（402）**（2026-08-19 新增）| 官方文件沒寫任何帳號/收件匣數量限制，此行為疑似非預期。**若 P5.1 建 Chatwoot 收件匣時遇到這個錯誤，先查此 issue 對照，不要當成自己裝錯重查半天** | 裝機時若遇到，查 GitHub issue 最新留言是否已有修法/版本號；必要時回報上游或找替代版本 | [Chatwoot GitHub #13422](https://github.com/chatwoot/chatwoot/issues/13422) |
| **授權（MIT，寬鬆，資訊性提醒）**| Chatwoot Community Edition 是 MIT license，比 n8n 的 Sustainable Use License 寬鬆很多，內部 + 對客戶使用都不受限 | 不影響現有計畫，僅供對照下方 n8n 授權項 | — |

---

## n8n

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| 執行紀錄（execution data）預設不清除 | DB 表無限增長，拖慢查詢、吃磁碟 | 設定 `EXECUTIONS_DATA_PRUNE=true` + `EXECUTIONS_DATA_MAX_AGE=336`（14 天）| [n8n 官方文件](https://docs.n8n.io/hosting/scaling/execution-data/) |
| Binary data（下載/處理過的檔案）每次執行都存一份 | 大量重複檔案佔滿磁碟，且不會自動清 | 設定 `N8N_BINARY_DATA_TTL=60`（分鐘），逾時自動清理 | 同上 |
| 🔴 **Sustainable Use License 限制（2026-08-19 新增，需操作者確認使用情境）**| 免費僅限「自己公司內部用途」。**若拿 n8n 幫客戶跑付費自動化、或把 n8n 嵌進賣給客戶的產品，需要付費 Enterprise License**——這不是技術坑，是法律/授權問題 | **待操作者確認**：現有 n8n 用途是否僅限內部維運（Telegram/監控/排程），還是有幫客戶跑付費自動化？前者不需處理，後者需評估 Enterprise License 或改用其他工具 | [n8n 官方授權文件](https://docs.n8n.io/sustainable-use-license/) |
| Wait node / 長迴圈 workflow 把資料留在記憶體中 | 多個並發長時間 workflow 疊加會造成記憶體洩漏式增長 | 監控記憶體趨勢；必要時 `NODE_OPTIONS --max-old-space-size` 調整 | [n8n 官方文件](https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/fix-memory-issues) |
| （若未來改用 SQLite，目前是 Postgres 可跳過）刪除的執行紀錄不會自動釋放磁碟空間 | 空間被保留給未來資料重用，`df` 顯示的數字誤導人 | 現行架構走 supabase-db 內的 Postgres，此坑不適用；若未來拆出獨立 SQLite 需另評估 | [n8n 官方文件](https://docs.n8n.io/hosting/scaling/execution-data/) |

---

## Trigger.dev 自架

（ClickHouse 相關兩項已列於上方 ClickHouse 專節，此處補充其餘）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| 官方文件明示：**這份指南本身不足以構成 production-ready 部署**，安全/擴展/可靠性未完全涵蓋 | 照抄官方 compose 上線會有沒講到的缺口 | 對照本清單其餘各項（防火牆/密碼/監控）逐一補強，不要假設官方 compose = 生產就緒 | [Trigger.dev 官方 Docker 指南](https://trigger.dev/docs/self-hosting/docker) |

---

## WordPress + WooCommerce（×10 租戶）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| `wp_options` autoload 過大 | 每次頁面請求都要載入，拖慢全站 TTFB | 定期稽核 autoload 選項大小；外掛裝太多容易累積 | [DCHost 資料庫優化指南](https://www.dchost.com/blog/en/wordpress-database-optimization-guide-wp_options-autoload-and-table-bloat/) |
| `wp_postmeta` 無界增長（WooCommerce 特別嚴重）| DB 逐漸肥大，查詢變慢 | 排程清理過期 transient、限制 revision 數量、自動清空回收桶 | 同上 |
| WooCommerce transient 過大無法儲存（已知開放 issue）| 特定情境下會產生連鎖錯誤 | 留意此已知 bug，若遇到對應症狀先查此 issue 而非當成新問題排查 | [WooCommerce GitHub #53327](https://github.com/woocommerce/woocommerce/issues/53327) |
| 每個 WooCommerce 站點記憶體需求被低估 | 512MB 起跳，DB 密集型/會員站建議 2–4GB | 現有負載帳（37–58GB 總量）已含 WP 站 5–10G 額度，10 站攤下來每站有餘裕，但個別旺站需留意 | [WP Host Finder](https://wphostfinder.com/wordpress-host/) |

---

## MainWP + MainWP Child（🔴 上線前必查版本）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| **CVE-2024-10783**：MainWP Child ≤5.2 有權限提升漏洞（Child 尚未連上 Dashboard 時，未授權攻擊者可直接登入成 admin）；**5.3.3 之前的修法都不完整** | 每個新裝但還沒接上 Dashboard 的子站點，短暫視窗內可被直接接管 | **裝機時務必確認 MainWP Child 版本高於 5.3.3（建議直接抓最新版）**，且裝完立刻接上 Dashboard，縮短「已裝未連線」的暴露視窗 | [Wordfence 情資](https://www.wordfence.com/threat-intel/vulnerabilities/wordpress-plugins/mainwp-child/mainwp-child-52-missing-authorization-to-unauthenticated-privilege-escalation) |
| 舊版 MainWP Child 備份檔案資訊洩漏（≤4.4.1.1）| 敏感備份檔案可被存取 | 確認版本已更新，不使用舊版備份路徑 | [Wordfence](https://www.wordfence.com/threat-intel/vulnerabilities/wordpress-plugins/mainwp-child/mainwp-child-4411-information-disclosure-via-back-up-files) |
| 未裝 Vulnerability Checker | 子站點外掛漏洞不會被主動掃到 | 可選：裝 MainWP Vulnerability Checker extension（接 WPScan 或 NVD API）持續掃全部子站 | [MainWP 官方文件](https://mainwp.com/kb/vulnerability-checker-extension/) |

---

## Postiz

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| Compose 內 `NOT_SECURED` 選項留在開發模式 | 生產環境跑開發設定，安全性大幅降低 | 部署前確認此選項已移除/關閉 | [Modernizing Tech](https://modernizingtech.com/tips/other/how-to-set-up-postiz-on-docker/) |
| Redis/Postgres port 暴露 | 同其他服務的通病 | 已在 P2.4b 通用規則覆蓋 | 社群通報 |

---

## Uptime Kuma（🔴 三項已知漏洞，需版本確認）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| **CVE：hostname 欄位驗證只在前端做**，可繞過注入任意指令執行（RCE）| 若面板可被未授權存取，等於伺服器 RCE | 確認用最新版；面板本身**絕不能對外暴露**（見下一項）| [Veracode](https://sca.analysiscenter.veracode.com/vulnerability-database/security/remote-code-execution-rce/javascript/sid-44413) |
| **CVE-2026-32230**：ping badge endpoint 缺授權檢查，洩漏監控時間資訊 | 即使沒登入也能側錄內部監控狀態 | 更新到修補版本 | [GitHub Advisory](https://github.com/advisories/GHSA-c7hf-c5p5-5g6h) |
| Google Analytics ID 欄位未消毒（XSS）| 若使用該功能，可被注入惡意 script | 不啟用此功能，或確認已修補 | 搜尋結果彙整 |
| **社群實測：現有 15,000+ 台 Uptime Kuma 因預設設定/跳過認證/反向代理設錯而公開暴露內部網路資訊**（規模性現象，非個案）| 面板本身洩漏全部監控目標與內部拓樸 | **面板走 127.0.0.1 + 內部 VPN/SSH tunnel 存取；只有「狀態頁」（status page，唯讀、無管理功能）才能公開**，兩者不要混為一談 | [vpntierlists](https://vpntierlists.com/blog/is-uptimekuma-a-scary-monitoring-tool-for-homelabs) |
| SQLite 資料庫累積後不自動釋放空間（刪除記錄留下空洞）| 檔案越變越大，即使清過歷史資料 | 定期 Settings → Monitor History → Shrink Database；已有的 R2 備份順帶涵蓋此檔 | [社群支援文件](https://support.networkhomelab.com/853401-Recovering-and-Maintaining-Uptime-Kuma-SQLite) |

---

## Cloudflare / 切換相關（soulful P7/P8 適用）

| 坑 | 後果 | 修法 | 來源 |
|---|---|---|---|
| 🔴 **Zone SSL/TLS 模式若是 Flexible，切換到新機會出現重導向迴圈**（2026-08-19 新增）| Flexible 模式下 Cloudflare 用明文 HTTP 連 origin；若 origin（WordPress/nginx）設了 HTTP→HTTPS 強制轉址，CF 跟 origin 會互踢皮球，訪客看到 `ERR_TOO_MANY_REDIRECTS`。**這是 origin 遷移最常見的切換當天事故之一** | 確認 Cloudflare zone SSL/TLS 模式是 **Full (Strict)**（不是 Flexible）；新機已裝 Cloudflare Origin Certificate（P5.2 已規劃）；可選加碼：開 Authenticated Origin Pulls，讓 origin 只信任帶 CF client cert 的請求 | [Cloudflare 官方文件](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full/) |

---

## 驗收方式（裝機/服務上線前，逐服務跑一次）

- [ ] 通用主機層：4 項舊有 + `restart: unless-stopped` 全站統一 + image tag 全部釘版本 + `fstrim.timer` 已排程
- [ ] Supabase：`.env` 全部密鑰非預設值 + RLS 全表開啟 + service_role 不在前端 + port 內部化
- [ ] ClickHouse：記憶體上限 80% + 批次寫入 + `override.xml` 產生源已修 + **系統紀錄表（query_log/trace_log/part_log 等）TTL 已設，一張一張加、一張一張重啟驗證**（不要一次全加）+ 若某張表宣告式寫法崩潰，改用 `ALTER TABLE ... MODIFY TTL` 並接上 `check-clickhouse-health.ps1` 的無 TTL 表偵測 + 孤兒 `_N` 分身表已清 +（若重裝 Trigger.dev）ClickHouse 用官方 tag ≥25.8
- [ ] Chatwoot：Redis ≥7.0 + `vm.overcommit_memory=1` 已設 + 建收件匣時若遇 402 先查已知 issue
- [ ] n8n：`EXECUTIONS_DATA_PRUNE`/`EXECUTIONS_DATA_MAX_AGE`/`N8N_BINARY_DATA_TTL` 已設 + **授權使用情境已與操作者確認**
- [ ] WordPress×10：transient/revision 清理排程已建
- [ ] MainWP：Child 版本 >5.3.3，裝完立即連 Dashboard
- [ ] Postiz：`NOT_SECURED` 已移除
- [ ] Uptime Kuma：面板不對外，只公開 status page；版本已更新
- [ ] soulful 切換：Cloudflare zone SSL/TLS 模式為 Full (Strict)，非 Flexible

---

_建立 2026-08-19。查證方式：WebSearch/WebFetch 逐項取得官方文件/GitHub issue/安全通報原文後才寫入，非憑記憶列舉。維護者：AwareWave。新機建置階段（P2/P3/P5/P7）逐項對照此清單。_
