# codex-oracle review -- 2026-11-02 08:49:13 +08:00

- mode: `review`
- scope: -Path lobster-factory/packages/db/migrations/0153_co_replies.sql, lobster-factory/packages/db/migrations/0153_co_replies.down.sql, lobster-factory/packages/db/tests/test_0153_co_replies.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/replies/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/replies/RepliesClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/host-jobs.ts, lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Outbound OS v2 card C4 reply sync: migration 0153 co_replies + co_mark_sent/co_mark_unsent/co_apply_reply/co_fail_reply; Gmail read-only sync every 10 min (sent detection per message, history cursor, claim-then-classify, retry 5), Replies page. Spec: agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md section 5.6. Focus: double counting, cursor skipping mail, wrong lead matched, follow-up wrongly marked sent, privacy (unmatched inbox mail must never be stored), lock order vs co_begin_send.
- exit: 0 | elapsed: 130292ms | answer: 2193B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/connectors/SendersCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/messages/gmail-draft/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/senders/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/google-oauth.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/host-jobs.ts, lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/tools/outreach/replies/RepliesClient.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/outreach/gmail-sync/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/outreach/replies/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/__tests__/gmail-sync.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-api.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts, lobster-factory/packages/db/migrations/0153_co_replies.down.sql, lobster-factory/packages/db/migrations/0153_co_replies.sql, lobster-factory/packages/db/tests/test_0153_co_replies.py
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 全域 2,000 筆上限使部分 Gmail 草稿永遠不會對帳  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts:310`  
  confidence  -> CONFIRMED  
  scenario    -> 全系統累積超過 2,000 封 `drafted`／`sending` 訊息時，每個信箱只從同一批全域查詢結果尋找自己的草稿；未進入這批結果的信即使已寄出，也不會改為 `sent`。  
  why missed  -> 上限設在按信箱篩選事件之前；少量假資料測試不會觸及它。

FINDING 2: 寄件地址與對話串指向不同 lead 時，回信會歸給錯誤組織  
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/gmail-sync.ts:180`  
  confidence  -> CONFIRMED  
  scenario    -> 同一地址在組織 A、B 各有一筆 lead；信件位於 A 的已寄對話串，但 B 有較新的寄送事件。地址查詢會選 B，且優先於已查出的 A 對話串，於是回信內容及副作用記到 B。  
  why missed  -> 地址比對與對話串比對各自看似合理；兩者衝突時的優先順序未經測試。

FINDING 3: 分類失敗後，已收到的回信仍容許追蹤信繼續  
  file:line   -> `lobster-factory/packages/db/migrations/0153_co_replies.sql:230`  
  confidence  -> CONFIRMED  
  scenario    -> 回信已認領，但 AI 分類連續失敗四次；`co_fail_reply` 到第五次才停止追蹤信。在此期間 lead 的追蹤日期及待寄訊息仍有效，追蹤信可在對方回覆後寄出。  
  why missed  -> 測試驗證了第五次失敗的最終狀態，沒有驗證前四次的停寄狀態。

FINDING 4: 已建成 Gmail 草稿的追蹤信不會被回信流程標為跳過  
  file:line   -> `lobster-factory/packages/db/migrations/0153_co_replies.sql:138`  
  confidence  -> CONFIRMED  
  scenario    -> 追蹤信狀態為 `drafted`、Gmail 草稿已存在；lead 回信並成功分類後，`co_stop_followups` 只跳過 `draft`／`approved`，該追蹤信仍保持 `drafted`，之後可被人工寄出並由同步標記為已寄。  
  why missed  -> 停寄測試使用 `draft` 狀態，未覆蓋已建立 Gmail 草稿的狀態。

TOTAL: 4 findings
