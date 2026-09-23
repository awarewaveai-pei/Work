// The renderer's pure refusals. The network policy in entrypoint.sh is the real boundary and is
// verified live at deploy time by probing from inside the container; these pin the first line.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SNAPSHOT_FAILURE_CODES,
  Semaphore,
  clampTimeout,
  classifyNavigationError,
  classifyStatus,
  honestUserAgent,
  isPrivateAddress,
  publicUrlOnly,
  pushCapped,
  secretMatches,
  validateTargetUrl,
} from "../lib.mjs";

test("private and special v4 ranges are private, public ones are not", () => {
  for (const ip of ["10.1.2.3", "127.0.0.1", "169.254.169.254", "172.17.0.1", "172.31.255.255", "192.168.1.1", "100.64.0.1", "0.0.0.0", "224.0.0.1"]) {
    assert.equal(isPrivateAddress(ip), true, ip);
  }
  for (const ip of ["1.1.1.1", "8.8.8.8", "145.239.195.47", "172.32.0.1", "100.128.0.1"]) {
    assert.equal(isPrivateAddress(ip), false, ip);
  }
});

test("any v6 literal is refused outright — the container has no v6 route", () => {
  assert.equal(isPrivateAddress("::1"), true);
  assert.equal(isPrivateAddress("2606:4700::1111"), true);
});

test("ordinary public pages pass", () => {
  assert.equal(validateTargetUrl("https://scholars.latrobe.edu.au/tgfarrell").hostname, "scholars.latrobe.edu.au");
  assert.equal(validateTargetUrl("http://example.com/x?y=1").protocol, "http:");
});

test("non-web schemes are refused — file:, data:, javascript:, chrome:", () => {
  for (const u of ["file:///etc/passwd", "data:text/html,hi", "javascript:alert(1)", "chrome://version", "ftp://x.com/"]) {
    assert.throws(() => validateTargetUrl(u), { code: "url_scheme_not_allowed" }, u);
  }
});

test("private IP literals are refused, including the cloud metadata endpoint", () => {
  for (const u of ["http://169.254.169.254/latest/meta-data/", "http://10.240.2.1/", "http://172.17.0.1:5432/", "http://127.0.0.1:3000/"]) {
    assert.throws(() => validateTargetUrl(u), { code: "url_private_address" }, u);
  }
});

test("docker service names and internal suffixes are refused", () => {
  for (const u of ["http://supabase-db:5432/", "http://lobster-next-admin:3000/api/ops/summary", "http://localhost/", "http://renderer/", "http://x.internal/", "http://printer.local/"]) {
    assert.throws(() => validateTargetUrl(u), { code: "url_internal_hostname" }, u);
  }
});

test("embedded credentials are refused", () => {
  assert.throws(() => validateTargetUrl("https://user:pass@example.com/"), { code: "url_credentials_not_allowed" });
});

test("garbage is refused, not crashed on", () => {
  for (const u of [undefined, null, 42, "", "not a url", "x".repeat(5000)]) {
    assert.throws(() => validateTargetUrl(u), { code: "url_invalid" });
  }
});

test("secret comparison: exact match only, empty expected secret never matches", () => {
  assert.equal(secretMatches("abc", "abc"), true);
  assert.equal(secretMatches("abd", "abc"), false);
  assert.equal(secretMatches("ab", "abc"), false);
  assert.equal(secretMatches(undefined, "abc"), false);
  assert.equal(secretMatches("", ""), false);
});

test("timeouts are clamped, garbage falls back", () => {
  assert.equal(clampTimeout(1), 5_000);
  assert.equal(clampTimeout(999_999), 45_000);
  assert.equal(clampTimeout("abc"), 30_000);
  assert.equal(clampTimeout(20_000), 20_000);
});

test("user agent keeps the browser's own string and appends our identity once", () => {
  const ua = honestUserAgent("Mozilla/5.0 HeadlessChrome/140.0");
  assert.match(ua, /HeadlessChrome/);
  assert.match(ua, /AwareWaveCollector\/1\.0/);
  assert.equal(honestUserAgent(ua), ua);
  assert.match(honestUserAgent(""), /^AwareWaveCollector/);
});

test("semaphore never runs more than max at once and drains its queue", async () => {
  const s = new Semaphore(2);
  let running = 0;
  let peak = 0;
  const job = async () => {
    await s.acquire();
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running--;
    s.release();
  };
  await Promise.all(Array.from({ length: 7 }, job));
  assert.equal(peak, 2);
  assert.equal(s.active, 0);
  assert.equal(s.pending, 0);
});

// ── /snapshot classifiers (site-watch) ──────────────────────────────────────

test("navigation errors map to site failure codes", () => {
  const cases = {
    "page.goto: Timeout 15000ms exceeded.": "timeout",
    "net::ERR_TIMED_OUT at https://x.com/": "timeout",
    "net::ERR_NAME_NOT_RESOLVED at https://nope.example/": "dns",
    "net::ERR_BLOCKED_BY_CLIENT at http://10.0.0.1/": "blocked",
    "net::ERR_CONNECTION_REFUSED at https://x.com/": "connect",
    "net::ERR_CERT_DATE_INVALID at https://x.com/": "connect",
    "net::ERR_SSL_PROTOCOL_ERROR at https://x.com/": "connect",
    "net::ERR_TOO_MANY_REDIRECTS at https://x.com/": "connect",
    "something unexpected": "navigation",
  };
  for (const [msg, code] of Object.entries(cases)) {
    assert.equal(classifyNavigationError(msg), code, msg);
    assert.ok(SNAPSHOT_FAILURE_CODES.includes(code), code);
  }
});

test("main-document status: 2xx/3xx up, 4xx and 5xx down, missing status is a navigation failure", () => {
  assert.equal(classifyStatus(200), null);
  assert.equal(classifyStatus(304), null);
  assert.equal(classifyStatus(404), "http_4xx");
  assert.equal(classifyStatus(503), "http_5xx");
  assert.equal(classifyStatus(0), "navigation");
  assert.equal(classifyStatus(undefined), "navigation");
});

test("error lists are capped in count and length", () => {
  const list = [];
  for (let i = 0; i < 50; i++) pushCapped(list, "x".repeat(1000));
  assert.equal(list.length, 20);
  assert.equal(list[0].length, 300);
});

test("reported URLs drop query and fragment (tokens live there)", () => {
  assert.equal(publicUrlOnly("https://a.example.com/shop?session=abc#top"), "https://a.example.com/shop");
  assert.equal(publicUrlOnly("not a url"), "");
  // A navigation that never left the blank page reported "about://blank", which was stored as the
  // result's final URL and shown on the client card as if it were an address.
  assert.equal(publicUrlOnly("about:blank"), "");
  assert.equal(publicUrlOnly("chrome-error://chromewebdata/"), "");
});
