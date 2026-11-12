// Versioned static files (edge-cacheable): every page's <script src>/<link href> and every VideoWorkbench.loadScripts URL
// carries ?v=<build>, and a static file asked for with the CURRENT build gets `public, max-age=31536000, immutable`, so
// Cloudflare keeps it at the edge instead of going back to the European origin for each file (from Taiwan that leg
// queued the ~30 boot files 1-2.5 s deep, 2026-11-12). Invariant: a cached URL always names the bytes it holds. The build id
// is a hash of the served files themselves, so any changed file changes every URL; a missing ?v= is never cached, a stale one
// is refused (one page never runs two builds).
// HTML, config.js, /awarewave/*, /api, /media, /generated are always "no-store" (cachePolicy).
const crypto = require("node:crypto"), fs = require("node:fs"), path = require("node:path");

const DIRS = ["pages", "shared", "styles", "scripts", "vendor", "assets", "examples"];
const CACHEABLE = /^\/(shared|styles|scripts|vendor|assets|examples|pages)\/[^?#]*$/;

function buildId(root) {
  const hash = crypto.createHash("sha256");
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.isFile()) hash.update(path.relative(root, full).split(path.sep).join("/") + "\0").update(fs.readFileSync(full)).update("\0");
    }
  };
  for (const d of DIRS) walk(path.join(root, d));
  return hash.digest("hex").slice(0, 16);
}

// Same-origin relative or root-relative URL with no query/fragment: the only kind that is versioned.
const plain = (u) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u) && !/[?#]/.test(u) && u !== "";

function versionHtml(html, id) {
  return html
    .replace(/<html\b(?![^>]*data-vw-build)/i, `<html data-vw-build="${id}"`)
    .replace(/<script\b[^>]*>/gi, (tag) => tag.replace(/(\ssrc=")([^"]*)(")/i, (m, a, u, b) => (plain(u) ? a + u + "?v=" + id + b : m)))
    .replace(/<link\b[^>]*>/gi, (tag) =>
      /\srel="(?:stylesheet|modulepreload|preload)"/i.test(tag)
        ? tag.replace(/(\shref=")([^"]*)(")/i, (m, a, u, b) => (plain(u) ? a + u + "?v=" + id + b : m))
        : tag);
}

// pathname = decoded path; search = raw query string ("?v=..."). The service worker script keeps its own update check.
// "immutable" = this build's bytes, cache for a year; "stale" = asked for by a page of an older build: the server only holds
// this build, so it is refused (404) rather than mixing versions in one page (that page reloads); "no-store" = everything else.
function cachePolicy(pathname, search, id, file) {
  if (!id || !CACHEABLE.test(pathname) || /\.html$/i.test(file) || pathname === "/scripts/media-cache-sw.js") return "no-store";
  const v = new URLSearchParams(search).get("v");
  return v === null ? "no-store" : v === id ? "immutable" : "stale";
}

module.exports = { buildId, versionHtml, cachePolicy };
