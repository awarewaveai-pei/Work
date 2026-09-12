import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { postRunDueSchedules } from "./postRunDueSchedules";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.COLLECT_SCHEDULE_INGEST_TOKEN = "test-token";
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.aware-wave.com";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("postRunDueSchedules", () => {
  it("throws before ever calling fetch when the token is not configured", async () => {
    delete process.env.COLLECT_SCHEDULE_INGEST_TOKEN;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(postRunDueSchedules()).rejects.toThrow(/COLLECT_SCHEDULE_INGEST_TOKEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the correct URL with the bearer token, and parses the JSON result", async () => {
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://app.aware-wave.com/api/internal/collect/run-due-schedules");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      return new Response(JSON.stringify({ ok: true, checked: 3, due: 1, results: [] }), { status: 200 });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const result = await postRunDueSchedules();
    expect(result).toEqual({ ok: true, checked: 3, due: 1, results: [] });
  });

  it("throws with the response body on a non-2xx status, rather than swallowing it", async () => {
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(postRunDueSchedules()).rejects.toThrow(/401/);
  });
});
