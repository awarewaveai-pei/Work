---
# Phase 4 backup monitoring metadata (machine-readable)
# 讀取者：scripts/phase4-checks.py（本機 fallback 與雲端 routine 共用同一支）
# 這個區塊不是裝飾。缺了它，Phase 4 巡檢會把本租戶判成「status 不明」而長期掛 WARNING。
status: not-onboarded          # not-onboarded | active（開始備份後才改 active）
onboarded_at: null
backup_schedule: null
backup_destination: null
# 還原演練：記錄「做過什麼」，**不要**寫「下次什麼時候到期」——
# 到期日由 phase4-checks.py 以「最後一次 PASS + interval」推算。
# 手寫到期日的舊做法已於 2026-08-26 退役：演練做完沒人回頭改它就變假警報，
# 被人推前又能無聲關掉整條檢查（兩個方向都出過事）。
restore_drill_interval_days: 90
restore_drills:
#  - date: 2026-08-16
#    result: PASS               # PASS | FAIL | PARTIAL
#    scope: data-layer
#    note: "簡述演練方式與關鍵數字"
truth_source: null             # 指向同目錄 BACKUP_AUTO_STATUS.json（onboard 後填）
---

# Backup and Restore Proof (Required)

> Record objective evidence for backup and restore readiness.

## Backup Record

- Tenant:
- Site:
- Environment: staging / production
- Backup timestamp:
- Backup scope: DB / uploads / full snapshot
- Storage location:
- Retention policy:
- Operator:

## Restore Drill Record

> **做完演練要寫兩個地方，順序不能反**：
> ① 先在檔頭 frontmatter 的 `restore_drills` 加一筆（**閘只讀這裡**）
> ② 再在本節寫敘述，其中 `| Drill date | YYYY-MM-DD |` 這一列請照原樣保留 ——
> `phase4-checks.py` 會拿它跟 frontmatter 對帳，你漏了 ① 它會直接告訴你要補哪一行。

| 項目 | 值 |
|---|---|
| Drill date | |
| 還原標的 | |
| Result | PASS / FAIL |

- Duration:
- Issues found:
- Corrective actions:
- Verified by:

## Artefacts

- Backup file/checksum:
- Restore log path:
- Screenshot/report links:
