# codex-oracle review -- 2026-11-19 23:36:03 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: Fix: our social 重新連接 sent Postiz its ROW id as ?refresh=, but Postiz (own UI: refresh=integration.internalId; youtube.provider.ts reConnect requires refresh among the authorized account's channel ids) needs the PLATFORM channel id, so every reconnect ended in 'Channel not found' (reproduced 2026-11-19; with the channel id it succeeded). Public API has no internalId, so: migration 0171 adds social_accounts.postiz_internal_id; host script social-channel-health.sh now includes internalId; channel-health.ts parses it (optional, strict) and writes it when it differs (all accounts incl. disabled); store.ts startConnect sends postiz_internal_id and refuses with 409 before creating an attempt when it is not synced yet. Report only real defects.
- exit: 0 | elapsed: 173836ms | answer: 623B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/audit.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/channel-health.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/channel-health.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/scripts/social-channel-health.sh, lobster-factory/packages/db/migrations/0171_social_accounts_postiz_internal_id.down.sql, lobster-factory/packages/db/migrations/0171_social_accounts_postiz_internal_id.sql, lobster-factory/packages/db/scripts/0171_social_accounts_postiz_internal_id_down.sql
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 超過 1,000 個社群帳號後，部分帳號永遠無法同步平台頻道 ID
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/channel-health.ts:83
  confidence  -> CONFIRMED
  scenario    -> `social_accounts` 有 1,001 筆時，這個未分頁查詢只取得前 1,000 筆（上限見 `lib/supabase-paging.ts:1`）。第 1,001 筆的 `postiz_internal_id` 持續為空；即使每五分鐘同步正常執行，按「重新連接」仍固定收到 409。
  why missed  -> 新測試只用少量帳號驗證同步，沒有涵蓋單次查詢的筆數上限。

TOTAL: 1 findings