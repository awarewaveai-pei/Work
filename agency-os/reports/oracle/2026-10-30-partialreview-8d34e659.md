# codex-oracle review -- 2026-10-30 09:14:32 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/report-store.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-incident-atomic.test.ts, scripts/codex-continue.ps1, Projects/internal/cognitive-engineering-os/ai_lego/platform/workflow/run_lock.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_lock.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/decision/eisenhower_matrix.py, Projects/internal/cognitive-engineering-os/tests/unit/test_impact_effort.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Four fixes: (1) collection incidents via upsertIncidentAtomic with env in fingerprint/external_id; (2) codex-continue.ps1 card checks run with allow-list env so Codex-written code gets no inherited secret; (3) COS single-use run-lock files swept when free and stale; (4) eisenhower provenance uses shared genuine_compute_provenance
- exit: 0 | elapsed: 214989ms | answer: 2665B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/blocks/ai.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/modules/decision/eisenhower_matrix.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/workflow/run_lock.py, Projects/internal/cognitive-engineering-os/tests/unit/test_impact_effort.py, Projects/internal/cognitive-engineering-os/tests/unit/test_run_lock.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/report-store.ts, scripts/codex-continue.ps1, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/__tests__/collect-incident-atomic.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: RPC 寫入成功但組織歸屬更新失敗時，collection 事故會從客戶佇列消失。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/report-store.ts:202
  confidence  -> CONFIRMED
  scenario    -> RPC 建立事故後，獨立的 `organization_id` 更新回傳錯誤；函式仍在第 209 行回傳 `ok: true`，但客戶維修頁依 `organization_id` 篩選（`app/(shell)/ops/repairs/page.tsx:64`），因此看不到事故。
  why missed  -> 新 RPC 沒有組織參數；原本單次寫入的歸屬欄位被拆成未納入成功判定的第二次寫入。

FINDING 2: 共用 upsert 會把 collection 事故關聯到其他組織的事故，並可能在全域維修佇列中將它折疊隱藏。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/report-store.ts:194
  confidence  -> CONFIRMED
  scenario    -> 組織 A 的 collection 新事故與組織 B 的其他來源事故相隔不到 15 分鐘，兩者 `client_slug` 都是 null；`upsertIncidentAtomic.ts:92` 觸發關聯，`correlate.ts:76` 只用 `client_slug IS NULL` 篩選，於是 A 的事故可連到 B 的父事故。全域維修頁再按 `parent_incident_id` 折疊子事故（`page.tsx:104-108`）。
  why missed  -> 作者看到了 RPC 的計數功能，卻漏看 helper 在補寫組織歸屬之前還會執行事故關聯。

FINDING 3: 卡片檢查的白名單仍會傳入繼承的資料庫憑證。
  file:line   -> scripts/codex-continue.ps1:145
  confidence  -> CONFIRMED
  scenario    -> 操作者行程已有指向真實資料庫的 `COGNITIVE_OS_TEST_DATABASE_URL`，且同名測試容器已存在；第 253 行不會產生新的測試 URL，第 149–151 行卻將繼承值放進檢查環境。卡片寫入的檢查程式可取得憑證；既有 PostgreSQL 測試也會用該 URL 建立資料庫（`Projects/internal/cognitive-engineering-os/tests/pg.py:38-54`）。
  why missed  -> 白名單限制了變數名稱，但沒有驗證這個允許項的值確實由本次腳本建立。

FINDING 4: collection 事故仍未進入通知流程。
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/report-store.ts:198
  confidence  -> CONFIRMED
  scenario    -> 首次 collection 故障成功建立事故；此路徑只呼叫 atomic upsert 並回傳成功，沒有呼叫通知派送。完整流程在 `lib/ops-inbox/ingest.ts:23-27` 才會執行 `dispatchNotifications`，因此 Telegram／Slack 不會收到這筆事故。
  why missed  -> 作者把 atomic upsert 當成完整的 incident pipeline；新測試只斷言 RPC 呼叫與鍵值。

TOTAL: 4 findings
