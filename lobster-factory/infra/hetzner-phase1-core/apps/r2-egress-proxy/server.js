const http = require("http");
const https = require("https");
const ALLOWED_HOST = "api.cloudflare.com";
const port = Number(process.env.PORT || 8787);
const server = http.createServer((req, res) => {
  if (!req.url.startsWith("/client/v4/accounts/") || !["r2-egress-proxy:8787", "r2-egress-proxy"].includes(req.headers.host || "")) {
    res.writeHead(403); return res.end("forbidden");
  }
  const headers = { authorization: req.headers.authorization || "", "content-type": req.headers["content-type"] || "application/octet-stream" };
  if (req.headers["content-length"]) headers["content-length"] = req.headers["content-length"];
  const upstream = https.request({ hostname: ALLOWED_HOST, port: 443, path: req.url, method: req.method, headers }, (up) => { res.writeHead(up.statusCode || 502, up.headers); up.pipe(res); });
  upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("upstream unavailable"); });
  req.pipe(upstream);
});
server.listen(port, "0.0.0.0");
