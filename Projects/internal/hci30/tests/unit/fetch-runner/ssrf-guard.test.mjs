// HCI-30 isolated fetch runner -- SSRF gate unit tests (ADR-0029 gate 4-5;
// HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 4). Run with:
//   node --test tests/unit/fetch-runner/ssrf-guard.test.mjs
// (same convention as tests/unit/intelligence/*.test.mjs and
// scripts/mutation-check-node-gates.ps1's `node --test $testPath`.)
//
// Controlled/synthetic targets only -- no real third-party hosts, no real
// personal/customer data (Task 4 boundary).

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkUrl, isPrivateAddress } from '../../../infra/local/fetch-runner/net/ssrf-guard.mjs';

const publicResolver = async () => ['93.184.216.34'];

test('isPrivateAddress: parity check against the proven lobster-factory address list (this file is a standalone reimplementation, not an import -- this test is what catches the two copies silently diverging)', () => {
  for (const addr of ['127.0.0.1', '169.254.169.254', '10.0.0.5', '192.168.1.1', '172.16.0.1', '100.64.0.1', '::1', 'fd00::1', 'fe80::1']) {
    assert.equal(isPrivateAddress(addr), true, `${addr} must be classified private`);
  }
  for (const addr of ['93.184.216.34', '1.1.1.1', '2606:4700::1111']) {
    assert.equal(isPrivateAddress(addr), false, `${addr} must be classified public`);
  }
});

test('checkUrl: rejects non-http(s) schemes and in-URL credentials', async () => {
  assert.equal((await checkUrl('file:///etc/passwd', publicResolver)).ok, false);
  assert.equal((await checkUrl('https://user:pw@example.com/', publicResolver)).ok, false);
  const credsVerdict = await checkUrl('https://user:pw@example.com/', publicResolver);
  assert.equal(credsVerdict.reason, 'credentials_in_url');
});

test('checkUrl: rejects a public host on a non-web port', async () => {
  const verdict = await checkUrl('http://example.com:6379/', publicResolver);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /blocked_port_6379/);
});

test('checkUrl: allows a public https host on the default port and returns the exact address to pin', async () => {
  const verdict = await checkUrl('https://totally-public.example.com/x', publicResolver);
  assert.deepEqual(verdict, { ok: true, reason: null, address: '93.184.216.34', family: 4 });
});

test('checkUrl: blocks a public name that resolves to a private address (DNS-rebind-shaped check-time rejection)', async () => {
  const rebinding = async () => ['169.254.169.254'];
  const verdict = await checkUrl('https://totally-public.example.com/x', rebinding);
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /private_address_169\.254\.169\.254/);
});

test('checkUrl: dns_failed and dns_empty are distinct, both fail closed', async () => {
  const failing = async () => { throw new Error('ENOTFOUND'); };
  assert.equal((await checkUrl('https://nowhere.example.com/', failing)).reason, 'dns_failed');
  const empty = async () => [];
  assert.equal((await checkUrl('https://nowhere.example.com/', empty)).reason, 'dns_empty');
});

test('isPrivateAddress: a genuinely public IPv4-mapped-IPv6 address is not blindly blocked (regression: the mapped-address regex used to match on the bare `::ffff:` prefix alone, blocking every mapped address regardless of the address it encoded)', () => {
  // WHATWG URL host serialization always normalizes a bracketed mapped host to this
  // hex-tail canonical form -- verified via `new URL('http://[::ffff:8.8.8.8]/').hostname`
  // -> `[::ffff:808:808]` -- never to a dotted-quad `::ffff:8.8.8.8` for a URL-derived host.
  assert.equal(isPrivateAddress('::ffff:808:808'), false, '::ffff:808:808 (8.8.8.8) must decode to a dotted-quad and be classified public');
  // The literal dotted-quad spelling of the same public address must also pass (already worked pre-fix; guards against a regression in the branch above the fix).
  assert.equal(isPrivateAddress('::ffff:8.8.8.8'), false);
  // A private address in the same hex-tail canonical form must still be blocked post-fix.
  assert.equal(isPrivateAddress('::ffff:7f00:1'), true, '::ffff:7f00:1 (127.0.0.1) must still be classified private');
  assert.equal(isPrivateAddress('::ffff:a9fe:a9fe'), true, '::ffff:a9fe:a9fe (169.254.169.254, the cloud metadata endpoint) must still be classified private');
  // A mapped tail that isn't the canonical two-hex-group shape must fail closed (blocked), not fall through unblocked.
  assert.equal(isPrivateAddress('::ffff:0:808:808'), true, 'a malformed ::ffff: tail must fail closed');
});

test('checkUrl: a bracketed public IPv4-mapped-IPv6 host resolves through and is not blocked', async () => {
  const verdict = await checkUrl('http://[::ffff:8.8.8.8]/', publicResolver);
  assert.equal(verdict.ok, true);
});

test('isPrivateAddress: a trailing-dot FQDN hits the fast literal-string path, not just DNS resolution (regression: the `.internal`/`.local`/`.localhost` suffix check did not strip a trailing dot the way an IPv4 literal is stripped by URL parsing, so "evil.internal." fell through the fast path)', () => {
  assert.equal(isPrivateAddress('evil.internal.'), true);
  assert.equal(isPrivateAddress('evil.local.'), true);
  assert.equal(isPrivateAddress('evil.localhost.'), true);
  assert.equal(isPrivateAddress('localhost.'), true);
  // Sanity: a public trailing-dot FQDN must still pass.
  assert.equal(isPrivateAddress('example.com.'), false);
});

test('checkUrl: a trailing-dot internal-TLD URL is rejected via the literal-host path, never reaching the resolver', async () => {
  let resolverCalled = false;
  const resolverThatWouldBeWrong = async () => { resolverCalled = true; return ['93.184.216.34']; };
  const verdict = await checkUrl('http://evil.internal./x', resolverThatWouldBeWrong);
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'private_host_literal');
  assert.equal(resolverCalled, false, 'the fast literal-string path must reject before any DNS lookup happens');
});
