# staging 站三層對帳（SG 檔案 / MariaDB / Supabase wp_sites）

- generated: 2026-10-19T04:40:47Z
- verdict: **OK**
- staging 磁碟用量: 250.4 MB
- 孤兒總數: 0（complete: 1）

| slug | 分類 | 目錄 | 大小 | 資料庫 | wp_sites |
|---|---|---|---|---|---|
| e2e-verify-0704-6e2b91 | complete | V | 250 MB | wp_s_6e2b917e2efc46b89cdbcb | active=t |

## 清理方式

唯讀報告。清理走被探測那台主機上的 `deprovision-staging.sh`（先備份、有守衛、要 --confirm）：

```bash
ssh -i "C:\Users\user1115\.ssh\id_ed25519" -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug>"   # DRY RUN
ssh -i "C:\Users\user1115\.ssh\id_ed25519" -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/deprovision-staging.sh --slug <slug> --apply --confirm <slug>"
ssh -i "C:\Users\user1115\.ssh\id_ed25519" -p 58122 ubuntu@145.239.195.47 "sudo /root/lobster-phase1/scripts/deprovision-staging.sh --db <db> --apply --confirm <db>"   # db_only
```

`db_only` 用 `--db`：只接受 staging 命名、不是主站 DB、且沒有任何 staging wp-config 指向它；先 dump 備份再 DROP（含同名帳號）。
