# A10-2 Evidence (Business Loop)

## Checklist
- [x] Staging flow executed（本機 `regression:staging-pipeline` **4/4**，含 `install-from-manifest.sh` **DRY_RUN**）
- [x] Acceptance evidence captured（drill 報告 + 本檔；行為為 dry/preview，非真 WP 裝件）
- [ ] Production trigger prepared/executed（**未做** — 仍需核准與 Trigger／DB 實跑後補）
- [x] Artifacts/logs_ref recorded（本地 shell 輸出已留在終端記錄；無遠端 artifact sink 本輪）
- [x] WORKLOG + memory synced（`WORKLOG.md` 2026-04-01 A10-2 條目 + 本 commit）

## Execution plan (next run)
1. Readiness: `powershell -ExecutionPolicy Bypass -File .\scripts\preflight-onboarding-a10-2-readiness.ps1`（已修復：monorepo 根執行時自動解析 `agency-os`）
2. Payloads（路徑以本機為準）:
   - `cd C:\Users\USER\Work\lobster-factory`
   - `npm run payload:create-wp-site -- --siteName=pilot-main`
   - `npm run payload:apply-manifest -- --wpRootPath="C:\Users\USER\Work\.scratch\wp-dummy"`
3. Staging regression（**4/4** 需 `--wpRootPath`）:  
   `npm run regression:staging-pipeline -- --wpRootPath="C:\Users\USER\Work\.scratch\wp-dummy"`
4. Drill report（含 4/4）:  
   `node scripts/emit-staging-drill-report.mjs --wpRootPath="C:\Users\USER\Work\.scratch\wp-dummy"`
5. Production / Trigger：待下一階段與 `03-run-id-map.md` 真實 ID。

## Evidence (2026-04-01 desktop run)
- **preflight**: PASS（bootstrap + artifacts governance）
- **wp_root**: `C:\Users\USER\Work\.scratch\wp-dummy`（空目錄占位）
- **workflow_run_id**: `n/a`（本輪僅本機 **run-staging-pipeline-regression**，未送 Trigger `workflow_runs`）
- **package_install_run_id**: `n/a`（**DRY_RUN**；未執行真實 `wp-cli`）
- **logs_ref**: `n/a`（本地 stdout；見 drill 報告 Notes）
- **e2e_report_path**: `agency-os/reports/e2e/staging-pipeline-drill-20260401-113446.md`
- **rollback_path**（if any）: `lobster-factory/scripts/rollback-apply-manifest-staging.mjs`
- **engineering fixes this run**（可重現性）:
  - `scripts/preflight-onboarding-a10-2-readiness.ps1`（根目錄）：monorepo 下自動選 `agency-os`
  - `execute-apply-manifest-staging.mjs`：Windows 自動解析 Git `bash.exe`
  - `install-from-manifest.sh`：**DRY_RUN=1** 時不強制 PATH 內 `wp`（仍列印預定 wp 指令）
  - `emit-staging-drill-report.mjs`：支援 `--wpRootPath=` 以對齊 **4/4** regression

## Notes
- P1 onboarding 已完成；本檔更新為 **A10-2 本機 staging 管線** 一次完整 pass（dry）。真實商業閉環（production、DB、artifacts）留待下一輪。
