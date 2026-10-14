// HCI-30 collector pipeline -- Trigger.dev orchestration logic
// (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 9). Trigger.dev's own task
// wrapper (whichever deployment package ends up hosting it -- see this
// task's own WORKLOG/TASKS entry for the open placement question) should be
// a thin shell calling `orchestrateDiscoveredFetch` and deciding what to do
// with its `{outcome, retryable, ...}` result (throw to trigger Trigger.dev's
// own retry policy, or return for a terminal outcome) -- exactly the
// "thin task, real logic lives in an importable function" pattern
// lobster-factory's own schedules-heartbeat.ts already uses (it delegates
// to postRunDue() rather than containing its own logic inline).
//
// ADR-0029 gate 6: this file imports ONLY ./runner-client.mjs for network
// calls -- never a raw fetch()/http client. scripts/check-trigger-no-direct-
// fetch.ps1 (test id wave6-trigger-no-direct-fetch) enforces that
// mechanically, not just by convention.
//
// Every external effect (enqueue, status poll, the Task 8 DB write, the
// poll-interval sleep) is dependency-injected, same seam as every other
// module in this pipeline -- tests drive the whole retry/poll/write state
// machine with zero real network calls, zero real timers, and zero real
// Postgres connection.

import { enqueueDiscoveredFetch, getRunnerJobStatus } from './runner-client.mjs';

const IN_FLIGHT_STATUSES = new Set(['queued', 'fetching']);
const TERMINAL_STATUSES = new Set(['completed', 'flagged_for_review', 'failed']);
// OBJECT_TOO_LARGE (object-storage-client.mjs) is a config/content-size
// rejection -- retrying the exact same URL produces the exact same payload
// size, so retrying changes nothing. HTTP_CLIENT_ERROR/UNSUPPORTED_CONTENT_TYPE
// (retrieval/http-html-fetch.mjs, critic review 2026-09-18) are the same
// shape: the same URL fetched again gets the identical 4xx or the identical
// wrong content type, so retrying is pure waste -- both of Trigger.dev's
// retry budget and of real HTTP requests against a third-party site (a mild
// self-inflicted DoS-like pattern the review named directly). 429 (rate
// limiting) deliberately never gets HTTP_CLIENT_ERROR -- it IS transient,
// unlike every other 4xx, and stays in the default-retryable bucket. Every
// other job.errorCode (today just OBJECT_STORAGE_TIMEOUT) is presumed
// transient. A bare `ssrf_blocked_` prefix on job.error (no errorCode --
// SsrfBlockedError predates the errorCode field and its message prefix
// already IS its own machine-matchable signal, server.mjs's own comment) is
// the other non-retryable case: an SSRF-gate policy rejection, not a
// transient fault.
const NON_RETRYABLE_ERROR_CODES = new Set(['OBJECT_TOO_LARGE', 'HTTP_CLIENT_ERROR', 'UNSUPPORTED_CONTENT_TYPE']);

function isNonRetryable(job) {
  if (job.errorCode && NON_RETRYABLE_ERROR_CODES.has(job.errorCode)) return true;
  return typeof job.error === 'string' && job.error.startsWith('ssrf_blocked_');
}

/**
 * Enqueue one URL on the isolated runner, poll until it reaches a terminal
 * status, and on a clean completion hand the result to Task 8's
 * writeDiscoveredSource(). Returns a structured `{outcome, retryable, ...}`
 * result rather than throwing for an in-band terminal outcome (flagged,
 * failed) -- only an unexpected error in enqueue/poll/write itself (a bug,
 * not a modeled outcome) propagates as a real exception. This lets the
 * eventual Trigger.dev task wrapper decide retry policy from `retryable`
 * without needing to parse error messages or know this module's internals.
 */
export async function orchestrateDiscoveredFetch({
  runnerBaseUrl,
  sharedSecret,
  targetUrl,
  tenantId,
  subjectKind = 'ORGANIZATION',
  query,
  writeDiscoveredSourceImpl,
  // Task 10 (operator UI): "dry-run first" is this pipeline's own version of
  // /ops/collect's existing "試跑不會存任何東西" convention -- a human
  // previewing an unfamiliar URL should be able to see what the runner would
  // capture (title, text length, whether the content-isolation scan would
  // flag it) without that preview ever landing in hci.sources/
  // hci.source_snapshots. `dryRun: true` skips BOTH the tenantId/query
  // consistency check and the Task 8 write call entirely -- `query` and
  // `writeDiscoveredSourceImpl` are then not required at all, since nothing
  // downstream of the runner's own answer is ever touched.
  dryRun = false,
  enqueueImpl = enqueueDiscoveredFetch,
  getStatusImpl = getRunnerJobStatus,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollIntervalMs = 2000,
  maxPollAttempts = 30,
}) {
  if (!dryRun && !writeDiscoveredSourceImpl) throw new TypeError('writeDiscoveredSourceImpl is required (e.g. Task 8\'s writeDiscoveredSource) unless dryRun is true');

  if (!dryRun) {
    // critic review 2026-09-18 (Major, real cross-tenant-write risk): `tenantId`
    // (told to the runner, cosmetic/audit-only on that side) and `query`
    // (a caller-supplied, already-SET-ROLE'd connection whose RLS scope is the
    // ONLY real tenant boundary Task 8's writeDiscoveredSource has -- it takes
    // no tenant_id parameter at all, sink-hci-discovered.mjs's own header
    // comment) are two independent inputs this function never used to cross-
    // check. A caller bug (e.g. a loop over multiple tenants' seeds that pairs
    // the wrong tenantId with the wrong query) could enqueue as "tenant B" on
    // the runner while writing to hci.sources/hci.source_snapshots as
    // whichever tenant `query` is actually SET ROLE'd to -- a real cross-
    // tenant data-integrity bug, the highest-severity class in this stack, in
    // the one shared entry point every future caller funnels through. No
    // caller existed yet when this was written, making it the cheapest
    // possible moment to close -- app/server.mjs (Task 10) is now the first
    // real caller, and it happens to always pass a matching tenantId/query
    // pair (both come from the same resolveTenant() result), so this check
    // has never yet had a real bug to catch, only tests that simulate one.
    // Skipped for a dry run -- there is no write for it to protect.
    const { rows: tenantCheckRows } = await query('SELECT hci.current_tenant_id() AS id');
    const actualTenantId = tenantCheckRows[0]?.id;
    if (actualTenantId !== tenantId) {
      throw new Error(`tenantId mismatch: caller passed tenantId=${tenantId} but the supplied query's connection is SET ROLE'd to tenant=${actualTenantId ?? 'unknown'} -- refusing to enqueue a runner job under one tenant's identity while writing under another's`);
    }
  }

  const job = await enqueueImpl({ runnerBaseUrl, sharedSecret, targetUrl, tenantId, subjectKind });

  let current = job;
  for (let attempt = 0; attempt < maxPollAttempts && IN_FLIGHT_STATUSES.has(current.status); attempt++) {
    await sleepImpl(pollIntervalMs);
    current = await getStatusImpl({ runnerBaseUrl, sharedSecret, jobId: job.id });
  }

  if (IN_FLIGHT_STATUSES.has(current.status)) {
    // Never reached a terminal status within the poll budget -- presumed
    // transient (a slow but eventually-successful fetch, a busy runner),
    // not a policy rejection, so retryable.
    return { outcome: 'timed_out', retryable: true, jobId: job.id };
  }

  if (current.status === 'flagged_for_review') {
    // ADR-011 SS決策15b: never retry-until-clean. The content itself
    // tripped the gate (or Task 7's truncation-routes-to-review fix) -- a
    // human must look, not this orchestrator.
    return { outcome: 'flagged_for_review', retryable: false, jobId: job.id, scanReasons: current.scanReasons ?? null, truncated: !!current.truncated };
  }

  if (current.status === 'failed') {
    return {
      outcome: 'failed',
      retryable: !isNonRetryable(current),
      jobId: job.id,
      error: current.error ?? null,
      errorCode: current.errorCode ?? null,
    };
  }

  // critic review 2026-09-18 (Major, real repro): this used to be an
  // implicit "not in-flight/flagged/failed, so must be completed" -- no
  // code ever actually checked the value. Real repro: a status this module
  // does not recognize (e.g. a future 'cancelled', or any typo/schema drift
  // on the runner side) fell through to here and reached
  // writeDiscoveredSourceImpl with undefined contentHash/snapshotRef. Only
  // Task 8's own non-empty-string validation (a coincidence, not a
  // protection this file designed) turned that into a thrown TypeError
  // instead of a silent bad write. Explicit now, matching this function's
  // own stated design ("only an unexpected error... propagates as a real
  // exception") instead of contradicting it.
  if (current.status !== 'completed') {
    throw new Error(`unrecognized terminal job status '${current.status}' -- expected one of ${[...TERMINAL_STATUSES].join(', ')}`);
  }

  if (dryRun) {
    // Never calls writeDiscoveredSourceImpl -- a dry run's whole point is
    // that nothing lands in hci.sources/hci.source_snapshots. finalUrl/
    // title/textLength/truncated let a human preview exactly what a real
    // run would have captured; snapshotRef is deliberately NOT surfaced --
    // the object storage upload already happened for real inside the
    // runner (Task 5/7's design, not something dry-run mode changes), but
    // showing that pointer here would invite a caller to treat a "preview"
    // as if it were an already-durable, DB-backed reference.
    return { outcome: 'dry_run_completed', retryable: false, jobId: job.id, finalUrl: current.finalUrl || targetUrl, title: current.title ?? null, textLength: current.textLength ?? null, contentHash: current.contentHash };
  }

  const written = await writeDiscoveredSourceImpl(query, {
    targetUrl: current.finalUrl || targetUrl,
    contentHash: current.contentHash,
    snapshotRef: current.snapshotRef,
    contentEpistemicType: current.contentProvenance?.epistemic_type,
  });

  return { outcome: 'written', retryable: false, jobId: job.id, sourceId: written.sourceId, snapshotId: written.snapshotId, candidateRelatedSources: written.candidateRelatedSources };
}
