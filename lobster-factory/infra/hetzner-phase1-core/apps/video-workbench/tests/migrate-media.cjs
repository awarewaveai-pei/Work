// P6 L4: backend/migrate-media.cjs (+ scripts/migrate-media-to-r2.cjs). The fake fetchImpl plays the next-admin assets
// route (same shape as tests/p6-main-system.cjs; idempotent by checksum). Guards: state.json is never written when its
// revision moved during the run (the running server owns it); no local file is ever deleted or changed; undo only
// reverts local state.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const { migrate, undo } = require("../backend/migrate-media.cjs");
const appDir = require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env);
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTioAAAAASUVORK5CYII=", "base64");
const ORG = "11111111-1111-4111-8111-111111111111", BASE = "http://next-admin.test:3000";
const env = { VW_INTERNAL_BASE: BASE, VW_INTERNAL_TOKEN: "internal-secret" };
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const G1 = "/generated/aaaaaaaa-0000-4000-8000-000000000001.png", GCUBE = "/generated/aaaaaaaa-0000-4000-8000-000000000002.cube",
  GGONE = "/generated/aaaaaaaa-0000-4000-8000-000000000003.png", GJOB = "/generated/aaaaaaaa-0000-4000-8000-000000000004.png";
const JOB = "cccccccc-0000-4000-8000-000000000001";

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vw-migrate-"));
  let calls, known, onCall;
  const fetchImpl = async (url, options = {}) => {
    assert.equal(String(url), BASE + "/api/internal/video/workbench/assets");
    assert.equal(options.headers.Authorization, "Bearer internal-secret");
    const bytes = Buffer.from(await new Response(options.body).arrayBuffer()), checksum = sha(bytes);
    calls.push({ origin: options.headers["X-VW-Origin"], checksum, meta: JSON.parse(Buffer.from(options.headers["X-VW-Meta"], "base64url").toString("utf8")) });
    onCall?.();
    const existing = known.has(checksum);
    if (!existing) known.set(checksum, "bbbbbbbb-0000-4000-8000-" + String(known.size + 1).padStart(12, "0"));
    return Response.json({ ok: true, existing, assetId: known.get(checksum), checksumSha256: checksum, objectUrl: "https://cdn.test/x" }, { status: existing ? 200 : 201 });
  };
  const run = (data, extra = {}) => migrate({ data, org: ORG, env, fetchImpl, appDir, ...extra });
  const unrefBytes = Buffer.concat([png, Buffer.from("unref")]), mediaBytes = Buffer.concat([png, Buffer.from("media")]);
  const MSHA = sha(mediaBytes), USHA = sha(unrefBytes), MURL = `/media/${MSHA}/original.png`, UURL = `/media/${USHA}/original.png`;
  function fixture(name) {
    const data = path.join(root, name);
    fs.mkdirSync(path.join(data, "generated"), { recursive: true });
    fs.mkdirSync(path.join(data, "media", MSHA), { recursive: true });
    fs.mkdirSync(path.join(data, "media", USHA), { recursive: true });
    fs.writeFileSync(path.join(data, "generated", path.basename(G1)), png);
    fs.writeFileSync(path.join(data, "generated", path.basename(GCUBE)), "LUT");
    fs.writeFileSync(path.join(data, "generated", path.basename(GJOB)), Buffer.concat([png, Buffer.from("job")]));
    // A pre-L3 job result that never made it into state.assets (settle() only runs on a status change).
    fs.writeFileSync(path.join(data, "jobs.json"), JSON.stringify([
      { id: JOB, type: "image", status: "succeeded", input: {}, result: { url: GJOB, origin: { kind: "ai_generated", model: "gpt-image-1", provider: "OpenAI" } } },
      { id: "cccccccc-0000-4000-8000-000000000002", type: "image", status: "failed", result: null },
    ]));
    fs.writeFileSync(path.join(data, "media", MSHA, "original.png"), mediaBytes);
    fs.writeFileSync(path.join(data, "media", MSHA, "probe.json"), "{}");
    fs.writeFileSync(path.join(data, "media", USHA, "original.png"), unrefBytes);
    fs.writeFileSync(path.join(data, "state.json"), JSON.stringify({
      version: 1, revision: 3, characters: [], projects: [], jobs: [],
      assets: [
        { id: "a1", kind: "image", url: G1, origin: { kind: "ai_generated", model: "m", provider: "p" } },
        { id: "a2", kind: "image", url: MURL },
        { id: "a3", kind: "image", url: GCUBE, origin: { kind: "import", legacy: true } },
        { id: "a4", kind: "image", url: "https://example.test/remote.png" },
        { id: "a5", kind: "image", url: GGONE, origin: { kind: "import", legacy: true } },
      ],
    }));
    return data;
  }
  const tree = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();
  const snapshot = (data) => Object.fromEntries(["generated", "media"].flatMap((d) => tree(path.join(data, d)).map((f) => [d + "/" + f, fs.readFileSync(path.join(data, d, f)).toString("base64")])));
  try {
    // 1. dry-run: row count = sources (1 job result + state a1,a2,a3,a5 + 1 unreferenced media dir), no network, no writes.
    calls = []; known = new Map();
    const data = fixture("org"), before = snapshot(data), stateBefore = fs.readFileSync(path.join(data, "state.json"), "utf8");
    const dry = await run(data, { dryRun: true, fetchImpl: async () => { throw Error("dry-run must not call the network"); } });
    assert.equal(dry.rows.length, 6);
    assert.deepEqual(dry.counts, { total: 6, "dry-run": 4, skipped: 1, error: 1 });
    assert.equal(dry.rows.filter((r) => r.reason === "unreferenced_media").length, 1);
    assert(!fs.readdirSync(data).some((f) => f.startsWith("migrate-report")) && !fs.existsSync(path.join(data, "main-system-assets.json")));
    assert.equal(fs.readFileSync(path.join(data, "state.json"), "utf8"), stateBefore);

    // 2. real run: registers all uploadable files, skips .cube, one error row (missing file) does not stop the rest.
    const rep = await run(data);
    assert.deepEqual(rep.counts, { total: 6, registered: 4, skipped: 1, error: 1 });
    assert.deepEqual(calls.map((c) => c.origin).sort(), ["ai_generated", "ai_generated", "real_footage", "real_footage"]);
    // the job result goes in with its own job id, so the route keys it like the live settle() would
    assert.equal(calls.find((c) => c.meta.vwJobId === JOB)?.meta.rightsSources[0].kind, "ai_generated");
    assert.equal(rep.rows.find((r) => r.url === GJOB).status, "registered");
    assert.equal(rep.rows.find((r) => r.url === GGONE).reason, "file_missing");
    assert.equal(rep.rows.find((r) => r.url === MURL).reason, "origin_missing_treated_as_import_legacy");
    assert.equal(rep.rows.find((r) => r.url === UURL).status, "registered");
    for (const r of rep.rows) assert.deepEqual(Object.keys(r).filter((k) => ["url", "status", "assetId", "checksum", "reason"].includes(k)).length, 5);
    assert.deepEqual(JSON.parse(fs.readFileSync(rep.reportFile, "utf8")).counts, rep.counts);
    let state = JSON.parse(fs.readFileSync(path.join(data, "state.json"), "utf8"));
    assert.equal(state.revision, 4);
    const [a1, a2, a3, a4, a5] = state.assets;
    assert.match(a1.assetId, /^bbbbbbbb-/);
    assert.equal(a1.checksumSha256, sha(png));
    assert.equal(a2.assetId, rep.rows.find((r) => r.url === MURL).assetId);
    assert(!a3.assetId && !a4.assetId && !a5.assetId);
    assert.deepEqual(snapshot(data), before, "本地檔一個都不能刪或改");

    // 3. second run: every registrable file is `existing` with zero fetch calls; state not rewritten.
    calls = [];
    const again = await run(data, { fetchImpl: async () => { throw Error("second run must not call the network"); } });
    assert.deepEqual(again.counts, { total: 6, existing: 4, skipped: 1, error: 1 });
    assert.notEqual(again.reportFile, rep.reportFile, "重跑不得覆蓋 undo 要用的第一份報告");
    assert.equal(JSON.parse(fs.readFileSync(path.join(data, "state.json"), "utf8")).revision, 4);
    // ...and with the url index lost, the route's checksum idempotency answers existing for each.
    fs.rmSync(path.join(data, "main-system-assets.json"));
    const lost = await run(data);
    assert.equal(calls.length, 4);
    assert.deepEqual(lost.counts, { total: 6, existing: 4, skipped: 1, error: 1 });

    // 4. undo with the first run's own report file (two reruns since): state backfill removed, urls dropped from the index,
    // ledger ids printed, local files untouched.
    const index = JSON.parse(fs.readFileSync(path.join(data, "main-system-assets.json"), "utf8"));
    assert(index[G1] && index[MURL] && index[UURL] && index[GJOB]);
    const undone = undo({ data, report: rep.reportFile });
    assert.equal(undone.assetIds.length, 4);
    state = JSON.parse(fs.readFileSync(path.join(data, "state.json"), "utf8"));
    assert(state.assets.every((a) => a.assetId === undefined && a.checksumSha256 === undefined));
    assert.equal(state.revision, 5);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, "main-system-assets.json"), "utf8")), {});
    assert.deepEqual(snapshot(data), before);

    // 5. guard: revision moved mid-run (the server saved) -> state.json is not written, report still lists the ledger ids.
    const live = fixture("live");
    calls = []; known = new Map();
    let moved = false;
    onCall = () => {
      if (moved) return;
      moved = true;
      const s = JSON.parse(fs.readFileSync(path.join(live, "state.json"), "utf8"));
      fs.writeFileSync(path.join(live, "state.json"), JSON.stringify({ ...s, revision: s.revision + 1, characters: [{ id: "browser-edit" }] }));
    };
    const aborted = await run(live);
    onCall = undefined;
    assert.equal(aborted.stateWritten, false);
    assert.match(aborted.abortReason, /revision changed/);
    state = JSON.parse(fs.readFileSync(path.join(live, "state.json"), "utf8"));
    assert.deepEqual([state.revision, state.characters.length], [4, 1], "伺服器剛存的 state 不得被覆寫");
    assert(state.assets.every((a) => !a.assetId));
    assert.equal(aborted.counts.registered, 4);
    assert(fs.existsSync(aborted.reportFile));
    console.log("PASS migrate-media：dry-run 列數／不連線、實跑登記＋回填、第二次全 existing 零連線、revision 變動拒寫、undo 還原、不動本地檔");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
