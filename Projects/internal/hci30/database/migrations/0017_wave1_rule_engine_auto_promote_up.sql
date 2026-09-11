-- HCI-30 Wave 1 - Rule-engine auto-promotion toggle (operator-requested
-- 2026-09-11, "都要" -- mandatory human review by default, AND an optional
-- trust-threshold override). Extends 0001-0016; must run after all
-- sixteen, before fixtures/harness/negative-test files.
--
-- HCI_RULE_ENGINE_SPEC.md's own §Combination named this exact gap as a
-- disclosed, not-yet-built follow-up: "a per-case configurable
-- auto-promotion threshold ... needs a new case-level policy setting this
-- file does not add." This migration is that setting.
--
-- Deliberately a plain boolean, not a numeric confidence threshold: the
-- rule engine's own output (packages/intelligence/rule-engine.mjs) is
-- already a single band value per dimension, not a continuous confidence
-- score there is a meaningful numeric cutoff to compare against -- "may
-- this case's rule-engine-only findings count without a human
-- ASSESSMENT" is a case-level yes/no policy decision, matching how
-- `risk_tier`'s own R0-R4 ladder is a categorical policy input, not a
-- derived statistic.
--
-- Not added to enforce_case_lifecycle()'s CLOSED-immutability tuple
-- (migrations/0002:117-119): this is a review-policy preference about how
-- to treat automated findings, not a substantive fact about the
-- investigation itself the way purpose/risk_tier/requester_context are --
-- an operator revisiting a closed case's automation policy is not
-- rewriting what was found, so it stays freely updatable regardless of
-- case status, same posture as the case's own tenant/id fields being
-- excluded from that tuple for an analogous reason (they are identity, not
-- investigative content).

BEGIN;
SET LOCAL lock_timeout = '3s';

ALTER TABLE hci.cases ADD COLUMN auto_promote_rule_findings boolean NOT NULL DEFAULT false;
GRANT UPDATE (auto_promote_rule_findings) ON hci.cases TO hci_app_test_a, hci_app_test_b;

COMMIT;
