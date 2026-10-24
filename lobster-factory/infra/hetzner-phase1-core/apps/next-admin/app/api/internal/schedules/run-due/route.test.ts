import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const listEnabledSchedules = vi.hoisted(() => vi.fn());
const recordScheduleRun = vi.hoisted(() => vi.fn());
const recordScheduleError = vi.hoisted(() => vi.fn());
const claimScheduleRun = vi.hoisted(() => vi.fn());
const run = vi.hoisted(() => vi.fn());
const ingestIncident = vi.hoisted(() => vi.fn());
const refreshClaimReviewIfDue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/schedules/store", () => ({ listEnabledSchedules, recordScheduleRun, recordScheduleError, claimScheduleRun }));
vi.mock("@/lib/schedules/jobs", () => ({ clientJob: (key: string) => (key === "collect_crawl" ? { key, run } : undefined), asRegistered: <T,>(row: T) => row }));
vi.mock("@/lib/ops-inbox/ingest", () => ({ ingestIncident }));
vi.mock("@/lib/collect/lookups/answer", () => ({ refreshClaimReviewIfDue }));
const sb = vi.hoisted(() => ({
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { slug: "acme" }, error: null }) }) }) }),
}));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => sb }));
// next/server's after() needs a request scope; collect the callbacks and run them on demand.
const afterCallbacks = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void afterCallbacks.push(fn) }));

const { POST } = await import("./route");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "test-token-value-that-is-long-enough";

function req(auth?: string): Request {
  return new Request("http://localhost/api/internal/schedules/run-due", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

const dueSchedule = (organizationId: string, jobKey = "collect_crawl") => ({
  organizationId,
  jobKey,
  enabled: true,
  frequency: "daily" as const,
  hourUtc: new Date().getUTCHours(), // guarantees isDueNow() is true right now, no fake timers needed
  dayOfWeekUtc: 1,
  dayOfMonth: 1,
  lastRunAt: null,
  lastRunKey: null,
  lastError: null,
  lastErrorAt: null,
  updatedBy: null,
  updatedAt: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  process.env.SCHEDULE_INGEST_TOKEN = TOKEN;
  run.mockResolvedValue("written=3");
  recordScheduleError.mockResolvedValue(undefined);
  // the real claim: one winner per run key
  const taken = new Set<string>();
  claimScheduleRun.mockImplementation(async (o: string, j: string, k: string) => (taken.has(`${o}|${j}|${k}`) ? false : (taken.add(`${o}|${j}|${k}`), true)));
  ingestIncident.mockResolvedValue({ id: "inc-1", error: null });
});

afterEach(() => {
  delete process.env.SCHEDULE_INGEST_TOKEN;
});

describe("POST /api/internal/schedules/run-due", () => {
  it("rejects a missing or wrong bearer token", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(0); // no fact-check mirror refresh for an unauthenticated caller
  });

  it("fails closed when the token is not configured at all", async () => {
    delete process.env.SCHEDULE_INGEST_TOKEN;
    expect((await POST(req(`Bearer ${TOKEN}`))).status).toBe(401);
  });

  it("asks for the daily fact-check mirror refresh after answering, never before", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(refreshClaimReviewIfDue).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);
    await afterCallbacks[0]();
    expect(refreshClaimReviewIfDue).toHaveBeenCalledTimes(1);
  });

  /** POST, then run what it deferred with after() (callback 0 is the claimreview refresh). */
  async function sweep() {
    const before = afterCallbacks.length;
    const res = await POST(req(`Bearer ${TOKEN}`));
    for (const cb of afterCallbacks.slice(before + 1)) await cb();
    return res;
  }

  it("claims and runs only the rows isDueNow() says are due, with a run key that names the job", async () => {
    listEnabledSchedules.mockResolvedValue([
      dueSchedule(ORG_A),
      { ...dueSchedule(ORG_B), hourUtc: (new Date().getUTCHours() + 5) % 24 }, // not this hour
    ]);
    const body = await (await sweep()).json();
    expect(body).toMatchObject({ checked: 2, due: 1 });
    expect(body.started).toEqual([expect.stringMatching(/^scheduled-collect_crawl-11111111-\d{8}$/)]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(ORG_A, body.started[0]);
    expect(recordScheduleRun).toHaveBeenCalledWith(ORG_A, "collect_crawl");
    expect(ingestIncident).not.toHaveBeenCalled();
  });

  it("the job runs AFTER the answer: a heartbeat that gives up early does not cut the job short", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A)]);
    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    expect(run).not.toHaveBeenCalled();
    await afterCallbacks[1]();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("a retried heartbeat for the same firing runs nothing a second time", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A)]);
    await sweep();
    const second = await (await sweep()).json();
    expect(second.started).toEqual([]);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("one job throwing: its error is recorded, ONE incident is raised, and the next client still runs", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A), dueSchedule(ORG_B)]);
    run.mockImplementation(async (organizationId: string) => {
      if (organizationId === ORG_A) throw new Error("A failed");
      return "written=1";
    });

    const body = await (await sweep()).json();
    expect(body.due).toBe(2);
    expect(recordScheduleRun).toHaveBeenCalledTimes(1);
    expect(recordScheduleRun).toHaveBeenCalledWith(ORG_B, "collect_crawl");
    expect(recordScheduleError).toHaveBeenCalledWith(ORG_A, "collect_crawl", expect.stringContaining("A failed"));
    expect(ingestIncident).toHaveBeenCalledTimes(1);
    expect(ingestIncident).toHaveBeenCalledWith(
      sb,
      expect.objectContaining({ source: "schedule", fingerprint: `schedule:collect_crawl:${ORG_A}`, client_slug: "acme" }),
    );
  });

  it("a job that says not yet (its own clock) records nothing: no run, no error, no incident", async () => {
    const { NotDueYet } = await import("@/lib/schedules/schedule");
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A)]);
    run.mockRejectedValue(new NotDueYet("2026-10-31 is not over yet in America/New_York"));
    await sweep();
    expect(run).toHaveBeenCalledTimes(1);
    expect(recordScheduleRun).not.toHaveBeenCalled();
    expect(recordScheduleError).not.toHaveBeenCalled();
    expect(ingestIncident).not.toHaveBeenCalled();
  });

  it("a row whose job left the registry is a failure, not a silent skip", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A, "retired_job")]);
    await sweep();
    expect(recordScheduleError).toHaveBeenCalledWith(ORG_A, "retired_job", expect.stringMatching(/unknown_job:retired_job/));
    expect(ingestIncident).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("a store that cannot be read is a 500, never a green 'nothing due'", async () => {
    listEnabledSchedules.mockRejectedValue(new Error("schedules_db:list_enabled:relation does not exist"));
    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/relation does not exist/);
  });
});
