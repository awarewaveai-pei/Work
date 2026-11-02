// Browser tests start their own server on a free port with throwaway data. Never point a test at
// the fixed port 4178: that is the operator's running workbench (an older copy, with real .data), so the
// test would check the wrong code and write into real data. tests/test-isolation.cjs enforces this.
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");

// fetchImpl: a test may pass its own fake provider (never a real one) to check what the server does with a reply;
// env: extra placeholder keys (e.g. REPLICATE_API_TOKEN) so a route gets past its "not configured" check.
async function isolatedServer(prefix = "vw-test-", { fetchImpl, env } = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const server = require("../server.cjs").createServer({
    dataDir,
    // A placeholder key makes the UI report the service as configured (send enabled); every
    // provider call still throws below, and tests mock /api/seedstar/generations themselves.
    env: { OPENAI_API_KEY: "test-only", ...env },
    fetchImpl:
      fetchImpl ||
      (() => {
        throw Error("Provider calls are forbidden in tests");
      }),
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  server.unref(); // the test process exits when the browser closes; no explicit shutdown needed
  return { base: "http://127.0.0.1:" + server.address().port, dataDir, server };
}

module.exports = { isolatedServer };
