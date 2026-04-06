# Phase 1 維護日曆（可列印／可複製）

> **敘事與原則**：見 [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md)（Owner）。  
> **用法**：每次做完在 **外部**行事曆打勾，並在 `agency-os/WORKLOG.md` **一句話**留痕（不含祕密）。

---

## 每週（或每次維護窗）

- [ ] 主機 **`df -h`**、inode、Docker 儲存空間正常  
- [ ] **`docker compose ps`** 無異常重啟循環；必要時 `docker compose logs -f --tail=200 <service>`  
- [ ] 安全更新／重開機窗（若使用 `unattended-upgrades` 等）無待處理失敗

---

## 每月

- [ ] **基礎映像 CVE**：n8n、WordPress、MariaDB、Redis、Nginx — 有無 **緊急安全釋出**（有則 **staging 先**）  
- [ ] **備份**：確認 `backup-phase1.sh` 或等效任務 **有執行**；抽查 **異地** 是否收到檔案  
- [ ] **Supabase（SoR）**：依 monorepo **`agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`**／營運 SOP 的備份與監控（**不在**本 compose 內）

---

## 每季

- [ ] **祕密輪替**：DB root／WP DB user／API keys（依 monorepo **`agency-os/docs/operations/security-secrets-policy.md`**）  
- [ ] **`N8N_IMAGE_TAG`**（及其他第三方 tag）：是否仍 **刻意**使用 `latest`？production 應 **semver 或 digest**（見 `LONG_TERM_OPS.md` §3）  
- [ ] **TLS／DNS**：憑證到期日、自動續期是否正常  
- [ ] **防火牆**：SSH 仍限來源？未對外開 DB／Redis？

---

## 每年（至少一次）

- [ ] **災難還原演練**：在 **隔離 VM** 還原 WP DB+檔案與 n8n 卷策略；Supabase **單獨演練**  
- [ ] **RPO／RTO**：數字是否仍成立？責任人／escalation 是否仍有效？  
- [ ] **汰換評估**：單機 compose 是否仍滿足合規／SLA？若否，排 **ADR + 遷移**（見 `LONG_TERM_OPS.md` §7）

---

## 一鍵指令參考（在 `hetzner-phase1-core` 目錄、已載入 `.env` 時）

```bash
docker compose ps
docker system df
./scripts/backup-phase1.sh
```

---

## Related

- **全堆疊索引**：`agency-os/docs/operations/hetzner-stack-rollout-index.md`  
- [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md)  
- [`README.md`](./README.md)
