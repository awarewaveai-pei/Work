# soulfulexpression.org 切換手冊 — Hostinger → ks-aw-01

> **狀態（2026-08-27）**：新機已就緒並通過 Drill #2。**尚未切換。**
> 切換是 High-risk，需操作者明示 go-ahead —— 本文件的目的是讓那個「明示」之後只剩一個動作。

## 一句話

改一筆 Cloudflare A 記錄的 IP，**幾秒生效；改回去就是回滾**。

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

## 切換當天的增量同步（**不可省略**）

新機的資料停在拉取當下。中間 live 站的任何寫入（文章、訂單、使用者註冊、表單、
FluentCRM 聯絡人）都還在 Hostinger。切換前必須把差額補上，**且補的當下要停止寫入**，
否則會產生「切換後才發現少了一小時的訂單」這種難以事後修補的狀況。

建議做法（把寫入窗口壓到最短）：

```bash
# a. 在 live 站開維護模式（Hostinger 端，或直接放一個 .maintenance）
#    目的是讓這段期間不再有新寫入
# b. 重新拉一次 DB（檔案通常只增不改，可只補 uploads 差異）
# c. 在新機重新載入 DB，跑一次下方的一致性檢查
# d. 才執行切換
```

> **未做決定**：維護窗口要多長、要不要真的開維護模式，取決於可接受的停機時間。
> 這需要操作者決定，本文件不預設。

---

## 切換（一個動作）

```bash
curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/zones/bb1358fe8d3e1d73c822bdb31d3cd823/dns_records/5287ae0edbce87ec8a9fa6152e05e220" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"soulfulexpression.org","content":"149.202.64.114","proxied":true}'
```

## 回滾（同一個動作，換回舊 IP）

```bash
curl -sS -X PATCH \
  "https://api.cloudflare.com/client/v4/zones/bb1358fe8d3e1d73c822bdb31d3cd823/dns_records/5287ae0edbce87ec8a9fa6152e05e220" \
  -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"soulfulexpression.org","content":"191.101.230.176","proxied":true}'
```

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
| **`check-smoke-tests.ps1` 的 `client_mail` 檢查** | 寫死 Hostinger SSH（`HOSTINGER_SOULFUL_SSH_*`），換機後會壞 | **切換同一天改**，否則會變成永久失敗的偵測器 |
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
