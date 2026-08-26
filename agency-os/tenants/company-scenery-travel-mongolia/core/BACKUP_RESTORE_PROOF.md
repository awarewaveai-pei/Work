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

# Backup and Restore Proof — Scenery Travel Mongolia

> 客觀證據；與 `ENVIRONMENT_REGISTRY` 欄位互相對齊更新。
>
> **2026-05-22 治理修訂**：本 tenant **尚未 onboard**（staging 環境尚未建立，無 production site 也無 baseline backup）。
> Phase 4 routine 看到 `status: not-onboarded` 應該 **SKIP**（不算 WARNING），詳見 `agency-os/automation/claude-routines/phase4-weekly.md`。
> Tenant onboarding 完成後（staging URL 寫入 ENVIRONMENT_REGISTRY + 首次 backup），把 frontmatter `status` 改為 `active` + 填其餘欄位。

## Backup Record

- Tenant: Scenery Travel Mongolia
- Site: scenery-travel-mn
- Environment: **staging**（production 上線後另列一筆）
- Backup timestamp: **待補**（**staging 實機**就緒後首次備份時填入；staging **canonical URL** 已定見 `ENVIRONMENT_REGISTRY.md`）
- Backup scope: DB / uploads / full snapshot
- Storage location: **待補**（UpdraftPlus + cloud storage 路徑）
- Retention policy: **待補**（建議：30 天）
- Operator:

## Restore Drill Record

- Drill date: **待執行**（Day 4 Pre-Production Gate 前完成）
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
