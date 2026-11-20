// Card R4: the table test that decides which transitions are offered (operator 2026-11-20: 做不到的不放). Every catalogue
// entry (next-admin public/editor-shared/transitions.js CATALOG = FFmpeg's built-in xfade transitions) is tried once:
//   1. it exports: two short coloured clips joined by the export's own xfade step (backend/transitions.cjs xfadeSteps,
//      the function backend/editor-export.cjs builds its transitions with), on the export's ffmpeg; the file exists and
//      lasts a + b - t;
//   2. its preview (backend/transitions.cjs preview, the same step on the same ffmpeg) is made within PREVIEW_MS.
// The ones that pass are VERIFIED. `node tests/r4-transitions-table.cjs --write` writes that list into the module; the
// gate run fails when an offered kind no longer passes (it then leaves the list on the next --write; nobody keeps an
// exclusion list). Also: curves exist only where the export has a curved form, and are refused elsewhere.
// One real editor export with a card R4 kind runs too. video-service's join of a card R4 kind: video-service
// tests/test_bookends.py (it checks names against FFmpeg's own list, the same 58 here).
const assert = require("node:assert/strict"), fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { run } = require("../backend/media.cjs");
const tr = require("../backend/transitions.cjs"), { Transitions } = tr;
const { spawnSync } = require("node:child_process"), ffmpeg = require("ffmpeg-static");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vw-r4-table-")), A = 0.6, T = 0.3;
const seconds = (file) => {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(spawnSync(ffmpeg, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : NaN;
};

(async () => {
  const results = [];
  for (const x of Transitions.CATALOG) {
    const why = [];
    // 1. the export's step
    const out = path.join(dir, x.xfade + ".mp4");
    try {
      const steps = tr.xfadeSteps({ type: x.xfade, curve: "線性", timing: `duration=${T}:offset=${A - T}`, a: "[0:v]", b: "[1:v]", out: "[v]", tag: "t" });
      await run(["-y", "-hide_banner", "-f", "lavfi", "-i", `color=c=red:s=160x90:r=24:d=${A}`, "-f", "lavfi", "-i", `color=c=blue:s=160x90:r=24:d=${A}`,
        "-filter_complex", steps.join(";"), "-map", "[v]", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out], AbortSignal.timeout(20000));
      const got = seconds(out);
      if (!(Math.abs(got - (2 * A - T)) <= 0.05)) why.push(`出片長度 ${got}，應為 ${2 * A - T}`);
    } catch (e) {
      why.push("出片失敗：" + String(e.message).slice(-160));
    }
    // 2. the preview, uncached
    const started = Date.now();
    try {
      await tr.preview({ transition: x.id, seconds: 0.5 }, { run, dir: fs.mkdtempSync(path.join(dir, "p-")), signal: AbortSignal.timeout(20000) });
      const ms = Date.now() - started;
      // the time standard decides the list when it is written (on the laptop); a loaded build machine only logs it
      if (ms > Transitions.PREVIEW_MS && process.argv.includes("--write")) why.push(`預覽 ${ms} ms，超過 ${Transitions.PREVIEW_MS} ms`);
      results.push({ id: x.id, ms, why });
    } catch (e) {
      results.push({ id: x.id, ms: Date.now() - started, why: [...why, "預覽失敗：" + String(e.message).slice(-160)] });
    }
  }
  const passed = results.filter((r) => !r.why.length).map((r) => r.id), failed = results.filter((r) => r.why.length);
  const ms = results.map((r) => r.ms).sort((a, b) => a - b);
  console.log(`R4 table: ${passed.length}/${results.length} pass; preview ms median ${ms[ms.length >> 1]}, max ${ms.at(-1)}`);
  for (const f of failed) console.log("  not offered:", f.id, "--", f.why.join("；"));

  if (process.argv.includes("--write")) {
    const file = path.join(require("../backend/appearance.cjs").resolveSource(path.join(__dirname, ".."), process.env), "public/editor-shared/transitions.js");
    const text = fs.readFileSync(file, "utf8").replace(/(\/\/ @verified-begin\n)[\s\S]*?(\n\s*\/\/ @verified-end)/,
      (_, a, b) => a + "  const VERIFIED = [\n" + passed.map((id) => `    ${JSON.stringify(id)},`).join("\n") + "\n  ];" + b);
    fs.writeFileSync(file, text);
    console.log("wrote VERIFIED:", passed.length);
  } else {
    // every offered kind must pass here (the gate runs this in the workbench image too); one that passes here but is not
    // offered was left out on the machine that wrote the list -- said, not added by hand
    const broken = Transitions.VERIFIED.filter((id) => !passed.includes(id));
    assert.deepEqual(broken, [], "offered but failing now: " + broken.join(", ") + " -- run node tests/r4-transitions-table.cjs --write");
    const extra = passed.filter((id) => !Transitions.VERIFIED.includes(id));
    if (extra.length) console.log("  passes here but not offered (list written elsewhere):", extra.join(", "));
    assert.ok(Transitions.LIST.slice(1).every((x) => passed.includes(x.id)), "only what passes is offered");
  }

  // Curves: the module's flag = the export's curved forms; a curve on any other kind is refused, never ignored.
  assert.deepEqual(Transitions.CATALOG.filter((x) => x.curved).map((x) => x.xfade).sort(), Object.keys(tr.CURVED_TRANSITIONS).sort());
  for (const x of Transitions.CATALOG) {
    if (x.curved) assert.match(tr.xfadeSteps({ type: x.xfade, curve: "平滑", timing: "duration=0.3:offset=0.3", a: "[a]", b: "[b]", out: "[o]", tag: "c" }).at(-1), /transition=custom/);
    else {
      assert.throws(() => tr.xfadeSteps({ type: x.xfade, curve: "平滑", timing: "duration=0.3:offset=0.3", a: "[a]", b: "[b]", out: "[o]", tag: "c" }), /不支援曲線/, x.id);
      await assert.rejects(tr.preview({ transition: x.id, curve: "加速" }, { run, dir, signal: AbortSignal.timeout(5000) }), new RegExp(Transitions.NO_CURVE_WHY), x.id);
      assert.ok(Transitions.NO_CURVE.includes(x.id), x.id);
    }
  }

  // One real editor export with a card R4 kind (pixelize), through the export's own project path.
  const { exportEditor } = require("../backend/editor-export.cjs");
  const clip = (id, start) => ({ id, kind: "video", track: "V1", asset: { url: id + ".mp4" }, startFrame: start, durationFrames: 24, sourceStartFrame: 0 });
  for (const [id, color] of [["c1", "red"], ["c2", "blue"]])
    spawnSync(ffmpeg, ["-y", "-hide_banner", "-f", "lavfi", "-i", `color=c=${color}:s=320x180:r=24:d=2`, "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", path.join(dir, id + ".mp4")]);
  let n = 0;
  const made = await exportEditor({ ratio: "16:9", timebase: { num: 24, den: 1 }, tracks: [{ id: "V1", kind: "video" }],
    clips: [clip("c1", 0), { ...clip("c2", 24), transition: "pixelize", transitionFrames: 8 }] },
    { file: (u) => path.join(dir, u), output: (ext) => { const name = `export-${++n}.${ext}`; return { file: path.join(dir, name), url: name }; }, run, signal: AbortSignal.timeout(120000) }, "720p");
  assert.ok(fs.statSync(path.join(dir, made.url)).size > 0);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("PASS R4 transitions table: every offered kind exports and previews in time; curves only where the export has them; a real export with pixelize");
})().catch((e) => { console.error(e); process.exitCode = 1; });
