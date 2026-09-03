# staging 站三層對帳（SG 檔案 / MariaDB / Supabase wp_sites）

- generated: 2026-08-29T00:20:15Z
- verdict: **WARN**
- staging 磁碟用量: 0 MB
- 孤兒總數: 0（complete: 0）

> **BLIND SPOT**: sg_parse_empty, eu_parse_empty
> 這一輪有偵測器什麼都沒量到。未量到不等於健康，所以 verdict 一律 WARN 而非 OK。

| slug | 分類 | 目錄 | 大小 | 資料庫 | wp_sites |
|---|---|---|---|---|---|

## 清理方式

唯讀報告。清理走 SG 上的 `deprovision-staging.sh`（先備份、有守衛、要 --confirm）：

```bash
ssh hetzner-sg "/root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug>"   # DRY RUN
ssh hetzner-sg "/root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug> --apply --confirm <slug>"
```

`db_only`（只剩資料庫、沒有目錄）那一類拆不動：腳本刻意要求目錄存在且含 wp-config.php，
否則它無法證明自己要 DROP 的是哪一個資料庫。這一類請人工確認後手動處理。
