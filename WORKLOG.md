
## 2026-05-04

### Machine appendix (weekly-system-review)
- 2026-05-04 16:37:27 : gates=PASS (exit 0) ; integrated-status: generate-integrated-status-report.ps1 OK


## 2026-05-11

### Machine appendix (weekly-system-review)
- 2026-05-11 09:10:15 : gates=PASS (exit 0) ; integrated-status: generate-integrated-status-report.ps1 OK


## 2026-07-03

### next-admin Build & Onboard local direct build path
- Scope: `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`.
- Added `local_direct` as a first-class `/api/build/runs` execution mode so Build Console can create a Supabase run, mark it running, call the in-app hosting bridge, and complete/fail the run without requiring Trigger.dev.
- Rewired `/api/onboarding/trigger-build` to use the same local hosting bridge path for customer intake builds, returning `run_id` plus `build_status` so `/build?runId=...` remains the progress/evidence view.
- Updated `/onboard` and `/build` defaults/copy so N8N and Trigger.dev are optional integrations/background dispatch choices, not required dependencies for staging WordPress builds.
- Preserved `enqueue` as an optional Trigger.dev dispatcher path for long-running/background execution; current local-direct risk remains synchronous HTTP timeout/process-restart exposure until this is moved into a same-host worker.
- Secret safety: local shell env readiness check only reported boolean presence; no token/key values were printed. Live provision was not executed locally because required env values were absent in this shell.
- Validation: `npm run typecheck` PASS; `npm test` PASS (47 files, 573 tests); `npm run build` PASS with existing Sentry/Supabase Edge warnings only.

## 2026-09-17

### HCI-30 Task 4 critic-deferred SSRF-guard findings -- fixed in both isolated copies
- Root cause C1: `isPrivateAddress`'s IPv4-mapped-IPv6 regex `/^::ffff:0*:?/` matched on the bare `::ffff:` prefix alone (`0*` and `:?` both zero-width-satisfiable), blanket-blocking every mapped address regardless of what it encoded. Confirmed via `node -e` that Node's WHATWG URL host serializer always normalizes a bracketed mapped host to the hex-tail canonical form (`new URL('http://[::ffff:8.8.8.8]/').hostname` -> `[::ffff:808:808]`), so a genuinely public mapped address reaching this code from a URL was wrongly blocked -- fail-safe (over-blocks), not a bypass, but incorrect.
- Root cause C2: the `.internal`/`.local`/`.localhost` literal-suffix fast path did not strip a trailing dot, so `evil.internal.` (a valid absolute FQDN, RFC 1035) skipped the fast path. Confirmed via `node -e` that Node's URL parser strips a trailing dot from an IPv4 literal host but not from a domain host. The resolved-address DNS check still caught it if it truly resolved private -- slower path, not a bypass.
- Fix (identical logic, independently applied to both non-importing copies per ADR-0029 collection-ingestion isolation boundary): added `decodeMappedIPv4Tail()` to decode the hex-tail form to a dotted-quad and recurse into `isPrivateAddress()` on it (single source of truth for the IPv4 range table, no duplicated thresholds); added `.replace(/\.$/, '')` before the literal-suffix checks.
  - `Projects/internal/hci30/infra/local/fetch-runner/net/ssrf-guard.mjs`
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/ssrf.ts`
- Tests added to each side's own suite (no cross-imports): `.../fetch-runner/net/ssrf-guard.mjs`'s pair `tests/unit/fetch-runner/ssrf-guard.test.mjs`, and `lib/collect/__tests__/collect-fetch.test.ts`'s "SSRF gate" describe block. Cover: public mapped address (`::ffff:8.8.8.8` / hex-tail `::ffff:808:808`) not blocked; private mapped addresses (loopback, cloud metadata) still blocked; malformed mapped tail fails closed; trailing-dot `evil.internal.`/`.local.`/`.localhost.`/`localhost.` blocked via the literal path with the resolver proven never called (mock assertion); public trailing-dot FQDN still passes.
- REALTEST_EVIDENCE: tool=Bash | cmd=`node --test "Projects/internal/hci30/tests/unit/fetch-runner/*.test.mjs"` (33/33 pass, includes unrelated fetch-runner suites for regression) + `npx vitest run lib/collect` in next-admin (189/189 pass) + `npx tsc --noEmit -p tsconfig.json` (clean) | exit=0 | ms=~2000
- REVIEW_DONE: critic=Quick | verdict=pass | findings=0c/1m/0n -- the 1 Major (see below) is a pre-existing gap, not a regression from this fix, and out of scope for this coordinated fix.
- BUGHUNT_DONE: scope=agency-os,scripts,Projects/internal/hci30,lobster-factory | grep=`::ffff:0\*:` (the dead regex) and `export function isPrivateAddress` | hits=0 stray copies of the old regex; exactly the 2 known `isPrivateAddress` definitions exist (isolation boundary intact)
- 剩餘風險 (deferred, not fixed here -- separate scope from the two named findings): critic found the shared IPv4 range table (both copies, unchanged by this fix) never classified IANA special-purpose/documentation-only ranges as private -- RFC 5737 TEST-NET-1/2/3 (192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24), RFC 2544 benchmarking (198.18.0.0/15), 6to4 relay anycast (192.88.99.0/24), IETF protocol assignments (192.0.0.0/24). This already existed for plain dotted-quad IPv4 literals before today's fix (`isPrivateAddress('203.0.113.5')` was already `false`); today's fix only makes the mapped-IPv6 form consistent with that pre-existing plain-IPv4 behavior, not stricter or looser overall. Whether to also block these ranges (defense-in-depth beyond RFC1918/loopback/link-local/CGNAT/multicast) is a design decision for both copies together, not a mechanical bug fix -- flagged as a follow-up, not fixed unilaterally.
