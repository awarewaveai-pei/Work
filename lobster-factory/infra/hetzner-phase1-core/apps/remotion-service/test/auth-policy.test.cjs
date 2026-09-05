const assert = require("node:assert/strict");
const test = require("node:test");

const {
  evaluateRendererAuthPolicy,
  isLoopbackHost,
} = require("../dist/auth-policy.js");

test("recognises only loopback local-development hosts", () => {
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("0.0.0.0"), false);
  assert.equal(isLoopbackHost("remotion-service"), false);
});

test("requires an explicit token by default", () => {
  assert.deepEqual(
    evaluateRendererAuthPolicy({ token: "token", host: "0.0.0.0", allowInsecureLocalRender: false }),
    { ok: true, authRequired: true },
  );
  assert.equal(
    evaluateRendererAuthPolicy({ token: "", host: "127.0.0.1", allowInsecureLocalRender: false }).ok,
    false,
  );
});

test("permits a tokenless renderer only when both local guards are explicit", () => {
  assert.deepEqual(
    evaluateRendererAuthPolicy({ token: "", host: "127.0.0.1", allowInsecureLocalRender: true }),
    { ok: true, authRequired: false },
  );
  assert.equal(
    evaluateRendererAuthPolicy({ token: "", host: "0.0.0.0", allowInsecureLocalRender: true }).ok,
    false,
  );
});
