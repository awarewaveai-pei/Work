// Subscription text jobs (PLAN I2 I7): the lane is the secret's (neither lane takes or answers the other's jobs), a
// worker only gets tools it said it runs (an old worker with no tools list: pictures only), and a spent allowance is a
// state of the plan that blocks one tool for pictures and text alike.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimJob, completeJob, resetCodexBridgeForTests, runOnLaptop, runSubJob, RUN_LEASE_MS, workerOnline, type SubTextJobInput } from "../codex-bridge";
import { workerLane } from "@/app/api/internal/codex-images/worker-auth";
import { POST as claim } from "@/app/api/internal/codex-images/claim/route";
import { POST as complete } from "@/app/api/internal/codex-images/complete/route";

const OWNER_SECRET = "owner-secret-123";
const HOST_SECRET = "host-secret-456";
const signal = () => new AbortController().signal;
const text = (over: Partial<SubTextJobInput> = {}): SubTextJobInput =>
  ({ tool: "codex", lane: "owner", cliModel: null, system: "s", prompt: "p", ...over });
const post = (route: (r: Request) => Promise<Response>, secret: string, body: unknown) =>
  route(new Request("http://x/api/internal/codex-images", {
    method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify(body),
  }));
const claimed = async (secret: string, tools?: string[]) =>
  ((await (await post(claim, secret, { waitMs: 0, ...(tools ? { tools } : {}) })).json()) as { job: { id: string; kind: string } | null }).job;
const pending = <T>(p: Promise<T>) => Promise.race([p, new Promise((r) => setTimeout(() => r("queued"), 0))]);

beforeEach(() => {
  resetCodexBridgeForTests();
  vi.stubEnv("CODEX_WORKER_SECRET", OWNER_SECRET);
  vi.stubEnv("SUB_WORKER_HOST_SECRET", HOST_SECRET);
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

describe("lane = the secret that authenticated", () => {
  it("the host secret never gets an owner-lane job, the owner secret never a schedule-lane job", async () => {
    await claimed(OWNER_SECRET, ["codex"]);
    await claimed(HOST_SECRET, ["codex"]);
    const ownerJob = runSubJob(text({ lane: "owner" }), signal());
    expect(await claimed(HOST_SECRET, ["codex"])).toBeNull();
    const o = await claimed(OWNER_SECRET, ["codex"]);
    expect(o).toMatchObject({ kind: "text", tool: "codex" });

    const hostJob = runSubJob(text({ lane: "schedule" }), signal());
    expect(await claimed(OWNER_SECRET, ["codex"])).toBeNull();
    const h = await claimed(HOST_SECRET, ["codex"]);
    expect(h).toMatchObject({ kind: "text", tool: "codex" });

    // Nor can a worker answer the other lane's job.
    expect((await post(complete, HOST_SECRET, { id: o!.id, text: "x" })).status).toBe(404);
    expect((await post(complete, OWNER_SECRET, { id: o!.id, text: "owner answer" })).status).toBe(200);
    expect((await post(complete, HOST_SECRET, { id: h!.id, text: "host answer" })).status).toBe(200);
    await expect(ownerJob).resolves.toMatchObject({ ok: true, text: "owner answer" });
    await expect(hostJob).resolves.toMatchObject({ ok: true, text: "host answer" });
  });

  it("same value for both secrets = owner; an unset host secret lets no empty token through", () => {
    const req = (auth: string) => new Request("http://x", { headers: { authorization: auth } });
    expect(workerLane(req("Bearer same"), { CODEX_WORKER_SECRET: "same", SUB_WORKER_HOST_SECRET: "same" })).toBe("owner");
    expect(workerLane(req("Bearer "), { CODEX_WORKER_SECRET: "x" })).toBeNull();
    expect(workerLane(req("Bearer  "), { CODEX_WORKER_SECRET: "x", SUB_WORKER_HOST_SECRET: "  " })).toBeNull();
    expect(workerLane(req("Bearer anything"), { CODEX_WORKER_SECRET: "x" })).toBeNull();
  });
});

describe("a worker gets only the tools it runs", () => {
  it("a claude job waits while the worker reports codex only, and new claude jobs fail fast", async () => {
    await claimed(OWNER_SECRET, ["codex", "claude"]);
    const waiting = runSubJob(text({ tool: "claude" }), signal());
    expect(await claimed(OWNER_SECRET, ["codex"])).toBeNull(); // left in the queue
    expect(await pending(waiting)).toBe("queued");
    await expect(runSubJob(text({ tool: "claude" }), signal())).resolves.toEqual({ ok: false, error: "sub_worker_offline" });
    expect(await claimed(OWNER_SECRET, ["codex", "claude"])).toMatchObject({ kind: "text", tool: "claude" });
  });
});

describe("I7: a spent text allowance blocks that tool, not the worker", () => {
  it("fails queued same-tool jobs, answers new ones at once, leaves the other tool alone, and lifts at reset", async () => {
    vi.useFakeTimers();
    await claimJob(0, "owner", ["codex", "claude"]);
    const first = runSubJob(text(), signal());
    const job = await claimJob(0, "owner", ["codex", "claude"]);
    const queuedCodex = runSubJob(text(), signal());
    const queuedClaude = runSubJob(text({ tool: "claude" }), signal());
    const resetsAt = Date.now() + 60_000;
    expect(completeJob(job!.id, { ok: false, error: "sub_quota_exhausted", quotaResetsAt: resetsAt }, "owner")).toBe(true);

    await expect(first).resolves.toEqual({ ok: false, error: "sub_quota_exhausted", quotaResetsAt: resetsAt });
    await expect(queuedCodex).resolves.toEqual({ ok: false, error: "sub_quota_exhausted", quotaResetsAt: resetsAt });
    await expect(runSubJob(text(), signal())).resolves.toEqual({ ok: false, error: "sub_quota_exhausted", quotaResetsAt: resetsAt });
    expect(workerOnline("owner", "codex")).toBe(true);
    expect(await claimJob(0, "owner", ["codex", "claude"])).toMatchObject({ tool: "claude" }); // the other tool runs on
    expect(await Promise.race([queuedClaude, Promise.resolve("running")])).toBe("running");

    await vi.advanceTimersByTimeAsync(61_000);
    await claimJob(0, "owner", ["codex", "claude"]); // still polling
    const afterReset = runSubJob(text(), signal());
    expect(await claimJob(0, "owner", ["codex", "claude"])).toMatchObject({ kind: "text", tool: "codex" });
    expect(await Promise.race([afterReset, Promise.resolve("running")])).toBe("running");
  });
});

describe("an old picture-only worker (claim without a tools list)", () => {
  it("gets pictures but never a text job, and text callers hear it is offline", async () => {
    await claimed(OWNER_SECRET, ["codex"]);
    const queuedText = runSubJob(text(), signal());
    expect(await claimed(OWNER_SECRET)).toBeNull(); // old worker: the text job stays queued
    expect(await pending(queuedText)).toBe("queued");
    await expect(runSubJob(text(), signal())).resolves.toEqual({ ok: false, error: "sub_worker_offline" });
    void runOnLaptop({ prompt: "a lantern", aspectRatio: "1:1", refs: [] }, signal());
    expect(await claimed(OWNER_SECRET)).toMatchObject({ kind: "image" });
  });
});

describe("one plan, one allowance: pictures and text share the Codex block", () => {
  it("a spent text allowance answers pictures codex_quota_exhausted at once", async () => {
    await claimJob(0, "owner", ["codex"]);
    void runSubJob(text(), signal());
    const job = await claimJob(0, "owner", ["codex"]);
    completeJob(job!.id, { ok: false, error: "sub_quota_exhausted", quotaResetsAt: Date.now() + 60_000 }, "owner");
    await expect(runOnLaptop({ prompt: "p", aspectRatio: "2:3", refs: [] }, signal())).resolves.toEqual({ ok: false, error: "codex_quota_exhausted" });
  });

  it("a spent picture allowance answers queued and new codex text sub_quota_exhausted", async () => {
    await claimJob(0, "owner", ["codex"]);
    void runOnLaptop({ prompt: "p", aspectRatio: "2:3", refs: [] }, signal());
    const job = await claimJob(0, "owner", ["codex"]);
    const queuedText = runSubJob(text(), signal());
    completeJob(job!.id, { ok: false, error: "codex_quota_exhausted" }, "owner");
    await expect(queuedText).resolves.toMatchObject({ ok: false, error: "sub_quota_exhausted" });
    await claimJob(0, "owner", ["codex"]); // a new worker polls on after the picture error
    await expect(runSubJob(text(), signal())).resolves.toMatchObject({ ok: false, error: "sub_quota_exhausted" });
  });

  it("a text allowance reported after the job's lease ran out still blocks the tool the worker names", async () => {
    vi.useFakeTimers();
    await claimJob(0, "owner", ["claude"]);
    void runSubJob(text({ tool: "claude" }), signal());
    const job = await claimJob(0, "owner", ["claude"]);
    await vi.advanceTimersByTimeAsync(RUN_LEASE_MS + 1);
    expect((await post(complete, OWNER_SECRET, { id: job!.id, error: "sub_quota_exhausted", tool: "claude" })).status).toBe(404);
    await claimJob(0, "owner", ["claude"]);
    await expect(runSubJob(text({ tool: "claude" }), signal())).resolves.toMatchObject({ ok: false, error: "sub_quota_exhausted" });
  });
});
