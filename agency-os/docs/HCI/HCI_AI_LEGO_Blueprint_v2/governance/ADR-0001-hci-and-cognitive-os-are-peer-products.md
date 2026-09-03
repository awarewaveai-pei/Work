# ADR-0001 — HCI-30 and AI LEGO Cognitive OS Are Peer Products

Status: **ACCEPTED**
Date: 2026-09-02
Decision authority: Operator-delegated (2026-09-02, full delegation to Claude); operator may supersede with a later explicit decision
Scope: HCI AI LEGO Blueprint v2 architecture only; fixes the product-boundary relationship between HCI-30 and AI LEGO Cognitive Engineering OS and nothing else — no schema, deployment, real-person data, or legal claim is authorized by this ADR.

## Context

`02_PRODUCT_BOUNDARIES.md:5` states its purpose as "the permanent separation between HCI-30 and AI LEGO Cognitive Engineering OS", and `:71` records that the split was re-derived against six criteria (domain ownership, failure independence, commercial independence, data ownership, deployment independence, evolution independence). `03_AWARE_WAVE_DOMAIN_AND_SUBDOMAIN_MAP.md:77`, `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:65`, and `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:5-11` ("Neither product is a submodule of the other") all assert the same relationship. The whole document set already lives by this principle, yet `governance/ADR_INDEX.md:19` listed ADR-0001 as `PLANNED`, "Not recorded" at the time this ADR was drafted (the index has since been updated to `ACCEPTED` in the same edit batch that filed this ADR). Under `01_SYSTEM_CONSTITUTION.md:113-115` (Invariant 8) a principle stated only in prose is an intention, not a control; this ADR records the decision and names the controls.

The one real tension is data ownership: `02_PRODUCT_BOUNDARIES.md:73` notes that both products independently reinvent Evidence/Claim vocabulary under the same names with different shapes, and `01_SYSTEM_CONSTITUTION.md:132` classifies an undetected same-named-concept collision across a product boundary as an architecture failure. The resolution chosen there is a small, versioned, vendored kernel (`09:65-88`); `HD-09` is resolved by `ADR-0013` (`ACCEPTED`, same batch), which this ADR does not re-decide.

Current runtime state: HCI has a synthetic-only PostgreSQL skeleton at `D:\Work\Projects\internal\hci30\` (`README.md:3,7`) with a negative-test harness that records outcomes as data with a `UNIQUE test_id` (`database/tests/00_test_harness.sql:31-40`) and a runner that executes `node --test` contract tests plus the SQL suite (`scripts/test-wave1-local.ps1:15-16,45-49`). AI LEGO has specifications only; `17_REPOSITORY_LAYOUT_AND_PATHS.md:16` says its runtime root `Projects\internal\cognitive-engineering-os\` is created "only when that product has runtime code", and `:152` forbids pre-creating a `shared\` tree.

## Decision

HCI-30 and AI LEGO Cognitive Engineering OS are **independent peer products at the domain layer**. Neither is a component, plugin, submodule, or method pack of the other. Each must run — build, test, deploy, and serve its core use cases — with the other absent. They may interact only through a versioned contract, API, or event (`10:5-11`), and any future shared code is a vendored, pinned package (`09:88`, `17:152`), never a live shared service or database.

Alternatives and why they lose:

- **HCI as a Domain Method Pack inside AI LEGO.** Violates `09:96-98` (AI LEGO must not own HCI Person records, relationships, trust scores, public claims, cooperation decisions) and Invariant 3 (`01:57-59`): an AI LEGO outage would take down manual evidence entry and historical reads that `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:74` requires to survive. It also makes HCI's RESTRICTED personal data subject to a general-purpose execution engine's blast radius.
- **AI LEGO as HCI's internal cognition engine.** Breaks commercial and evolution independence (`02:71`): AI LEGO's Method Atlas, replay, and convergence machinery (`09:33-59`) serve non-HCI cognitive work (`10:17`), and HCI would end up re-hosting a product it does not own. `09:100` already directs HCI to integrate rather than reimplement these capabilities — integration presupposes a separate product.
- **One merged platform.** The "Shared God Platform" `02:73` explicitly rejects; doubles the data-ownership surface that `ADR-0016` and `ADR-0009` scope per product, and on the verified single-box deployment (`13:84`) couples both products' release and rollback cycles.

The peer relationship is the invariant; the Shared Kernel (HD-09), the optional integration contract (ADR-0005 `ACCEPTED`), and the no-cross-DB rule (ADR-0002 `ACCEPTED`) are consequences that get their own decisions and gates.

## Required implementation gates

Each gate names a test id that must exist in the `hci_test.results` register (`00_test_harness.sql:31-40`) or an equivalent `node --test` file, and the runner that executes it. A gate is closed only when a mutation that reintroduces the coupling turns the named assertion red (`README.md:11`).

1. **`ARCH-PEER-01` — import boundary (Wave 1).** Test file `D:\Work\Projects\internal\hci30\tests\architecture\peer-boundary.test.mjs` (directory reserved at `17:115-116`), wired into `scripts/test-wave1-local.ps1` next to the existing `node --test` call (`:15-16`). Fails if any file under `hci30\domain\`, `intelligence\`, `public-intelligence\`, `database\`, or `api\` contains an import, `require`, path string, or SQL reference to `Projects\internal\cognitive-engineering-os\` or `agency-os\docs\AI_LEGO_Cognitive_Engineering_OS\specs\`. Only `hci30\integrations\cognitive-os\**` (`17:100-107`) may reference the other product. Mutation: add one such import to `domain\` → red.
2. **`ARCH-PEER-02` — no database-level coupling (Wave 1).** Assertion in `database\tests\wave1-negative-tests.sql` via `hci_test.expect_true`: `pg_extension` contains neither `postgres_fdw` nor `dblink`; `pg_foreign_server` is empty; no `pg_constraint` of type `f` references a table outside schema `hci`; no schema other than `hci`, `hci_test`, and PostgreSQL defaults exists. Covered by `scripts\mutation-check-wave1.ps1`. Mutation: `CREATE EXTENSION dblink` in the up migration → red.
3. **`PEER-DEGRADE-01` — HCI serves core use cases with AI LEGO absent (Wave 10, path `hci30\integrations\cognitive-os\contract-tests\`, `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:135-141`).** With no `cognitive-os` service in `infra\local\compose.test.yml` and the adapter base URL pointing at an unroutable host, each operation listed in `10:15` (create/edit person, create relationship, record interaction, admit evidence, view timeline, create manual assessment, create decision, read historical data) succeeds; the adapter returns a typed failure within its timeout and writes no HCI row. Mutation: make any domain path call the adapter synchronously → red.
4. **`PEER-REF-01` — AI LEGO appears in HCI only as an opaque reference (Wave 10).** Assertion in the same SQL suite: every column whose name matches `%cognitive_run%` or `%execution_ref%` is `text`/`uuid` with no foreign key and no `CHECK` that dereferences another product's identifier space; `10:69` ("HCI assessment may store references to AI LEGO run IDs") is the only permitted coupling. Mutation: add a FK from an assessment row to any non-`hci` relation → red.
5. **`ARCH-PEER-03` — reverse direction (lands with the first runtime commit under `Projects\internal\cognitive-engineering-os\`; not before, per `17:16`).** Mirror of gate 1 in that product's `tests\` (`17:141`): no path under its `method-atlas\ workflow\ execution\ authority\ model-routing\ verification\ convergence\ replay\ rollback\ handoff\ jurisdiction\` may reference `Projects\internal\hci30\`. Until that commit exists, this half is recorded as `OPEN — NOT APPLICABLE YET` in `ADR_INDEX.md`, not as satisfied.

CI: gates 1-4 run in the same job as the existing Wave 1 suite (`13:20-24` requires them to block merge, not to be illustrative). No separate workflow file exists yet; creating one is part of closing gate 1.

This ADR does **not** authorize: admitting non-synthetic or real-person data; any production deployment; creating `D:\Work\Projects\shared\` (needs ADR-0013 / HD-09); any cross-product database access (ADR-0002, `ACCEPTED`, independently prohibits this); any claim of legal compliance; or any change to the AI LEGO mother documents.

## Consequences

- Every later HCI or AI LEGO design must name which side owns a concept before crossing the boundary; a same-named concept with two shapes is a build failure once gates 1-2 exist, not a review comment.
- Shared vocabulary (EntityRef, epistemic labels, risk tiers, tenant substrate) may only be shared by vendoring a pinned kernel version (`09:67-88`); HD-09 decides whether to extract, but cannot choose a live shared runtime without superseding this ADR.
- HCI Wave 10 integration work is optional and additive; nothing in Waves 1-9 may depend on it.
- `ADR_INDEX.md:11` states that only a recorded explicit human approval moves a decision to `ACCEPTED`. The human approval here is the operator's 2026-09-02 blanket delegation of HCI decision authority to Claude; this ADR is itself the first recorded instance of that delegation — no separate prior file states it, and it must not be conflated with the narrower, differently-dated grant at `D:\Work\Projects\internal\hci30\docs\HCI30_DELIVERY_PLAN.md:3` ("operator delegated implementation authority, 2026-09-01"), which covers build authority for the delivery plan, not authority to self-accept architecture ADRs. This ADR records the blanket delegation as its authority rather than a per-decision `HD-xx=` vote. An operator who wants per-decision approval restored supersedes this ADR or amends the index rule explicitly.

## Verification and rollback

- Verification recorded here is documentation-only: every cited line was read on 2026-09-02; no runtime gate above is implemented. The `ADR_INDEX.md` register showed `PLANNED` at drafting time; a separate edit in the same batch has since updated it to `ACCEPTED` (this ADR itself deliberately touches no other file).
- Gates 1-4 are absent from `D:\Work\Projects\internal\hci30\` today (`tests\` holds only `unit\contracts\validate-request.test.mjs`; no `tests\architecture\` directory exists). Gate 5 has no target directory yet.
- Rollback before implementation: supersede with an explicit later ADR. Rollback after implementation: deleting or weakening `ARCH-PEER-*` / `PEER-*` assertions is itself a boundary change and requires a superseding ADR plus mutation-check evidence, mirroring ADR-0016's "may not be weakened in place" rule.

## Evidence

- `02_PRODUCT_BOUNDARIES.md:5,65,71-73` — purpose, six-criteria re-derivation, data-ownership qualification.
- `01_SYSTEM_CONSTITUTION.md:57-59,113-115,125-132` — Invariant 3, Invariant 8, architecture-failure definition.
- `09_AI_LEGO_COGNITIVE_OS_BOUNDARY.md:63-65,88,96-100` — HD-09 pending, vendored/pinned rule, ownership prohibitions.
- `10_HCI_AI_LEGO_INTEGRATION_CONTRACT.md:5-17,61-70,87` — principle, independence requirement, two ledgers, transport independence.
- `13_TESTING_REPLAY_ROLLBACK_AND_SRE.md:13-24,72-80,84` — architecture tests 3/5/7, enforcement discipline, graceful degradation, single-box deployment.
- `17_REPOSITORY_LAYOUT_AND_PATHS.md:16,100-113,128-143,152,180` — reserved paths, no pre-created `shared\`, ADR filename.
- `22_HCI_TOP_TIER_IMPLEMENTATION_MASTER_PLAN.md:27-41,43-53,135-141` — Wave 0/1/10 scope and acceptance.
- `governance/ADR_INDEX.md:11,19` — lifecycle rule and the `PLANNED` entry this ADR fills.
- `D:\Work\Projects\internal\hci30\README.md:3,7,11`, `database\tests\00_test_harness.sql:31-40`, `scripts\test-wave1-local.ps1:15-16,45-49` — current synthetic runtime and harness conventions the gates reuse.
- Accepted ADRs checked for contradiction: ADR-0009 (tenant primitive shared by vendoring, consistent with gate 4), ADR-0010, ADR-0011, ADR-0014, ADR-0015, ADR-0016 (weaken-in-place prohibition reused here).
