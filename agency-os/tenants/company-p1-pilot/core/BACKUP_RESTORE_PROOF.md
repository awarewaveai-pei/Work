---
# Phase 4 backup monitoring metadata (machine-readable)
status: not-onboarded
onboarded_at: null
backup_schedule: null
backup_destination: null
# 2026-08-26 schema：記錄演練「事實」，到期日由 scripts/phase4-checks.py 推算
# （舊 restore_drill_due_after / last_known_success_utc 為推導值與手抄鏡像，已退役）
restore_drill_interval_days: 90
restore_drills:
truth_source: null
---

# Backup and Restore Proof — P1 Pilot

> **2026-05-22 治理修訂**：本 tenant **尚未 onboard**（客戶仍在 design / sales 階段），無 production site 也無 baseline backup。
> Phase 4 routine 看到 `status: not-onboarded` 應該 **SKIP**（不算 WARNING），詳見 `agency-os/automation/claude-routines/phase4-weekly.md`。
> Tenant 真的開始 backup 後，把 frontmatter `status` 改為 `active` + 填其餘欄位 + 補下方 Backup Record。

## Backup Record

- Tenant: P1 Pilot Tenant
- Site: pilot-main
- Environment: staging（production N/A）
- Backup timestamp: **待補**
- Backup scope: **待補**
- Storage location: **待補**
- Retention policy: drill — 依內部約定
- Operator:

## Restore Drill Record

- Drill date: **待執行**
- Restore target:
- Duration:
- Result: PASS / FAIL
- Issues found:
- Corrective actions:
- Verified by:

## Artefacts

- Backup file/checksum: **待補**
- Restore log path:
- Screenshot/report links:
