// Route layer, end to end in one process: the browser helper (public/editor-shared/codex-wait.js) posts to the real
// /api/tools/studio/generate, gets 202 at once, polls this route while the laptop takes 120 s, and ends with the picture.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai/gateway", () => ({ providerUrl: () => "https://unused.invalid" }));
const logged = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/lib/ai/log-ai-call", () => ({
  logImageResult: (_r: unknown, args: Record<string, unknown>) => { logged.push(args); },
  holdCost: async () => ({ id: "hold-1", units: 0, settle: async () => ({ charged: 0, shortfall: 0 }) }),
}));
vi.mock("@/lib/entitlements/grant", async () => {
  const { requestActor } = await import("@/lib/entitlements/subject");
  return { withFeature: (_k: string, h: (r: Request, g: unknown) => Promise<Response>) => (r: Request) => h(r, { actor: requestActor(r), subject: { kind: "internal" } }) };
});

import { POST as generate } from "../../../studio/generate/route";
import { GET as poll } from "./route";
import { claimJob, completeJob, resetCodexBridgeForTests } from "@/lib/tarot/codex-bridge";
import { CODEX_JOBS_URL, fetchAwaitingCodex } from "@/lib/studio/codex-wait";

const OWNER = "11111111-2222-3333-4444-555555555555";
const PNG = "data:image/png;base64,iVBORw0KGgo=";
const as = (userId: string) => ({ "x-ops-claims-role": "owner", "x-ops-user-id": userId });

/** What the browser's fetch reaches: the two real route handlers. */
const app = (url: string, init?: RequestInit): Promise<Response> => {
  const req = new Request(`http://localhost${url}`, init);
  if (url === "/api/tools/studio/generate") return generate(req);
  if (url.startsWith(CODEX_JOBS_URL)) return poll(req, { params: Promise.resolve({ id: decodeURIComponent(url.slice(CODEX_JOBS_URL.length)) }) });
  throw new Error(`unexpected ${url}`);
};
const body = JSON.stringify({ model: "codex-image", prompt: "a lantern on a table", aspectRatio: "2:3" });

beforeEach(() => {
  resetCodexBridgeForTests();
  logged.length = 0;
  vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER);
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

async function laptopTakesJob() {
  for (let i = 0; i < 50; i++) {
    const job = await claimJob(0);
    if (job) return job;
    await vi.advanceTimersByTimeAsync(1);
  }
  throw new Error("no job queued");
}

describe("Codex through the route layer", () => {
  it("a 120 s picture: generate answers 202 at once, the poll ends with the route's own response, logged once", async () => {
    await claimJob(0); // laptop online
    const done = fetchAwaitingCodex("/api/tools/studio/generate", { method: "POST", headers: { "content-type": "application/json", ...as(OWNER) }, body }, { fetch: app, pollMs: 3000 });
    const job = await laptopTakesJob();
    expect(job).toMatchObject({ prompt: "a lantern on a table", aspectRatio: "2:3" });
    await vi.advanceTimersByTimeAsync(120_000); // ~40 polls answered 202
    completeJob(job.id, { ok: true, image: PNG });
    await vi.advanceTimersByTimeAsync(3000);
    const res = await done;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, image: PNG, costUsd: 0 });
    expect(logged.filter((l) => l.model === "codex-image")).toHaveLength(1);
  });

  it("another staff member cannot take the owner's job; the owner still can", async () => {
    await claimJob(0);
    const first = await app("/api/tools/studio/generate", { method: "POST", headers: { "content-type": "application/json", ...as(OWNER) }, body });
    expect(first.status).toBe(202);
    const id = first.headers.get("X-Codex-Job")!;
    completeJob((await laptopTakesJob()).id, { ok: true, image: PNG });
    await vi.advanceTimersByTimeAsync(1);
    // Same owner id configured for a second person would be refused by codexAllowed; a job id from another actor is unknown.
    vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "99999999-2222-3333-4444-555555555555");
    const stranger = await app(CODEX_JOBS_URL + id, { headers: as("99999999-2222-3333-4444-555555555555") });
    expect(await stranger.json()).toMatchObject({ ok: false, code: "codex_job_gone" });
    vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", OWNER);
    const mine = await app(CODEX_JOBS_URL + id, { headers: as(OWNER) });
    expect(await mine.json()).toMatchObject({ ok: true, image: PNG });
  });
});
