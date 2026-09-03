# ADR-0033 — Signed Tenant-Context Principal (Option B-signed)

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 — the tenancy-principal mechanism RLS keys on. Resolves the `🔴 OPEN DECISION - tenancy principal` block in `governance/ADR-0016-mandatory-tenant-rls.md:15-49`, and item HD-05 in `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:41-45`. This ADR does not authorize real-person data, production deployment, or any change to the RLS-mandatory commitment ADR-0016 already made; it changes only what identity that RLS keys on.

## Context

ADR-0016 (`governance/ADR-0016-mandatory-tenant-rls.md:9`) makes forced RLS mandatory on every tenant-owned table, keyed by `hci.current_tenant_id()`. The Wave 1 synthetic implementation of that function reads the Postgres `role` GUC:

```sql
SELECT tenant_id FROM hci.app_tenant_bindings
WHERE role_name = COALESCE(NULLIF(current_setting('role', true), 'none'), session_user)
```
(`Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql:274-279`)

Two `NOLOGIN`/`NOBYPASSRLS` per-tenant roles exist only for this (`0001_wave1_synthetic_up.sql:269-270`), and the negative-test suite selects a tenant by literally issuing `SET ROLE hci_app_test_a;` (`Projects/internal/hci30/database/tests/wave1-negative-tests.sql:14`, `RESET ROLE;` at line 234). ADR-0016 itself flags why this cannot be the production principal: `SET ROLE` is checked against `session_user`'s membership, not against the currently active role, so any session logged in as a role able to `SET ROLE` into a tenant role can freely re-tenant itself mid-connection; a missed `RESET ROLE`, a pooled connection returned without `DISCARD ALL`, or a SQL-injection foothold moves the whole session's RLS identity with it (`ADR-0016-mandatory-tenant-rls.md:24-29`). ADR-0016 also states the synthetic suite cannot validate this because the suite itself is a superuser session using `SET ROLE` — any pass would be for the wrong reason (`ADR-0016-mandatory-tenant-rls.md:31-33`), and it blocks all non-synthetic tenant-data admission until this is decided (`ADR-0016-mandatory-tenant-rls.md:46`).

ADR-0016 named three options: **A** one real `LOGIN` role per tenant; **B** a pooled login role carrying tenancy in a signed/validated `SET LOCAL` context; **C** freeze scope to synthetic-only and defer (`ADR-0016-mandatory-tenant-rls.md:37-44`). This ADR chooses among them.

## Decision

Adopt **Option B-signed**. One pooled application login role, `hci_app`, replaces the per-tenant `hci_app_test_a`/`hci_app_test_b` roles as the production login principal. Tenancy is no longer carried in the Postgres `role` GUC at all — it is carried per-transaction in a custom GUC, `hci.tenant_ctx`, holding an opaque signed token: `(tenant_id, actor_id, expires_at, HMAC)`.

`hci.current_tenant_id()` becomes `SECURITY DEFINER`. It parses `hci.tenant_ctx`, recomputes the HMAC over `(tenant_id, actor_id, expires_at)` using a key stored in a table `hci_app` has no `SELECT` grant on, and returns `tenant_id` only if the HMAC matches and `now() < expires_at`. Any other outcome — GUC unset, malformed, HMAC mismatch, or expired — returns `NULL`. Because every RLS policy is `tenant_id = hci.current_tenant_id()`, a `NULL` return matches zero rows under every existing policy (`0001_wave1_synthetic_up.sql:336`, `:370`): **fail-closed by construction**, not by an added check. Tokens are minted only in the auth layer, which alone holds the HMAC key; the synthetic test suite mints via a `SECURITY DEFINER` helper that does not leak the key to the test session.

Context is set with `SET LOCAL hci.tenant_ctx = '<token>'`, never `SET`. `SET LOCAL` is transaction-scoped: it reverts automatically at `COMMIT`/`ROLLBACK` regardless of whether the application remembers to reset it, so pooler connection reuse cannot leak one tenant's context into the next transaction on the same physical connection — the exact "missed RESET" failure mode ADR-0016 named (`ADR-0016-mandatory-tenant-rls.md:27-28`) is closed by the primitive itself, not by discipline.

**Why this wins over the alternatives, in engineering terms:**

- **Over Option A (per-tenant LOGIN roles).** A `SET ROLE` forge is impossible under B-signed because there is no per-tenant role for the app to hold membership in, or `SET ROLE` into — `hci_app` is the only login role, full stop. Option A instead makes forgery structurally impossible by giving up connection pooling per tenant (one live connection identity per tenant, or a role-per-request re-auth on every pooled handoff), which does not scale past a small, static tenant count and reintroduces exactly the pooling cost ADR-0016 flagged Option A for (`ADR-0016-mandatory-tenant-rls.md:37-39`). B-signed keeps one pooled login role and removes the forgery vector by removing the GUC that was forgeable, not by removing pooling.
- **Over Option C (defer, synthetic-only).** C leaves the negative-test suite testing the wrong artifact indefinitely — `SET ROLE` from a superuser session, which ADR-0016 already says proves nothing (`ADR-0016-mandatory-tenant-rls.md:31-33`) — and blocks Wave 2+ schema work on an unresolved identity primitive. B-signed gives the suite a real forgery to attempt and fail: setting `hci.tenant_ctx` directly to a value with a tenant_id the caller wants but no valid HMAC, which `current_tenant_id()` rejects by definition, not by a test double.
- **Over an unsigned `SET LOCAL app.tenant_id` (a fourth, considered-and-rejected option).** An unsigned custom GUC set directly by the application is exactly as forgeable as the `role` GUC — any statement running as `hci_app` can `SET LOCAL app.tenant_id` to any value. Signing is the entire content of "B-signed" versus plain B: the HMAC check inside a `SECURITY DEFINER` function is what makes the GUC's *content* untrusted-by-default and only the *verification result* trusted, mirroring how `hci.app_tenant_bindings` is already deliberately ungranted to the application roles today (`0001_wave1_synthetic_up.sql:272-273`).

## Required implementation gates

Wave 2 may not admit non-synthetic tenant data until all of the following exist and pass. Each is machine-testable; a gate with no failing-test description below is not accepted as satisfying this ADR.

1. **Schema**: `hci.tenant_context_keys` table (or equivalent) holding the active HMAC signing key(s), with no `GRANT` of any privilege to `hci_app` — verified by a negative test asserting `hci_app` cannot `SELECT`/read the key table (expect `42501`). Lands in the Wave 2 migration alongside the audit schema already planned there (`11_SECURITY_PRIVACY_GOVERNANCE.md:31`, Wave 2).
2. **Role change**: migration drops `hci_app_test_a`/`hci_app_test_b` as the *login* principal pattern and creates single pooled `hci_app NOLOGIN NOBYPASSRLS` (or `LOGIN` if the pool sits in front of Postgres and authenticates once as this role) — verified by `pg_roles` showing no per-tenant login role exists in the target schema.
3. **`hci.current_tenant_id()` rewrite**: `SECURITY DEFINER`, parses and HMAC-verifies `hci.tenant_ctx`, returns `NULL` on any of {unset, malformed, bad HMAC, expired}. Machine-tested by three CI-blocking negative tests, replacing the placeholder ADR-0016 named:
   - `RLS-ESCALATE-01` — `SET LOCAL hci.tenant_ctx` to a forged/unsigned token naming tenant B while authenticated only for tenant A → every tenant-scoped `SELECT` returns zero rows (`expect_true`, same pattern as `RLS-LEAK-01` at `wave1-negative-tests.sql:23-25`) and every tenant-scoped `INSERT` raises `42501` (same pattern as `RLS-WRITE-01` at `wave1-negative-tests.sql:33-36`).
   - `RLS-ESCALATE-02` — a validly-signed token whose `expires_at` is in the past → zero rows / `42501`, identical assertion shape.
   - `RLS-ESCALATE-03` — no `hci.tenant_ctx` set at all (fresh pooled connection, nothing set this transaction) → zero rows / `42501`, proving the fail-closed default without relying on the application remembering to set anything.
   All three replace `SET ROLE hci_app_test_a;` (`wave1-negative-tests.sql:14`) with a token-minting helper call; none may run as the table owner or a superuser, per the existing test-execution requirement (`wave1-negative-tests.sql:8-10`). Lands in Wave 2.
4. **Transaction scoping**: a test proving `SET LOCAL` (not `SET`) is used exclusively by the application's context-setting call path — asserted by starting a transaction, setting context, committing, opening a *new* transaction on the same pooled connection, and confirming `hci.current_tenant_id()` returns `NULL` (context did not survive the commit). Lands in Wave 2, same suite as gate 3.
5. **Token minting isolation**: the auth-layer minting function and the synthetic-suite's test-minting helper are each independently `SECURITY DEFINER` with `EXECUTE` restricted to their respective callers, and neither the signing key nor a minting function callable by `hci_app` is reachable from a session authenticated only as `hci_app` — verified by a negative test asserting `hci_app` cannot `EXECUTE` the minting function (expect `42501`). Lands in Wave 2.
6. **CI wiring**: `RLS-ESCALATE-01..03` added to the same CI-blocking negative-test run ADR-0016 already requires (`ADR-0016-mandatory-tenant-rls.md:9`), not a separate optional suite — a red result on any of the three blocks merge, identically to existing `RLS-LEAK-*`/`RLS-WRITE-*` results.

## Consequences

- The `role` GUC and per-tenant `NOLOGIN` roles (`hci_app_test_a`, `hci_app_test_b`) stop being the production tenancy principal; they may remain as a synthetic/local convenience only if gate 2's migration explicitly documents that scope-narrowing, otherwise they are removed.
- `hci.current_tenant_id()` gains a dependency on wall-clock time (`expires_at`) and a signing key's availability; a signing-key outage or clock skew beyond token lifetime now fails every tenant-scoped query closed (`NULL` → zero rows), which is the intended safe failure mode, not a defect to work around by widening the RLS policy.
- This ADR does **not** authorize: admitting real-person data (still gated by ADR-0016's "no non-synthetic tenant data" line and this ADR's own Scope), any production deployment or portal integration, or any relaxation of ADR-0016's forced-RLS or CI-blocking-test requirements. It also does not decide who mints tokens operationally (session length, refresh policy, key rotation cadence) beyond "the auth layer holds the key" — that operational detail is deferred to the Wave 2 implementation task, not re-opened as a design question here.
- A future change to the tenancy-principal mechanism requires a superseding ADR, not an in-place edit to `hci.current_tenant_id()`.

## Verification and rollback

- Verification recorded here is documentation-only, matching this repository's current state: the Wave 1 synthetic schema still implements the `role`-GUC mechanism this ADR supersedes (`0001_wave1_synthetic_up.sql:274-279`); gates 1-6 above are **OPEN** until the Wave 2 migration implementing `hci.tenant_ctx` and `RLS-ESCALATE-01..03` lands and is reviewed.
- Before implementation, rollback is trivial: this ADR is superseded by a later explicit operator decision, and no schema exists yet to unwind.
- After implementation, rollback must not weaken RLS in place (ADR-0016's rollback clause, `ADR-0016-mandatory-tenant-rls.md:53`, applies unchanged) — reverting to the `role`-GUC mechanism requires a reviewed migration and a new ADR, not a hotfix, because it would reopen the forgery vector this ADR closes.
- Until gates 1-6 are implemented and `RLS-ESCALATE-01..03` are green in CI, ADR-0016's admission block stands: no non-synthetic tenant data may be admitted.

## Evidence

- `governance/ADR-0016-mandatory-tenant-rls.md:15-49` — the open decision this ADR resolves, including the three named options and the required `RLS-ESCALATE-01` obligation.
- `HCI30_RESEARCH_REVIEW/22_OPEN_HUMAN_DECISIONS.md:41-45` — HD-05, the RLS-mandatory human decision this mechanism implements the identity side of.
- `Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql:269-282,334-336,368-371` — the Wave 1 `role`-GUC implementation being superseded, and the RLS-policy shape (`tenant_id = hci.current_tenant_id()`) that makes a `NULL` return fail-closed.
- `Projects/internal/hci30/database/tests/wave1-negative-tests.sql:8-14,23-36,234` — existing negative-test conventions (`hci_test.expect_true`/`expect_sqlstate`, non-owner execution requirement, `SET ROLE`/`RESET ROLE` pattern) that `RLS-ESCALATE-01..03` must follow the shape of while replacing the mechanism under test.
- `11_SECURITY_PRIVACY_GOVERNANCE.md:31,63-64` — Wave 2 placement precedent (audit schema) and the `HD-05=A`/ADR-0016 resolution note this ADR extends.
- `governance/ADR-0026-claim-source-tenant-ownership.md:19,27` — independent confirmation that the tenancy-principal ambiguity was already recognized as blocking adjacent design decisions before this ADR closed it.
