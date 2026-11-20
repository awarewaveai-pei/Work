// Invariant under test: a submitted render ends "done" or "error" with a reason -- a crashing render does not take
// the service down, and a restart turns cut-off jobs into an explicit failure instead of 404 / pending forever.
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { createApp } = require("../dist/app.js");
const { JobStore, INTERRUPTED_ERROR } = require("../dist/job-store.js");
const { RenderRunner } = require("../dist/render-runner.js");
const { cgroupCpuLimit, cgroupMemoryLimit, allowParallelEncoding } = require("../dist/resource-limits.js");

const TOKEN = "test-token";
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "remotion-test-"));

async function service(store, timeoutMs = 20000) {
  const outDir = tmp();
  const runner = new RenderRunner({
    store,
    workerPath: path.join(__dirname, "fixtures", "fake-renderer-worker.cjs"),
    getServeUrl: async () => "http://bundle.invalid",
    upload: async (outFile, jobId, kind) => {
      assert.equal(fs.readFileSync(outFile, "utf8"), kind); // the fake worker writes its output kind
      return `https://r2.invalid/${jobId}.${kind}`;
    },
    outFile: (jobId, kind) => path.join(outDir, `${jobId}.${kind}`),
    timeoutMs,
    cancelGraceMs: 300,
    encoderThreads: 2,
    allowParallelEncoding: (w, h) => allowParallelEncoding(w, h, 1024 * 1024 * 1024),
  });
  const server = createApp({ authRequired: true, authToken: TOKEN, store, runner }).listen(0, "127.0.0.1");
  await new Promise((res) => server.once("listening", res));
  const base = () => `http://127.0.0.1:${server.address().port}`;
  const call = async (p, body, method = body ? "POST" : "GET") => {
    const r = await fetch(base() + p, {
      method,
      headers: { "Content-Type": "application/json", "X-Render-Token": TOKEN },
      body: body && JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  return { server, call };
}

async function submit(call, mode) {
  process.env.FAKE_RENDER_MODE = mode; // forked worker inherits the env at fork time
  const r = await call("/render", { templateId: "scale-bg-text-slideup", props: { text: "t" }, outputFormat: "16x9", fps: 30, durationInFrames: 180 });
  assert.equal(r.status, 200);
  return r.body.jobId;
}

async function settle(call, jobId) {
  for (let i = 0; i < 200; i++) {
    const r = await call("/status/" + jobId);
    if (r.body.status === "done" || r.body.status === "error") return r.body;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error("job never settled");
}

test("a render that throws an unhandled rejection fails that job with a reason; the service keeps serving", async () => {
  const { server, call } = await service(new JobStore(null));
  try {
    const crashed = await settle(call, await submit(call, "unhandled"));
    assert.equal(crashed.status, "error");
    assert.match(crashed.error, /記憶體不足/);
    assert.equal((await call("/health")).status, 200);
    const next = await settle(call, await submit(call, "ok"));
    assert.equal(next.status, "done", JSON.stringify(next));
    assert.match(next.url, /^https:\/\/r2\.invalid\//);
  } finally {
    server.close();
  }
});

test("a worker killed from outside ends as a failed job", async () => {
  const { server, call } = await service(new JobStore(null));
  try {
    const killed = await settle(call, await submit(call, "sigkill"));
    assert.equal(killed.status, "error");
    assert.match(killed.error, /^渲染失敗：/);
  } finally {
    server.close();
  }
});

test("a render that never finishes is stopped at the time limit", async () => {
  const { server, call } = await service(new JobStore(null), 1500);
  try {
    const hung = await settle(call, await submit(call, "hang"));
    assert.equal(hung.status, "error");
    assert.match(hung.error, /仍未完成，已中止/);
  } finally {
    server.close();
  }
});

// R5: a caller that gives up cancels; the one-at-a-time queue moves on instead of waiting for a render nobody collects.
test("cancelling the running job (DELETE /render/:id) frees the queue: the next job starts and finishes", async () => {
  const { server, call } = await service(new JobStore(null), 60000);   // the time limit is far off: only the cancel stops it
  try {
    const stuck = await submit(call, "hang");
    for (let i = 0; i < 100 && (await call("/status/" + stuck)).body.status !== "rendering"; i++) await new Promise((res) => setTimeout(res, 50));
    const next = await submit(call, "ok");
    assert.equal((await call("/status/" + next)).body.status, "pending", "waits behind the stuck one");
    const t0 = Date.now();
    assert.deepEqual(await call("/render/" + stuck, undefined, "DELETE"), { status: 200, body: { status: "cancelled" } });
    const done = await settle(call, next);
    assert.equal(done.status, "done", JSON.stringify(done));
    assert.ok(Date.now() - t0 < 10000, "the next job started on the cancel, not at the time limit");
    assert.equal((await call("/status/" + stuck)).body.status, "cancelled", "a cancelled job is never closed as an error");
    assert.deepEqual((await call("/render/" + stuck, undefined, "DELETE")).body, { status: "cancelled" }, "a repeat is harmless");
    assert.equal((await call("/render/no-such-job", undefined, "DELETE")).status, 404);
  } finally {
    server.close();
  }
});

test("after a restart, a job that was rendering reads as failed, not 404 or pending", async () => {
  const file = path.join(tmp(), "jobs.json");
  const before = new JobStore(file);
  before.create("job-1");
  before.update("job-1", { status: "rendering" });
  before.create("job-2");
  before.update("job-2", { status: "done", url: "https://r2.invalid/2.mp4" });

  const after = new JobStore(file); // new process, same file
  assert.equal(after.load(), 1);
  const { server, call } = await service(after);
  try {
    const r = await call("/status/job-1");
    assert.equal(r.status, 200);
    assert.deepEqual([r.body.status, r.body.error], ["error", INTERRUPTED_ERROR]);
    assert.equal((await call("/status/job-2")).body.status, "done");
  } finally {
    server.close();
  }
});

// R1: the cover is one JPEG frame (renderStill), uploaded as .jpg; bad cover props are refused before a job exists.
test("a cover renders as one JPEG still; a cover without a picture or title is refused", async () => {
  const { server, call } = await service(new JobStore(null));
  try {
    process.env.FAKE_RENDER_MODE = "ok";
    const frame = "data:image/jpeg;base64,/9j/4AAQ";
    const r = await call("/render", { templateId: "cover", props: { backgroundUrl: frame, title: "封面" }, outputFormat: "9x16", fps: 30, durationInFrames: 1 });
    assert.equal(r.status, 200);
    const done = await settle(call, r.body.jobId);
    assert.equal(done.status, "done", JSON.stringify(done));
    assert.match(done.url, /\.jpg$/);
    for (const props of [{ title: "封面" }, { backgroundUrl: "https://example.com/a.jpg", title: "封面" }, { backgroundUrl: frame, title: " " }, { backgroundUrl: frame, title: "x".repeat(201) }]) {
      const bad = await call("/render", { templateId: "cover", props, outputFormat: "16x9" });
      assert.equal(bad.status, 400, JSON.stringify(props));
    }
    assert.equal((await call("/render", { templateId: "cover", props: null, outputFormat: "16x9" })).status, 400, "null props: 400, not 500");
  } finally {
    server.close();
  }
});

// R3: a ready picture as the opener (still-opener): the cover's picture rules, and no title or subtitle at all.
test("a still opener renders as an mp4 with the picture only; a title or a non-data picture is refused", async () => {
  const { server, call } = await service(new JobStore(null));
  try {
    process.env.FAKE_RENDER_MODE = "ok";
    const frame = "data:image/png;base64,iVBORw0KGgo=";
    const r = await call("/render", { templateId: "still-opener", props: { backgroundUrl: frame }, outputFormat: "4x5", fps: 30, durationInFrames: 60 });
    assert.equal(r.status, 200);
    assert.match((await settle(call, r.body.jobId)).url, /\.mp4$/);
    for (const props of [{ backgroundUrl: frame, title: "字" }, { backgroundUrl: frame, subtitle: "副" }, { backgroundUrl: "https://example.com/a.png" }])
      assert.equal((await call("/render", { templateId: "still-opener", props, outputFormat: "16x9", fps: 30, durationInFrames: 60 })).status, 400, JSON.stringify(props));
  } finally {
    server.close();
  }
});

// R2: the cover opener is a short mp4 with the cover's props; the same picture/title rules, and at most 10 seconds.
test("a cover opener renders as an mp4; bad cover props or more than 10 s are refused", async () => {
  const { server, call } = await service(new JobStore(null));
  try {
    process.env.FAKE_RENDER_MODE = "ok";
    const frame = "data:image/jpeg;base64,/9j/4AAQ";
    const r = await call("/render", { templateId: "cover-opener", props: { backgroundUrl: frame, title: "開場" }, outputFormat: "16x9", fps: 30, durationInFrames: 60 });
    assert.equal(r.status, 200);
    const done = await settle(call, r.body.jobId);
    assert.equal(done.status, "done", JSON.stringify(done));
    assert.match(done.url, /\.mp4$/);
    assert.equal((await call("/render", { templateId: "cover-opener", props: { backgroundUrl: "https://example.com/a.jpg", title: "開場" }, outputFormat: "16x9", fps: 30, durationInFrames: 60 })).status, 400);
    assert.equal((await call("/render", { templateId: "cover-opener", props: { backgroundUrl: frame, title: "開場" }, outputFormat: "16x9", fps: 30, durationInFrames: 301 })).status, 400);
  } finally {
    server.close();
  }
});

test("container limits come from the cgroup, and 1 GiB rules out parallel encoding at 1080p", () => {
  const v2 = tmp();
  fs.writeFileSync(path.join(v2, "cpu.max"), "200000 100000\n");
  fs.writeFileSync(path.join(v2, "memory.max"), "1073741824\n");
  assert.equal(cgroupCpuLimit(v2), 2);
  assert.equal(cgroupMemoryLimit(v2), 1073741824);
  const unlimited = tmp();
  fs.writeFileSync(path.join(unlimited, "cpu.max"), "max 100000\n");
  fs.writeFileSync(path.join(unlimited, "memory.max"), "max\n");
  assert.equal(cgroupCpuLimit(unlimited), null);
  assert.equal(cgroupMemoryLimit(unlimited), null);
  assert.equal(allowParallelEncoding(1920, 1080, 1073741824), false);
  assert.equal(allowParallelEncoding(1920, 1080, null), undefined);
});
