// HCI-30 isolated fetch runner -- internal HTTP API skeleton (ADR-0029 gate 1,
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 3). Enqueue/status only --
// no outbound fetch/extract logic here (that is Task 4/7, dependent on the
// DNS-rebind protection this task explicitly does not build). This file
// exists so Task 9's Trigger.dev orchestrator has a real API shape to call
// once wired, and so the network-isolation tests in
// tests/architecture/fetch-runner-network-isolation.test.ps1 have a live
// service running inside the container whose network namespace they probe.
//
// KNOWN GAP (left for Task 4/7, not this task): nothing here waits for the
// network-guard sidecar's iptables rules to be confirmed applied before this
// server starts accepting requests. That race is harmless today because this
// server makes zero outbound calls of its own -- the day Task 7 adds a real
// fetch() call, that call must not run until network-guard has finished
// (compose.fetch-runner.yml's network-guard service exiting 0 is the signal;
// wire a `depends_on: network-guard: condition: service_completed_successfully`
// on whatever service issues the first real fetch, or block on a ready-file
// network-guard writes).
import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.HCI_FETCH_RUNNER_PORT || 8090);
const SHARED_SECRET = process.env.HCI_FETCH_RUNNER_SHARED_SECRET;
if (!SHARED_SECRET) {
  console.error('HCI_FETCH_RUNNER_SHARED_SECRET is required -- refusing to start unauthenticated.');
  process.exit(1);
}

// In-memory only -- Task 8 owns durable persistence into
// hci.sources/hci.source_snapshots. A restart loses all queued/status state;
// acceptable for a skeleton with no real fetch execution behind it yet.
const jobs = new Map();

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

// Defense in depth (critic review 2026-09-17): `http.createServer` never
// awaits this callback, so ANY future unguarded dereference inside it -- not
// just the null-body case already fixed below -- would throw a synchronous
// TypeError, become an unhandled promise rejection, and crash the whole
// process under Node's default `--unhandled-rejections=throw`. This
// container has no restart policy (by design -- restarting would silently
// wipe network-guard's iptables rules), so any such crash is a full outage
// until a human intervenes. One catch-all here turns "unknown future bug" +
// "no auto-recovery" into a 500 response instead of a dead process.
const server = http.createServer(async (req, res) => {
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
    jobs.set(id, job);
    return sendJson(res, 202, job);
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
