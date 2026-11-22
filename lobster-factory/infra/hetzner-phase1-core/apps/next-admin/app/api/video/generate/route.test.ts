// POST /api/video/generate (K5): a chain asked by the operator is answered 202 + X-Codex-Job and starts detached; the
// poll must end on a 200 { ok, jobId } (codex-wait.js reads every 202 as "still running"). Without a chain: 202 as before.
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ actor: "ops:owner:u-owner", started: [] as unknown[] }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (_k: string, h: (r: Request, g: unknown, c: unknown) => Promise<Response>) => (r: Request, c: unknown) => h(r, { actor: m.actor }, c),
}));
vi.mock("@/lib/entitlements/subject", () => ({ requestActor: () => m.actor }));
vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));
vi.mock("@/lib/tenant-guard", () => ({ effectiveOrgId: () => "org1", OrgAccessError: class extends Error {}, toOrgAccessResponse: () => new Response(null, { status: 403 }) }));
vi.mock("@/lib/content/blocks/video-pipeline", () => ({ resolveOrgId: () => "org1" }));
vi.mock("@/lib/content/brand-voice-store", () => ({ siteVoiceFor: async () => "" }));
vi.mock("@/lib/content/video/start", () => ({ startVideoJob: async (_o: unknown, input: unknown) => { m.started.push(input); return { ok: true, jobId: "job-1" }; } }));

const { POST } = await import("./route");
const { GET } = await import("../../tools/codex-laptop/jobs/[id]/route");
const { CODEX_JOB_HEADER, resetCodexBridgeForTests } = await import("@/lib/tarot/codex-bridge");

const post = (extra: object = {}) => POST(new Request("https://app.aware-wave.com/api/video/generate", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic: "t", ...extra }),
}) as never);
const poll = (id: string) => GET(new Request("https://app.aware-wave.com/x"), { params: Promise.resolve({ id }) });

beforeEach(() => { m.actor = "ops:owner:u-owner"; m.started = []; vi.stubEnv("CODEX_IMAGE_OWNER_USER_ID", "u-owner"); resetCodexBridgeForTests(); });

describe("POST /api/video/generate", () => {
  it("no chain: 202 { ok, jobId } in the request, as before", async () => {
    const res = await post();
    expect(res.status).toBe(202);
    expect(res.headers.get(CODEX_JOB_HEADER)).toBeNull();
    expect(await res.json()).toEqual({ ok: true, jobId: "job-1" });
  });
  it("the operator's chain: 202 + job header, then the poll ends on 200 { ok, jobId }", async () => {
    const res = await post({ chain: "claude+api", claudeModel: "sub-claude-haiku" });
    expect(res.status).toBe(202);
    const id = res.headers.get(CODEX_JOB_HEADER)!;
    expect(id).toBeTruthy();
    let r = await poll(id);
    for (let i = 0; r.status === 202 && i < 50; i++) { await new Promise((ok) => setTimeout(ok, 5)); r = await poll(id); }
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, jobId: "job-1" });
    expect(m.started[0]).toMatchObject({ chain: "claude+api", claudeModel: "sub-claude-haiku" });
  });
  it("a chain sent by someone else is not deferred", async () => {
    m.actor = "ops:staff:u-staff";
    const res = await post({ chain: "claude+api" });
    expect(res.status).toBe(202);
    expect(res.headers.get(CODEX_JOB_HEADER)).toBeNull();
    expect(await res.json()).toEqual({ ok: true, jobId: "job-1" });
  });
});
