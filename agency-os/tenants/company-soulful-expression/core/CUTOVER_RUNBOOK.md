# soulfulexpression.org 切換手冊 — Hostinger → ks-aw-01

> **狀態（2026-08-27）**：新機已就緒並通過 Drill #2。**尚未切換。**
> 切換是 High-risk，需操作者明示 go-ahead —— 本文件的目的是讓那個「明示」之後，
> 每一步都已經寫好、演練過、且有回滾路徑。

## 一句話

**凍結舊站寫入 → 補完增量 → 改一筆 Cloudflare A 記錄的 IP → 解凍舊站當回滾路徑。**

DNS 那一筆幾秒生效，改回去就是回滾 —— 但單改 DNS **不是**完整切換：
中間那段時間 live 站上的新訂單與新註冊會留在 Hostinger 並永久遺失。
凍結窗口實測 52 秒，已工具化，見下。

| | 值 |
|---|---|
| Cloudflare zone id | `bb1358fe8d3e1d73c822bdb31d3cd823` |
| A 記錄 id（apex）| `5287ae0edbce87ec8a9fa6152e05e220` |
| 現在指向（Hostinger）| `191.101.230.176` |
| 要改成（ks-aw-01）| `149.202.64.114` |
| proxied | `true`（**維持橘雲，不要改**）|

---

## 切換前必須全綠（每次都重跑，不要憑印象）

```bash
# 1. 新機直接對打，完全不動 DNS
for p in / /wp-login.php /shop/ /expressions/music/into-the-deep/; do
  curl -sS -o /dev/null -w "$p -> %{http_code}\n" --max-time 30 \
    --resolve soulfulexpression.org:443:149.202.64.114 "https://soulfulexpression.org$p"
done
# 期望：全部 200

# 2. 中文永久連結（要用 url-encode，否則是你的終端機在騙你）
ENC=$(python3 -c "import urllib.parse;print(urllib.parse.quote('insights/general/感恩日記改變人生的五分鐘習慣'))")
curl -sS -o /dev/null -w "CJK -> %{http_code}\n" --max-time 30 \
  --resolve soulfulexpression.org:443:149.202.64.114 "https://soulfulexpression.org/$ENC/"
# 期望：200

# 3. 容器健康
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114 \
  'sudo docker ps --filter name=soulful --format "{{.Names}} {{.Status}}"'
# 期望：兩個都 (healthy)

# 4. 憑證還有效
echo | openssl s_client -connect 149.202.64.114:443 -servername soulfulexpression.org 2>/dev/null \
  | openssl x509 -noout -dates
# 期望：notAfter 尚未到期（目前 2026-11-25）

# 5. 資料新鮮度 —— 這是最容易忘記的一項
#    新機上的資料是 2026-08-27 06:07 那份。切換前必須重新同步一次增量，
#    否則切過去之後，這段期間 live 站上的新訂單／新文章／新註冊會全部消失。
#    見下方「切換當天的增量同步」。
```

---

## 切換當天的增量同步（**不可省略**，已工具化）

新機的資料停在拉取當下。中間 live 站的任何寫入（文章、訂單、使用者註冊、表單、
FluentCRM 聯絡人）都還在 Hostinger。這個差額不是「建議補」，是**切過去就永久遺失**。

這件事已經寫成腳本，**不要手動做**：`lobster-factory/infra/soulful/cutover-sync.sh`
（部署在 `ks-aw-01:/root/soulful/cutover-sync.sh`）。

它的不變量是一句話：**舊主機在最終 dump 開始後不得再接受任何寫入，而在那之前發生的寫入不得遺失。**

| 它做什麼 | 為什麼 |
|---|---|
| 先對新機自己做快照 | 失敗時新機可完整還原，不會卡在半套狀態 |
| 在 live 寫 `.maintenance`（`$upgrading = time()`）| 停止寫入。**必須是 `time()`**：core 的 `wp_is_maintenance_mode()` 在 600 秒後會忽略該檔，寫死時間戳等於凍結會自己過期 |
| curl 驗證 live 真的回 503 | 「以為凍結了」和「凍結了」是兩件事 |
| 停掉新機 web 層 → dump → rsync → 載入 | 載入期間沒有任何東西在寫新機 |
| **14 項 parity gate**（含 `MAX(post_modified_gmt)`、HPOS 與舊式訂單兩處）| `COUNT(*)` 看不見「改」。不符即中止，不切換 |
| 通過才啟動 web 層、跑 nginx+TLS smoke（含中文永久連結）| parity 必須在任何東西寫入新機**之前**量，否則 WordPress 開機寫的 transient 會造成誤判 |
| 全程留證據檔 | 事後可查 |

演練實測（2026-08-27，`--dry-run` 連續兩次）：**52 秒**，rsync 收斂到 0/0/0，288 表、
中文永久連結 200。腳本內建 `FREEZE_BUDGET_SEC` 預算，超時會明講。

**步驟 0（每次都做，不可略）：確認機器上的腳本 = repo 裡的腳本。**
被覆審、被修正、被演練的是 repo 裡那份；真正執行的是 `ks-aw-01:/root/soulful/cutover-sync.sh`。
兩者之間沒有自動同步。一份切換前修好的 bug（例如凍結會自己過期）在舊副本上會完整復活，而且沒有任何偵測器。

```bash
# 0a. 部署 repo 版本上去
scp -i ~/.ssh/id_ed25519 -P 58122   lobster-factory/infra/soulful/cutover-sync.sh ubuntu@149.202.64.114:/tmp/cutover-sync.sh
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114   'sudo install -o root -g root -m 700 /tmp/cutover-sync.sh /root/soulful/cutover-sync.sh && rm -f /tmp/cutover-sync.sh'

# 0b. 兩邊 sha256 必須一致
sha256sum lobster-factory/infra/soulful/cutover-sync.sh | cut -c1-12
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114   'sudo sha256sum /root/soulful/cutover-sync.sh | cut -c1-12'
```

```bash
# 演練：完全不碰 live，跑完自動把新機還原回起點
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114 'sudo /root/soulful/cutover-sync.sh --dry-run'

# 正式：會凍結 live，並「保持凍結」等你切 DNS
# REQUIRE_VERSION 讓舊副本直接拒跑，而不是安靜地跑出錯誤結果
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114   'sudo REQUIRE_VERSION=2026-08-27-r5 /root/soulful/cutover-sync.sh --live'
```

> 腳本開頭會印 `version=… sha256=… host=…`，evidence 檔也留同一行。
> **對不上就不要往下做。**

> `--live` **結束時 live 站是 503,這是刻意的**。凍結窗口一路開到 DNS 切完為止,
> 否則舊站會在你切換的空檔繼續收單。腳本結尾會印出解凍指令，照著往下走。

---

## 切換（順序不可調換）

```
1. cutover-sync.sh --live   → parity 通過，live 停在 503，新機是它的精確副本
2. DNS PATCH                → 見下方指令
3. 驗證新機在服務            → curl，見「切換後立刻驗」
4. 舊站【維持凍結】          → 不要解凍。理由見下
```

**第 4 步是「不做某件事」。** 舊站的 `.maintenance` 內容是 `<?php $upgrading = time(); ?>`，
`time()` 在每次 request 被重新求值，所以 `time() - $upgrading` 永遠約等於 0 ——
**這個凍結不會自己過期**（會過期的是「寫死時間戳」那種寫法，那是本腳本刻意避開的 bug）。

維持凍結的理由是整個設計的不變量：**舊主機在最終 dump 之後不得再接受任何寫入。**
切換後仍可能有零星流量打到舊 origin（外部服務記住的 IP、webhook、MainWP child、
某人書籤裡的 origin URL）。那些寫入會成功、會沉在舊 DB 裡、而且**沒有任何人會發現** ——
正是本腳本存在的理由。凍結著，這一整類失敗在物理上不可能發生。

凍結只擋 HTTP。SSH 照常，要撈舊站的檔案或設定不受影響。

```bash
# 2. DNS
curl -sS -X PATCH   "https://api.cloudflare.com/client/v4/zones/bb1358fe8d3e1d73c822bdb31d3cd823/dns_records/5287ae0edbce87ec8a9fa6152e05e220"   -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>"   -H "Content-Type: application/json"   --data '{"type":"A","name":"soulfulexpression.org","content":"149.202.64.114","proxied":true}'
```

> 監控會把舊站報成 down —— 那是**正確的**，它確實不在服務。同一天要把
> `check-smoke-tests.ps1` 切到 ks-aw-01 profile（**改 `mcp/user-env.ps1` 裡的 `SOULFUL_DB_PROFILE`，不是命令列參數**，見下方表格），
> 否則會留下一個永遠紅的偵測器，而永遠紅的偵測器等於沒有偵測器。

## 回滾（**先解凍，再改 DNS** —— 順序反了就是把流量導向 503）

```bash
# 1. 先讓舊站能服務。DNS 改回去之前它必須已經是活的，
#    否則回滾的瞬間全站 503，而那正是你想避免的狀態。
ssh -i ~/.ssh/hostinger_soulful -p 65002 u942075013@191.101.230.176   'rm -f /home/u942075013/domains/soulfulexpression.org/public_html/.maintenance'
curl -sSI --resolve soulfulexpression.org:443:191.101.230.176   https://soulfulexpression.org/ | head -1     # 必須是 200，不是 503

# 2. 確認 200 之後才改 DNS
curl -sS -X PATCH   "https://api.cloudflare.com/client/v4/zones/bb1358fe8d3e1d73c822bdb31d3cd823/dns_records/5287ae0edbce87ec8a9fa6152e05e220"   -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>"   -H "Content-Type: application/json"   --data '{"type":"A","name":"soulfulexpression.org","content":"191.101.230.176","proxied":true}'
```

> **回滾會遺失切換後在新機產生的寫入**（新訂單、新註冊）。凍結窗口的存在就是為了
> 讓「切換 → 發現不對 → 回滾」這段時間短到還沒有人下單。**回滾決定越早越乾淨**；
> 過了幾小時之後，回滾的代價已經從「幾乎為零」變成「要人工比對兩邊資料」。

**回滾的前提**：Hostinger 那邊必須仍然活著且未被改動。
👉 **切換後不要立刻關掉或清空 Hostinger**，留到觀察期結束（建議至少 7 天）。

---

## 切換後立刻驗（前 5 分鐘）

```bash
curl -sSI https://soulfulexpression.org/ | head -3          # 期望 200
curl -sS https://soulfulexpression.org/ | grep -o '<title>[^<]*'   # 期望是真標題不是錯誤頁
```

`scripts/verify-soulful-cutover.ps1` **不要當成切換驗證** —— 它驗的是 2026-08-15
那次 nameserver 遷移（NS 委派、mail 記錄），**與 origin 換機無關**，切換前跑它也會全綠。
它仍然有用（確認信箱記錄沒被誤動），但它答的不是「切過去了沒」這個問題。

---

## 切換成功後才做的兩件事

### 1. Origin lockdown（把 443 限制成只有 Cloudflare 能連）

目前新機的 443 對全世界開放。內容本來就是公開的，所以不是資料外洩，
但它讓 origin 可被直接攻擊、繞過 Cloudflare 的所有防護。

**刻意排在切換之後**：現在鎖起來，`--resolve` 的切換前測試就全部做不了。

```bash
ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@149.202.64.114
sudo bash -c '
  ufw delete allow 80/tcp; ufw delete allow 443/tcp
  for c in $(curl -s https://api.cloudflare.com/client/v4/ips | python3 -c "
import json,sys
d=json.load(sys.stdin)[\"result\"]
print(\"\n\".join(d[\"ipv4_cidrs\"]+d[\"ipv6_cidrs\"]))"); do
    ufw allow from $c to any port 443 proto tcp
    ufw allow from $c to any port 80 proto tcp
  done
  ufw status numbered | head -40
'
```

> ⚠️ **不要在這裡加操作者自己的 IP 白名單**。操作者長期在不同國家移動
> （memory `feedback_global_traveler`），寫死 IP 會在出國時把自己擋在外面。
> SSH 走 58122 是獨立規則，不受此影響。

### 2. 移除 Hostinger 上的拉取金鑰

```bash
ssh -i ~/.ssh/hostinger_soulful -p 65002 u942075013@191.101.230.176 \
  "sed -i '/ks-aw-01-soulful-pull/d' ~/.ssh/authorized_keys && grep -c ks-aw-01 ~/.ssh/authorized_keys"
# 期望輸出 0
```

---

## 已知在切換後才會浮現、需要另外處理的事

| 事項 | 說明 | 何時處理 |
|---|---|---|
| **litespeed-cache** | 站上仍啟用，但新機是 nginx，該外掛的快取層完全失效（不會壞，只是沒作用）。`.htaccess` 裡的 LSCACHE 區塊 nginx 不讀 | 切換穩定後另排；替代方案是 Redis object cache（PHP 已內建 redis 模組）|
| **`hostinger` 外掛** | 主機商專屬管理外掛，換機後無意義 | 切換穩定後停用移除 |
| **MainWP child 連線** | token 綁站台 URL/IP，換機後 Dashboard 可能同步失敗 | 切換後重新確認連線 |
| **解除舊站凍結** | 舊站切換後刻意維持 503（見 §切換 第 4 步）。移除 `.maintenance` 等於重新打開「寫入落在舊機且無人察覺」這條路 | **觀察期（≥7 天）結束、確定不回滾時**，連同移除拉取金鑰一起做 |
| **`check-smoke-tests.ps1` 的 `client_mail` 檢查** | 已 profile 化。切換前 `hostinger`（`wp db query`），切換後要改 `ks-aw-01`（`docker exec soulful-db`）。**這不是命令列參數** —— AO-RESUME 是用子行程跑這支腳本，session 範圍的 `$env:` 傳不進去 | **切換同一天**把 `mcp/user-env.ps1` 的 `SOULFUL_DB_PROFILE` 改成 `ks-aw-01`，開新終端機後跑一次 `check-smoke-tests.ps1` 確認 `checks.client_mail` 不是 `warn:unknown_profile:*`。<br>⚠️ **不改的後果不是「壞掉」而是「假綠」**：凍結只擋 HTTP，SSH 照常，且 WP-CLI 本來就繞過維護模式 —— 舊機會繼續回傳看起來正常的郵件記錄，而那是一台已經退役的機器。這正是 2026-08-03 靜默寄信失敗的形狀 |
| **信箱** | 仍在 Hostinger Business Email（付到 2029），**與 hosting 分離、不受本次切換影響**。DKIM selector 是 `hostingermail1` | 不動 |
| **Cloudflare SSL 模式** | 目前 `full`。新 origin 有公開有效 LE 憑證，故 `strict` 對它可行 | 見下 |

### Cloudflare SSL `full` → `strict` 的取捨（**未決，需操作者判斷**）

- **改的好處**：`full` 模式下 Cloudflare 接受 origin 的任何憑證（自簽、過期、網域不符都收），
  代表 origin 若設錯，切換會**靜默成功**但 origin 段未經驗證。`strict` 會擋下這種情況。
- **改的代價**：回滾到 Hostinger 就開始依賴 **Hostinger 的 LE 憑證持續有效**。
  該憑證 2026-10-25 到期、續期預計約 9/25，而 Hostinger 已確定不續約 —— **它是否還會續憑證無人知道**。
  若沒續且模式是 `strict`，回滾路徑會直接 526 失效。
- **建議**：切換完成且穩定後再改 `strict`（那時已不需要回滾路徑）；
  或若要提前改，**在 2026-10-05 前確認 Hostinger 憑證已續期**，未續就改回 `full`。

---

_建立 2026-08-27。前置作業與證據：`BACKUP_RESTORE_PROOF.md` Drill #2、`LIVE_RUNTIME_BASELINE_20260827.md`、
`lobster-factory/infra/soulful/`。步驟細節與更廣的背景見 `SITE_MIGRATION_RUNBOOK.md`。_
