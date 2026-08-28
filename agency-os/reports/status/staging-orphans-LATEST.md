# staging 站三層對帳（SG 檔案 / MariaDB / Supabase wp_sites）

- generated: 2026-08-28T02:25:51Z
- verdict: **CRITICAL**
- staging 磁碟用量: 1969.7 MB
- 孤兒總數: 10（complete: 3）

| slug | 分類 | 目錄 | 大小 | 資料庫 | wp_sites |
|---|---|---|---|---|---|
| e2e-verify-0704-6e2b91 | complete | V | 357 MB | wp_s_6e2b917e2efc46b89cdbcb | active=f |
| mongolia-03-a49272 | complete | V | 549 MB | wp_s_a492729fd89145d780b9cb | active=f |
| test-wp-webhook-co-5c1bd1 | complete | V | 355 MB | wp_s_5c1bd18ee4924d959194ab | active=f |
| (none) | db_only | - | - | wp_s_89488120950641239fe965 | - |
| (none) | db_only | - | - | wp_s_76e3cd2d311342eb9eb524 | - |
| (none) | db_only | - | - | wp_s_cca9e58e68ea4129ba1944 | - |
| (none) | db_only | - | - | wp_s_97dc2433ccd74d0fb0d93d | - |
| (none) | db_only | - | - | wp_s_cfc84c52469b4b91b2accf | - |
| (none) | db_only | - | - | wp_s_29972023e7d14c3d86cac5 | - |
| fresh-brew-coffee-f2a3b4 | unregistered | V | 93 MB | wp_s_f2a3b4c5d6e789abcdef00 | - |
| green-valley-farm-28ba09 | unregistered | V | 217 MB | wp_s_28ba09a5733c49b1819fc6 | - |
| ssasd-8ebcd4 | unregistered | V | 306 MB | wp_s_8ebcd496056049a8883944 | - |
| test-pilot | unregistered | V | 93 MB | wp_staging_testpilot | - |

## 清理方式

唯讀報告。清理走 SG 上的 `deprovision-staging.sh`（先備份、有守衛、要 --confirm）：

```bash
ssh hetzner-sg "/root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug>"   # DRY RUN
ssh hetzner-sg "/root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug> --apply --confirm <slug>"
```

`db_only`（只剩資料庫、沒有目錄）那一類拆不動：腳本刻意要求目錄存在且含 wp-config.php，
否則它無法證明自己要 DROP 的是哪一個資料庫。這一類請人工確認後手動處理。
