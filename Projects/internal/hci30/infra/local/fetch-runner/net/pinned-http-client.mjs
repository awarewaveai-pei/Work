// HCI-30 isolated fetch runner -- DNS-pinned HTTP client (ADR-0029 gate 4-5;
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 4).
//
// Standalone reimplementation of the pinning technique in
// lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/collect/net/fetcher.ts
// (pinnedDispatcher + createCollectFetch's per-hop re-gate loop), built on Node's core
// http/https modules instead of undici's `Agent({connect:{lookup}})` -- this runner's
// Dockerfile (../Dockerfile) never runs `npm install`, so no package outside Node core
// is available inside the container. Node's own http.Agent/https.Agent accept the same
// kind of `lookup` override (forwarded to net.connect), which is the documented,
// standard way to pin a Node HTTP client's connection to a specific address regardless
// of what the platform's own DNS resolution would answer at connect time.
//
// Why this closes the DNS-rebind TOCTOU gap: ssrf-guard.mjs's checkUrl() resolves a
// hostname ONCE and validates every address it returned. Without a second guarantee,
// Node's own http stack would resolve the SAME hostname again when connecting -- a
// rebinding host can answer "public" to the first query and "private" to the second,
// and checkUrl never sees that second answer. pinnedLookup() below never calls DNS (or
// the injected resolver) again: it is a pure function that always answers with the one
// address checkUrl already validated, so the platform's own connect-time resolution
// path never runs a real query at all.
//
// NOT wired into infra/local/fetch-runner/server.mjs's /enqueue handler by this task --
// that is Task 7 (HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md), which also adds
// content-isolation for whatever this client fetches. This file only proves the safe
// HTTP client primitive exists and works.

import http from 'node:http';
import https from 'node:https';
import { checkUrl, defaultResolver, SsrfBlockedError } from './ssrf-guard.mjs';

export { SsrfBlockedError };

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * A `lookup` function (same shape as node:dns's lookup) that ignores the hostname it is
 * asked about and always answers with `address`/`family`. Handed to an http.Agent /
 * https.Agent, this is what turns checkUrl()'s "I resolved this hostname and it was
 * safe" into a guarantee instead of advice -- the exact mechanism a DNS-rebind test
 * must exercise directly, decoupled from Agent construction so it is testable without
 * reaching into Node Agent internals.
 */
export function pinnedLookup(address, family) {
  return function lookup(_hostname, options, callback) {
    if (options && options.all) return callback(null, [{ address, family }]);
    callback(null, address, family);
  };
}

/**
 * One Agent per request, never pooled/reused (deliberate, same invariant as
 * lobster-factory's pinnedDispatcher): a pinned connection reused for a later request
 * to a DIFFERENT resolved address for the same hostname would silently un-pin it.
 */
export function createPinnedAgent(protocol, address, family) {
  const Impl = protocol === 'https:' ? https.Agent : http.Agent;
  return new Impl({ keepAlive: false, lookup: pinnedLookup(address, family) });
}

/** Bytes accepted from one response before it is truncated, not silently dropped. */
const DEFAULT_MAX_BYTES = 5_000_000;

/**
 * The real transport: issues one Node core http/https request against `current`,
 * connecting only to `pinnedAddress` no matter what `current`'s hostname is. Injectable
 * so tests exercise the redirect/gate loop below without opening real sockets.
 */
export async function defaultTransport(current, { method, headers, pinnedAddress, pinnedFamily, timeoutMs, maxBytes, deadlineMs = 120_000 }) {
  const u = new URL(current);
  const impl = u.protocol === 'https:' ? https : http;
  const agent = createPinnedAgent(u.protocol, pinnedAddress, pinnedFamily);
  let deadlineTimer;
  try {
    return await new Promise((resolve, reject) => {
      let settled = false;
      const req = impl.request(
        u,
        { method, headers, agent, timeout: timeoutMs },
        (res) => {
          const chunks = [];
          let total = 0;
          res.on('data', (chunk) => {
            if (settled) return;
            if (total + chunk.length > maxBytes) {
              chunks.push(chunk.subarray(0, maxBytes - total));
              total = maxBytes;
              settled = true;
              // Resolve HERE, not on 'end' -- res.destroy() below never fires
              // 'end' on an in-flight IncomingMessage (only 'close'), so
              // waiting for 'end' after a truncation-triggered destroy() hangs
              // the promise forever. Found by real repro against this exact
              // function, critic review 2026-09-17: a response over maxBytes
              // (default 5MB, entirely plausible for a fetched document) hung
              // past 10s with no settlement, leaking the pinned Agent/socket
              // via the `finally` below never running.
              resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: true });
              res.destroy();
              return;
            }
            chunks.push(chunk);
            total += chunk.length;
          });
          res.on('end', () => {
            if (settled) return;
            settled = true;
            resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), truncated: false });
          });
          res.on('error', (err) => {
            if (settled) return;
            settled = true;
            reject(err);
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error('request_timeout')));
      req.on('error', (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
      // `timeout` above is an IDLE timer (resets on every byte received) --
      // a slow-drip response that stays just under it never trips, and never
      // exceeds maxBytes either, so it can hold a pinned connection open
      // indefinitely. This is the absolute wall-clock cap the idle timer
      // does not provide (critic review 2026-09-17, matching the deadlineMs
      // the proven lobster-factory fetcher.ts reference already has).
      deadlineTimer = setTimeout(() => {
        if (settled) return;
        req.destroy(new Error(`request_deadline_exceeded_${deadlineMs}ms`));
      }, deadlineMs);
      req.end();
    });
  } finally {
    clearTimeout(deadlineTimer);
    agent.destroy();
  }
}

/**
 * Build the pinned, SSRF-gated fetch this runner uses. Every attempt (the initial
 * request AND every redirect hop) is re-validated by checkUrl() before any connection
 * is made -- a gate applied only to the first URL is a gate an attacker skips with one
 * 3xx response (see SsrfBlockedError thrown mid-loop, not just at the top).
 */
export function createSafeFetch(opts = {}) {
  const resolver = opts.resolver ?? defaultResolver;
  const maxRedirects = opts.maxRedirects ?? 5;
  const timeoutMs = opts.timeoutMs ?? 15_000;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const deadlineMs = opts.deadlineMs ?? 120_000;
  const transport = opts.transport ?? defaultTransport;

  return async function safeFetch(url, init = {}) {
    let current = url;
    const method = (init.method ?? 'GET').toUpperCase();
    // A fetch runner reads documents. POST/PUT/DELETE to an attacker-influenced URL is
    // a different capability this runner has no reason to grant.
    if (method !== 'GET' && method !== 'HEAD') {
      throw new SsrfBlockedError(`method_not_allowed_${method}`);
    }

    for (let hop = 0; hop <= maxRedirects; hop++) {
      const gate = await checkUrl(current, resolver);
      if (!gate.ok) throw new SsrfBlockedError(gate.reason);

      const res = await transport(current, {
        method,
        headers: init.headers ?? {},
        pinnedAddress: gate.address,
        pinnedFamily: gate.family,
        timeoutMs,
        maxBytes,
        deadlineMs,
      });

      if (REDIRECT_STATUS.has(res.status)) {
        const location = res.headers && res.headers.location;
        if (!location) throw new SsrfBlockedError(`redirect_without_location_${res.status}`);
        current = new URL(location, current).toString(); // relative Location headers are legal
        continue; // and the gate runs again for this new URL, before it is ever dialled
      }

      return { status: res.status, headers: res.headers, body: res.body, truncated: !!res.truncated, finalUrl: current };
    }
    throw new SsrfBlockedError(`too_many_redirects_${maxRedirects}`);
  };
}
