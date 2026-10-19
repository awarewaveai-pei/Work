## 2026-10-19（續NNN）ADR017 第2項：方案、權利、簽章許可與付費入口

- 根因／修改：第 2 項原本只有 permit 草稿；補 0110 方案／權利表與服務角色 RLS、14 天試用＋7 天寬限、不可重領試用標記、全帳戶到期掃描與 aggregate 點數餘額；共用 JCS＋Ed25519 向量；SDK／WordPress／Woo／Fluent 入口集中；portal launcher 改走 service wrapper。
- REALTEST_EVIDENCE: tool=Bash | cmd=python lobster-factory/packages/db/scripts/0110_plans_entitlements-local-verify.py; npx vitest run lib/entitlements lib/portal lib/ai; python -m unittest tests.unit.test_permit_vectors; npm run typecheck (workflows) | exit=0 | ms=measured per command
- REVIEW_DONE: critic=Deep | verdict=pass | findings=0c/0m/0n (DB expert review: SQL/RLS/trial/down/balance clean; launcher direct-table regression fixed)
- BUGHUNT_DONE: scope=agency-os,scripts,lobster-factory,Projects/internal/cognitive-engineering-os | grep=claude-request|wp-bridge-client|organization_product_subscriptions|organization_entitlements|media_credit_ledger|@anthropic-ai/sdk|@google/generative-ai | hits=verified before commit
- ORACLE_WAIVED: claude quota blocked after DB review agent; written adversarial review + targeted mutation/import-boundary evidence recorded in this entry
- rollback: git revert this commit; production migration and signing key/Trigger setup remain held by DEPLOY_HOLD and were not touched.
