/**
 * Invariant (migration 0115): tarot batch progress is rows keyed (job_id, card_index), not process memory.
 * One test per defect it closed, plus the list visibility guard.
 */
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeBatchDb } from "./fake-batch-db";

const h = vi.hoisted(() => ({ client: null as unknown, gen: vi.fn() }));

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => h.client }));
vi.mock("@/lib/tarot/image-gen", async (orig) => ({
  ...(await orig<typeof import("@/lib/tarot/image-gen")>()),
  generateTarotImage: h.gen,
}));
vi.mock("@/lib/entitlements/grant", () => ({ grantFor: async () => ({}) }));
vi.mock("@/lib/storage/r2", async (orig) => ({
  ...(await orig<typeof import("@/lib/storage/r2")>()),
  isR2Configured: () => true,
  putDesignObject: async (key: string) => ({ ok: true, publicUrl: `https://r2.test/${key}` }),
}));

const SECRET = "batch-secret-for-test";
const ORG_A = "00000000-0000-4000-8000-00000000000a";
const ORG_B = "00000000-0000-4000-8000-00000000000b";
const PNG = `data:image/png;base64,${Buffer.from("png").toString("base64")}`;

async function routes() {
  const store = await import("@/lib/tarot/batch-store");
  const { POST: card } = await import("@/app/api/internal/tarot/batch/[jobId]/card/route");
  const { POST: start } = await import("@/app/api/internal/tarot/batch/[jobId]/start/route");
  const { GET: status } = await import("@/app/api/tools/tarot/batch/[jobId]/route");
  const { GET: list } = await import("@/app/api/tools/tarot/batch/route");
  return { store, card, start, status, list };
}

const internal = (jobId: string, body: unknown) => [
  new Request(`http://next-admin/api/internal/tarot/batch/${jobId}/card`, {
    method: "POST", headers: { authorization: `Bearer ${SECRET}` }, body: JSON.stringify(body),
  }),
  { params: Promise.resolve({ jobId }) },
] as const;

const staffGet = (jobId: string) => [
  new Request(`http://next-admin/api/tools/tarot/batch/${jobId}`, { headers: { "x-ops-claims-role": "operator" } }),
  { params: Promise.resolve({ jobId }) },
] as const;

const card0 = { cardIndex: 0, cardName: "The Fool", prompt: "a fool", model: "flux-schnell", aspectRatio: "2:3" };

beforeEach(() => {
  h.client = createFakeBatchDb().client;
  h.gen.mockReset();
  h.gen.mockResolvedValue({ ok: true, image: PNG, seed: null });
  process.env.BATCH_INTERNAL_SECRET = SECRET;
});

describe("tarot batch store: rows, not memory", () => {
  it("a retried card callback neither double-counts nor regenerates", async () => {
    const { store, card, start, status } = await routes();
    const jobId = randomUUID();
    await store.createJob({ jobId, organizationId: ORG_A, createdBy: null, model: "flux-schnell", aspectRatio: "2:3", totalCards: 3 });
    expect((await start(new Request("http://x", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } }),
      { params: Promise.resolve({ jobId }) })).status).toBe(200);

    const first = await (await card(...internal(jobId, card0))).json();
    const retry = await (await card(...internal(jobId, card0))).json();

    expect(first.ok).toBe(true);
    expect(retry).toMatchObject({ ok: true, url: first.url, reused: true });
    expect(h.gen).toHaveBeenCalledTimes(1);
    const { job } = await (await status(...staffGet(jobId))).json();
    expect(job).toMatchObject({ completedCards: 1, failedCards: 0, status: "running" });
    expect(job.results).toHaveLength(1);
  });

  it("a job past its deadline reports timed out, not running", async () => {
    const { store, status } = await routes();
    const jobId = randomUUID();
    const longAgo = Date.now() - store.RUN_BUDGET_MS - store.PENDING_BUDGET_MS - 60_000;
    await store.createJob({ jobId, organizationId: ORG_A, createdBy: null, model: "flux-schnell", aspectRatio: "2:3", totalCards: 78, now: longAgo });
    await store.markRunning(jobId, longAgo);

    const { job } = await (await status(...staffGet(jobId))).json();

    expect(job.state).toBe("timed_out");
    expect(job.status).toBe("error"); // the shipped browser stops polling on done/error
  });

  it("job state survives a fresh store instance (restart)", async () => {
    const before = await routes();
    const jobId = randomUUID();
    await before.store.createJob({ jobId, organizationId: ORG_A, createdBy: null, model: "flux-schnell", aspectRatio: "2:3", totalCards: 2 });
    await before.card(...internal(jobId, card0));

    vi.resetModules();
    const after = await routes();
    expect(after.store).not.toBe(before.store);
    const res = await after.status(...staffGet(jobId));

    expect(res.status).toBe(200);
    const { job } = await res.json();
    expect(job.completedCards).toBe(1);
    expect(job.results[0]).toMatchObject({ cardIndex: 0, cardName: "The Fool" });
  });

  it("the job list returns only the caller's organization's jobs", async () => {
    const { store, list } = await routes();
    const mine = randomUUID();
    const theirs = randomUUID();
    await store.createJob({ jobId: mine, organizationId: ORG_A, createdBy: null, model: "flux-schnell", aspectRatio: "2:3", totalCards: 1 });
    await store.createJob({ jobId: theirs, organizationId: ORG_B, createdBy: null, model: "flux-schnell", aspectRatio: "2:3", totalCards: 1 });

    const res = await list(new Request("http://next-admin/api/tools/tarot/batch", {
      headers: { "x-ops-claims-role": "operator", "x-ops-user-kind": "client", "x-ops-org-id": ORG_A },
    }));

    const { jobs } = await res.json();
    expect(jobs.map((j: { jobId: string }) => j.jobId)).toEqual([mine]);
  });
});
