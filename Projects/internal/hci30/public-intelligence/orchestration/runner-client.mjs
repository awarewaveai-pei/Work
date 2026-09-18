// HCI-30 collector pipeline -- the ONE sanctioned HTTP client for Trigger.dev
// task code (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 9; ADR-0029 gate
// 6: "task 程式碼只能呼叫 runner 自己的 API，不能有任何對外 HTTP client 呼叫
// 非白名單目標"). Every direct fetch()/http-client call in this whole
// orchestration layer lives HERE and nowhere else -- scripts/check-trigger-
// no-direct-fetch.ps1 (test id wave6-trigger-no-direct-fetch) enforces that
// by filename allowlist ("*runner-client*"), matching the exact pattern
// lobster-factory's own collect-scheduled-crawl.ts already uses (a thin
// Trigger.dev task delegating to a separate function, never fetching
// inline) rather than inventing a new one.
//
// Uses the platform global `fetch` (available in Node 18+ and in the
// Trigger.dev worker runtime) -- not axios/undici/node:http -- so this file
// itself has zero npm dependencies, matching every other module in this
// collector pipeline (net/pinned-http-client.mjs, object-storage-client.mjs,
// sink-hci-discovered.mjs).
//
// `fetchImpl` is dependency-injected (same seam as every other module in
// this codebase) so tests never make a real network call.

// critic review 2026-09-18: Node 18+'s global `fetch` has NO default
// timeout. orchestrateDiscoveredFetch's whole "poll budget" reliability
// guarantee (maxPollAttempts) is worthless if a single getRunnerJobStatus
// call can hang forever -- the for-loop never gets a chance to increment
// because it is blocked on the `await` itself, not on the loop condition.
// A stuck runner (event-loop starvation from the unbounded `jobs` Map,
// resource exhaustion, a network partition) would hang this function
// indefinitely with no signal at all, leaving only Trigger.dev's own
// platform-level task timeout as a backstop for something this module's
// own design says it should bound itself.
const DEFAULT_TIMEOUT_MS = 30_000;

function authHeaders(sharedSecret) {
  return { Authorization: `Bearer ${sharedSecret}`, 'Content-Type': 'application/json' };
}

/**
 * POST /enqueue on the isolated runner. Returns the queued job
 * ({id, status:'queued', ...}) or throws on a non-2xx response.
 */
export async function enqueueDiscoveredFetch({ runnerBaseUrl, sharedSecret, targetUrl, tenantId, subjectKind = 'ORGANIZATION', fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const res = await fetchImpl(`${runnerBaseUrl}/enqueue`, {
    method: 'POST',
    headers: authHeaders(sharedSecret),
    body: JSON.stringify({ targetUrl, tenantId, subject_kind: subjectKind }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw Object.assign(new Error(`enqueue_failed_http_${res.status}`), { status: res.status });
  return res.json();
}

/**
 * GET /status/:id on the isolated runner. Returns the job's current state
 * (queued/fetching/completed/flagged_for_review/failed, plus whatever fields
 * that status carries -- see server.mjs's processJob). Throws on a non-2xx
 * response (including 404, which the runner returns for an unknown id --
 * ADR-0029 gate 6 does not exempt orchestration bugs from fail-loud). A
 * timeout throws Node's own `AbortError` (`.name === 'AbortError'`, no
 * `.code` this codebase recognizes) -- orchestrate-discovered-fetch.mjs's
 * `isNonRetryable()` correctly leaves it in the default-retryable bucket,
 * since a timeout is exactly the transient-fault shape retrying exists for.
 */
export async function getRunnerJobStatus({ runnerBaseUrl, sharedSecret, jobId, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const res = await fetchImpl(`${runnerBaseUrl}/status/${jobId}`, { headers: authHeaders(sharedSecret), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw Object.assign(new Error(`status_poll_failed_http_${res.status}`), { status: res.status });
  return res.json();
}

/**
 * POST /snapshot-text on the isolated runner: readable text of an already-
 * stored snapshot (fetch-runner server.mjs readStoredSnapshotText). A
 * content-scan hit is a modelled outcome, returned as {flagged:true,
 * scanReasons}; every other non-2xx throws with the runner's error label.
 */
export async function readSnapshotText({ runnerBaseUrl, sharedSecret, snapshotRef, contentHash, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const res = await fetchImpl(`${runnerBaseUrl}/snapshot-text`, {
    method: 'POST',
    headers: authHeaders(sharedSecret),
    body: JSON.stringify({ snapshotRef, contentHash }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await res.json().catch(() => null);
  if (res.status === 422 && body?.error === 'content_flagged') return { flagged: true, scanReasons: body.scanReasons ?? [] };
  if (!res.ok) throw Object.assign(new Error(`snapshot_text_failed_http_${res.status}${body?.error ? `_${body.error}` : ''}`), { status: res.status });
  return { flagged: false, ...body };
}
