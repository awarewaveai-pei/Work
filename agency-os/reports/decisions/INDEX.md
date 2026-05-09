# Decision Reports Index

All decisions evaluated by the `decision-intelligence` agent (`/decide`).

For each entry: open the linked file for the full report including debate transcript, installation plan, rollout plan, risk register, observability plan, and ADR skeleton.

---

| Date | Decision | Recommendation | Confidence | File |
|------|----------|---------------|------------|------|
| 2026-05-09 | 為 30 個客戶 WP 站選擇統一管理平台 | MainWP (self-hosted) | 0.83 | [2026-05-09-choose-wordpress-management-platform.md](2026-05-09-choose-wordpress-management-platform.md) |

---

## How to use

- **Find a past decision:** scan the table above by date or keyword
- **Re-run a decision:** open the file, check the Switch Conditions section — if any are met, run `/decide` again with updated context
- **Promote to ADR:** copy the ADR Skeleton section from the report to `docs/architecture/decisions/ADR_NNN_title.md` and register in `docs/architecture/decisions/ADR_INDEX.md`
- **Review cadence:** each report has a Decision Review Cadence section with scheduled review dates

## Related

- `docs/architecture/decisions/ADR_INDEX.md` — binding architectural decisions (promoted from here)
- `reports/strategy-review/INDEX.md` — strategy-review reports
