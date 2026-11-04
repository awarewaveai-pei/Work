# codex-oracle review -- 2026-11-04 11:27:34 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/meta-webhook.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Meta webhook accepts deliveries from several Meta apps (one app per company): signature valid under any of META_APP_SECRET or META_APP_SECRET_<appId>; lead content is still read back from Graph with the Page's own token. Also verify: dependencies outside this diff (compose env lines, other users of META_APP_SECRET). If no real finding, return none.
- exit: 0 | elapsed: 115526ms | answer: 1154B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/meta/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/meta-webhook.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 第二個 Meta App 的密鑰未傳入 next-admin，簽章仍會被拒絕
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:330
  confidence  -> CONFIRMED
  scenario    -> 以目前 compose 啟動，並在 `.env` 設定 `META_APP_SECRET_992677007160936`；next-admin 只收到 `META_APP_SECRET`，該 App 的有效簽章在 `route.ts:33` 得到 403。
  why missed  -> 差異只修改了讀取環境變數的程式與測試，沒有修改容器的環境變數宣告。

FINDING 2: Soulful 粉專的 Page token 未傳入容器，名單事件會被確認接收但無法擷取
  file:line   -> lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:332
  confidence  -> CONFIRMED
  scenario    -> 即使補上第二個 App 密鑰，以目前 compose 啟動時也只有 AwareWave 的 Page token。Soulful 粉專 `808838245657038` 的事件會在 `meta-webhook.ts:78-79` 因缺 token 失敗；`meta-leads.ts:113` 將其計為不可重試，`route.ts:48` 回 200，該名單不會再由 Meta 重送。
  why missed  -> 新測試使用空的 `entry`，沒有走到按粉專讀取 Graph 的路徑。

TOTAL: 2 findings
