import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { postRunDue } from "./postRunDue";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeEach(() => {
  process.env.SCHEDULE_INGEST_TOKEN = "test-token";
  process.env.AWAREWAVE_WEBHOOK_BASE_URL = "https://app.aware-wave.com";
});

afterEach(() => {
  global.fetch = originalFetch;
  process.env = { ...originalEnv };
});

describe("postRunDue", () => {
  it("throws before ever calling fetch when the token is not configured", async () => {
    delete process.env.SCHEDULE_INGEST_TOKEN;
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(postRunDue()).rejects.toThrow(/SCHEDULE_INGEST_TOKEN/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the schedules sweep with the bearer token, and parses the JSON result", async () => {
    const body = { ok: true, checked: 3, due: 1, started: ["scheduled-collect_crawl-11111111-20261015"], claimErrors: [] };
    const fetchSpy = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe("https://app.aware-wave.com/api/internal/schedules/run-due");
      expect(init?.method).toBe("POST");
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
      return new Response(JSON.stringify(body), { status: 200 });
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    expect(await postRunDue()).toEqual(body);
  });

  it("throws with the response body on a non-2xx status, rather than swallowing it", async () => {
    global.fetch = vi.fn(async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch;
    await expect(postRunDue()).rejects.toThrow(/401/);
  });
});
