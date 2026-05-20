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
| Block xmlrpc.php | `a881ce5e7b5841eca99fc797187020e9` |
| Block sensitive file access（scanner paths） | `74c0e70b90874ea4b44926aecb44ae16` |
| Challenge wp-login non-TW/SG | `（從 API list 查）` |

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
