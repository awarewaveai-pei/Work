# codex-oracle review -- 2026-10-15 13:19:46 +08:00

- mode: `review`
- scope: -Path Projects/internal/cognitive-engineering-os/scripts/dev/launch_cos_dev.ps1, Projects/internal/cognitive-engineering-os/scripts/dev/demo_fixture.cjs, Projects/internal/cognitive-engineering-os/apps/cognitive-web/app/(shell)/projects/demo/[method]/[[...domain]]/page.tsx, Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/demos.spec.ts  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: Follow-up to the step-3 review (agency-os/reports/oracle/2026-10-15-partialreview-0faf718d.md F1, an unknown demo address answers 200): every notFound() under app/(shell) answers 200 because (shell)/loading.tsx streams first (/methods/<bad>, /learn/<bad>, /projects/<bad> too), so the demo route stays one page that answers like the rest and the app-wide status goes to TASKS as its own task; generateStaticParams/dynamicParams=false were tried and dropped (the nested segment was not enforced in dev, and they would prerender at build while the catalog API is unreachable). launch_cos_dev.ps1: the engine has no SQLite mode since the PostgreSQL switch, so the local launcher now creates/starts a Docker postgres (cos-dev-db, the image tests/pg.py pins, 127.0.0.1:55432 only, trust auth, volume cos-dev-db-data), waits for pg_isready, sets COGNITIVE_OS_DATABASE_URLS=dev=..., runs migrate_db, then uvicorn. demo_fixture.cjs: a failure is an error line or an alert with text (an empty live region matched before), with a screenshot. Check: launcher failure modes (docker missing, port taken, container from another image), the trust-auth exposure, idempotence.
- exit: 0 | elapsed: 378049ms | answer: 3239B
- files-reviewed: Projects/internal/cognitive-engineering-os/apps/cognitive-web/components/Projects.test.tsx, Projects/internal/cognitive-engineering-os/scripts/dev/launch_cos_dev.ps1, Projects/internal/cognitive-engineering-os/scripts/dev/demo_fixture.cjs, lobster-factory/infra/hetzner-phase1-core/tests/e2e/cognitive/demos.spec.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: The launcher can declare PostgreSQL ready before the host TCP endpoint is usable.
  file:line   -> `launch_cos_dev.ps1:18-26` -> `tests/pg.py:95-102`
  confidence  -> CONFIRMED
  scenario    -> Fresh container initialization -> in-container `pg_isready` returns success for PostgreSQL’s temporary socket server -> `migrate_db` connects to `127.0.0.1:55432` too early and exits, so the API never starts.
  why missed  -> The probe checks the container socket, not the configured host endpoint; the test helper documents this false-positive behavior.

FINDING 2: An existing `cos-dev-db` container is reused without validating its image, port, or data volume.
  file:line   -> `launch_cos_dev.ps1:11-20`
  confidence  -> CONFIRMED
  scenario    -> Another project owns a running `cos-dev-db` PostgreSQL container with unrelated `cognitive_os` data -> the launcher accepts it, migrates it, and starts the API against the wrong database.
  why missed  -> Idempotence is implemented as name/state matching only; no `docker inspect` identity or port check exists.

FINDING 3: Trust authentication gives every local process passwordless PostgreSQL superuser access to imported data.
  file:line   -> `launch_cos_dev.ps1:13,20` -> `scripts/dev/README.md:9-14`
  confidence  -> CONFIRMED
  scenario    -> Any local process connects as `postgres` to `127.0.0.1:55432` -> it can read or modify all tenants and imported `.runtime` rows without API authentication.
  why missed  -> Binding to loopback was treated as an authentication boundary.

FINDING 4: Demo fixtures discard the method-level gate results required by the result page.
  file:line   -> `scripts/dev/demo_fixture.cjs:48-51` -> `ai_lego/apps/api/main.py:1850-1854` -> `components/DemoResult.tsx:6-14`
  confidence  -> CONFIRMED
  scenario    -> Generate the Iceberg demo, whose API response contains `top_down_completeness` -> the fixture stores only `gate_results`, so the demo approve bar omits the real 層序 gate.
  why missed  -> The API keeps interpretation gates and `record_gate_results` as separate fields, but the fixture serializer copies only the former.

FINDING 5: Fixture-generation timeouts and navigation errors bypass the screenshot path and abort later domains.
  file:line   -> `scripts/dev/demo_fixture.cjs:31-44` -> `scripts/dev/demo_fixture.cjs:61`
  confidence  -> CONFIRMED
  scenario    -> One domain hangs without producing an error alert -> `Promise.race` rejects, the outer catch exits, no screenshot is written, and remaining requested domains are never processed.
  why missed  -> Only a fulfilled `"FAILED: ..."` result enters the screenshot branch; rejected waits and navigation failures do not.

FINDING 6: Demo result headers never show the tool family.
  file:line   -> `components/DemoResult.tsx:14` -> `lib/catalog.ts:100-101` -> `components/RunHeader.tsx:26`
  confidence  -> CONFIRMED
  scenario    -> `/projects/demo/systems.iceberg_model` loads a catalog successfully -> family lookup uses `"systems"` while `familyLabels` is keyed by `"systems.iceberg_model"` -> the header omits the family label.
  why missed  -> The prop name suggests family-keyed data, but the helper actually returns method-keyed labels.

TOTAL: 6 findings
