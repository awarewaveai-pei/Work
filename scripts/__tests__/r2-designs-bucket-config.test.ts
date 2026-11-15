// Run: <next-admin>/node_modules/.bin/tsx --test scripts/__tests__/r2-designs-bucket-config.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrigins, desiredCorsRule, desiredLifecycleRule, diffRules, lostRules, main, mergeRules, normalizeOrigin, parseArgs,
  CORS_RULE_ID, type Rule,
} from "../r2-designs-bucket-config";

const env = { STAFF_HOSTS: "app.example.com, Admin.Example.com", PRODUCT_HOST_TAROT: "tarot.custom.test", PUBLIC_BASE_DOMAIN: "example.com" };

test("origins: https:// + staff hosts + enabled next-admin product hosts; disabled/external excluded; no localhost", () => {
  const o = buildOrigins(env);
  assert.ok(o.length > 0 && o.every((x) => x.startsWith("https://")));
  assert.ok(o.includes("https://app.example.com") && o.includes("https://admin.example.com"));
  assert.ok(o.includes("https://tarot.custom.test"), "PRODUCT_HOST_TAROT override");
  assert.ok(!o.includes("https://tarot.example.com"), "override replaces the default subdomain");
  assert.ok(o.includes("https://studio.example.com"), "enabled product without override = <subdomain>.<base>");
  for (const off of ["cs", "collect", "cognitive", "hci"]) assert.ok(!o.includes(`https://${off}.example.com`), `${off} must not be listed`);
  assert.ok(!o.some((x) => x.includes("localhost")), "no dev origin unless asked");
  assert.deepEqual(o, [...new Set(o)].sort());
});

test("origins: --dev-origin is the only way localhost appears; bad origins are refused", () => {
  assert.ok(buildOrigins(env, "http://localhost:3000").includes("http://localhost:3000"));
  assert.throws(() => normalizeOrigin("https://app.example.com/path"));
  assert.throws(() => normalizeOrigin("ftp://x.test"));
  assert.throws(() => normalizeOrigin("not a url"));
});

test("rules: CORS = PUT + content-type + 600s; lifecycle = uploads/pending/ deleted after 1 day", () => {
  assert.deepEqual(desiredCorsRule(["https://a.test"]), {
    id: CORS_RULE_ID, allowed: { origins: ["https://a.test"], methods: ["PUT"], headers: ["content-type"] }, maxAgeSeconds: 600,
  });
  const l = desiredLifecycleRule();
  assert.deepEqual(l.conditions, { prefix: "uploads/pending/" });
  assert.deepEqual(l.deleteObjectsTransition, { condition: { type: "Age", maxAge: 86400 } });
});

test("merge keeps foreign rules, replaces ours by id; diff says add / same / change / keep", () => {
  const ours = desiredCorsRule(["https://a.test"]);
  const foreign: Rule = { id: "other", allowed: { origins: ["https://x.test"], methods: ["GET"] } };
  assert.deepEqual(mergeRules([foreign], ours), [foreign, ours]);
  assert.deepEqual(diffRules([foreign], mergeRules([foreign], ours), ours).map((d) => d.status), ["keep", "add"]);
  const withExtra = { ...ours, extraDefault: 1 }; // R2 may add defaulted fields on read-back
  assert.equal(diffRules([withExtra], mergeRules([withExtra], ours), ours)[0].status, "same");
  const stale = desiredCorsRule(["https://old.test"]);
  assert.equal(diffRules([stale], mergeRules([stale], ours), ours)[0].status, "change");
});

test("read-back: a foreign rule that vanished after the PUT is reported", () => {
  const a: Rule = { id: "a", x: 1 }, b: Rule = { id: "b", x: 2 };
  assert.deepEqual(lostRules([a, b, { id: "ours" }], [{ ...a, extra: 1 }, { id: "ours" }], "ours"), [b]);
  assert.deepEqual(lostRules([a], [a], "ours"), []);
});

test("args: --apply with --dry-run refused; unknown flag refused", () => {
  assert.throws(() => parseArgs(["--apply", "--dry-run"]));
  assert.throws(() => parseArgs(["--nope"]));
  assert.equal(parseArgs([]).apply, false);
});

async function runMain(argv: string[], fetchImpl: typeof fetch) {
  const real = globalThis.fetch;
  const log = console.log, err = console.error;
  const lines: string[] = [];
  console.log = (...a) => void lines.push(a.join(" "));
  console.error = (...a) => void lines.push(a.join(" "));
  globalThis.fetch = fetchImpl;
  try {
    const code = await main(argv, { ...env, R2_API_TOKEN: "SECRET-TOKEN-VALUE", R2_ACCOUNT_ID: "ACCOUNT-ID-VALUE" });
    return { code, out: lines.join("\n") };
  } finally {
    globalThis.fetch = real; console.log = log; console.error = err;
  }
}
const cfJson = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, errors: status < 400 ? [] : [{ code: 10000, message: "Authentication error" }], result }), { status });

test("dry-run: only GETs (never PUT), prints the diff, leaks neither token nor account id", async () => {
  const calls: string[] = [];
  const { code, out } = await runMain([], (async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${String(url).split("/").slice(-1)[0]}`);
    return cfJson({ rules: [] });
  }) as unknown as typeof fetch);
  assert.equal(code, 0);
  assert.deepEqual(calls, ["GET cors", "GET lifecycle"]);
  assert.match(out, /\[新增\] awarewave-designs-direct-upload/);
  assert.match(out, /\[新增\] awarewave-designs-pending-1d/);
  assert.ok(!out.includes("SECRET-TOKEN-VALUE") && !out.includes("ACCOUNT-ID-VALUE"));
});

test("dry-run: 403 → exit 3 with the 'need a bucket-settings token' message, no other credential tried", async () => {
  let n = 0;
  const { code, out } = await runMain([], (async () => (n++, cfJson(null, 403))) as unknown as typeof fetch);
  assert.equal(code, 3);
  assert.equal(n, 1);
  assert.match(out, /需操作者臨時給 bucket 設定權限的 token/);
  assert.ok(!out.includes("SECRET-TOKEN-VALUE"));
});
