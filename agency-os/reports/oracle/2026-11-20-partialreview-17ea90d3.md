# codex-oracle review -- 2026-11-20 09:03:05 +08:00

- mode: `review`
- scope: whole repo
- target: `48d6700ca~1..48d6700ca`
- context: Live title 「感恩節 心理學：7 個 有效 感恩任務」: prompt asked for space-separated CJK words and Rank Math checker matched the spaced keyword verbatim. Fix: one keyword-match definition (Han/kana keyword ignores spaces, <=2 Han/kana join chars; English/Korean verbatim unchanged), zh/ja prompt rule, review title_spacing check. Focus keyword sent to WordPress unchanged by requirement.
- exit: 0 | elapsed: 137331ms | answer: 2088B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/__tests__/review.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/__tests__/keyword-match.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/keyword-match.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/rankmath-checker.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The local checker can pass a title that WordPress Rank Math still rejects.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/seo/rankmath-checker.ts:112
  confidence  -> CONFIRMED
  scenario    -> Focus keyword `感恩節 心理學` and title `感恩節的心理學：7個有效的感恩練習` pass the new local title check. Publishing still sends the spaced keyword unchanged at `lib/content/publish/wordpress-core.ts:415`; the WordPress Rank Math check described in the request matches it verbatim, so its title check fails.
  why missed  -> The tests exercise the local checker, not the WordPress check that prompted the change.

FINDING 2: The new Chinese title instruction defeats WordPress’s power-word check.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/article/generate-core.ts:292
  confidence  -> CONFIRMED
  scenario    -> The instructed title `兒童藝術治療完整指南` passes the local substring power-word check at `lib/seo/rankmath-checker.ts:294`. The existing WordPress integration records that Rank Math splits titles on ASCII spaces, so `完整指南` does not score as the registered `完整` power word (`lobster-factory/packages/wp-bridge-plugin/includes/Content/RankMathPowerWords.php:14`).
  why missed  -> The prompt and local scorer were updated without reconciling the existing WordPress tokenization dependency.

FINDING 3: Stored article checks bypass the new title-spacing gate.
  file:line   -> lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/content/topics/review.ts:46
  confidence  -> CONFIRMED
  scenario    -> A topic with an already-made article containing `感恩節 心理學` retains its pre-change checks: `make.ts:230` skips making that article, and `make.ts:238` reuses its stored checks. If those checks passed, the topic can retain a passing review and auto-publish; `tick.ts:155` checks only the stored `review.pass`.
  why missed  -> The new-check tests construct fresh articles and do not cover persisted artifacts.

TOTAL: 3 findings