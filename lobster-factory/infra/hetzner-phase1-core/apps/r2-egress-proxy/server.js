const http = require("http");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");

const MAX_BYTES = 300 * 1024 * 1024;

function equalToken(provided, expected) {
  const a = Buffer.from(provided || "");
  const b = Buffer.from(expected || "");
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function buildConfig(env = process.env) {
  let endpoint;
  try { endpoint = new URL(env.R2_S3_ENDPOINT || ""); } catch { throw new Error("invalid R2 S3 endpoint"); }
  if (endpoint.protocol !== "https:" || !endpoint.hostname.endsWith(".r2.cloudflarestorage.com")) throw new Error("invalid R2 S3 endpoint");
  for (const name of ["R2_ACCOUNT_ID", "R2_API_TOKEN", "R2_S3_ACCESS_KEY_ID", "R2_S3_SECRET_ACCESS_KEY", "R2_VIDEO_BUCKET"]) {
    if (!env[name]) throw new Error(`${name} is required`);
  }
  return {
    accountId: env.R2_ACCOUNT_ID,
    internalToken: env.R2_API_TOKEN,
    bucket: env.R2_VIDEO_BUCKET,
    client: new S3Client({ region: "auto", endpoint: endpoint.origin, forcePathStyle: true, credentials: { accessKeyId: env.R2_S3_ACCESS_KEY_ID, secretAccessKey: env.R2_S3_SECRET_ACCESS_KEY } }),
  };
}

function createProxy(config) {
  return http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end('{"ok":true}');
    }
    const bearer = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "")?.[1] || "";
    if (!equalToken(bearer, config.internalToken)) { res.writeHead(401); return res.end("unauthorized"); }
    let requestUrl;
    try { requestUrl = new URL(req.url || "", "http://r2-egress-proxy"); } catch { requestUrl = null; }
    const match = requestUrl && /^\/client\/v4\/accounts\/([^/]+)\/r2\/buckets\/([^/]+)\/objects\/(.+)$/.exec(requestUrl.pathname);
    let key = "";
    let bucket = "";
    try { if (match) { key = decodeURIComponent(match[3]); bucket = decodeURIComponent(match[2]); } } catch { key = ""; bucket = ""; }
    const safeKey = key && !key.startsWith("/") && !key.split("/").some(part => part === "." || part === ".." || part === "") && /^(remotion|video)\//.test(key);
    if (req.method !== "PUT" || !requestUrl || requestUrl.search || !match || match[1] !== config.accountId || bucket !== config.bucket || !safeKey) {
      res.writeHead(403); return res.end("forbidden");
    }
    const contentLength = Number(req.headers["content-length"] || 0);
    if (!Number.isFinite(contentLength) || contentLength <= 0 || contentLength > MAX_BYTES) { res.writeHead(413); return res.end("invalid content length"); }
    try {
      await config.client.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: req, ContentLength: contentLength, ContentType: req.headers["content-type"] || "application/octet-stream" }), { abortSignal: AbortSignal.timeout(120_000) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"success":true}');
    } catch (error) {
      console.error("[r2-egress] upload failed", error?.name || "Error", error?.$metadata?.httpStatusCode || "", error?.message || "");
      if (!res.headersSent) res.writeHead(502);
      res.end("upload failed");
    }
  });
}

if (require.main === module) createProxy(buildConfig()).listen(Number(process.env.PORT || 8787), "0.0.0.0");
module.exports = { buildConfig, createProxy, equalToken };
