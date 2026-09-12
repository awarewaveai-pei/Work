import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const listEnabledSchedules = vi.hoisted(() => vi.fn());
const recordScheduleRun = vi.hoisted(() => vi.fn());
const runCollection = vi.hoisted(() => vi.fn());
vi.mock("@/lib/collect/schedule-store", () => ({ listEnabledSchedules, recordScheduleRun }));
vi.mock("@/lib/collect/run", () => ({ runCollection }));

const { POST } = await import("./route");

const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";
const TOKEN = "test-token-value-that-is-long-enough";

function req(auth?: string): Request {
  return new Request("http://localhost/api/internal/collect/run-due-schedules", {
    method: "POST",
    headers: auth ? { authorization: auth } : {},
  });
}

const dueSchedule = (organizationId: string) => ({
  organizationId,
  enabled: true,
  frequency: "daily" as const,
  hourUtc: new Date().getUTCHours(), // guarantees isDueNow() is true right now, no fake timers needed
  dayOfWeekUtc: 1,
  lastRunAt: null,
  lastRunKey: null,
  updatedBy: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.COLLECT_SCHEDULE_INGEST_TOKEN = TOKEN;
  runCollection.mockResolvedValue({ sink: { written: 3 } });
});

afterEach(() => {
  delete process.env.COLLECT_SCHEDULE_INGEST_TOKEN;
});

describe("POST /api/internal/collect/run-due-schedules", () => {
  it("rejects a missing or wrong bearer token", async () => {
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("Bearer wrong"))).status).toBe(401);
    expect(runCollection).not.toHaveBeenCalled();
  });

  it("fails closed when the token is not configured at all", async () => {
    delete process.env.COLLECT_SCHEDULE_INGEST_TOKEN;
    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(401);
  });

  it("runs collection only for tenants isDueNow() says are due right now", async () => {
    listEnabledSchedules.mockResolvedValue([
      dueSchedule(ORG_A),
      { ...dueSchedule(ORG_B), hourUtc: (new Date().getUTCHours() + 5) % 24 }, // not this hour
    ]);

    const res = await POST(req(`Bearer ${TOKEN}`));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    expect(body.due).toBe(1);
    expect(runCollection).toHaveBeenCalledTimes(1);
    expect(runCollection).toHaveBeenCalledWith(expect.objectContaining({ organizationId: ORG_A }));
  });

  it("records the run only AFTER runCollection resolves, and skips it on failure", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A)]);
    runCollection.mockRejectedValue(new Error("crawl exploded"));

    const res = await POST(req(`Bearer ${TOKEN}`));
    const body = await res.json();
    expect(body.results[0].error).toMatch(/crawl exploded/);
    expect(recordScheduleRun).not.toHaveBeenCalled();
  });

  it("one tenant failing does not stop the sweep for the next tenant", async () => {
    listEnabledSchedules.mockResolvedValue([dueSchedule(ORG_A), dueSchedule(ORG_B)]);
    runCollection.mockImplementation(async ({ organizationId }: { organizationId: string }) => {
      if (organizationId === ORG_A) throw new Error("A failed");
      return { sink: { written: 1 } };
    });

    const res = await POST(req(`Bearer ${TOKEN}`));
    const body = await res.json();
    expect(body.due).toBe(2);
    expect(recordScheduleRun).toHaveBeenCalledTimes(1);
    expect(recordScheduleRun).toHaveBeenCalledWith(ORG_B, expect.any(String));
  });
});
