const http = require("node:http"),
  fs = require("node:fs"),
  path = require("node:path");
const root = __dirname,
  types = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".wasm": "application/wasm",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json",
    ".png": "image/png",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
    ".cube": "text/plain; charset=utf-8",
    ".glb": "model/gltf-binary",
    ".bvh": "text/plain; charset=utf-8",
  };
function createServer({
  dataDir = require("./backend/env-compat.cjs").vwEnv(process.env, "DATA_DIR") || path.join(root, ".data"),
  env = process.env,
  fetchImpl = fetch,
  awareWaveDir = require("./backend/appearance.cjs").resolveSource(root, env),
} = {}) {
  const createApi = (orgDir, orgId) => require("./backend/api.cjs").createApi({
    dataDir: orgDir,
    orgId,
    env,
    fetchImpl,
    appDir: awareWaveDir,
  });
  // P6 L1 / D2+D4: behind nginx (VW_TRUST_PROXY_IDENTITY=1) every /api/vw, /media, /generated request carries the
  // X-VW-User-Id + X-VW-Org-Id that nginx auth_request set, and each org gets its own <dataDir>/orgs/<orgId>/.
  // Local mode (unset) keeps the single dataDir exactly as before. One createApi per org (own queue, state, ledger).
  const trustProxy = env.VW_TRUST_PROXY_IDENTITY === "1";
  const savedTheme = require("./backend/appearance.cjs").savedTheme({ env, fetchImpl });
  const orgs = new Map();
  const local = trustProxy ? null : { dir: dataDir, api: createApi(dataDir) };
  const forOrg = (orgId) => {
    if (!orgs.has(orgId)) {
      const dir = path.join(dataDir, "orgs", orgId);
      orgs.set(orgId, { dir, api: createApi(dir, orgId) });
    }
    return orgs.get(orgId);
  };
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  // Usage still owed from before a restart is sent at startup, not on the org's next request (main-system.cjs outbox).
  if (trustProxy && fs.existsSync(path.join(dataDir, "orgs")))
    for (const org of fs.readdirSync(path.join(dataDir, "orgs")))
      if (uuid.test(org) && fs.existsSync(path.join(dataDir, "orgs", org, "usage-outbox.json"))) forOrg(org);
  const identity = (req) => {
    const user = req.headers["x-vw-user-id"], org = String(req.headers["x-vw-org-id"] || "").toLowerCase();
    if (!user || !uuid.test(org)) return null;
    // Invariant: only next-admin-signed identity is accepted; any container on the network can reach this port.
    if (!require("./backend/session-signature.cjs").verify(String(require("./backend/env-compat.cjs").vwEnv(env, "INTERNAL_TOKEN") || "").trim(), req.headers)) return null;
    // P6 L3: who acts and which billing account pays (permits, job createdBy) -- only nginx sets these headers.
    const billing = String(req.headers["x-vw-billing-org-id"] || "").toLowerCase();
    req.vwIdentity = { userId: String(user), orgId: org, ...(uuid.test(billing) ? { billingOrgId: billing } : {}), userKind: req.headers["x-vw-user-kind"], role: req.headers["x-vw-role"] };
    return forOrg(org);
  };
  const version = require("./package.json").version;
  const server = http.createServer(async (req, res) => {
    let file;
    try {
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (pathname === "/healthz" && (req.method === "GET" || req.method === "HEAD")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(req.method === "HEAD" ? undefined : JSON.stringify({ ok: true, version }));
        return;
      }
      // P6 L3: VW_CONFIG_MODE=http (container) serves config.js with mode "http"; the file itself stays the local default.
      if (pathname === "/config.js" && env.VW_CONFIG_MODE === "http") {
        const source = fs.readFileSync(path.join(root, "config.js"), "utf8");
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
        res.end(source.replace(/mode:\s*"local"/, 'mode: "http"'));
        return;
      }
      let tenant = local;
      if (trustProxy && /^\/(api\/vw|media|generated)\//.test(pathname)) {
        tenant = identity(req);
        if (!tenant) {
          res.writeHead(401, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          res.end(JSON.stringify({ error: { message: "需要登入" } }));
          return;
        }
      }
      if (tenant && (await tenant.api(req, res))) return;
      const dataDir = tenant ? tenant.dir : null;
      if (
        pathname === "/awarewave/theme.css" ||
        pathname === "/awarewave/forms.css"
      ) {
        const content = require("./backend/appearance.cjs").appearance(pathname, awareWaveDir) +
          (pathname === "/awarewave/theme.css" ? "\n" + (await savedTheme()) : "");
        res.writeHead(200, {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(content);
        return;
      }
      if (
        /^\/generated\/[a-f0-9-]+\.(png|jpg|webp|gif|mp3|wav|m4a|mp4|webm|mov|cube)$/.test(
          pathname,
        )
      )
        file = path.join(dataDir, pathname.slice(1));
      else if (pathname.startsWith("/media/")) {
        // backend/media-store.cjs layout only; other names and "/.." segments are 404.
        if (
          !/^\/media\/[a-f0-9]{64}\/(original\.(mp3|wav|m4a|mp4|webm|mov|glb|bvh)|proxy\.(mp4|webm)|thumb\.jpg|waveform\.json|probe\.json)$/.test(
            pathname,
          )
        )
          throw Error();
        file = path.join(dataDir, pathname.slice(1));
      } else
        file = path.resolve(
          root,
          "." +
            decodeURIComponent(new URL(req.url, "http://localhost").pathname),
        );
      const boundary = pathname.startsWith("/generated/")
        ? path.resolve(dataDir, "generated")
        : pathname.startsWith("/media/")
          ? path.resolve(dataDir, "media")
          : root;
      file = path.resolve(file);
      if (!file.startsWith(boundary + path.sep) && file !== root) throw Error();
      if (file === root) file = path.join(root, "index.html");
      if (
        /[\\/](node_modules|\.data|backend|runtime)([\\/]|$)/i.test(file) &&
        !pathname.startsWith("/generated/") &&
        !pathname.startsWith("/media/")
      )
        throw Error();
      const stat = fs.statSync(file);
      if (!stat.isFile()) throw Error();
      const size = stat.size;
      const send = (start, end) => {
        if (req.method === "HEAD" || !size) {
          res.end();
          return;
        }
        const stream = fs.createReadStream(file, { start, end });
        stream.on("error", () => res.destroy());
        res.on("close", () => stream.destroy());
        stream.pipe(res);
      };
      const headers = {
        "Content-Type": types[path.extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "no-store",
        "Accept-Ranges": "bytes",
        "Content-Length": size,
      };
      // EffectCraft Web (scripts/vendor-effectcraft.cjs): cross-origin isolated on its own path only,
      // so the rest of the workbench keeps loading cross-origin resources without CORP headers. Decided on the
      // resolved file, not the URL: an encoded /engines/effectcraft/%2e%2e/ path must not reach other files.
      if (file.startsWith(path.join(root, "engines", "effectcraft") + path.sep))
        Object.assign(headers, {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin",
        });
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        let start = 0,
          end = size - 1;
        if (match) {
          start = match[1]
            ? Number(match[1])
            : Math.max(0, size - Number(match[2]));
          end =
            match[1] && match[2]
              ? Math.min(Number(match[2]), size - 1)
              : size - 1;
        }
        if (
          !match ||
          (!match[1] && (!match[2] || Number(match[2]) === 0)) ||
          !Number.isSafeInteger(start) ||
          !Number.isSafeInteger(end) ||
          start < 0 ||
          start > end ||
          start >= size
        ) {
          res.writeHead(416, {
            ...headers,
            "Content-Range": `bytes */${size}`,
            "Content-Length": 0,
          });
          res.end();
          return;
        }
        res.writeHead(206, {
          ...headers,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": end - start + 1,
        });
        send(start, end);
      } else {
        res.writeHead(200, headers);
        send(0, size - 1);
      }
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      res.writeHead(error.code === "ERR_INVALID_URL" ? 400 : 404);
      res.end("Not found");
    }
  });
  return server;
}
if (require.main === module) {
  // Local default 127.0.0.1; the container sets VW_HOST=0.0.0.0 (no host port is published, only lobster-net).
  const host = process.env.VW_HOST || "127.0.0.1", port = process.env.PORT || 4178;
  createServer().listen(port, host, () =>
    console.log("AwareWave 影音工作台: http://" + host + ":" + port),
  );
}
module.exports = { createServer };
