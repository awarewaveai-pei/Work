# 第 5 項：買斷安裝（一鍵裝到客戶主機、授權檔、交接撤鑰）

**風險** High（交付；碰客戶主機）　**模型** Fable 5.1 設計 → Opus 5.5 做　**前置** 第 3 項（can()）＋第 4 項（付款）；待決 2（Postiz AGPL 律師）　**正本** ADR 017 §5、§6、順序 5；ADR 018 §4；一鍵架站總藍圖 Stage 4

## Decision
- 模組清單：`lib/portal/products.ts` 每列加 `modules: { services: string[], env: string[], dependsOn: ProductKey[] }`（例：social → next-admin、supabase、trigger、postiz；env：`POSTIZ_API_KEY`、`PUBLIC_BASE_DOMAIN`…）。登記表測試：`standalone: true` 的產品，其 `dependsOn` 閉包內不得含 SAFETY_GATE 功能。
- 建置變體：`next-admin` Dockerfile build arg `BUYOUT=1` → 含 SAFETY_GATE 功能的檔案不進 image（`lib/portal/safety-gated.ts` 列檔案清單；建置時 tsc 排除＋測試證明 image 內 grep 不到）。
- 授權檔：`scripts/issue-licence.mjs --customer <slug> --modules social,design --max-tenants 1 --updates-until 2027-10-16` → JSON＋Ed25519 簽章（私鑰 `LICENCE_SIGNING_KEY`，vault）。安裝內 `lib/entitlements/licence.ts` 離線驗章，`can()` 在 `self_hosted` 模式從它回答；`report()` 不做事。
- 安裝流程（新 workflow `provision/buyoutInstall.ts`，排在 Stage 4 之後）：客戶主機商 token 進 `serverAdapterFactory`（每次呼叫帶客戶 token，不存我方）→ 裝 compose 棧（選到模組的聯集）→ 寫授權檔 → 跑 smoke → 交接：撤我方 SSH key、撤所有我方密鑰；客戶買維運才留一把維運 key（標在授權檔 `maintenance_key_id`）。
- 更新管道：版本＝簽章的 release（image tag＋migrations＋changelog）放我方 registry；安裝內 `updates_until` 內可拉。過期不擋使用。
- 客戶已有網站：wp-bridge 接進來（§6），不搬站。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`（modules）、`lib/portal/safety-gated.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/Dockerfile`（build arg）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/licence.ts`、`__tests__/licence.test.ts`
- `scripts/issue-licence.mjs`
- `lobster-factory/packages/workflows/src/provision/buyoutInstall.ts`、`serverAdapterFactory.ts`
- `agency-os/docs/operations/APP_AWARE_WAVE_PROVISIONING_MASTER_PLAN.md`（加「買斷安裝」階段一節）

## Acceptance
```bash
cd D:/Work && node scripts/issue-licence.mjs --customer demo --modules social --max-tenants 1 --updates-until 2027-10-16 --out $env:TEMP/demo.licence.json
```
→ 檔案含 `kid`、`signature`；
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/entitlements/__tests__/licence.test.ts
```
→ 綠：驗章 ok；改一 byte 拒；`updates_until` 過期仍 `allowed:true`；`max_tenants=1` 時第 2 個根組織建立被拒。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && docker build --build-arg BUYOUT=1 -t next-admin:buyout . && docker run --rm next-admin:buyout sh -c "grep -rl SAFETY_GATE_IMPL /app/.next || echo absent"
```
→ `absent`。
真實：在拋棄式 VM（本機 Multipass 或一台時租主機）跑 `buyoutInstall` → 所有服務 healthy、smoke 綠；斷網後產品門仍可登入、按鈕可用；交接後 `ssh` 用我方 key 被拒。
突變：拔掉 licence 驗章 → 指名測試紅；還原綠。

## Rollback
安裝失敗自動 `docker compose down -v` 並刪授權檔；我方 repo `git revert`；不留任何客戶主機 token。
