import { describe, expect, it, vi, beforeEach } from "vitest";

const upsertSchedule = vi.hoisted(() => vi.fn());
const writeSiteWatchCell = vi.hoisted(() => vi.fn());
vi.mock("@/lib/schedules/store", () => ({ upsertSchedule }));
vi.mock("@/lib/schedules/jobs", () => ({
  clientJob: (key: string) =>
    key === "collect_crawl"
      ? { key, label: "自動爬取", frequencies: [{ value: "daily" }, { value: "weekly" }], defaults: { frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 } }
      : undefined,
}));
vi.mock("@/lib/schedules/adapters/site-watch", () => ({ SITE_WATCH_JOB: { key: "site_watch" }, writeSiteWatchCell }));

const ORG = "11111111-1111-4111-8111-111111111111";
const sb = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }) }) }),
    insert: () => Promise.resolve({ data: null, error: null }),
  })),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));

const { PATCH } = await import("./route");

const ctx = (job: string) => ({ params: Promise.resolve({ slug: "acme", job }) });
function req(opts: { role?: string; body?: unknown } = {}): Request {
  return new Request("http://localhost/api/ops/clients/acme/schedules/x", {
    method: "PATCH",
    headers: { "content-type": "application/json", ...(opts.role ? { "x-ops-claims-role": opts.role } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/ops/clients/[slug]/schedules/[job]", () => {
  it("rejects a viewer/operator role — only owner/admin may change automation config", async () => {
    const res = await PATCH(req({ role: "operator", body: { enabled: true, frequency: "daily" } }), ctx("collect_crawl"));
    expect(res.status).toBe(403);
    expect(upsertSchedule).not.toHaveBeenCalled();
    expect(writeSiteWatchCell).not.toHaveBeenCalled();
  });

  it("a job that is not in the registry is 404 — the page cannot invent a job", async () => {
    const res = await PATCH(req({ role: "admin", body: { enabled: true, frequency: "daily" } }), ctx("rm_rf"));
    expect(res.status).toBe(404);
    expect(upsertSchedule).not.toHaveBeenCalled();
  });

  it("a frequency the job does not offer is rejected before any write", async () => {
    const res = await PATCH(req({ role: "admin", body: { enabled: true, frequency: "hourly" } }), ctx("collect_crawl"));
    expect(res.status).toBe(400);
    expect(upsertSchedule).not.toHaveBeenCalled();
  });

  it("an admin write lands on (client, job) with the actor recorded", async () => {
    upsertSchedule.mockResolvedValue({ ok: true, schedule: { enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 }, errors: [] });
    const res = await PATCH(req({ role: "admin", body: { enabled: true, frequency: "weekly", hourUtc: 3, dayOfWeekUtc: 1 } }), ctx("collect_crawl"));
    expect(res.status).toBe(200);
    expect(upsertSchedule).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG, jobKey: "collect_crawl", enabled: true, updatedBy: "admin:claims" }));
  });

  it("site_watch goes to site-watch's own locked write, and its version conflict stays a 409", async () => {
    writeSiteWatchCell.mockResolvedValue({ ok: false, status: 409, error: "version_conflict" });
    const res = await PATCH(req({ role: "owner", body: { expectedVersion: 1, enabled: false, frequency: "daily", hourUtc: 22 } }), ctx("site_watch"));
    expect(res.status).toBe(409);
    expect(writeSiteWatchCell).toHaveBeenCalledWith(sb, ORG, expect.objectContaining({ expectedVersion: 1 }), expect.objectContaining({ role: "owner" }));
    expect(upsertSchedule).not.toHaveBeenCalled();
  });
});
