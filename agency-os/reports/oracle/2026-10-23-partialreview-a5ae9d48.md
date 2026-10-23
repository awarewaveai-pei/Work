# codex-oracle review -- 2026-10-23 21:03:59 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/customer-drill.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Round 2, delta after round 1 (agency-os/reports/oracle/2026-10-23-partialreview-ebc505f7.md). Fixed F1 consequence: withFeature's scope now carries grant.subject (unresolved after a shadow refusal) instead of null, so library asks after a not_authorized_for_org refusal stay flagged unresolved instead of silently billing the internal account; staffTooling now applies when the inherited subject is anything but internal; drill adds the operator-without-role case (enforce 403, shadow: video.script unresolved, ops.cheap-json internal). Not fixed on purpose: F1 shadow-allows (rollout design, ENTITLEMENT_MODE stays unset; route role checks decide who may render); F2 no call site names a customer org for a back-office feature; F3 pre-existing noorg_ path; F4 documented as a gate limit. Attack the delta: can the unresolved scope subject break a path that worked before, or let staff tooling bill a customer? If you cannot support a real finding, return no findings.
- exit: 0 | elapsed: 268453ms | answer: 30B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/__tests__/customer-drill.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/registry-code.test.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

NO FINDINGS

TOTAL: 0 findings
