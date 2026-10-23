import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BASE = "https://pub-a88b06f569bd41a3b9e27e29644d520e.r2.dev";
const JOB = "c8fbba27-61dc-4b2b-b344-3ecb0b89c658";
const m = vi.hoisted(() => ({ getJob: vi.fn() }));

vi.mock("@/lib/ops-role", () => ({
  resolveOpsRole: (req: Request) => ({ role: req.headers.get("x-ops-claims-role") ?? "viewer" }),
  canCreateAiImageJob: (role: string) => role === "operator",
}));
vi.mock("@/lib/tarot/batch-store", () => ({ getJob: m.getJob, BatchStoreUnavailableError: class extends Error {} }));
vi.mock("@/lib/tenant-guard", () => ({
  assertOrgAccess: () => undefined,
  OrgAccessError: class extends Error {},
  toOrgAccessResponse: () => new Response(null, { status: 403 }),
}));

import { GET } from "./route";

const call = (index: string, role = "operator") =>
  GET(new Request(`http://localhost/api/tools/tarot/batch/${JOB}/image/${index}`, { headers: { "x-ops-claims-role": role } }),
    { params: Promise.resolve({ jobId: JOB, index }) });

describe("GET /api/tools/tarot/batch/[jobId]/image/[index]", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv("R2_DESIGNS_PUBLIC_BASE", "");
    vi.stubGlobal("fetch", fetchMock.mockReset().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } })));
    m.getJob.mockReset().mockResolvedValue({
      organizationId: null,
      results: [
        { cardIndex: 0, cardName: "THE FOOL", url: `${BASE}/tarot-batch/${JOB}/000.png` },
        { cardIndex: 1, cardName: "THE MAGICIAN", url: "https://evil.example/x.png" },
      ],
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("serves the recorded card image from this origin", async () => {
    const res = await call("0");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith(`${BASE}/tarot-batch/${JOB}/000.png`, expect.anything());
  });

  it("refuses an image over the cap while reading, without buffering the rest", async () => {
    let pulled = 0;
    const big = new ReadableStream<Uint8Array>({
      pull(c) { pulled++; c.enqueue(new Uint8Array(8 * 1024 * 1024)); },
    });
    fetchMock.mockResolvedValue(new Response(big, { headers: { "content-type": "image/png" } }));
    const res = await call("0");
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "image_too_large" });
    expect(pulled).toBeLessThan(6);
  });

  it("fetches nothing outside our designs bucket, for an unknown card, or for a viewer", async () => {
    expect((await call("1")).status).toBe(404);
    expect((await call("7")).status).toBe(404);
    expect((await call("0", "viewer")).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
