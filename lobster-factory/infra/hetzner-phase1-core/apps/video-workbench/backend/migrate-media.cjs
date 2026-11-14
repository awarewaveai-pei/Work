// P6 L4: register the files made before L3 in the main-system ledger through createMainSystem().ingest (the one upload
// client; its url -> asset index makes a rerun a no-op), then backfill assetId/checksumSha256 on the state assets.
// Sources: succeeded jobs.json results (own origin + jobId, as api.cjs settle() sends them; settle only runs on a status
// change, so pre-L3 results are never registered otherwise), state.json assets, unreferenced media/<sha>/original.*.
// One url = one ledger asset, same as the live index (main-system.cjs:85). Never deletes or moves a local file.
const fs = require("node:fs"),
  path = require("node:path");
const { createMainSystem, MIME, LOCAL_URL, localUrls } = require("./main-system.cjs");
const { jobRatio } = require("../shared/jobs-view.js");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ORIGINS = new Set(["import", "upload", "ai_generated", "render"]);
const LEGACY = { kind: "import", legacy: true };

const readJson = (file) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null);
const writeJson = (file, value) => {
  fs.writeFileSync(file + ".tmp", JSON.stringify(value));
  fs.renameSync(file + ".tmp", file);
};
const fail = (code, message) => Object.assign(Error(message), { code });

// state.json is owned by the running server, which must be stopped. The revision re-check right before the write detects a
// server that saved during the run; it is not a lock (a save between check and rename still loses). Bumps revision so a browser tab holding the old one gets 409 and reloads (api.cjs PUT /state).
function commitState(stateFile, startRevision, mutate) {
  const fresh = readJson(stateFile);
  if (!fresh || (fresh.revision ?? 0) !== startRevision)
    throw fail("state_changed", `state.json revision changed during the run (${startRevision} -> ${fresh?.revision}); stop the server, then rerun`);
  mutate(fresh);
  fresh.revision = startRevision + 1;
  writeJson(stateFile, fresh);
}

function sources(data, state) {
  const rows = new Map();
  for (const job of readJson(path.join(data, "jobs.json")) || []) {
    const url = job?.status === "succeeded" ? job.result?.url : null;
    if (typeof url !== "string" || !LOCAL_URL.test(url) || rows.has(url)) continue;
    const origin = ORIGINS.has(job.result.origin?.kind) ? job.result.origin : null;
    rows.set(url, { url, origin, jobId: job.id, sources: [...localUrls(job.input)], costUsd: origin?.costUsd, ratio: jobRatio(job) });
  }
  for (const a of state?.assets || []) {
    if (typeof a?.url !== "string" || !LOCAL_URL.test(a.url)) continue;
    if (!rows.has(a.url)) rows.set(a.url, { url: a.url, origin: null });
    const row = rows.get(a.url);
    if (!row.origin && ORIGINS.has(a.origin?.kind)) row.origin = a.origin;
  }
  const media = path.join(data, "media");
  if (fs.existsSync(media))
    for (const sha of fs.readdirSync(media)) {
      if (!/^[a-f0-9]{64}$/.test(sha)) continue;
      const name = fs.readdirSync(path.join(media, sha)).find((f) => /^original\.[a-z0-9]+$/.test(f));
      const url = name && `/media/${sha}/${name}`;
      if (url && !rows.has(url)) rows.set(url, { url, origin: null, unreferenced: true });
    }
  return [...rows.values()].map((r) => ({ ...r, defaulted: !r.origin, origin: r.origin || LEGACY, file: path.join(data, r.url.slice(1)) }));
}

const count = (rows) => rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), { total: rows.length });

async function migrate({ data, org, dryRun = false, env, fetchImpl, appDir, inspect, log = () => {} }) {
  if (!UUID.test(String(org || ""))) throw fail("bad_org", "--org must be an organization uuid");
  const stateFile = path.join(data, "state.json"), state = readJson(stateFile), startRevision = state ? state.revision ?? 0 : null;
  const list = sources(data, state);
  const rows = list.map((s) => ({ url: s.url, status: dryRun ? "dry-run" : "error", assetId: null, checksum: null, reason: null }));
  if (dryRun) {
    list.forEach((s, i) => {
      if (!MIME[path.extname(s.url).slice(1)]) { rows[i].status = "skipped"; rows[i].reason = "unsupported_type"; }
      else if (!fs.existsSync(s.file)) { rows[i].status = "error"; rows[i].reason = "file_missing"; }
      else if (s.unreferenced) rows[i].reason = "unreferenced_media";
    });
    return { rows, counts: count(rows), dryRun: true };
  }
  const main = createMainSystem({ env, fetchImpl, appDir, dataDir: data, orgId: org, ...(inspect ? { inspect } : {}) });
  if (!main) throw fail("not_configured", "VW_INTERNAL_BASE and VW_INTERNAL_TOKEN must both be set");
  const indexBefore = readJson(path.join(data, "main-system-assets.json")) || {};
  for (const [i, s] of list.entries()) {
    const row = rows[i];
    try {
      if (!fs.existsSync(s.file)) { row.reason = "file_missing"; throw row; }
      const r = await main.ingest({ url: s.url, file: s.file, origin: s.origin, sources: s.sources, costUsd: s.costUsd, jobId: s.jobId, ratio: s.ratio });
      if (r.skipped) { row.status = "skipped"; row.reason = r.skipped; }
      else {
        row.status = r.existing ? "existing" : "registered";
        row.assetId = r.assetId;
        row.checksum = r.checksumSha256;
        row.newIndex = !indexBefore[s.url];
        if (s.defaulted) row.reason = "origin_missing_treated_as_import_legacy";
      }
    } catch (e) {
      row.status = "error";
      if (e !== row) row.reason = e.message;
    }
    log(`${row.status} ${row.url}${row.reason ? " (" + row.reason + ")" : ""}`);
  }
  const byUrl = new Map(rows.filter((r) => r.assetId).map((r) => [r.url, r]));
  const backfilled = [];
  let stateWritten = false, abortReason = null;
  const owed = (state?.assets || []).some((a) => byUrl.has(a?.url) && !a.assetId);
  if (owed) {
    try {
      commitState(stateFile, startRevision, (fresh) => {
        for (const a of fresh.assets || []) {
          const r = byUrl.get(a?.url);
          if (!r || a.assetId) continue;
          a.assetId = r.assetId;
          a.checksumSha256 = r.checksum;
          backfilled.push({ id: a.id, url: a.url });
        }
      });
      stateWritten = true;
    } catch (e) {
      if (e.code !== "state_changed") throw e;
      abortReason = e.message;
    }
  }
  // One report per run: a rerun (all existing, nothing backfilled) must not overwrite the report --undo needs.
  const reportFile = path.join(data, `migrate-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const report = { org, startRevision, stateWritten, abortReason, backfilled, counts: count(rows), rows };
  writeJson(reportFile, report);
  return { ...report, reportFile };
}

// Local state only. There is no delete route and the request path never deletes content-addressed R2 objects (L2), so
// the ledger rows (asset ids returned) are the operator's to remove by SQL.
function undo({ data, report: reportFile }) {
  const report = readJson(reportFile);
  if (!report || !Array.isArray(report.rows)) throw fail("bad_report", "not a migrate report: " + reportFile);
  const stateFile = path.join(data, "state.json"), state = readJson(stateFile);
  if (state && report.backfilled?.length) {
    const ids = new Set(report.backfilled.map((b) => b.id));
    commitState(stateFile, state.revision ?? 0, (fresh) => {
      for (const a of fresh.assets || []) if (ids.has(a.id)) { delete a.assetId; delete a.checksumSha256; }
    });
  }
  const indexFile = path.join(data, "main-system-assets.json"), index = readJson(indexFile);
  if (index) {
    for (const r of report.rows) if (r.newIndex) delete index[r.url];
    writeJson(indexFile, index);
  }
  return { assetIds: report.rows.filter((r) => r.assetId).map((r) => ({ assetId: r.assetId, status: r.status, url: r.url })) };
}

module.exports = { migrate, undo, sources };
