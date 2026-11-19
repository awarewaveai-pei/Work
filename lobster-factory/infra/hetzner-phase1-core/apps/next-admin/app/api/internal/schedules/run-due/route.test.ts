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
// In-memory tables: eq/in filter, order/limit kept simple. projects = media_production_projects rows of the test.
const projects = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const sb = vi.hoisted(() => ({
  from(table: string) {
    let rows: Array<Record<string, unknown>> = table === "organizations" ? [{ slug: "acme" }] : table === "media_production_projects" ? [...projects] : [];
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { if (table !== "organizations") rows = rows.filter((r) => r[k] === v); return q; },
      in: (k: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[k])); return q; },
      order: () => q,
      limit: (n: number) => { rows = rows.slice(0, n); return q; },
      range: (a: number, b: number) => { rows = rows.slice(a, b + 1); return q; },
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(ok, bad),
    };
    return q;
  },
}));
const advanceProject = vi.hoisted(() => vi.fn());
vi.mock("@/lib/content/video/project-advance", () => ({ advanceProject }));
vi.mock("@/lib/content/video/project-advance-deps", () => ({ advanceDeps: (_sb: unknown, org: string, actor: string) => ({ org, actor }) }));
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
  projects.length = 0;
  advanceProject.mockImplementation(async (_deps: unknown, p: { id: string }) => ({ projectId: p.id, result: "waiting", note: "還沒有成片" }));
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
    expect(run).toHaveBeenCalledWith(ORG_A, body.started[0], expect.objectContaining({ organizationId: ORG_A, jobKey: "collect_crawl" }));
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

  // 「做到草稿」 is the consent: its projects advance every firing with no client_schedules row at all.
  const project = (id: string, organizationId: string, autonomy: string, lifecycle_stage = "review") =>
    ({ id, organization_id: organizationId, autonomy, lifecycle_stage, title: id, source_ref: `ref-${id}`, updated_at: "2026-11-19T00:00:00Z", brief_json: { autoBudget: { runId: "r1", budgetTwd: 100, spentTwd: 0, episodeId: `ep-${id}` } } });

  it("with no client_schedules rows, a 做到草稿 project is still advanced, by the system actor, after the answer", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    projects.push(project("p-auto", ORG_A, "auto_after_render"));
    const body = await (await sweep()).json();
    expect(body).toMatchObject({ ok: true, checked: 0, autoAdvance: { organizations: [ORG_A] } });
    expect(advanceProject).toHaveBeenCalledTimes(1);
    expect(advanceProject).toHaveBeenCalledWith({ org: ORG_A, actor: "system:video_project_advance" }, expect.objectContaining({ id: "p-auto", organizationId: ORG_A }));
  });

  it("guided and full_auto projects, and finished ones, are not touched", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    projects.push(project("p-guided", ORG_A, "guided"), project("p-full", ORG_B, "full_auto"), project("p-done", ORG_A, "auto_after_render", "measure"));
    const body = await (await sweep()).json();
    expect(body.autoAdvance).toEqual({ organizations: [] });
    expect(advanceProject).not.toHaveBeenCalled();
  });

  it("a stopped project raises a Chinese notice naming the video, the step, why and the link; the schedules' result stays green", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_B)]);
    projects.push({ ...project("p-auto", ORG_A, "auto_after_render"), title: "春季新品" });
    advanceProject.mockResolvedValue({ projectId: "p-auto", result: "stopped", note: "權利檢查沒過", stage: "review" });
    const res = await sweep();
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalledTimes(1);
    expect(ingestIncident).toHaveBeenCalledTimes(1);
    expect(ingestIncident).toHaveBeenCalledWith(sb, expect.objectContaining({
      fingerprint: "video_project_advance:p-auto:review",
      title: "影片〈春季新品〉停在審核：權利檢查沒過",
      message: expect.stringMatching(/處理：https:\/\/video\.[^/]+\/\?open=projects&project=ref-p-auto&episode=ep-p-auto/),
    }));
  });

  it("the same project stopping at the same step twice has one fingerprint; another step has another", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    projects.push(project("p-auto", ORG_A, "auto_after_render"));
    advanceProject.mockResolvedValue({ projectId: "p-auto", result: "stopped", note: "x", stage: "review" });
    await sweep();
    await sweep();
    advanceProject.mockResolvedValue({ projectId: "p-auto", result: "stopped", note: "y", stage: "produce" });
    await sweep();
    expect(ingestIncident.mock.calls.map((c) => c[1].fingerprint)).toEqual([
      "video_project_advance:p-auto:review", "video_project_advance:p-auto:review", "video_project_advance:p-auto:produce",
    ]);
  });

  it("client_schedules unreadable: still a 500, and the 做到草稿 projects still advance", async () => {
    listEnabledSchedules.mockRejectedValue(new Error("schedules_db:list_enabled:boom"));
    projects.push(project("p-auto", ORG_A, "auto_after_render"));
    const res = await sweep();
    expect(res.status).toBe(500);
    expect((await res.json()).autoAdvance).toEqual({ organizations: [ORG_A] });
    expect(advanceProject).toHaveBeenCalledTimes(1);
  });

  it("organizations past the first 1000 matching rows are found too", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    for (let i = 0; i < 1000; i++) projects.push(project(`a${i}`, ORG_A, "auto_after_render"));
    projects.push(project("p-b", ORG_B, "auto_after_render"));
    expect((await (await sweep()).json()).autoAdvance).toEqual({ organizations: [ORG_A, ORG_B] });
  });

  it("an organization still advancing from the previous firing is skipped, not advanced twice", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    projects.push(project("p-auto", ORG_A, "auto_after_render"));
    let release!: () => void;
    advanceProject.mockImplementationOnce(() => new Promise((ok) => { release = () => ok({ projectId: "p-auto", result: "waiting", note: "" }); }));
    await POST(req(`Bearer ${TOKEN}`));
    const first = afterCallbacks.at(-1)!();
    await new Promise((r) => setTimeout(r, 0));
    await sweep();
    expect(advanceProject).toHaveBeenCalledTimes(1);
    release();
    await first;
    await sweep();
    expect(advanceProject).toHaveBeenCalledTimes(2);
  });

  it("the video project list unreadable: a 500 the host clock sees, while due jobs still run", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_B)]);
    const from = sb.from;
    sb.from = (table: string) => (table === "media_production_projects"
      ? { select: () => ({ eq: () => ({ in: () => ({ order: () => ({ range: () => Promise.resolve({ data: null, error: { message: "boom" } }) }) }) }) }) }
      : from(table)) as ReturnType<typeof from>;
    try {
      const res = await sweep();
      expect(res.status).toBe(500);
      expect((await res.json()).autoAdvance).toEqual({ error: expect.stringContaining("boom") });
      expect(run).toHaveBeenCalledTimes(1);
    } finally { sb.from = from; }
  });

  it("an organization whose advance fails outright raises an incident instead of sitting there unseen", async () => {
    listEnabledSchedules.mockResolvedValue([]);
    projects.push(project("p-auto", ORG_A, "auto_after_render"));
    advanceProject.mockRejectedValue(new Error("db down"));
    await sweep();
    expect(ingestIncident).toHaveBeenCalledWith(sb, expect.objectContaining({ fingerprint: `schedule:video_project_advance:${ORG_A}`, title: expect.stringContaining("排程"), message: expect.stringContaining("db down") }));
  });

  it("a store that cannot be read is a 500, never a green 'nothing due'", async () => {
    listEnabledSchedules.mockRejectedValue(new Error("schedules_db:list_enabled:relation does not exist"));
    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/relation does not exist/);
  });
});
