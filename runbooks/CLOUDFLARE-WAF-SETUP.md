# Cloudflare WAF 設定清單（aware-wave.com）

**Zone:** `aware-wave.com`

**Origin 注意**：主站／phase1 常指向 **SG `5.223.93.113`**；**`supabase.aware-wave.com`、`studio.aware-wave.com`** 等 Supabase 相關 hostname 之 **A／proxy 應對 EU**（AwareWave 自架 Supabase 已在 EU），見 **`agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md`**。

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

### Rule 2：封鎖敏感路徑暴力掃描
```
Expression: (http.request.uri.path contains "/wp-login.php" and not ip.geoip.country in {"TW" "HK" "SG" "JP" "US"})
Action: Challenge
```
（調整 country 白名單為你實際使用地點）

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
  "https://api.cloudflare.com/client/v4/zones/f21b1919632fee2221647908a94fdcac/rulesets/f290fd58b69c4cedb7a0688ca959034f/rules/74c0e70b90874ea4b44926aecb44ae16" \
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

---

## §Origin Lockdown SOP（Claude 自動使用）

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
