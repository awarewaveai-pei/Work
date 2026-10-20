# codex-oracle review -- 2026-10-19 18:56:06 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/subject.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/runtime.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/ledger.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts, Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_execution/gateway.py, Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: ADR 017 step 3: one entitlement judgment can(subject, feature_key, actor) with shadow mode (ENTITLEMENT_MODE unset/typo=shadow: refusals logged entitlement.would_deny and allowed; infra errors logged and allowed; only exact 'enforce' fails closed). TS: can.ts Grant minted only by can(); withFeature/grantFor; gateway loaders require an allowed Grant; actorFor() issues on_behalf_of only with a role. Python: check_entitlement is a thin can() adapter verifying the X-AwareWave-Permit header (ContextVar set by PermitHeaderMiddleware) bound to billing account+product cognitive+feature+actor; AIGateway(grant=...) required, external provider needs allowed grant. Adversarial: can a caller get allowed in enforce without a valid permit/entitlement; can the actor or org be spoofed; does shadow ever throw; does the contextvar leak across requests; are credits debited from on_behalf_of.

- exit: 0 | elapsed: 134828ms | answer: 2547B
- files-reviewed: Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/ai_execution/gateway.py, Projects/internal/cognitive-engineering-os/ai_lego/platform/entitlement/check.py, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ai/gateway.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/can.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/authz.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/grant.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/ledger.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/route-features.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/runtime.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/subject.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: `grantFor` accepts arbitrary organization IDs without requiring `AuthorizedOrg`, enabling cross-tenant grants and billing.
  `grant.ts:23-25` -> `subject.ts:72-83`
  confidence  -> CONFIRMED
  scenario    -> A staff caller invokes `grantFor("content.title", { orgId: victimOrg })`; the victim’s billing subject is resolved and a grant is issued without checking staff membership, allowing victim usage/credit debits.
  why missed  -> The comment says `actorFor` is the only authorization path, but `ctx.orgId`, `slug`, and `brandId` bypass it.

FINDING 2: TypeScript `Grant` objects can be mutated to bypass enforce-mode denial.
  `can.ts:85-90` -> `gateway.ts:10-13`
  confidence  -> CONFIRMED
  scenario    -> In enforce mode, a denied grant is returned; caller executes `(grant as any).info.allowed = true`, then `loadAnthropic(grant)` passes `assertGrant` and permits a paid provider call.
  why missed  -> `readonly` and `private` are compile-time TypeScript restrictions; the emitted JavaScript exposes mutable `info`.

FINDING 3: Python `Grant` objects can likewise be mutated to bypass the external-provider gate.
  `check.py:58-70` -> `gateway.py:142-144`
  confidence  -> CONFIRMED
  scenario    -> A denied grant has `grant.allowed = False`; caller sets `grant.allowed = True`, after which `AIGateway` accepts it for an external provider despite no valid permit.
  why missed  -> `__slots__` prevents new attributes but does not make existing grant fields immutable.

FINDING 4: The TypeScript and Python permit bindings use incompatible actor formats.
  `subject.ts:16-20` -> `main.py:1549-1554`
  confidence  -> CONFIRMED
  scenario    -> Next-admin issues a permit through `requestActor()` with actor `client:<org>[:<user>]`; the cognitive API verifies the same header against `cognitive:<identity_id>`, rejects the actor binding, and returns 403 in enforce mode.
  why missed  -> Each implementation is internally consistent, but the shared cross-service permit contract is not.

FINDING 5: Enforce-mode usage reporting can debit credits and then report failure, causing retries to double-charge.
  `can.ts:97-108`
  confidence  -> CONFIRMED
  scenario    -> `debit()` succeeds, `audit()` fails, and `report()` throws; a caller retries without an idempotency key, generating a new random key and debiting the same usage again.
  why missed  -> Debit and audit are treated as one operation, but the debit occurs before the failure-prone audit and the default retry key is nondeterministic.

Final line: TOTAL: 5 findings
