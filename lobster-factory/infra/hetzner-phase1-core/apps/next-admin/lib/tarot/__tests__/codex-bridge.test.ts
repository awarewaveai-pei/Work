// Codex pictures run on the operator's own plan: only she may queue one, the laptop's answer reaches the caller, and a
// laptop that is off fails fast instead of holding the request for 4 minutes.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { claimJob, codexAllowed, completeJob, resetCodexBridgeForTests, runOnLaptop, workerLeft, workerOnline } from "../codex-bridge";

vi.mock("@/lib/ai/gateway", () => ({ providerUrl: () => "https://unused.invalid" }));
const logged = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/ai/log-ai-call", () => ({
  logImageResult: (_r: unknown, args: Record<string, unknown>) => { logged.push(args); },
  holdCost: async () => ({ id: "hold-1", units: 0, settle: async () => ({ charged: 0, shortfall: 0 }) }),
}));

const OWNER = "11111111-2222-3333-4444-555555555555";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => { resetCodexBridgeForTests(); vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER); });
afterEach(() => { vi.unstubAllEnvs(); });

describe("codexAllowed", () => {
  it("lets only the operator acting herself through", () => {
    expect(codexAllowed(`ops:owner:${OWNER}`)).toBe(true);
    expect(codexAllowed(`ops:staff:99999999-2222-3333-4444-555555555555`)).toBe(false);
    expect(codexAllowed(`client:org-1:${OWNER}`)).toBe(false);
    expect(codexAllowed("ops:owner")).toBe(false);
  });
  it("lets nobody through when the owner id is unset", () => {
    vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "");
    expect(codexAllowed(`ops:owner:${OWNER}`)).toBe(false);
  });
});

describe("laptop queue", () => {
  it("fails fast when no worker has polled", async () => {
    await expect(runOnLaptop({ prompt: "p", aspectRatio: "2:3", refs: [] }, new AbortController().signal))
      .resolves.toEqual({ ok: false, error: "codex_worker_offline" });
  });

  it("hands the worker's picture to the waiting caller", async () => {
    await claimJob(0); // worker online, nothing queued
    const waiting = runOnLaptop({ prompt: "a lantern", aspectRatio: "1:1", refs: [] }, new AbortController().signal);
    const job = await claimJob(0);
    expect(job).toMatchObject({ prompt: "a lantern", aspectRatio: "1:1" });
    expect(completeJob(job!.id, { ok: true, image: PNG })).toBe(true);
    await expect(waiting).resolves.toEqual({ ok: true, image: PNG });
    expect(completeJob(job!.id, { ok: true, image: PNG })).toBe(false); // answered once
  });

  it("counts a worker busy drawing (no poll for over 45 s) as online", async () => {
    const t0 = Date.now();
    await claimJob(0, () => t0);
    void runOnLaptop({ prompt: "first", aspectRatio: "2:3", refs: [] }, new AbortController().signal, t0);
    expect(await claimJob(0, () => t0)).toMatchObject({ prompt: "first" }); // now drawing, not polling
    const second = runOnLaptop({ prompt: "second", aspectRatio: "2:3", refs: [] }, new AbortController().signal, t0 + 60_000);
    const raced = await Promise.race([second, new Promise((r) => setTimeout(() => r("queued"), 20))]);
    expect(raced).toBe("queued");
  });

  it("does not hand out a job too late to draw in time; its caller hears so at once", async () => {
    const t0 = Date.now();
    await claimJob(0, () => t0);
    const late = runOnLaptop({ prompt: "late", aspectRatio: "2:3", refs: [] }, new AbortController().signal, t0);
    expect(await claimJob(0, () => t0 + 50_000)).toBeNull(); // 40 s left < 45 s minimum
    await expect(late).resolves.toEqual({ ok: false, error: "codex_worker_busy" });
  });

  it("is offline at once after the worker reports a spent allowance (it exits)", async () => {
    await claimJob(0);
    void runOnLaptop({ prompt: "p", aspectRatio: "2:3", refs: [] }, new AbortController().signal);
    const job = await claimJob(0);
    const queued = runOnLaptop({ prompt: "queued", aspectRatio: "2:3", refs: [] }, new AbortController().signal);
    completeJob(job!.id, { ok: false, error: "codex_quota_exhausted" });
    await expect(queued).resolves.toEqual({ ok: false, error: "codex_quota_exhausted" }); // not after its own 90 s
    await expect(runOnLaptop({ prompt: "next", aspectRatio: "2:3", refs: [] }, new AbortController().signal))
      .resolves.toEqual({ ok: false, error: "codex_worker_offline" });
  });

  it("empties the queue on a spent allowance even when that job's caller already timed out", async () => {
    await claimJob(0);
    const ctl = new AbortController();
    void runOnLaptop({ prompt: "first", aspectRatio: "2:3", refs: [] }, ctl.signal);
    const first = await claimJob(0);
    expect(first!.timeLeftMs).toBeGreaterThan(80_000); // the worker stops drawing after this
    const queued = runOnLaptop({ prompt: "queued", aspectRatio: "2:3", refs: [] }, new AbortController().signal);
    ctl.abort(); // first caller gave up
    expect(completeJob(first!.id, { ok: false, error: "codex_quota_exhausted" })).toBe(false); // 404 to the worker
    await expect(queued).resolves.toEqual({ ok: false, error: "codex_quota_exhausted" });
  });

  it("drops a job whose caller gave up", async () => {
    await claimJob(0);
    const ctl = new AbortController();
    const waiting = runOnLaptop({ prompt: "p", aspectRatio: "2:3", refs: [] }, ctl.signal);
    ctl.abort();
    await expect(waiting).resolves.toEqual({ ok: false, error: "generation_timeout" });
    expect(await claimJob(0)).toBeNull();
  });
});

describe("generateTarotImage codex-image", () => {
  const grant = (actor: string) => ({ actor, subject: { orgId: "org-1", kind: "internal" } }) as never;

  it("refuses anyone but the operator before anything is queued", async () => {
    const { generateTarotImage } = await import("../image-gen");
    await claimJob(0);
    const r = await generateTarotImage({ model: "codex-image", prompt: "p" }, grant("ops:staff:someone-else"));
    expect(r).toEqual({ ok: false, error: "codex_operator_only" });
    expect(await claimJob(0)).toBeNull();
  });

  it("returns the operator's picture at no cost, and writes Codex's quota reading to the ledger row", async () => {
    const { generateTarotImage } = await import("../image-gen");
    await claimJob(0);
    const pending = generateTarotImage({ model: "codex-image", prompt: "p", aspectRatio: "2:3" }, grant(`ops:owner:${OWNER}`));
    let job = null;
    for (let i = 0; i < 50 && !job; i++) { job = await claimJob(0); if (!job) await new Promise((r) => setTimeout(r, 5)); }
    expect(job).not.toBeNull();
    logged.length = 0;
    completeJob(job!.id, { ok: true, image: PNG, usage: { codex_input_tokens: 34653, codex_5h_used_pct: 50, codex_week_used_pct: 37 } });
    await expect(pending).resolves.toMatchObject({ ok: true, image: PNG, seed: null, costUsd: 0 });
    expect(logged.at(-1)).toMatchObject({ model: "codex-image", metadata: { codex_input_tokens: 34653, codex_5h_used_pct: 50, codex_week_used_pct: 37, free: true } });
  });
});

describe("worker stopping on its own", () => {
  it("is offline at once and fails what was queued since its last claim", async () => {
    await claimJob(0);
    const pending = runOnLaptop({ prompt: "a cat", aspectRatio: "1:1", refs: [] }, new AbortController().signal);
    workerLeft();
    expect(workerOnline()).toBe(false);
    await expect(pending).resolves.toEqual({ ok: false, error: "codex_worker_offline" });
  });
});
