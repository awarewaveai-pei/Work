# Site Profile - soulfulexpression-org

- Tenant: company-soulful-expression
- Site: soulfulexpression-org
- Stage: Live
- Production URL: https://soulfulexpression.org/
- Staging URL（canonical，見 `core/ENVIRONMENT_REGISTRY.md`）: **https://staging.soulfulexpression.org/** — **lifecycle：**書面已登記；雲端實機仍待 Runbook Pilot A §2
- Hosting: Hostinger
- Region: APAC
- WP Version: **6.9.4**（Day 1 §1.2 盤點 2026-05-08）
- PHP Version: **8.2.30**（Day 1 §1.2 盤點 2026-05-08）
- DB Engine: **MariaDB 11.8.6**
- Active Theme: **Kadence 1.3.6**（更新可用 → 1.4.5）
- Plugins: 35 active + 1 must-use（16 有更新；Day 3 安全變更包優先處理 — 詳 `projects/2026-011-existing-site-handover-soulful/10_DISCOVERY.md`）
- Primary Language: en_AU（澳洲英語）
- Currency: AUD
- Industry Overlay: therapy

## Observability

- **模式：** 採 **完整交包客戶自持**（Slack／Sentry／Uptime／未來 Netdata 皆為客戶帳號與帳單，與 AwareWave 內部實例不混用）。細節與移交清單見 [`OBSERVABILITY_HOSTINGER.md`](OBSERVABILITY_HOSTINGER.md)。
