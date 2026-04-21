# Cloudflare WAF 設定清單（aware-wave.com）

**Zone:** `aware-wave.com` → VPS `5.223.93.113`

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
