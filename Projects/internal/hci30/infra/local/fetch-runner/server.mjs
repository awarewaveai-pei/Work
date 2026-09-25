// HCI-30 isolated fetch runner -- internal HTTP API (ADR-0029 gate 1;
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 3 skeleton, Task 6 seed
// governance, Task 7 fetch+extract+content-isolation). This file exists so
// Task 9's Trigger.dev orchestrator has a real API shape to call once wired
// (enqueue/status only -- Trigger.dev never fetches itself, ADR-0029 gate 6),
// and so the network-isolation tests in
// tests/architecture/fetch-runner-network-isolation.test.ps1 have a live
// service running inside the container whose network namespace they probe.
//
// Egress-policy gate: entrypoint.sh installs the OUTPUT policy in this container's netns on every
// start, writes a fresh ready-file, then drops privileges and execs this file (ADR-0029 "Where the
// egress policy is applied", 2026-09-21; replaced the one-shot network-guard sidecar, which never
// re-ran after a runner restart). So under the real entrypoint the file always exists before node
// starts. `waitForNetworkGuardReady()` still gates every outbound fetch as defense in depth: any
// start path that bypasses the entrypoint fails closed instead of fetching with no policy.
// `/healthz` and `/enqueue` respond regardless -- only fetch execution blocks.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fetchAndExtract, extractFromBytes } from './retrieval/http-html-fetch.mjs';
import { scanForInstructionLikeContent } from './content-isolation/scan.mjs';
import { putContentAddressedObject, getContentAddressedObject, sha256Hex, loadConfigFromEnv } from './object-storage-client.mjs';
import { createJobStore, loadJobStoreConfigFromEnv } from './job-store.mjs';

const NETWORK_GUARD_READY_FILE = process.env.HCI_FETCH_RUNNER_NETWORK_GUARD_READY_FILE || '/var/run/network-guard/ready';
const NETWORK_GUARD_READY_TIMEOUT_MS = Number(process.env.HCI_FETCH_RUNNER_NETWORK_GUARD_READY_TIMEOUT_MS || 30_000);
const NETWORK_GUARD_READY_POLL_MS = 200;

/**
 * Poll for the egress-policy ready-file (written by entrypoint.sh). Fail-closed: a timeout throws rather
 * than letting the caller silently proceed to fetch with an unknown egress
 * policy state -- the one failure mode ADR-0029 cannot tolerate is "fetched
 * something before we could prove the SSRF/isolation policy was actually
 * applied".
 */
async function waitForNetworkGuardReady(timeoutMs = NETWORK_GUARD_READY_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await fs.access(NETWORK_GUARD_READY_FILE);
      return;
    } catch {
      // not ready yet
    }
    if (Date.now() >= deadline) {
      throw new Error(`network_guard_not_ready_after_${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, NETWORK_GUARD_READY_POLL_MS));
  }
}

const PORT = Number(process.env.HCI_FETCH_RUNNER_PORT || 8090);
const SHARED_SECRET = process.env.HCI_FETCH_RUNNER_SHARED_SECRET;
if (!SHARED_SECRET) {
  console.error('HCI_FETCH_RUNNER_SHARED_SECRET is required -- refusing to start unauthenticated.');
  process.exit(1);
}

// critic review 2026-09-18: validated eagerly, at module load, same as
// SHARED_SECRET above -- previously only checked lazily inside processJob,
// reached only after network-guard-ready + a real fetch + a passing scan.
// That let the container start, pass the unauthenticated /healthz probe
// (never touches MinIO), and report healthy to compose's
// `condition: service_healthy` with a config that would fail on the very
// first clean job, indistinguishable in shape from any other per-job
// failure. Skipped entirely when HCI_FETCH_RUNNER_SKIP_MINIO_STARTUP_CHECK
// is set -- tests import this module for `processJob` and always inject
// `putContentAddressedObjectImpl`, so they never need real MinIO env vars
// (matching server.test.mjs's existing SHARED_SECRET/PORT dummy-value
// pattern) and must not be forced to fabricate four more just to import it.
if (!process.env.HCI_FETCH_RUNNER_SKIP_MINIO_STARTUP_CHECK) {
  try {
    loadConfigFromEnv();
  } catch (err) {
    console.error(`Object-storage configuration is invalid -- refusing to start: ${err.message}`);
    process.exit(1);
  }
}

// In-memory only -- Task 8 owns durable persistence into
// hci.sources/hci.source_snapshots. A restart loses all queued/status state.
// Bounded by TTL + cap (job-store.mjs); an expired/evicted id answers /status with 404.
let jobStoreConfig;
try {
  jobStoreConfig = loadJobStoreConfigFromEnv();
} catch (err) {
  console.error(`Job store configuration is invalid -- refusing to start: ${err.message}`);
  process.exit(1);
}
const jobs = createJobStore(jobStoreConfig);

function isAuthorized(req) {
  const header = req.headers['authorization'] || '';
  const expected = `Bearer ${SHARED_SECRET}`;
  // Constant-time compare requires equal-length buffers; a length mismatch
  // is itself not secret, so short-circuiting on it first does not leak
  // anything timingSafeEqual would otherwise protect.
  if (header.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Task 7: fetch + extract + content-isolation scan for one job, mutating it
 * in place so GET /status/:id reflects the outcome. Never stores `raw` bytes
 * on the job object itself -- that would either bloat /status's JSON
 * response with a full page body (Buffer.toJSON serializes as a
 * {type,data} int array) or, for a flagged/failed job, leak
 * attacker-controlled bytes into every future status poll. `raw` is instead
 * uploaded to Task 5's object storage (clean/non-flagged content only) and
 * only the resulting `snapshotRef` pointer is kept on the job.
 *
 * Object-storage upload lives HERE, not in Task 8/9 as an earlier version of
 * this comment assumed: only this runner has network access to its own
 * dedicated MinIO instance (entrypoint.sh's iptables policy allowlists
 * exactly that one peer) -- Task 8's write-path module and Task 9's
 * Trigger.dev orchestrator run OUTSIDE the isolated runner (deliberately --
 * they need real Postgres/Trigger.dev access, which the runner is cut off
 * from by the same isolation policy) and have no path to reach it. Found
 * while wiring Task 9, which needs `snapshotRef` to call Task 8's
 * writeDiscoveredSource() -- this runner is the only place that value can
 * ever be produced.
 *
 * `deps` is a test seam (same pattern as pinned-http-client.mjs's `transport`
 * and http-html-fetch.mjs's `safeFetch`): production code never passes it,
 * tests inject `fetchAndExtractImpl`/`scanImpl`/`waitForReadyImpl`/
 * `putContentAddressedObjectImpl` to drive this state machine without a real
 * network fetch, a real egress-policy ready-file, or a real MinIO instance.
 */
export async function processJob(job, deps = {}) {
  const fetchAndExtractImpl = deps.fetchAndExtractImpl ?? fetchAndExtract;
  const scanImpl = deps.scanImpl ?? scanForInstructionLikeContent;
  const waitForReadyImpl = deps.waitForReadyImpl ?? waitForNetworkGuardReady;
  // Re-reads env vars already validated eagerly at module load above -- this
  // call is expected to always succeed in production; it exists as its own
  // function only so tests can inject `putContentAddressedObjectImpl` and
  // never touch real MinIO config at all.
  const putContentAddressedObjectImpl = deps.putContentAddressedObjectImpl ?? ((bytes) => putContentAddressedObject(bytes, loadConfigFromEnv()));

  job.status = 'fetching';
  try {
    await waitForReadyImpl();
    const extracted = await fetchAndExtractImpl(job.targetUrl);
    // Scans `scanSurface` (title + text + HTML comments/attribute values),
    // not just `extracted.text` -- critic review 2026-09-17 found `title`
    // reached status='completed' completely unscanned, and comment/
    // attribute text (invisible to `text`'s extraction but still present in
    // `raw`, which is what actually gets uploaded/hashed below) was equally
    // invisible to the gate. See retrieval/http-html-fetch.mjs's
    // `scanSurface` construction.
    const scanResult = scanImpl(extracted.scanSurface);

    // critic review 2026-09-18: a truncated fetch (Task 4's 5MB response
    // cap) used to be uploaded and marked 'completed' exactly like a
    // complete one, with `truncated: true` sitting inert on the job and
    // nowhere in Task 8's hci.source_snapshots row at all -- a page cut off
    // mid-tag/mid-sentence recorded as if it were the whole document, with
    // no signal for a human reviewer. Routing it through the SAME
    // human-review lane as a content-isolation hit is the cheapest correct
    // fix (no new terminal status, no new DB column): flagged_for_review
    // already means "do not treat as a trustworthy DISCOVERED capture,
    // needs a human to look."
    if (scanResult.flagged || extracted.truncated) {
      // ADR-011 SS決策15b: a hit routes to human review, never straight into
      // the DISCOVERED write path (Task 8 must treat this status as terminal
      // -- not something to retry-until-clean, since the content itself is
      // what tripped the gate, not a transient fetch error). Raw bytes are
      // never uploaded here -- a reviewer works from scanReasons' excerpts
      // (or the truncation fact itself), not a durable copy of
      // possibly-malicious or knowingly-incomplete content. Written as an
      // if/else with the upload call physically inside the else branch
      // (critic review 2026-09-18), not an early-return before it -- makes
      // "flagged or truncated content never reaches upload" true by
      // control-flow construction, not just by test coverage of today's
      // ordering.
      job.status = 'flagged_for_review';
      if (scanResult.flagged) job.scanReasons = scanResult.reasons;
      if (extracted.truncated) job.truncated = true;
      return;
    }

    // contentHash comes from the OBJECT STORAGE write's own return value,
    // not extracted.contentHash (both hash the identical `raw` buffer with
    // sha256 and will always agree) -- using the value object storage
    // itself computed keeps contentHash mechanically consistent with
    // snapshotRef, which embeds this exact hash as its MinIO key
    // (s3://bucket/sha256/<hash>), rather than trusting two independent
    // computations to stay in sync by coincidence.
    const stored = await putContentAddressedObjectImpl(extracted.raw);

    // No `job.truncated` field here: reaching this line means
    // extracted.truncated was falsy (the branch above already returned for
    // a truncated fetch) -- a 'completed' job is always a complete capture.
    job.status = 'completed';
    job.contentHash = stored.content_hash;
    job.snapshotRef = stored.snapshot_ref;
    job.title = extracted.title;
    job.textLength = extracted.text.length;
    job.finalUrl = extracted.finalUrl;
    job.fetchedAt = extracted.fetchedAt;
    job.contentProvenance = extracted.content_provenance;
  } catch (err) {
    job.status = 'failed';
    // SsrfBlockedError's own .message is already the safe, non-sensitive,
    // `ssrf_blocked_<reason>`-prefixed label (ssrf-guard.mjs's constructor
    // does that prefixing itself) -- a future consumer can match on that
    // prefix to distinguish "policy rejection, retrying changes nothing"
    // from "transient fetch error, retry-worthy" without this function
    // needing to know about SsrfBlockedError specifically. An earlier
    // version re-wrapped it with a second `ssrf_blocked_` prefix, caught by
    // this file's own unit test (tests/unit/fetch-runner/server.test.mjs).
    job.error = (err && err.message) || 'unknown_error';
    // critic review 2026-09-18: before this, every object-storage failure
    // (ObjectTooLargeError, ObjectStorageTimeoutError -- both already carry
    // a `.code`, object-storage-client.mjs) collapsed into this same
    // unstructured message string alongside generic fetch errors, giving
    // Task 9's retry logic (plan doc: "enqueue/status/retry-only") no way
    // to tell "config/oversized, retrying is pointless" apart from
    // "transient, retry is reasonable." Surfacing `.code` when the thrown
    // error has one (both object-storage error classes do; SsrfBlockedError
    // does not, which is fine -- its message prefix is already its own
    // machine-matchable signal) gives Task 9 a real field to branch on
    // without having to parse `job.error` prose.
    job.errorCode = (err && err.code) || null;
  }
}

const CONTENT_HASH_HEX = /^[0-9a-f]{64}$/;
// Hard ceiling on text returned per call; callers cap lower for their own use.
export const SNAPSHOT_TEXT_MAX_CHARS = 200_000;

/**
 * Readable text of an ALREADY-STORED snapshot (evidence promotion, 2026-09-19).
 * The runner is the only process with MinIO access (egress-policy allowlist),
 * so re-extraction lives here; hci-app never sees raw bytes. No
 * waitForNetworkGuardReady(): the only peer contacted is the configured MinIO
 * endpoint, never a caller-supplied URL.
 * - sha256(bytes) must equal contentHash: evidence text is provably derived
 *   from the exact bytes the DB row points at.
 * - Re-scanned with the CURRENT scanner on the identical scanSurface
 *   (extractReadable): a scanner rule added after capture still blocks
 *   promotion of content it would now flag.
 * Returns {ok:false,status,error} for modelled rejections; throws only on
 * object-storage/transport failure.
 */
export async function readStoredSnapshotText(input, deps = {}) {
  const getObjectImpl = deps.getObjectImpl ?? ((ref) => getContentAddressedObject(ref, loadConfigFromEnv()));
  const scanImpl = deps.scanImpl ?? scanForInstructionLikeContent;
  const { snapshotRef, contentHash } = input;
  if (typeof contentHash !== 'string' || !CONTENT_HASH_HEX.test(contentHash)) return { ok: false, status: 400, error: 'invalid_content_hash' };
  if (typeof snapshotRef !== 'string' || !snapshotRef.endsWith(`/sha256/${contentHash}`)) return { ok: false, status: 400, error: 'snapshot_ref_does_not_match_content_hash' };

  const raw = await getObjectImpl(snapshotRef);
  if (sha256Hex(raw) !== contentHash) return { ok: false, status: 409, error: 'stored_bytes_hash_mismatch' };

  const { title, text, scanSurface } = extractFromBytes(raw);
  const scan = scanImpl(scanSurface);
  if (scan.flagged) return { ok: false, status: 422, error: 'content_flagged', scanReasons: scan.reasons };
  return {
    ok: true,
    title,
    // toWellFormed: a cut can land inside a surrogate pair (CJK Ext-B names, emoji).
    text: text.slice(0, SNAPSHOT_TEXT_MAX_CHARS).toWellFormed(),
    textLength: text.length,
    textTruncated: text.length > SNAPSHOT_TEXT_MAX_CHARS,
  };
}

// Defense in depth (critic review 2026-09-17): `http.createServer` never
// awaits this callback, so ANY future unguarded dereference inside it -- not
// just the null-body case already fixed below -- would throw a synchronous
// TypeError, become an unhandled promise rejection, and crash the whole
// process under Node's default `--unhandled-rejections=throw`. The restart
// policy would bring it back (entrypoint.sh re-applies the egress policy), but
// every in-memory job would be lost. One catch-all here turns "unknown future
// bug" into a 500 response instead of a dead process.
// Exported so tests/unit/fetch-runner/server.test.mjs can close it in an
// `after()` hook -- without an explicit close, `node --test` never observes
// this process exit naturally (an open TCP listener keeps the event loop
// alive indefinitely), which is not a concern for the real container
// (it is SUPPOSED to keep running) but hangs any test file that imports
// this module for its exported `processJob`.
export const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('unhandled request error:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
  }
});

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Unauthenticated on purpose: the container HEALTHCHECK and compose's
  // `condition: service_healthy` probe call this with no secret configured.
  if (req.method === 'GET' && url.pathname === '/healthz') {
    return sendJson(res, 200, { status: 'ok' });
  }

  if (!isAuthorized(req)) {
    return sendJson(res, 401, { error: 'unauthorized' });
  }

  if (req.method === 'POST' && url.pathname === '/enqueue') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'invalid_json' });
    }
    // critic review 2026-09-17 (Task 6): `JSON.parse` accepts top-level
    // `null`/arrays/scalars as legal JSON -- `body.targetUrl` on a `null`
    // body throws a synchronous TypeError inside this unawaited async
    // handler, which is an unhandled rejection that crashes the whole
    // process under Node's default `--unhandled-rejections=throw` (no
    // restart policy on this container by design, so that is a full outage
    // until a human intervenes). Reject non-plain-object bodies before
    // dereferencing anything on them.
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_body' });
    }
    if (!body.targetUrl || typeof body.targetUrl !== 'string') {
      return sendJson(res, 400, { error: 'targetUrl is required' });
    }
    // HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 6 (ADR-011 SS決策10):
    // this pipeline is org-entities-only, by machine-enforced whitelist, not
    // NLP/LLM inference of "is this text about a person". Fail-closed on
    // anything other than the exact literal -- a missing field and a
    // misspelled/wrong-case value get the same rejection, because both mean
    // "the caller did not affirmatively declare ORGANIZATION". No bypass
    // parameter may ever be added here (plan's Boundaries line for Task 6).
    if (body.subject_kind !== 'ORGANIZATION') {
      return sendJson(res, 400, {
        error: 'subject_kind_required',
        message: "seed requires an explicit subject_kind: 'ORGANIZATION' -- this pipeline accepts organization-entity seeds only (see agency-os/reports/decisions/2026-09-17-hci30-c6-and-collector-task1-decisions.md, decision 3)",
      });
    }
    const id = crypto.randomUUID();
    const job = {
      id,
      targetUrl: body.targetUrl,
      tenantId: body.tenantId ?? null,
      // Hardcoded, not `body.subject_kind`: the check above has just proven
      // strict equality to this literal, but echoing the caller's raw value
      // would silently decouple "accepted" from "persisted" if that check is
      // ever loosened later (critic review 2026-09-17).
      subjectKind: 'ORGANIZATION',
      status: 'queued',
      createdAt: new Date().toISOString(),
    };
    // false = every slot holds an in-flight job (never evicted); refuse rather than grow unbounded.
    if (!jobs.set(id, job)) {
      return sendJson(res, 503, { error: 'job_store_full' });
    }
    // Fire-and-forget, deferred via setImmediate -- NOT called directly here.
    // An async function's body runs SYNCHRONOUSLY up to its first `await`,
    // so calling processJob(job) inline would already have mutated
    // job.status to 'fetching' (processJob's first line) by the time
    // sendJson below serializes `job` -- a real race found by this file's
    // own architecture test (tests/architecture/fetch-runner-content-isolation.test.ps1),
    // where a fast-completing fetch made /enqueue's response body show
    // status='fetching' instead of the documented 'queued'. setImmediate
    // pushes the entire call (including that synchronous prefix) to the
    // next event-loop tick, guaranteeing this response always reflects the
    // job's state at enqueue time. (Task 9's Trigger.dev orchestrator polls
    // GET /status/:id for the eventual outcome -- ADR-0029 gate 6 requires
    // Trigger.dev to never fetch itself, which is why this runs here at all
    // rather than inside the request that enqueued it.)
    setImmediate(() => {
      processJob(job).catch((err) => {
        // processJob itself catches everything into job.status='failed' --
        // reaching here means a bug in processJob's OWN error handling, not
        // a fetch failure. Logged, not rethrown: this runs detached from any
        // request, so an uncaught rejection here would be a second
        // unhandled-rejection crash vector on top of the one Task 6 already
        // closed for the request-handling path.
        console.error(`processJob threw outside its own try/catch for job ${job.id}:`, err);
        job.status = 'failed';
        job.error = 'internal_processing_error';
      });
    });
    return sendJson(res, 202, job);
  }

  if (req.method === 'POST' && url.pathname === '/snapshot-text') {
    let body;
    try {
      body = await readJsonBody(req);
    } catch {
      return sendJson(res, 400, { error: 'invalid_json' });
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return sendJson(res, 400, { error: 'invalid_body' });
    }
    let result;
    try {
      result = await readStoredSnapshotText(body);
    } catch (err) {
      console.error('snapshot-text: object storage read failed:', err && err.message);
      return sendJson(res, 502, { error: 'object_storage_read_failed', errorCode: (err && err.code) || null });
    }
    if (!result.ok) {
      const { ok, status, ...rest } = result;
      return sendJson(res, status, rest);
    }
    const { ok, ...payload } = result;
    return sendJson(res, 200, payload);
  }

  const statusMatch = req.method === 'GET' && url.pathname.match(/^\/status\/([^/]+)$/);
  if (statusMatch) {
    const job = jobs.get(statusMatch[1]);
    if (!job) return sendJson(res, 404, { error: 'not_found' });
    return sendJson(res, 200, job);
  }

  sendJson(res, 404, { error: 'not_found' });
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`hci-fetch-runner internal API listening on :${PORT}`);
});
