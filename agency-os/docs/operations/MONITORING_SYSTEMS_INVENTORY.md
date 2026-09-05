# Monitoring Systems Inventory

Updated: 2026-09-05

## Why this file exists

Before 2026-09-05 there was no single place listing every monitoring/uptime-checking system actually running across AwareWave's own stack, every client site, and the tools (like MainWP) that manage them. That gap let MainWP's own built-in Uptime Monitor feature run silently for an unknown period, fully duplicating Uptime Kuma, on the same sites, with nobody aware it existed (see `AWARE_WAVE_OBSERVABILITY_BASELINE.md`'s "MainWP built-in Uptime Monitor" section for the incident).

This file is the index. It does not replace the detail docs it links to — update those for depth, update this one whenever a system/zone/site is added, removed, or its role changes.

## AwareWave internal stack

Full detail, per-tool split ("what each tool's job is, what NOT to use it for"), and the Netdata/Sentry/PostHog/Slack baselines: **`AWARE_WAVE_OBSERVABILITY_BASELINE.md`**.

## Uptime Kuma — single source of truth for all HTTP/keyword uptime checks

Instance: `uptime.aware-wave.com`, container `uptime-kuma` on `ks-aw-01` (`145.239.195.47`). DB: `/app/data/kuma.db` inside the container. Fix procedure: `runbooks/UPTIME-KUMA-MONITOR-FIX.md`.

All 22 active monitors, as of 2026-09-05 (`sqlite3 kuma.db "SELECT id,name,type,active,interval,url FROM monitor ORDER BY id"`):

| id | name | type | interval | target |
|---|---|---|---|---|
| 1 | n8n | http | 60s | `n8n.aware-wave.com/healthz` |
| 2 | Trigger.dev | http | 60s | `trigger.aware-wave.com/...` |
| 3 | WordPress (aware-wave.com) | http | 60s | `aware-wave.com/` |
| 4 | Node API Health | http | 60s | `api.aware-wave.com/health` |
| 5 | Supabase Auth | http | 60s | `supabase.aware-wave.com/auth...` |
| 6 | Supabase Studio | http | 60s | `studio.aware-wave.com/` |
| 7 | app.aware-wave.com | http | 60s | `app.aware-wave.com/api/ops...` |
| 8 | API Health | http | 60s | `api.aware-wave.com/health` |
| 9 | Uptime Kuma (self) | http | 60s | `127.0.0.1:3001/` |
| 12 | Cloudflare Status | http | 60s | `cloudflarestatus.com` (upstream status page) |
| 13 | PostHog Status | http | 60s | `status.posthog.com` (upstream) |
| 14 | Resend Status | http | 60s | `resend.statuspage.io` (upstream) |
| 15 | Sentry Status | http | 60s | `status.sentry.io` (upstream) |
| 18 | Supabase Storage | http | 60s | `supabase.aware-wave.com/storage...` |
| 19 | Supabase Realtime | http | 60s | `supabase.aware-wave.com/realtime...` |
| 20 | Redis health | http | 60s | `api.aware-wave.com/health` |
| 21 | AwareWave endpoint-alert (KS-6) | push | 120s | local push monitor, reported by `awarewave-endpoint-alert.timer` |
| 22 | MainWP Dashboard | http | 60s | `mainwp.aware-wave.com/` |
| 23 | Soulful Expression (reachability) | http | **180s** (was 60s, widened 2026-09-05) | `soulfulexpression.org/` |
| 24 | Soulful Expression — WP REST API | http | **180s** | `soulfulexpression.org/wp-json/` |
| 25 | Soulful Expression — homepage content | keyword | **180s** | `soulfulexpression.org/` |
| 26 | AwareWave WP REST API | http | 60s | `aware-wave.com/wp-json/` |
| 27 | AwareWave — homepage content | keyword | 60s | `aware-wave.com/` |

**Adding a new client site's uptime check goes here, not into a separate system.** If MainWP or any other tool's own built-in uptime feature is ever considered, retire the corresponding Kuma monitor(s) first — see the baseline doc's redundancy note.

## Cloudflare — all zones, one account

Per-zone security settings verified live via CF API 2026-09-05 (`bot_management.fight_mode`, `settings/waf`):

| Zone | Status | Real traffic? | Bot Fight Mode | WAF | Notes |
|---|---|---|---|---|---|
| `aware-wave.com` | active | Yes (internal stack) | **ON** | off (server-side LLAR defense instead — see `check-cloudflare-security.ps1` header) | Reference posture — this is the zone everything else should match for a live site |
| `soulfulexpression.org` | active | Yes (client site) | **off** | off | Zone created 2026-08-15 for the Hostinger→Cloudflare DNS cutover; Bot Fight Mode was never turned on. **Open decision, not yet actioned** — see Known Gaps below |
| `hope-flow.org` | active | No — zero DNS records | off | off | Parked/brand-defense domain only, no origin to protect (`AWAREWAVE_STACK_QUICKREF.md`) |
| `weartheworld.org` | active | No — zero DNS records | off | off | Same as above |
| `wusheng.foundation` | active | No — zero DNS records | off | off | Same as above (WuSheng Healing Module™ brand hold, see memory `project_content_engine_ssot`) |

The three parked domains' off/off posture is not a gap — there is nothing behind them to attack. Only `soulfulexpression.org` is a live site currently missing the protection `aware-wave.com` has.

## MainWP fleet

Dashboard: `mainwp.aware-wave.com`, containers `mainwp-web` + `mainwp-db` on `ks-aw-01`. 2 managed sites (`mwp_mainwp_wp` table): `soulfulexpression.org` and the internal `aware-wave.com` WordPress install.

- **Job**: backups (WPvivid extension), plugin/core update tracking, health sync — see `AWARE_WAVE_OBSERVABILITY_BASELINE.md`'s Monitoring Split table.
- **Not its job**: uptime/reachability alerting. Its own built-in Uptime Monitor feature was found silently active (60s interval, duplicating Kuma) and **disabled 2026-09-05** — full incident writeup and the "don't re-enable" rationale live in the baseline doc's dedicated section. Check `mwp_options.mainwp_global_uptime_monitoring_settings` → `active` should read `0`.

## Client sites — which are actually live

Only sites at `Stage: Live` in a tenant's `SITES_INDEX.md` need production monitoring; `Discovery`/`Build` stage sites don't yet.

| Tenant | Site | Stage | Production URL | Detail doc |
|---|---|---|---|---|
| `company-soulful-expression` | `soulfulexpression-org` | **Live** | `https://soulfulexpression.org/` | `tenants/company-soulful-expression/sites/soulfulexpression-org/OBSERVABILITY_HOSTINGER.md` |
| `company-p1-pilot` | `pilot-main` | Discovery | — | `tenants/company-p1-pilot/SITES_INDEX.md` |
| `company-scenery-travel-mongolia` | `scenery-travel-mn` | Build | 待補（上線前確認） | `tenants/company-scenery-travel-mongolia/SITES_INDEX.md` |

`OBSERVABILITY_HOSTINGER.md` documents the **交包（full handover）** observability model for that client (their own Slack/Sentry/Uptime accounts) — that model governs alert *ownership*, not the fact that we also run Kuma monitors 23/24/25 + a MainWP entry for the same site during/pending handover. Both can be true at once; don't read "client owns their observability" as "we run nothing for them."

## Known gaps

- **`soulfulexpression.org` Cloudflare zone Bot Fight Mode: deliberately left OFF, not a gap.** Turned on 2026-09-05, then turned back off the same day after checking: this zone is on the **Free** Cloudflare plan, where (unlike paid Super Bot Fight Mode) Bot Fight Mode does **not** exempt verified good bots — real-world reports confirm Googlebot/Bingbot/GPTBot/ClaudeBot/PerplexityBot can all get challenged/blocked. For a site that depends on organic + AI-search visibility, that risk outweighs blocking scanner noise that can't exploit anything (plugins are already patched, see below). Don't re-enable without either upgrading the plan (unlocks Super Bot Fight Mode's verified-bot allowlist) or writing a narrow custom WAF rule instead of using the blunt toggle.
- **`/wp-admin/install.php` — hardened 2026-09-05.** `.htaccess` rule added on ks-aw-01's `soulful-wp` container (backed up first; verified 403 on the path, 200/200/400 unchanged on homepage/wp-login.php/admin-ajax.php). **Note for future edits to this site**: production traffic has run on ks-aw-01 since 2026-08-28, not Hostinger — Hostinger is a frozen rollback path only (see `tenants/company-soulful-expression/core/ENVIRONMENT_REGISTRY.md`'s 2026-09-05 correction). Editing Hostinger's `.htaccess` silently does nothing to the live site; this was discovered the hard way while applying this exact fix.
- **Ultimate Member (2.13.0) and um-user-photos (2.2.0)** on `soulfulexpression.org` were checked against known CVEs (CVE-2026-4248, CVE-2026-19423, CVE-2026-19251, CVE-2026-1404, all Ultimate Member) — every one was patched at or before the currently-installed 2.13.0, and `wp plugin list` shows `update=none` (already latest). No action needed beyond staying current; the repeated scanner traffic hitting fixed plugin-asset paths is fingerprinting for version, not exploiting anything live.
- **`GPTBot` (OpenAI's crawler) is not blocked** by `soulfulexpression.org`'s `robots.txt` (confirmed via direct fetch — the file has no `User-agent: GPTBot` rule at all, only generic WooCommerce/`wp-admin` disallows). This is a content-licensing/AI-training-opt-out decision for the client, not a security issue — flagging it here since it surfaced during this investigation, not because it needs a technical fix from this side.

## Related

- `agency-os/docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md`
- `runbooks/UPTIME-KUMA-MONITOR-FIX.md`
- `agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md`
- `agency-os/tenants/company-soulful-expression/sites/soulfulexpression-org/OBSERVABILITY_HOSTINGER.md`
- `scripts/check-cloudflare-security.ps1`

## Related Documents (Auto-Synced)
- `docs/operations/AWARE_WAVE_OBSERVABILITY_BASELINE.md`

_Last synced: 2026-09-05 11:46:38 UTC_

