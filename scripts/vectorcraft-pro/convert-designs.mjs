#!/usr/bin/env node
// C7.1 (agency-os/handoffs/2026-11-04-vectorcraft-pro/R0-PLAN.md §6): inventory of the old vector editor's saves in My Designs.
// Read-only. There is nothing to convert, and this script exists to prove it with real counts:
// - The old editor's 「存入 My Designs」 posts a PNG/WebP preview only (public/vector-editor.html:1025-1027, source 'vector-editor');
//   its editable .design.json goes to the user's disk only (vector-editor.html:1285), never to the server.
// - My Designs is media_assets (app/api/tools/designs/route.ts:247-270); the POST takes only png/jpeg/webp data URLs (:161-176)
//   and has no column or attachment for SVG or project JSON (packages/db/migrations/0038_media_assets_reconcile.sql:29-41).
// So a stored row holds pixels, not vectors: re-exporting "SVG (真實 cm)" from it would wrap the same bitmap. The rows stay as they
// are and open in /tools/vector-pro as images (editor-shared/blocks/my-designs.js). No write mode exists here on purpose.
//
// Usage:  node scripts/vectorcraft-pro/convert-designs.mjs --dry-run
// Env:    SUPABASE_AWAREWAVE_URL + SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY (from mcp/user-env.ps1; values never printed).
// Exit:   0 = inventory printed and every row is a raster preview (nothing to convert); 2 = a row carries vector data this script
//         did not expect (stop: a real converter is needed); 1 = usage / env / HTTP error.

const SOURCES = ["vector-editor"];
const RASTER = new Set(["image/png", "image/jpeg", "image/webp"]);
const VECTOR_KEYS = ["svg", "design_json", "project", "fabric_json", "vector"];

if (!process.argv.includes("--dry-run")) {
  console.error("Only --dry-run exists: the old vector saves are raster previews, so there is nothing to write back.");
  process.exit(1);
}
const base = process.env.SUPABASE_AWAREWAVE_URL?.replace(/\/+$/, "");
const key = process.env.SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY;
if (!base || !key) {
  console.error("Set SUPABASE_AWAREWAVE_URL and SUPABASE_AWAREWAVE_SERVICE_ROLE_KEY (mcp/user-env.ps1).");
  process.exit(1);
}

const rows = [];
for (const source of SOURCES) {
  for (let offset = 0; ; offset += 1000) {
    const url = `${base}/rest/v1/media_assets?select=id,mime_type,byte_size,created_at,metadata&metadata->>source=eq.${encodeURIComponent(source)}&order=created_at.asc&limit=1000&offset=${offset}`;
    const res = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) {
      console.error(`media_assets read failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) break;
  }
}

const byMime = {};
const vectorRows = [];
for (const r of rows) {
  byMime[r.mime_type ?? "null"] = (byMime[r.mime_type ?? "null"] ?? 0) + 1;
  const meta = r.metadata ?? {};
  if (!RASTER.has(r.mime_type) || VECTOR_KEYS.some((k) => meta[k] != null)) vectorRows.push(r.id);
}
const dates = rows.map((r) => r.created_at).filter(Boolean);
console.log(JSON.stringify({
  mode: "dry-run",
  sources: SOURCES,
  rows: rows.length,
  byMime,
  firstSaved: dates[0] ?? null,
  lastSaved: dates.at(-1) ?? null,
  rowsWithVectorData: vectorRows.length,
  toConvert: vectorRows.length,
  verdict: vectorRows.length === 0
    ? "every row is a raster preview: nothing to convert; rows stay and open as images in /tools/vector-pro"
    : "some rows carry vector data: a converter is needed before the old editor retires",
  vectorRowIds: vectorRows,
}, null, 2));
// exitCode, not process.exit(): exiting with undici's keep-alive sockets open trips a libuv assert on Windows.
process.exitCode = vectorRows.length === 0 ? 0 : 2;
