// Card M3 invariant 8 (2): the export job itself samples frames of an untouched full-frame clip and compares them
// with the source (Codex 2026-11-02: only tests called the frame check before). A 5-frame shift fails the job.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  { execFileSync } = require("node:child_process");
const { isolatedServer } = require("./isolated-server.cjs");
const ffmpeg = require("ffmpeg-static");

(async () => {
  const { base, dataDir } = await isolatedServer("vw-export-frame-");
  const generated = path.join(dataDir, "generated");
  fs.mkdirSync(generated, { recursive: true });
  const name = crypto.randomUUID() + ".mp4";
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=640x360:r=30000/1001:d=10",
    "-f", "lavfi", "-i", "sine=duration=10", "-c:v", "libx264", "-crf", "12", "-c:a", "aac", "-shortest",
    path.join(generated, name)]);
  const api = (route, method = "GET", body) =>
    fetch(base + "/api/seedstar" + route, {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body && JSON.stringify(body),
    }).then((r) => r.json());
  const project = {
    id: "plain", title: "plain", ratio: "16:9", timebase: { num: 30000, den: 1001 },
    clips: [{ id: "plain-v1", kind: "video", track: "V1", asset: { url: "/generated/" + name },
      startFrame: 0, durationFrames: 200, sourceStartFrame: 30, speed: 1 }],
  };
  const created = await api("/generations", "POST", { type: "video", operation: "editor-export", settings: { quality: "720p", project } });
  let job;
  for (let i = 0; i < 600; i++) {
    job = await api("/generations/" + created.id);
    if (["succeeded", "failed"].includes(job.status)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.equal(job.status, "succeeded", job.error);
  assert.ok(job.result.verification.frameChecks >= 1, JSON.stringify(job.result.verification));
  console.log("PASS 正式匯出：未加工的整畫面片段由任務自己抽格比對（frameChecks " + job.result.verification.frameChecks + "）");
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});
