import { describe, expect, it, vi, beforeEach } from "vitest";

const getSchedule = vi.hoisted(() => vi.fn());
const upsertSchedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collect/schedule-store", () => ({ getSchedule, upsertSchedule }));

const ORG = "11111111-1111-4111-8111-111111111111";
const sb = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { id: ORG }, error: null }) }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { GET, PATCH } = await import("./route");

function ctx() {
  return { params: Promise.resolve({ slug: "acme" }) };
}
function req(method: string, opts: { role?: string; body?: unknown } = {}): Request {
  return new Request("http://localhost/api/ops/clients/acme/collection-schedule", {
    method,
    headers: { "content-type": "application/json", ...(opts.role ? { "x-ops-claims-role": opts.role } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("GET /api/ops/clients/[slug]/collection-schedule", () => {
  it("reads as disabled (never 'unconfigured') when no row exists yet", async () => {
    getSchedule.mockResolvedValue(null);
    const res = await GET(req("GET"), ctx());
    const body = await res.json();
    expect(body.schedule.enabled).toBe(false);
  });

  it("returns the stored row when one exists", async () => {
    getSchedule.mockResolvedValue({ organizationId: ORG, enabled: true, frequency: "daily", hourUtc: 5, dayOfWeekUtc: 1, lastRunAt: null, lastRunKey: null, updatedBy: "owner:x" });
    const res = await GET(req("GET"), ctx());
    const body = await res.json();
    expect(body.schedule).toMatchObject({ enabled: true, frequency: "daily", hourUtc: 5 });
  });
});

describe("PATCH /api/ops/clients/[slug]/collection-schedule", () => {
  it("rejects a viewer/operator role — only owner/admin may change automation config", async () => {
    const res = await PATCH(req("PATCH", { role: "operator", body: { enabled: true } }), ctx());
    expect(res.status).toBe(403);
    expect(upsertSchedule).not.toHaveBeenCalled();
  });

  it("allows an admin to turn scheduling on", async () => {
    upsertSchedule.mockResolvedValue({ ok: true, schedule: { organizationId: ORG, enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 } });
    const res = await PATCH(req("PATCH", { role: "admin", body: { enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 } }), ctx());
    expect(res.status).toBe(200);
    expect(upsertSchedule).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, enabled: true, updatedBy: "admin:claims" }));
  });

  it("surfaces a validation failure from the store instead of a bare 200", async () => {
    upsertSchedule.mockResolvedValue({ ok: false, errors: ["hour_utc_out_of_range"] });
    const res = await PATCH(req("PATCH", { role: "owner", body: { enabled: true, hourUtc: 99 } }), ctx());
    expect(res.status).toBe(400);
  });
});
