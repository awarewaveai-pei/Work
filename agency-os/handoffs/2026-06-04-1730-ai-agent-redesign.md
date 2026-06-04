---
slug: ai-agent-redesign
created_utc: 2026-06-04T09:30:00Z
hint: "要大修\"https://aware-wave.com/\" AI AGENT 去讀 \"Work\\agency-os\\docs\\operations\\APP_AWARE_WAVE_COMPLETE_REFERENCE.md\""
source_session_summary: "2026-06-04 全讀 app.aware-wave.com codebase（1800行文件），發現12個問題，修復線上 webhook 全斷 bug（NOTIFY pgrst reload schema），預備大修改"
---

## 1. 任務目標

大改 `app.aware-wave.com`（Lobster Factory Admin Console）的邏輯架構與 UX，解決 12 個已知問題。

## 2. 為什麼做

現有後台有致命 auth 問題、功能壞掉（WpUpdateButtons 無樣式）、導覽混亂、即時性缺失，不是一個順暢好用的後台。

## 3. 已試過

- **2026-06-04 全讀完整 codebase**：所有頁面、API routes、lib、DB schema、infra 都讀過
- **生成 1800 行參考文件**：`agency-os/docs/operations/APP_AWARE_WAVE_COMPLETE_REFERENCE.md`（包含 §14 完整 12 個問題的 code evidence + 修法）
- **修復線上緊急 bug**：webhook 全斷（PostgREST schema cache 未刷新）→ `NOTIFY pgrst, 'reload schema'` 已修復，09:21 UTC 恢復正常
- **讓 memory 進 git**：`.gitignore` 修改，memory/ 現已 tracked

## 4. 卡在哪

等下班後用筆電繼續，尚未開始任何代碼修改。

## 5. 下一步指令

**閱讀參考文件（必讀第一步）：**

1. 讀 `$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_COMPLETE_REFERENCE.md`（全文 1800 行）
   - §14 是 12 個問題的完整分析（含 code 證據 + 修法）
   - §3 是認證架構（production 403 問題的根因）
   - §6 是每個頁面的完整邏輯

**確認現況：**

2. `git pull` 確認取得最新版本
3. 確認 SG 上 webhooks 正常：`curl -s http://127.0.0.1:3002/api/ops/inbox/health` 應回 `ok: true, ingest_fresh: true`

**優先修的 3 個 🔴 問題（按影響順序）：**

4. **Auth 403（問題 1）**：`middleware.ts` 在 production 下所有頁面需 `x-ops-proxy-auth` header，但 nginx 沒注入。修法：在 `nginx/default.conf` 的 `app.aware-wave.com` server block 加一行注入 header，或改用 Cloudflare Access + claims header。詳見 `APP_AWARE_WAVE_COMPLETE_REFERENCE.md §14 問題1`

5. **WpUpdateButtons 無樣式（問題 2）**：`app/ops/clients/[slug]/WpUpdateButtons.tsx` 全用 Tailwind class 但 app 無 Tailwind。修法：把所有 `className="bg-red-600..."` 等 Tailwind class 換成 inline style。詳見 §14 問題2

6. **Repair Center 佇列邏輯（問題 5）**：`app/ops/repairs/page.tsx:83` 的 `incidents.filter(i => !runsByIncident.has(i.id))` 需改為只過濾 active-state runs。詳見 §14 問題5

**🟠 混亂問題（第二批）：**

7. 統一名稱：「Ops Inbox」/「Incident Engine」同一頁面，選一個名稱並修 `layout.tsx` + `page.tsx`
8. 合併兩個 Onboarding 入口（`/onboard` 和 `/ops/onboarding` 做同樣的事）

**追蹤改動後重新部署：**

9. 修完一項 → `git commit` → `sg-deploy.sh` → 驗證 smoke test pass
10. 若 DB 有新 migration → 在 EU VPS 跑 `docker exec supabase-db psql -U postgres postgres -c "NOTIFY pgrst, 'reload schema';"` 刷新 schema cache（2026-06-04 的教訓）

## 6. 相關資源

**核心參考（必讀）：**
- `$WORK_ROOT/agency-os/docs/operations/APP_AWARE_WAVE_COMPLETE_REFERENCE.md` — 1800行完整系統知識 + 12問題分析

**修改目標檔案：**
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/nginx/default.conf` — 問題1 修法
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/[slug]/WpUpdateButtons.tsx` — 問題2
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/repairs/page.tsx` — 問題5（line 83）
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/layout.tsx` — 問題3（名稱統一）

**部署流程：**
- SG VPS：`5.223.93.113`，`/root/lobster-phase1/scripts/sg-deploy.sh`
- EU DB schema reload：`docker exec supabase-db psql -U postgres postgres -c "NOTIFY pgrst, 'reload schema';"`

**⚠️ 陷阱：**
- `NEXT_PUBLIC_*` 變數在 docker build 時 bake 進去，改了要重 build（不只 restart container）
- sg-deploy.sh 跑 `npm test` gate，測試失敗會 abort，不要繞過
- migration 0035 的 `upsert_incident_atomic` 函數已存在但之前 schema cache 未刷新導致 2h 中斷，修任何 migration 後記得 `NOTIFY pgrst, 'reload schema'`
