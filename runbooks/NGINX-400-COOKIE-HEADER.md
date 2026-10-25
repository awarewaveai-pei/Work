# app.aware-wave.com：nginx 400 Request Header Or Cookie Too Large

## 判斷

- 無 Cookie 的 `/` 可回 307、同一瀏覽器登入後回 `400 Request Header Or Cookie Too Large`：先查請求的 Cookie 標頭長度；勿先重啟 Next.js。
- 流量經 host nginx → `lobster-nginx` → next-admin。錯誤頁尾 `nginx/1.30.4` 指向 `lobster-nginx`；現役設定是 `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` 的 `app.aware-wave.com` server。`nginx/system-sites/aware-wave-app-api-subdomains.conf` 已退役。
- Supabase session 可分成多個 `sb-*-auth-token.N` Cookie，但瀏覽器會把它們放在同一個 `Cookie` 請求標頭。不要把 Cookie 值輸出到 log、終端或工單。

## 無憑證重現

在 `D:\Work` 的 PowerShell 執行：

```powershell
$cookie = 'Cookie: probe=' + ('x' * 8192)
curl.exe -sS -o NUL -w '%{http_code}' --max-time 15 -H $cookie https://app.aware-wave.com/
```

2026-10-25 修復前回 400，修復後回 307。乾淨的 `/login` 回 200，原本顯示 400 的 Chrome 分頁重新整理後顯示 Dashboard。

## 修復與驗證

- app vhost 使用 `large_client_header_buffers 4 32k;`。指令只放 app 的 `server {}`，不要提高所有站點的限制。
- 正式修改屬 High；取得操作者明示授權後，先比對線上設定與 repo 基線，再把已驗證的新檔送入主機本機的 `/root/lobster-phase1/scripts/safe-infra-patch.sh nginx /root/lobster-phase1/nginx/default.conf`。腳本負責備份、`nginx -t`、reload、健康檢查及失敗回滾。勿直接覆寫或重啟容器。
- 驗證 `docker exec lobster-nginx nginx -T` 已載入設定；重跑上方 8192-byte 測試、`/login`、原本故障的瀏覽器分頁，最後跑 `scripts/system-health-check.ps1`。
- 若需回滾，從 safe-patch 輸出的 backup 路徑取舊檔，再經同一個 `safe-infra-patch.sh nginx` 套用；不要直接 `cp` 後手動 reload。

## 界線

2026-10-25 的 16 KiB 合成 Cookie：公開路徑回 Cloudflare 520，直達 `lobster-nginx` 回 431。此設定已修復實際瀏覽器與 8 KiB 重現案例；若有人仍失敗，逐層檢查 host nginx、`lobster-nginx`、next-admin 的限制與該瀏覽器實際標頭大小，不要只繼續調高 nginx 數值。
