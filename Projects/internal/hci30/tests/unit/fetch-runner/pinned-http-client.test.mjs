// HCI-30 isolated fetch runner -- pinned HTTP client tests (ADR-0029 gate 4-5;
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 4, test id wave6-dns-rebind-rejected).
// Run with: node --test tests/unit/fetch-runner/pinned-http-client.test.mjs
//
// Two things need proof, and neither alone is enough (same split as
// lobster-factory's lib/collect/__tests__/collect-dns-pin.test.ts):
//   A) the underlying mechanism -- pinnedLookup()/createPinnedAgent() genuinely
//      override what address Node's http/https stack connects to, with no real DNS
//      query involved for the pinned hop. This cannot be exercised through a URL whose
//      hostname is expected to survive the SSRF gate (every real routable address that
//      could host a test listener -- 127.0.0.1, 10.x, etc. -- is exactly what the gate
//      exists to reject), so this test drives the transport/agent layer directly.
//   B) the wiring -- createSafeFetch() actually re-runs checkUrl() on every hop and
//      hands transport() the FIRST validated address, never a hypothetical
//      re-resolved one, including across a redirect.
//
// (A) uses a real local HTTP server and Node's real http/https client -- no mocks.
// (B) mocks the resolver and transport, which is the only way to inspect what
// createSafeFetch actually passed without opening real sockets.
//
// Controlled/synthetic targets only (Task 4 boundary).

import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import {
  createPinnedAgent,
  createSafeFetch,
  defaultTransport,
  pinnedLookup,
} from '../../../infra/local/fetch-runner/net/pinned-http-client.mjs';
import { SsrfBlockedError } from '../../../infra/local/fetch-runner/net/ssrf-guard.mjs';

const publicResolver = async () => ['93.184.216.34'];

test('mechanism: pinnedLookup answers with the pinned address regardless of the hostname asked about, and never changes answer on a second call (the exact TOCTOU window a DNS-rebind attacker relies on Node re-querying)', () => {
  const lookup = pinnedLookup('93.184.216.34', 4);
  const calls = [];
  const record = (err, address, family) => calls.push({ err, address, family });

  // Two different hostnames, and a repeat call -- a rebinding host wants a SECOND real
  // lookup to happen so it can answer differently. This function performs no lookup at
  // all; it is a pure closure over the one address checkUrl already validated.
  lookup('rebinding-host.example', {}, record);
  lookup('rebinding-host.example', {}, record);
  lookup('a-totally-different-hostname.example', {}, record);

  assert.deepEqual(calls, [
    { err: null, address: '93.184.216.34', family: 4 },
    { err: null, address: '93.184.216.34', family: 4 },
    { err: null, address: '93.184.216.34', family: 4 },
  ]);
});

test('mechanism: pinnedLookup honors dns.lookup\'s {all:true} shape too', () => {
  const lookup = pinnedLookup('203.0.113.5', 4);
  let seen;
  lookup('irrelevant.example', { all: true }, (err, records) => { seen = { err, records }; });
  assert.deepEqual(seen, { err: null, records: [{ address: '203.0.113.5', family: 4 }] });
});

test('mechanism: createPinnedAgent is a fresh Agent per call, never shared/cached', () => {
  const a = createPinnedAgent('https:', '203.0.113.1', 4);
  const b = createPinnedAgent('https:', '203.0.113.1', 4);
  assert.notEqual(a, b);
  a.destroy();
  b.destroy();
});

test('mechanism: defaultTransport connects to the pinned address even when the hostname has no real DNS record anywhere (real local server, real Node http client, no mocks)', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('pinned-ok');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    // The ONLY way this can succeed is if pinnedLookup supplied 127.0.0.1 without ever
    // asking real DNS about this hostname -- it is not a real domain and has no record.
    const res = await defaultTransport(`http://this-host-does-not-exist-anywhere.invalid:${port}/`, {
      method: 'GET',
      headers: {},
      pinnedAddress: '127.0.0.1',
      pinnedFamily: 4,
      timeoutMs: 5000,
      maxBytes: 1_000_000,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.toString('utf8'), 'pinned-ok');
  } finally {
    server.close();
  }
});

test('mechanism: defaultTransport resolves promptly (not hangs) when a real response exceeds maxBytes', async () => {
  // Critic review 2026-09-17: the original truncation branch called
  // res.destroy() then waited for the 'end' event to resolve -- destroy()
  // on an in-flight IncomingMessage fires 'close', never 'end', so the
  // promise never settled (a real repro against this exact function hung
  // past 10s with a 42KB body vs a 3KB cap). This test proves the fix:
  // resolve happens at the truncation site itself, via a real socket.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/octet-stream' });
    res.end(Buffer.alloc(4096, 7)); // 4096 bytes, cap below is 1024
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const res = await defaultTransport(`http://this-host-does-not-exist-anywhere.invalid:${port}/`, {
      method: 'GET',
      headers: {},
      pinnedAddress: '127.0.0.1',
      pinnedFamily: 4,
      timeoutMs: 5000,
      maxBytes: 1024,
    });
    assert.equal(res.truncated, true);
    assert.equal(res.body.length, 1024);
  } finally {
    server.close();
  }
});

test('wiring: createSafeFetch passes a pinned address to transport on the first attempt', async () => {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, ...init });
    return { status: 200, headers: {}, body: Buffer.from('ok') };
  };
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport });
  await fetchOnce('https://totally-public.example.com/page');

  assert.equal(calls.length, 1);
  assert.equal(calls[0].pinnedAddress, '93.184.216.34');
  assert.equal(calls[0].pinnedFamily, 4);
});

test('wiring: re-validates the gate on every redirect hop -- a public start URL that 302s to the cloud metadata endpoint must never reach a second transport call', async () => {
  const transportCalls = [];
  const transport = async (url) => {
    transportCalls.push(url);
    if (transportCalls.length === 1) {
      return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) };
    }
    return { status: 200, headers: {}, body: Buffer.from('should never be reached') };
  };
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport });

  await assert.rejects(
    () => fetchOnce('https://legit-looking.example.com/start'),
    (err) => err instanceof SsrfBlockedError && /private_host_literal/.test(err.reason),
  );
  assert.equal(transportCalls.length, 1, 'the redirect target must never be connected to');
});

test('wiring: follows a legitimate redirect and reports the final url, pinning a NEW address per hop', async () => {
  let hop = 0;
  const resolver = async (host) => (host === 'second-host.example.com' ? ['198.51.100.9'] : ['93.184.216.34']);
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, pinnedAddress: init.pinnedAddress });
    hop += 1;
    if (hop === 1) return { status: 302, headers: { location: 'https://second-host.example.com/dst' }, body: Buffer.alloc(0) };
    return { status: 200, headers: {}, body: Buffer.from('ok') };
  };
  const fetchOnce = createSafeFetch({ resolver, transport });
  const res = await fetchOnce('https://first-host.example.com/src');

  assert.equal(res.status, 200);
  assert.equal(res.finalUrl, 'https://second-host.example.com/dst');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].pinnedAddress, '93.184.216.34');
  assert.equal(calls[1].pinnedAddress, '198.51.100.9');
});

test('wiring: stops after too many redirects instead of looping forever', async () => {
  const transport = async () => ({ status: 302, headers: { location: 'https://example.com/loop' }, body: Buffer.alloc(0) });
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport, maxRedirects: 2 });
  await assert.rejects(
    () => fetchOnce('https://example.com/loop'),
    (err) => err instanceof SsrfBlockedError && /too_many_redirects_2/.test(err.reason),
  );
});

test('wiring: refuses a method this runner has no reason to use', async () => {
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport: async () => ({ status: 200, headers: {}, body: Buffer.alloc(0) }) });
  await assert.rejects(
    () => fetchOnce('https://example.com/x', { method: 'POST' }),
    (err) => err instanceof SsrfBlockedError && /method_not_allowed_POST/.test(err.reason),
  );
});

test('wave6-dns-rebind-rejected: the resolver is consulted exactly once per hop, and transport receives ONLY that first answer -- simulates a rebinding host whose second answer (represented here as what the resolver would return on a second call) never gets used', async () => {
  let calls = 0;
  const rebindingResolver = async () => {
    calls += 1;
    // Call 1: a safe public answer. Call 2 (which must never happen): what a
    // DNS-rebinding host would flip to once it believes the check already passed.
    return calls === 1 ? ['93.184.216.34'] : ['127.0.0.1'];
  };
  const transportCalls = [];
  const transport = async (_url, init) => {
    transportCalls.push(init);
    return { status: 200, headers: {}, body: Buffer.from('ok') };
  };

  const fetchOnce = createSafeFetch({ resolver: rebindingResolver, transport });
  const res = await fetchOnce('https://totally-public.example.com/x');

  assert.equal(calls, 1, 'a second resolver call is the exact TOCTOU window this client must not create');
  assert.equal(transportCalls.length, 1);
  assert.equal(transportCalls[0].pinnedAddress, '93.184.216.34', 'transport must receive the FIRST resolved address, never a re-resolved one');
  assert.equal(res.status, 200);
});
