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
    ".gif": "image/gif",
    ".jpg": "image/jpeg",
  };
function createServer({
  dataDir = process.env.SEEDSTAR_DATA_DIR || path.join(root, ".data"),
  env = process.env,
  fetchImpl = fetch,
  awareWaveDir = require("./backend/appearance.cjs").resolveSource(root, env),
} = {}) {
  const api = require("./backend/api.cjs").createApi({
    dataDir,
    env,
    fetchImpl,
  });
  const server = http.createServer(async (req, res) => {
    let file;
    try {
      if (await api(req, res)) return;
      const pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      if (
        pathname === "/awarewave/theme.css" ||
        pathname === "/awarewave/forms.css"
      ) {
        const content = require("./backend/appearance.cjs").appearance(
          pathname,
          awareWaveDir,
        );
        res.writeHead(200, {
          "Content-Type": "text/css; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(content);
        return;
      }
      if (
        /^\/generated\/[a-f0-9-]+\.(png|jpg|webp|gif|mp3|wav|m4a|mp4|webm|mov)$/.test(
          pathname,
        )
      )
        file = path.join(dataDir, pathname.slice(1));
      else
        file = path.resolve(
          root,
          "." +
            decodeURIComponent(new URL(req.url, "http://localhost").pathname),
        );
      const boundary = pathname.startsWith("/generated/")
        ? path.resolve(dataDir, "generated")
        : root;
      file = path.resolve(file);
      if (!file.startsWith(boundary + path.sep) && file !== root) throw Error();
      if (file === root) file = path.join(root, "index.html");
      if (
        /[\\/](node_modules|\.data|backend)([\\/]|$)/i.test(file) &&
        !pathname.startsWith("/generated/")
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
if (require.main === module)
  createServer().listen(process.env.PORT || 4178, "127.0.0.1", () =>
    console.log("SeedStar: http://127.0.0.1:" + (process.env.PORT || 4178)),
  );
module.exports = { createServer };
