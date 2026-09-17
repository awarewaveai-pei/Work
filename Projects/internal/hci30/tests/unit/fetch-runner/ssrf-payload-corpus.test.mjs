// HCI-30 isolated fetch runner -- named SSRF payload corpus (ADR-0029 gate 5, test id
// wave6-ssrf-payload-corpus; HCI_COLLECTOR_DISCOVERED_PIPELINE_PLAN.md Task 4).
// Run with: node --test tests/unit/fetch-runner/ssrf-payload-corpus.test.mjs
//
// Every entry below is asserted to be rejected BEFORE any connection attempt: the
// literal/encoding entries never even reach the resolver (checkUrl short-circuits on
// isPrivateAddress before calling it), and the open-redirect entry asserts the mock
// transport is called exactly once -- the redirect target is never dialled.
//
// Controlled/synthetic targets only. No real third-party host is contacted by this
// file; the "public" resolver below is a hardcoded fake, and open-redirect uses an
// injected mock transport, never a real socket (Task 4 boundary).

import assert from 'node:assert/strict';
import test from 'node:test';
import { checkUrl } from '../../../infra/local/fetch-runner/net/ssrf-guard.mjs';
import { createSafeFetch, SsrfBlockedError } from '../../../infra/local/fetch-runner/net/pinned-http-client.mjs';

const publicResolver = async () => ['93.184.216.34'];

// -- Category 1: decimal / octal / hex IP encoding, and IPv4-mapped IPv6 --
// Node's WHATWG URL parser normalizes all of these hostname forms into a canonical
// dotted-quad or bracketed-IPv6 hostname before checkUrl() ever runs (verified against
// the WHATWG URL "IPv4 parser" state machine: each of 2130706433 / 0177.0.0.1 /
// 017700000001 / 0x7f000001 / 0x7f.0x0.0x0.0x1 is a spec-legal encoding of 127.0.0.1).
// This corpus proves the END-TO-END behavior (parse -> normalize -> reject), not just
// the isPrivateAddress() unit in isolation -- a regression in either half would show up
// here even if the other half's own tests stayed green.
const ENCODED_LOOPBACK_CORPUS = [
  { name: 'decimal IP literal for 127.0.0.1', url: 'http://2130706433/' },
  { name: 'octal per-octet IP literal for 127.0.0.1', url: 'http://0177.0.0.1/' },
  { name: 'full octal (single 32-bit number) IP literal for 127.0.0.1', url: 'http://017700000001/' },
  { name: 'hex (single 32-bit number) IP literal for 127.0.0.1', url: 'http://0x7f000001/' },
  { name: 'hex per-octet IP literal for 127.0.0.1', url: 'http://0x7f.0x0.0x0.0x1/' },
];

const IPV4_MAPPED_IPV6_CORPUS = [
  { name: 'IPv4-mapped IPv6, dotted-quad tail', url: 'http://[::ffff:127.0.0.1]/' },
  { name: 'IPv4-mapped IPv6, canonical hex-tail form the URL parser normalizes the dotted form to', url: 'http://[::ffff:7f00:1]/' },
];

// -- Category 2: protocol smuggling -- non-http(s) schemes that would otherwise let a
// "fetch" reach a raw TCP protocol (redis, memcached, the local filesystem) through a
// URL string. checkUrl()'s scheme allowlist (http/https only) rejects these before any
// host/port/resolution logic runs at all.
const PROTOCOL_SMUGGLING_CORPUS = [
  { name: 'gopher smuggling a raw command to a local service', url: 'gopher://127.0.0.1:6379/_flushall' },
  { name: 'file scheme reading the local filesystem', url: 'file:///etc/passwd' },
  { name: 'dict scheme probing a local service', url: 'dict://127.0.0.1:11211/stats' },
  { name: 'ftp scheme', url: 'ftp://127.0.0.1/' },
];

test('wave6-ssrf-payload-corpus: decimal/octal/hex-encoded loopback literals are all rejected as private_host_literal, never reaching the resolver', async () => {
  for (const { name, url } of ENCODED_LOOPBACK_CORPUS) {
    let resolverCalled = false;
    const verdict = await checkUrl(url, async () => { resolverCalled = true; return ['93.184.216.34']; });
    assert.equal(verdict.ok, false, `${name} (${url}) should be rejected`);
    assert.equal(verdict.reason, 'private_host_literal', `${name} (${url}) unexpected reason: ${verdict.reason}`);
    assert.equal(resolverCalled, false, `${name} (${url}) must be rejected before any DNS resolution is attempted`);
  }
});

test('wave6-ssrf-payload-corpus: IPv4-mapped IPv6 loopback literals are rejected in both their dotted and canonical hex-tail forms', async () => {
  for (const { name, url } of IPV4_MAPPED_IPV6_CORPUS) {
    let resolverCalled = false;
    const verdict = await checkUrl(url, async () => { resolverCalled = true; return ['93.184.216.34']; });
    assert.equal(verdict.ok, false, `${name} (${url}) should be rejected`);
    assert.equal(verdict.reason, 'private_host_literal', `${name} (${url}) unexpected reason: ${verdict.reason}`);
    assert.equal(resolverCalled, false, `${name} (${url}) must be rejected before any DNS resolution is attempted`);
  }
});

test('wave6-ssrf-payload-corpus: protocol-smuggling schemes are rejected by the scheme allowlist, never reaching host/port checks', async () => {
  for (const { name, url } of PROTOCOL_SMUGGLING_CORPUS) {
    let resolverCalled = false;
    const verdict = await checkUrl(url, async () => { resolverCalled = true; return ['93.184.216.34']; });
    assert.equal(verdict.ok, false, `${name} (${url}) should be rejected`);
    assert.match(verdict.reason, /^blocked_scheme_/, `${name} (${url}) unexpected reason: ${verdict.reason}`);
    assert.equal(resolverCalled, false, `${name} (${url}) must be rejected before any DNS resolution is attempted`);
  }
});

test('wave6-ssrf-payload-corpus: credential-smuggling (userinfo pointing away from the real target host) is rejected before the host is even inspected', async () => {
  let resolverCalled = false;
  const verdict = await checkUrl('http://looks-safe.example.com@169.254.169.254/', async () => { resolverCalled = true; return ['93.184.216.34']; });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'credentials_in_url');
  assert.equal(resolverCalled, false);
});

test('wave6-ssrf-payload-corpus: open redirect to an internal target is rejected before the redirect target is ever dialled', async () => {
  const transportCalls = [];
  const transport = async (url) => {
    transportCalls.push(url);
    if (transportCalls.length === 1) {
      return { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data/' }, body: Buffer.alloc(0) };
    }
    // If the gate failed to re-check hop 2, this is what "the attack worked" looks like.
    return { status: 200, headers: {}, body: Buffer.from('SHOULD NEVER BE REACHED') };
  };
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport });

  await assert.rejects(
    () => fetchOnce('https://legit-looking.example.com/start'),
    (err) => err instanceof SsrfBlockedError && err.reason === 'private_host_literal',
  );
  assert.equal(transportCalls.length, 1, 'the open-redirect target must never be connected to');
});

test('wave6-ssrf-payload-corpus: open redirect chain to an encoded-IP loopback literal is also rejected before the second hop', async () => {
  const transportCalls = [];
  const transport = async (url) => {
    transportCalls.push(url);
    if (transportCalls.length === 1) {
      return { status: 302, headers: { location: 'http://2130706433/' }, body: Buffer.alloc(0) };
    }
    return { status: 200, headers: {}, body: Buffer.from('SHOULD NEVER BE REACHED') };
  };
  const fetchOnce = createSafeFetch({ resolver: publicResolver, transport });

  await assert.rejects(
    () => fetchOnce('https://legit-looking.example.com/start'),
    (err) => err instanceof SsrfBlockedError && err.reason === 'private_host_literal',
  );
  assert.equal(transportCalls.length, 1, 'the encoded-IP redirect target must never be connected to');
});
