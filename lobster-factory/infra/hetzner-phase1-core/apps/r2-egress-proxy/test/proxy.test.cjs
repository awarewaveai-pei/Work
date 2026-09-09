const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig, equalToken, createProxy } = require("../server.js");

test("constant-time token comparison rejects empty and mismatch values", () => {
  assert.equal(equalToken("secret", "secret"), true);
  assert.equal(equalToken("secret", "other"), false);
  assert.equal(equalToken("", ""), false);
});

test("configuration requires a Cloudflare R2 S3 endpoint and all credentials", () => {
  assert.throws(() => buildConfig({}), /invalid R2 S3 endpoint/);
  assert.throws(() => buildConfig({ R2_S3_ENDPOINT: "https://example.com" }), /invalid R2 S3 endpoint/);
});

test("proxy only permits scoped video/remotion object PUTs", async (t) => {
  const calls = [];
  const server = createProxy({
    accountId: "acct",
    bucket: "bucket",
    internalToken: "token",
    client: { send: async command => { calls.push(command.input); } },
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  const { port } = server.address();
  const request = (path, options = {}) => fetch(`http://127.0.0.1:${port}${path}`, { method: "PUT", headers: { authorization: "Bearer token", "content-length": "2", ...options.headers }, body: "ok" });
  assert.equal((await request("/client/v4/accounts/acct/r2/buckets/bucket/objects/video/test.mp4")).status, 200);
  assert.equal((await request("/client/v4/accounts/acct/r2/buckets/bucket/objects/other/test.mp4")).status, 403);
  assert.equal((await request("/client/v4/accounts/acct/r2/buckets/bucket/objects/video/../secret.mp4")).status, 403);
  assert.equal((await request("/client/v4/accounts/acct/r2/buckets/bucket/objects/video/test.mp4?x=1")).status, 403);
  assert.deepEqual(calls.map(call => call.Key), ["video/test.mp4"]);
});
