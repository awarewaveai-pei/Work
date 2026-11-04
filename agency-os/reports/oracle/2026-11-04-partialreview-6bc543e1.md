# codex-oracle review -- 2026-11-04 13:08:48 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/soulful/nginx/soulful-proxy.inc, lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf, scripts/public-endpoint-smoke.ps1, scripts/README.md  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Soulful nginx: add X-Frame-Options + CSP frame-ancestors 'self' in soulful-proxy.inc (included by every proxied location; server-level add_header would be dropped by location / own add_header). public-endpoint-smoke.ps1 gains RequireHeaders assertion for soulful/aware-wave/app. Comment + README sync.
- exit: 0 | elapsed: 92012ms | answer: 491B
- files-reviewed: lobster-factory/infra/soulful/nginx/soulful-proxy.inc, lobster-factory/infra/soulful/nginx/soulfulexpression.org.conf, scripts/README.md, scripts/public-endpoint-smoke.ps1
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新增的 smoke check 無法驗證它宣稱涵蓋的登入與結帳頁
  file:line   -> scripts/public-endpoint-smoke.ps1:21
  confidence  -> CONFIRMED
  scenario    -> 首頁仍回傳標頭，但 `/wp-login.php` 或 `/checkout/` 的標頭因個別 location 的 `add_header` 繼承變更而消失；第 23–25 行只請求三個網站的 `/`，檢查仍通過。
  why missed  -> 以首頁代表「login/checkout doors」，沒有對實際頁面送出請求。

TOTAL: 1 findings
