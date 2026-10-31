# Cold Outreach Workbench — Phase 1 Build Plan（MVP 實作排程）

> 對應 SSOT：[`COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md`](./COLD_OUTREACH_WORKBENCH_INTEGRATED_SPEC_v1.md)
> 範圍：Spec §G3 Phase 1 + §G4 MVP，已折入決策（客戶 Gmail / 你幫找 / 訂閱 / 無 SES / `co_` prefix）與 PART H（Free-Plan Router 前移 Phase 1）。
> 建立：2026-06-23｜狀態：**進行中 — Phase 1 ungated 全完成，剩 T10（Gmail per-org OAuth，⚠️High，gated）**（2026-08-25 訂正：原寫「未開始」已過期；T1 migration `0048_co_outreach_core.sql`、T2–T9/T11/T12 的 `lib/outreach/` + 7 條 `app/api/outreach/*` route + `app/(shell)/outreach` UI 均已落地）

---

## 0. Phase 1 完成定義（DoD）

操作者能在 next-admin 完成一條完整冷開發鏈：
**建 Service Profile → 匯名單進 Inbox（去重+suppression）→ AI 評分 → 生冷信（Cold Gate + evidence）→ 人工審核 Approve → 建客戶 Gmail 草稿（人工寄）→ 設 follow-up**，全程 org-scoped、用 Free-Plan Router（客戶 BYO-key 優先）、不自動寄信、不碰金流。

## 1. 任務依賴圖

```
T1 schema/RLS ──┬─ T2 module 殼 ──┬─ T3 Service Profile
                │                 ├─ T4 Connector+Router+BYO-key
                │                 └─ T12 Suppression UI
                ├─ T5 Lead Inbox(import/dedup/suppression) ── T7 Leads CRUD
                ├─ T6 AI Scoring(enrichLead) ───────────────┐
                └─ ...                                       ├─ T8 Message Gen(Cold Gate+evidence)
                                              T7,T6 ─────────┘     └─ T9 Message Review UI
                                                                         └─ T10 Gmail OAuth+Draft ⚠High
                                              T7 ── T11 Follow-up dashboard
```
關鍵路徑：**T1 → T2 → T4 → T5 → T6 → T8 → T9 → T10**。

## 2. 任務清單（6 要素契約）

### T1 — DB migrations `0048+`：co_ schema（Phase-1 子集）+ service-role RLS ⚠️High（DB）
- **Goal**：建 Phase 1 需要的表，org-scoped + service-role RLS，可回滾。
- **Scope（表）**：`co_service_profiles`、`co_lead_inbox`、`co_leads`、`co_messages`、`co_suppression_list`、`co_connector_accounts`、`co_connector_usage`、`co_connector_limits`、`co_sender_accounts`、`co_sending_events`、`co_timeline_events`、`co_verified_emails`（dedup cache）。（campaigns/replies/proposals/experiments/analytics 留 Phase 2。）
- **Input**：Spec PART B DDL。
- **Output**：`lobster-factory/packages/db/migrations/0048_co_outreach_core.sql`（+ 視需要拆 0049 RLS）。
- **Acceptance**：在 EU Supabase apply 乾淨；RLS enabled；含 rollback 區塊（比照 0041）；過 splinter/RLS-initplan lint；**db-expert 審過**。
- **Boundaries**：不改既有表；不寫 seed 真實資料。

### T2 — next-admin module 殼 `app/outreach/` + org-scoped data layer
- **Goal**：sidebar + 路由 + server-side org scoping helper（Clerk session → active org → service-role query 自動 `WHERE organization_id`）。
- **Input**：既有 `app/ops`、`app/tools` 殼；Clerk 中介層。
- **Output**：`app/outreach/layout.tsx` + 16 頁 route stub + `lib/outreach/db.ts`（org-scoped client）+ `lib/outreach/auth.ts`（operator 跨 org 檢查，沿用 ops-console）。
- **Acceptance**：頁面渲染；非本 org 查詢被擋（寫一個 e2e 證明隔離）；`tsc --noEmit` 乾淨。
- **Boundaries**：先 stub UI，不做完整頁面邏輯。

### T3 — Service Profile CRUD
- **Goal**：建/改服務設定檔（含 forbidden_words/replacement_words）。
- **Depends**：T1、T2。
- **Output**：`app/outreach/settings/service-profiles/*` + server actions。
- **Acceptance**：CRUD 真寫 Supabase；REALTEST（建一筆→讀回→改→刪）；tsc 乾淨。

### T4 — Connector 層 + Free-Plan Router + 客戶 BYO-key onboarding（PART H 核心）
- **Goal**：每 org 存 BYO free key（→ secrets-vault `credentials_ref`，不硬編）；Router fallback ladder；Quota Guard 讀 `co_connector_limits`。
- **Depends**：T1、T2。
- **Output**：`lib/outreach/connectors/router.ts`（AI/verify/scrape/send 各一條 fallback）+ `app/outreach/connectors/*` + onboarding「收 client free key」步驟。
- **Acceptance**：Router 單元測試（每條 ladder 命中正確 fallback）；quota 達 100% 自動降級 REALTEST；key 只存 ref 不存實值（grep 證明無硬編）。
- **Boundaries**：Phase 1 只接 Gemini + Hunter + 手動 fallback；Apify/Snov 留 Phase 3。

### T5 — Lead Inbox：import（CSV/手動）→ normalize → dedup → suppression check → `co_lead_inbox`
- **Goal**：匯入暫存，不污染正式 leads。
- **Depends**：T1、T4。
- **Output**：`app/outreach/inbox/*` + n8n「Import Leads」workflow（per-org webhook）。
- **Acceptance**：CSV 匯入 REALTEST；重複名單 dedup 命中；suppression 命中被擋；`co_verified_emails` 不重驗。

### T6 — AI Scoring（Trigger.dev `enrichLead`）
- **Goal**：quality/contactability/ICP 三分數 → 寫 `co_leads`，走 Router（Gemini BYO）+ `ai_call_logs`。
- **Depends**：T1、T4、T5。
- **Output**：`packages/workflows/src/trigger/co-enrich-lead.ts`。
- **Acceptance**：對 inbox 一筆跑出三分數 + priority（REALTEST 真 invoke）；AI 成本記 `ai_call_logs`；Gemini free tier **不送 PII**（只送 observation）驗證。

### T7 — Leads CRUD + list/filter + Approve-to-Leads
- **Depends**：T1、T5。
- **Output**：`app/outreach/leads/*`（表格/篩選/Lead Detail）+ inbox→leads approve 動作。
- **Acceptance**：approve 後 inbox→leads 狀態轉換 REALTEST；篩選器運作；tsc 乾淨。

### T8 — Message 生成（Trigger.dev `generateOutreachPack`）+ Cold Gate + evidence_snapshot + safety lint
- **Goal**：生冷信/follow-up，過 Cold Gate（observation/source_url 必填、純文字、拒收句、禁用詞），帶 evidence_snapshot。
- **Depends**：T6、T7。
- **Output**：`packages/workflows/src/trigger/co-generate-outreach-pack.ts` + `co-safety-lint.ts`。
- **Acceptance**：缺 observation→block REALTEST；禁用詞→block；產物含 evidence_snapshot；unsupported_claims 非空→warn。

### T9 — Message Review UI + Approve + Safety/Evidence panel
- **Depends**：T8。
- **Output**：`app/outreach/review/*`（左 context / 中 draft / 右 safety+evidence+actions）+ 重生選項。
- **Acceptance**：approve 寫 `co_messages.status`；panel 顯示真 evidence/safety；critic 審 UI 邏輯。

### T10 — Gmail per-org OAuth + 建草稿（n8n）+ sender daily limit ⚠️High（auth/憑證）
- **Goal**：用**客戶自己的 Gmail** OAuth 建草稿（不自動寄），記 `co_sending_events(draft_created)`，守 sender daily limit。
- **Depends**：T2、T4、T9。
- **Output**：Gmail OAuth 連線（per-org）+ n8n「Gmail Draft」workflow。
- **Acceptance**：真建一封 Gmail 草稿 REALTEST（用測試 Gmail）；超 daily limit 被擋；**只建 draft 不寄出**驗證。
- **Boundaries**：**High risk — 等明示 go-ahead 才接真實憑證**；先用測試帳號。

### T11 — Follow-up date + dashboard（Trigger.dev `dailyFollowupScan`）
- **Depends**：T7。
- **Output**：`app/outreach/followups/*` + cron task（`0 9 * * *`）。
- **Acceptance**：`next_followup_date <= today` 進今日任務 REALTEST。

### T12 — Suppression 管理 UI + Global Gate 強制
- **Depends**：T1。
- **Output**：`app/outreach/settings/suppression/*` + 寄送前必查邏輯。
- **Acceptance**：手動加/匯入 suppression；解除需二次確認；任何寄送動作前查 suppression REALTEST。

## 3. 治理（強制）

- **新部署面 6 件套**（AGENTS.md）：① unit test gate ② docker healthcheck ③ HTTP smoke ④ rollback runbook ⑤ Slack/TG 通知 ⑥ typecheck gate。outreach module 上 sg-deploy 前補齊。
- **每個 `.ts/.tsx` 改動**：`npx tsc --noEmit` + `/review`（critic）+ REALTEST，才宣告完成。
- **T1（DB）/ T10（Gmail 憑證）= High risk**：列風險 + rollback，等 go-ahead。
- **n8n / Trigger.dev 改動**：召喚對應 agent；改後 health check。

## 4. 建議起手順序（最小可驗證切片）

1. **T1 → T2**（地基：schema + 殼 + org 隔離證明）
2. **T4**（Router + BYO-key，成本骨幹先立）
3. **T5 → T6 → T7**（名單進得來、評得了分、看得到）
4. **T8 → T9**（生文案 + 審核）
5. **T10**（Gmail 草稿，High risk 最後接，先測試帳號）
6. **T11 / T12 / T3**（補齊）

> 每完成一個 T：跑 `/verify-recent` + `/checkpoint`；跨 3+ 模組的 T（T4/T5/T8）建議先召 `planner` 細拆再寫。
