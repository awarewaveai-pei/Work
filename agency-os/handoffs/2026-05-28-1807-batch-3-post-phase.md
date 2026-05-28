---
slug: batch-3-post-phase
created_utc: 2026-05-28T10:07:00Z
hint: "Batch 3、Post-Phase 4"
source_session_summary: "完成 Auto-Repair audit Batch 2 (m2/m10/m11)，含 critic Major fix (timingSafeEqual 共用模組)；Batch 3 + Post-Phase 4 尚未開始。"
---

## 1. 任務目標

完成 Auto-Repair audit (2026-05-23) 剩餘 4 Major + 1 Minor：Batch 3 先做 M9/M10/m4（無技術阻礙）；Post-Phase 4 做 M2/M4（架構變更，需事先討論設計）。

## 2. 為什麼做

M2 單一 bearer token 洩漏可偽造全部 5 個 webhook source；M9 TOCTOU 在真實 incident 下有審計資料損毀風險。

## 3. 已試過

Batch 1 commit `c872012`: M7 null-check, M8 path traversal, m6 strict gate, m8-GHA, m9-docstring。
Batch 2 commit `832c562`: m2 timingSafeEqual shared module (`lib/security/timingSafeEqual.ts`), m10 triage archive (migration 0032), m11 RLS deny-anon (migration 0033)。全部 tsc 0 errors / vitest 168/168 pass。

## 4. 卡在哪

等下次 session（無技術阻礙；M2/M4 Post-Phase 需架構設計討論，依賴 M2 先完成）。

## 5. 下一步指令

### Batch 3 — 全部走 R0（git log → analyze → plan → approve → implement → 4-action verify）

**M9 — escalateAnalysisOnlyRun TOCTOU** (service.ts:255-256)

1. 讀 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts` 搜尋 `escalateAnalysisOnlyRun`（約 line 255）。
2. 現況：fetch run → check policy === 'analysis_only' → update state。Race window：兩個 concurrent request 都通過 guard，最終一個覆蓋另一個的 terminal state。
3. 修法選項 A（推薦，minimal）：在 Supabase client 用 `.update().eq('id', id).eq('policy', 'analysis_only').not('state', 'in', '("resolved","rolled_back","human_only")').select('id')` — atomic WHERE predicate；檢查 `data.length === 0` → return error `"state_conflict_concurrent_modify"`。
4. 修法選項 B：新 migration `0034_atomic_escalate_rpc.sql`，PL/pgSQL function `escalate_analysis_only_run(run_id uuid)` 含 `FOR UPDATE` row lock + RETURNING id。
5. 加 test case（concurrent call simulation，第二次呼叫應返回 error）。

**M10 — Sentry retry storm 非 atomic upsert** (sentry/route.ts:43-71)

1. 讀 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/sentry/route.ts:43-71`。
2. 現況：先 SELECT occurrence_count，再 UPDATE = old+1。兩個 concurrent Sentry retry 都讀到 N，都寫 N+1 → 一次 increment 遺失。
3. 修法：新 migration `0034_upsert_incident_atomic.sql`（或 `0035`，取決於 M9 用不用 migration）：
   ```sql
   CREATE OR REPLACE FUNCTION public.upsert_incident_atomic(
     p_fingerprint text, p_source text, p_title text, p_severity text, p_metadata jsonb
   ) RETURNS TABLE(id uuid, transition text, occurrence_count int) ...
   ```
   以 `INSERT ... ON CONFLICT (fingerprint) DO UPDATE SET occurrence_count = ops_incidents.occurrence_count + 1 RETURNING id, ...`
4. `sentry/route.ts` 改呼叫 `.rpc("upsert_incident_atomic", {...})`，移除 read-then-write sequence。
5. Apply migration 到 EU Supabase，real curl test 驗 concurrent write 計數正確。

**m4 — uptime-kuma monitor.hostname attacker-controlled**

1. 搜尋 `app/api/webhooks/uptime-kuma/route.ts` 找 `monitor.hostname` 使用位置。
2. 現況：`hostname` 從 attacker-controlled 欄位取得，可能影響環境推斷或 fingerprint 組成。
3. 修法：禁止以 `monitor.hostname` 推斷 environment/source；改用 `monitor.type`（白名單驗證）+ 固定 `source="uptime-kuma"`。若 hostname 出現在 fingerprint 組成中，改用 `monitor.id`（平台內部 ID，不可偽造）。
4. 加 test case：hostname 含 injection string 時不影響 fingerprint 或 source 欄位。

### Post-Phase 4 — 先討論再動手（M2 → M4 有依賴）

**M2 — per-source HMAC（架構變更，影響 5 個 webhook route）**

1. 討論設計：5 個 env vars（`SENTRY_WEBHOOK_SECRET`, `UPTIME_KUMA_WEBHOOK_SECRET`, `NETDATA_WEBHOOK_SECRET`, `GRAFANA_WEBHOOK_SECRET`, `POSTHOG_WEBHOOK_SECRET`），各自獨立 HMAC signing token。
2. `lib/ops-inbox/verifyIngestToken.ts` 改為 source-aware（或 5 個 source 各自用現有 platform signature 驗證，不共用 bearer token）。
3. ⚠️ 須確認每個 platform 的 webhook 簽名格式（Sentry 用 `sentry-hook-signature`，Uptime Kuma 無簽名、靠 IP allowlist，Netdata 無簽名、靠 token，Grafana 用 `X-Grafana-Token`）— 各 platform 處理不同。

**M4 — fingerprint forgery（依賴 M2 完成後）**

1. Fingerprint 目前含 attacker-controlled `issue.id`/`monitor.id`，可預先 seed 讓真實告警 dedup 進 resolved 狀態。
2. 修法方向：fingerprint 組成加入 source-specific HMAC nonce（M2 的 per-source key 才能做到），或加入 `created_at` 時間窗限制 dedup 範圍。

## 6. 相關資源

- `$WORK_ROOT/agency-os/reports/audit/auto-repair-2026-05-23.md` — M9 §line 143, M10 §line 144, M2 §line 136, M4 §line 138 原始 finding
- `$WORK_ROOT/agency-os/docs/operations/AUDIT_REGISTRY.md` — 目前狀態 SSOT（4 Major: M2/M4/M9/M10；1 Minor: m4）
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/repair-center/service.ts` — M9 target (escalateAnalysisOnlyRun ~line 255)
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/sentry/route.ts` — M10 target (lines 43-71)
- `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/uptime-kuma/route.ts` — m4 target
- `$WORK_ROOT/lobster-factory/packages/db/migrations/` — 最新 migration 是 0033；下一個用 0034 (或 0034+0035 視 M9/M10 是否各需 migration)
- ⚠️ Landmine: M4 必須在 M2 完成後才做；Batch 3 (M9/M10/m4) 和 Post-Phase 4 (M2/M4) 嚴格按序
- ⚠️ Landmine: M10 upsert RPC 需同步更新 `lib/ops-inbox/types.ts` 的 `IncidentSource` + `normalize/` 對應 normalizer（若 atomic function 回傳新欄位）
