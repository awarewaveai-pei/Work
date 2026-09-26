# Decision Reports Index

Decisions evaluated by the `decision-intelligence` agent (`/decide`), **plus direct main-agent decisions** — the latter are labelled `Mode: ... (直接決策，非 /decide 面板)` in their own header and carry no debate transcript. Check the header before treating a record as panel-vetted.

For each entry: open the linked file for the full report including debate transcript, installation plan, rollout plan, risk register, observability plan, and ADR skeleton.

---

| Date | Decision | Recommendation | Confidence | File |
|------|----------|---------------|------------|------|
| 2026-05-09 | 為 30 個客戶 WP 站選擇統一管理平台 | MainWP (self-hosted) | 0.83 | [2026-05-09-choose-wordpress-management-platform.md](2026-05-09-choose-wordpress-management-platform.md) |
| 2026-06-15 | Build vs buy vs hybrid for AwareWave automated daily zh-TW SEO/GEO content pipeline | BUILD on existing stack (+ narrow topic-discovery feed) | 0.80 | [2026-06-15-build-zh-tw-content-pipeline.md](2026-06-15-build-zh-tw-content-pipeline.md) |
| 2026-08-17 | Dedicated 主機規格上修（64GB → 128GB ECC）+ 供應商候選擴至 OVH | OVH KS-6（$59.80）；Hetzner auction ≤€65 則改選 Hetzner | 0.78 | [2026-08-17-dedicated-host-spec-upgrade.md](2026-08-17-dedicated-host-spec-upgrade.md) |
| 2026-08-18 | Dedicated 主機採購時機與供應商（「為什麼不乾脆買 KS-6？」）| C6：立刻買 OVH KS-6（月租）+ 平行觀望 + 死線前範圍閘 | 0.79 | [2026-08-18-dedicated-host-purchase-timing.md](2026-08-18-dedicated-host-purchase-timing.md) |
| 2026-09-01 | HCI Wave 1 的人類決策處理策略 | C2：先批准 HD-00～10；其餘依觸發條件延後 | 0.70 | [2026-09-01-hci-wave-1-decision-tranche.md](2026-09-01-hci-wave-1-decision-tranche.md) |
| 2026-09-10 | aware-wave.com DMARC 何時從 p=none 升到 quarantine/reject | 維持 p=none 至 9/28，之後 pct=25→100→reject 機械分階段推進 | 直接決策 | [2026-09-10-dmarc-enforcement-timeline.md](2026-09-10-dmarc-enforcement-timeline.md) |
| 2026-09-14 | Art Therapy Library 的 Airtable → Supabase 遷移方法 | 自建 deterministic ETL + raw landing + relational canonical | 0.86 | [2026-09-14-airtable-supabase-migration-method.md](2026-09-14-airtable-supabase-migration-method.md) |
| 2026-09-17 | HCI-30 C6 跨網域身分/角色模型 + 蒐集器管線 REJECTED 保存期限 | 簽章 handoff token + 延伸既有 per-tenant role 模型；REJECTED retain-forever 列入既有系統性抹除債務 | 直接決策 | [2026-09-17-hci30-c6-and-collector-task1-decisions.md](2026-09-17-hci30-c6-and-collector-task1-decisions.md) |
| 2026-09-23 | 研究管線（/ops/collect → Cognitive OS／HCI → 報表）三條線為何不順、怎麼重建 | 缺件＝彙整層（原文→每句帶 [n] 的結構化發現，三個 schema）；研究案聚合根；Cognitive OS 降為結構化透鏡；**HCI 退出三條線**（原構想七個矛盾見 §10.1）；§10.5 四題待操作者裁決 | 直接決策（提案，§10 修正版） | [2026-09-23-research-pipeline-architecture.md](2026-09-23-research-pipeline-architecture.md) |
| 2026-09-26 | 系統模式遇到外部進來的事件（Printful／Woo 訂單／Chatwoot）與建站派送怎麼處理 | 模式只擋我們發起的變更；客戶事件先落 DB 再延後或轉人工，永不回 423；操作者發起的 Printful 寫入與建站派送照常把關 | 直接決策（操作者全權委派） | [2026-09-26-system-mode-inbound-events.md](2026-09-26-system-mode-inbound-events.md) |

---

## How to use

- **Find a past decision:** scan the table above by date or keyword
- **Re-run a decision:** open the file, check the Switch Conditions section — if any are met, run `/decide` again with updated context
- **Promote to ADR:** copy the ADR Skeleton section from the report to `docs/architecture/decisions/ADR_NNN_title.md` and register in `docs/architecture/decisions/ADR_INDEX.md`
- **Review cadence:** each report has a Decision Review Cadence section with scheduled review dates

## Related

- `docs/architecture/decisions/ADR_INDEX.md` — binding architectural decisions (promoted from here)
- `reports/strategy-review/INDEX.md` — strategy-review reports
