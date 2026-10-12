# Cloudflare WAF 設定清單（aware-wave.com）

**Zone:** `aware-wave.com`

**Origin 注意（2026-08-31）**：所有 production hostname（含主站、Supabase、Trigger、n8n）皆指向單一 **ks-aw-01 `145.239.195.47`** 並維持 Cloudflare proxy；服務以 host nginx vhost 分流。詳見 **`runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`**。

---

## 第一步：SSL/TLS 模式
Dashboard → SSL/TLS → Overview
- 設為 **Full (strict)**（源站有 Let's Encrypt 憑證）

## 第二步：基本安全設定
Dashboard → SSL/TLS → Edge Certificates
- [x] Always Use HTTPS
- [x] Automatic HTTPS Rewrites
- [x] HTTP Strict Transport Security (HSTS) — max-age 6 個月，勾選 includeSubDomains

Dashboard → Security → Settings
- Security Level: **Medium**
- Bot Fight Mode: **On**
- Browser Integrity Check: **On**

## 第三步：WAF 受管規則（免費方案可用）
Dashboard → Security → WAF → Managed rules
- **Cloudflare Managed Ruleset** → Deploy（預設動作 Block）
- **Cloudflare Free Managed Ruleset** → Deploy

## 第四步：自訂規則（Custom Rules）
Dashboard → Security → WAF → Custom rules → Create rule

### Rule 1：封鎖 xmlrpc.php（WordPress 攻擊入口）
```
Expression: (http.request.uri.path contains "/xmlrpc.php")
Action: Block
```

### Rule 2：wp-login 保護（DEPRECATED — 勿套用）
> **⚠️ 已棄用**：geo/country 規則會封鎖出國中的操作者。
> wp-login 保護改由伺服器端 LLAR（Limit Login Attempts Reloaded）+ nginx 負責。
> 見 `§注意事項` 與 `§Origin Lockdown SOP`。

### Rule 3：保護 n8n webhook（限速）
Dashboard → Security → WAF → Rate limiting rules
```
Expression: (http.request.uri.path contains "/webhook/")
Requests: 100 per 1 minute per IP
Action: Block (duration 60s)
```

### Rule 4：保護 Supabase API（限速）
```
Expression: (http.request.uri.path contains "/rest/v1/" or http.request.uri.path contains "/auth/v1/")
Requests: 200 per 1 minute per IP
Action: Block (duration 60s)
```

## 第五步：啟用 WebSocket（Trigger.dev 需要）
Dashboard → Network
- WebSockets: **On**

## 第六步：驗收測試
```bash
# WordPress 首頁
curl -sSI https://aware-wave.com/ | grep -E "HTTP|CF-Ray"

# API health
curl -sSI https://api.aware-wave.com/health | grep HTTP

# n8n（應有 CF-Ray header 代表流過 CF）
curl -sSI https://n8n.aware-wave.com/ | grep CF-Ray

# 確認 xmlrpc 被 block
curl -sSI https://aware-wave.com/xmlrpc.php | grep "HTTP"
# 期望: HTTP/2 403 或 1020
```

## 注意事項
- Trigger.dev dashboard 子網域若遇 WS 問題：確認 WebSockets 已開且 Cloudflare timeout > 100s
- n8n webhook 如遇 Cloudflare block：先暫時設 Challenge（驗證碼），排查後改 Rate Limit
- 所有 Custom Rules 先用 **Log** 模式觀察 24 小時，確認無誤再改 **Block**

---

## §API 維護（Claude 自動使用）

> 使用 Cloudflare Ruleset API 管理 Custom WAF Rules，不需進 Dashboard。

### 固定 ID（勿修改）

| 項目 | ID |
|---|---|
| Zone（aware-wave.com） | `f21b1919632fee2221647908a94fdcac` |
| Custom WAF Ruleset | `f290fd58b69c4cedb7a0688ca959034f` |
| Block sensitive file access（scanner paths） | `8202ff335538476a89685341f6efde07` |
| Rate Limit Ruleset | `e29e21021ab641b38a4067735a027907` |
| Rate Limit Rule（>50 req/10s） | `b8ffa72df8d44ea78a09bd0ababf8abb` |

> **注意**：`74c0e70b...`（舊 scanner-paths rule）已於 2026-06-04 隨 ruleset 清空時刪除。`8202ff33...` 為 2026-06-12 重建的新 rule。
> wp-login/xmlrpc 改用伺服器端 LLAR + nginx 防護（操作者常出國，CF geo rule 會自己封自己）。

### 查現有規則

```bash
CF_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" mcp/user-env.ps1 | sed 's/.*= "\(.*\)"/\1/')
curl -s "https://api.cloudflare.com/client/v4/zones/f21b1919632fee2221647908a94fdcac/rulesets/f290fd58b69c4cedb7a0688ca959034f" \
  -H "Authorization: Bearer $CF_TOKEN" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for r in d['result']['rules']:
    print(f'[{r[\"action\"]}] {r[\"description\"]}: {r[\"expression\"][:100]}')
"
```

### 追加新 scanner path 至 Block sensitive file access

```bash
CF_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" mcp/user-env.ps1 | sed 's/.*= "\(.*\)"/\1/')

# 編輯下方 expression，追加 or http.request.uri.path contains "/新路徑"
NEW_EXPR='(http.request.uri.path contains "/.env" or http.request.uri.path contains "/.git" or http.request.uri.path contains "/config.php" or http.request.uri.path contains "/.aws/" or http.request.uri.path contains "/.ssh/" or http.request.uri.path contains "/wp-config" or http.request.uri.path contains "/etc/passwd" or http.request.uri.path contains "/etc/shadow" or http.request.uri.path contains "/.htaccess" or http.request.uri.path contains "/.DS_Store" or http.request.uri.path contains "/phpinfo")'

PAYLOAD=$(python3 -c "import json,sys; print(json.dumps({'action':'block','expression':sys.argv[1],'description':'Block sensitive file access (scanner paths)','enabled':True}))" "$NEW_EXPR")

curl -s -X PATCH \
  "https://api.cloudflare.com/client/v4/zones/f21b1919632fee2221647908a94fdcac/rulesets/f290fd58b69c4cedb7a0688ca959034f/rules/8202ff335538476a89685341f6efde07" \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" | python3 -c "import json,sys; d=json.load(sys.stdin); print('success:', d['success'])"
```

### 驗證（PATCH 後必跑）

```bash
# 全部應回 403
curl -s -o /dev/null -w "/.aws/credentials: %{http_code}\n" https://n8n.aware-wave.com/.aws/credentials
curl -s -o /dev/null -w "/.ssh/id_rsa: %{http_code}\n"     https://n8n.aware-wave.com/.ssh/id_rsa
curl -s -o /dev/null -w "/wp-config.bak: %{http_code}\n"   https://n8n.aware-wave.com/wp-config.bak
curl -s -o /dev/null -w "/etc/passwd: %{http_code}\n"       https://n8n.aware-wave.com/etc/passwd

# 正常路徑應回 200
curl -s -o /dev/null -w "/healthz: %{http_code}\n"         https://n8n.aware-wave.com/healthz
curl -s -o /dev/null -w "/api/ops/summary: %{http_code}\n" https://app.aware-wave.com/api/ops/summary
```

### Rate Limit 排除清單缺口（2026-08-29 事故，已修）

**症狀**：操作者正常瀏覽 `studio.aware-wave.com` 的 Studio 編輯器（`/project/default/editor`）被 Cloudflare 回 `Error 1015 You are being rate limited`。稍早 `trigger.aware-wave.com` 儀表板也出現過同款錯誤。

**根因**：Rate Limit Rule（`b8ffa72d...`，50 req/10s per IP）的排除清單只寫了 `app.aware-wave.com` 和 `supabase.aware-wave.com`，2026-07-04 建規則當時 studio/trigger 這些內部管理後台可能還沒各自獨立網域或還沒被納入考慮。這些後台都是 SPA，載入一頁就會併發打十幾支 API/資源請求，單一操作者的正常使用就能觸發「50 req/10s」的門檻——這條規則設計目的是擋公開網站的掃描器灌爆，不該套用在只有操作者一人用、且已有 Basic Auth 或站內登入保護的內部工具上。

**修復**：排除清單追加 `studio.aware-wave.com`、`trigger.aware-wave.com`、`n8n.aware-wave.com`、`uptime.aware-wave.com`、`mainwp.aware-wave.com`、`postiz.aware-wave.com`（`oracle.aware-wave.com` 是公開消費者 app，**刻意不排除**，保留掃描器防護）。已用 PATCH 同一顆 rule 完成，8 連發 curl 打 studio 編輯器全部 200 驗證。

**2026-10-12 追加 `cognitive.aware-wave.com`**（操作者同意）：它是公開產品，但一整班共用一個 Wi-Fi 位址，一頁約 10 個請求 × 30 人就超過 50/10s。免費方案只能有一條限速規則，無法替它單獨設門檻，所以排除；保護改由 lobster-nginx 照登入的人（session cookie）限速，見 `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` 的 `zone=cognitive`。改前規則存檔在該次 session 的 scratchpad，退回 = 從 expression 拿掉 `and http.host ne "cognitive.aware-wave.com"`。

**日後新增內部管理後台子網域時，務必同步檢查這條規則的排除清單**（本次事故的可複製教訓：新子網域 = 新的 SPA = 新的併發請求來源，忘記排除就會在操作者正常使用時無預警鎖 10 秒-timeout 循環）。

```bash
# 查目前排除清單
CF_TOKEN=$(grep "CLOUDFLARE_API_TOKEN" mcp/user-env.ps1 | sed 's/.*= "\(.*\)"/\1/')
curl -s "https://api.cloudflare.com/client/v4/zones/f21b1919632fee2221647908a94fdcac/rulesets/e29e21021ab641b38a4067735a027907" \
  -H "Authorization: Bearer $CF_TOKEN" | python3 -c "import json,sys; print(json.load(sys.stdin)['result']['rules'][0]['expression'])"
```

---

## §Origin Lockdown SOP（Claude 自動使用）

> **🚨 本節下方 iptables/ipset 指令為歷史，禁止執行。** 現役 ks-aw-01 改用 **OVH Edge Network Firewall**（8 條規則 state=ok，見 `runbooks/KS-AW-01-HOST-SWITCH-RUNBOOK.md`）。經 OVH Manager Cloud Shell `ovhcloud` CLI 操作，不使用本節腳本；回滾指令的目標也必須是現役 `145.239.195.47`。遇 origin-bypass 事件請依 Host Switch Runbook 的現役機制處理。
>
> **目標**：限制 SG VPS port 80/443 只接受 Cloudflare 出口 IP，攻擊者直打 origin IP 時在 iptables 層被 DROP，nginx 完全看不到，Netdata 不告警。
> **根因**：2026-06-12 scanner 洪流事件 — 攻擊者繞過 CF 直打 origin，4500 req 打爆 Netdata bad_request %。

### 狀態確認

```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 \
  "ipset list cf-ipv4 2>/dev/null | head -3 && \
   iptables -C INPUT -p tcp --dport 443 -m set --match-set cf-ipv4 src -j ACCEPT 2>&1 \
   && echo 'LOCKDOWN: ACTIVE' || echo 'LOCKDOWN: INACTIVE'"
```

也可用 `/origin-lockdown status`（Claude Code slash command）。

### 首次部署（HIGH RISK — 需操作者 go-ahead）

```bash
# 1. 上傳 script
scp -i ~/.ssh/hetzner_trigger \
  lobster-factory/infra/hetzner-phase1-core/scripts/cf-origin-lockdown.sh \
  root@5.223.93.113:/root/cf-origin-lockdown.sh

# 2. Preview（確認 no 誤傷）
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --preview"

# 3. Apply（啟動 120 秒 auto-revert 計時器）
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --apply"

# 4. 驗收（120 秒內完成）
curl -sI https://aware-wave.com/ | grep -E "HTTP|CF-Ray"   # 必須有 CF-Ray
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 echo ok     # SSH 22 仍通
# direct-IP 應 timeout（若能測試非 CF IP 的話）

# 5. 確認並持久化
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --confirm"
```

### CF IP 月更新（防止 CF 新增出口 IP 被誤擋）

```bash
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --refresh"
```

此操作只更新 ipset，不改 iptables 規則。`ao-resume.ps1` 每月自動觸發 `scripts/refresh-cf-origin-ips.ps1`。

### Rollback（緊急，< 2 min）

```bash
# 方法 A：用 script
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 "bash /root/cf-origin-lockdown.sh --rollback"

# 方法 B：手動（備份在 /root/cf-lockdown-backup-YYYYMMDD-HHMMSS/）
ssh -i ~/.ssh/hetzner_trigger root@5.223.93.113 \
  "iptables-restore < /root/cf-lockdown-backup-*/rules.v4.bak && \
   ip6tables-restore < /root/cf-lockdown-backup-*/rules.v6.bak && \
   netfilter-persistent save"
```

### 架構說明

```
【加固後】
攻擊者 → 直打 5.223.93.113:443 → iptables DROP（到不了 nginx）→ 零 log → 零告警
合法用戶 → CF edge → CF IP（白名單）→ iptables ACCEPT → nginx → 正常

【CF IP 白名單來源】
IPv4（15 段）：173.245.48.0/20 等（同 nginx aware-wave-security.conf set_real_ip_from）
IPv6（7 段）：2400:cb00::/32 等
持久化：/etc/iptables/rules.v4 + rules.v6（iptables-persistent）
```

### 重要注意事項

- **操作者出國無影響**：lockdown 是 IP-based（CF 出口 IP），非 geo rule，不會封自己
- **SSH 22 不受影響**：lockdown 只動 80/443
- **fail2ban 仍在**：lockdown 後 fail2ban 對直打 origin 的 IP 無作用（因 iptables DROP 更早），但 CF-proxied 流量的 real-IP banning 仍靠 nginx real_ip module
- **IPv6**：ip6tables 同步鎖定，ufw 在此 server 未安裝
- **Script**：`lobster-factory/infra/hetzner-phase1-core/scripts/cf-origin-lockdown.sh`

# Rate-limit rule policy (2026-07-04)

Rule `b8ffa72df8d44ea78a09bd0ababf8abb` is the global scanner-flood rule
(`>50 requests / 10s`, block for 10s). It must exclude normal WordPress
operator/admin bursts while keeping login and scanner defenses intact.

Required carve-outs:
- Exclude `app.aware-wave.com` and `supabase.aware-wave.com`.
- Exclude `aware-wave.com` paths beginning with `/wp-admin/`, `/wp-json/`,
  `/wp-content/`, and `/wp-includes/`.
- Do not exclude `/wp-login.php`.
- Do not exclude scanner paths such as `/.env`, `/.git`, `/wp-config`,
  `/.aws/`, `/.ssh/`, or `/xmlrpc.php`.

Server-side defense remains:
- `wp-login.php`: LLAR + host Nginx `wp_login` rate limit + fail2ban.
- scanner paths: Cloudflare custom WAF + host Nginx `scanner-block.inc`.
- origin bypass: SG Origin Lockdown on ports 80/443.
