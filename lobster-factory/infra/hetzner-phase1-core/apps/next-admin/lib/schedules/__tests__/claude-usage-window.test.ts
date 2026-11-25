import { describe, expect, it, vi } from "vitest";
import { isDueNow, scheduledRunKey, type Schedule } from "@/lib/schedules/schedule";
import { claudeUsageWindowUnavailable, fireClaudeUsageWindow } from "@/lib/schedules/claude-usage-window";
import { validWeekdayHours } from "@/lib/schedules/store";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
const { clientJob, jobAppliesTo, PLATFORM_ORG_SLUG } = await import("@/lib/schedules/jobs");

// Taipei = UTC+8. 2026-11-23 is a Monday.
const week: Schedule = { enabled: true, frequency: "weekdays", hourUtc: 0, dayOfWeekUtc: 1, dayOfMonth: 1, weekdayHours: [null, 8, 8, 8, 8, 8, 7], lastRunAt: null };

describe("weekdays (0183): each Taipei weekday its own Taipei hour", () => {
  it("fires Tuesday 08:xx Taipei (00:xx UTC), not 07:xx or 09:xx", () => {
    expect(isDueNow(week, new Date("2026-11-24T00:05:00Z"))).toBe(true); // Tue 08:05 Taipei
    expect(isDueNow(week, new Date("2026-11-23T23:55:00Z"))).toBe(false); // Tue 07:55 Taipei
    expect(isDueNow(week, new Date("2026-11-24T01:00:00Z"))).toBe(false); // Tue 09:00 Taipei
  });

  it("Saturday 07:00 Taipei is Friday 23:00 UTC", () => {
    expect(isDueNow(week, new Date("2026-11-27T23:10:00Z"))).toBe(true);
    expect(isDueNow(week, new Date("2026-11-28T00:10:00Z"))).toBe(false); // Sat 08:10 Taipei
  });

  it("a day set to null never fires (Sunday)", () => {
    for (let h = 0; h < 24; h++) expect(isDueNow(week, new Date(Date.UTC(2026, 10, 29, h - 8, 5)))).toBe(false);
  });

  it("once per Taipei day: not again the same day, again on the next set day; moving today's hour after the run does not rerun", () => {
    const ran = { ...week, lastRunAt: "2026-11-24T00:02:00Z" }; // Tue 08:02 Taipei
    expect(isDueNow(ran, new Date("2026-11-24T00:40:00Z"))).toBe(false);
    expect(isDueNow({ ...ran, weekdayHours: [null, 8, 9, 8, 8, 8, 7] }, new Date("2026-11-24T01:05:00Z"))).toBe(false);
    expect(isDueNow(ran, new Date("2026-11-25T00:05:00Z"))).toBe(true); // Wed
  });

  it("disabled, or no hours stored, never fires", () => {
    expect(isDueNow({ ...week, enabled: false }, new Date("2026-11-24T00:05:00Z"))).toBe(false);
    expect(isDueNow({ ...week, weekdayHours: null }, new Date("2026-11-24T00:05:00Z"))).toBe(false);
  });

  it("run key is per Taipei day: Thu 08:00 and Fri 07:00 Taipei (both Thursday UTC) get two keys", () => {
    const org = "11111111-1111-4111-8111-111111111111";
    const thu = scheduledRunKey(org, "claude_usage_window", new Date("2026-11-26T00:05:00Z"), "weekdays");
    const fri = scheduledRunKey(org, "claude_usage_window", new Date("2026-11-26T23:05:00Z"), "weekdays");
    expect(thu).toBe("scheduled-claude_usage_window-11111111-20261126");
    expect(fri).toBe("scheduled-claude_usage_window-11111111-20261127");
  });

  it("validWeekdayHours: 7 entries, each null or a whole hour 0-23", () => {
    expect(validWeekdayHours([null, 8, 8, 8, 8, 8, 7])).toBe(true);
    expect(validWeekdayHours([8, 8, 8, 8, 8, 8])).toBe(false);
    expect(validWeekdayHours([null, 8, 8, 8, 8, 8, 24])).toBe(false);
    expect(validWeekdayHours([null, 8, 8, 8, 8, 8, 7.5])).toBe(false);
    expect(validWeekdayHours("8")).toBe(false);
  });
});

describe("claude_usage_window job", () => {
  const URL_OK = "https://api.anthropic.com/v1/claude_code/routines/trig_01LfZEYHtBxdGKjNB2dUeugP/fire";
  const env = { CLAUDE_USAGE_WINDOW_FIRE_URL: URL_OK, CLAUDE_USAGE_WINDOW_FIRE_TOKEN: "sk-ant-oat01-secret" };

  it("exists only for the platform organization", () => {
    const job = clientJob("claude_usage_window")!;
    expect(jobAppliesTo(job, PLATFORM_ORG_SLUG)).toBe(true);
    expect(jobAppliesTo(job, "company-soulful-expression")).toBe(false);
    expect(jobAppliesTo(job, null)).toBe(false);
    expect(jobAppliesTo(clientJob("collect_crawl")!, "company-soulful-expression")).toBe(true);
  });

  it("says why it cannot fire until the host has the URL and token", () => {
    expect(claudeUsageWindowUnavailable({})).toBe("主機還沒設定觸發金鑰");
    expect(claudeUsageWindowUnavailable({ ...env, CLAUDE_USAGE_WINDOW_FIRE_URL: "https://evil.example/fire" })).toBe("觸發網址格式不對");
    expect(claudeUsageWindowUnavailable(env)).toBeNull();
  });

  it("fires the routine with its own token and returns the session id", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ type: "routine_fire", claude_code_session_id: "session_abc" }), { status: 200 }));
    await expect(fireClaudeUsageWindow(env, fetchImpl as unknown as typeof fetch)).resolves.toBe("fired session_abc");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(URL_OK);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-ant-oat01-secret");
    expect((init.headers as Record<string, string>)["anthropic-version"]).toBe("2023-06-01");
  });

  it("throws on a refused fire without putting the token in the message; never calls out when unconfigured", async () => {
    const refused = vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "bad token" } }), { status: 401 }));
    const err = await fireClaudeUsageWindow(env, refused as unknown as typeof fetch).catch((e: Error) => e.message);
    expect(err).toBe("claude_usage_window:http_401:authentication_error:bad token");
    expect(err).not.toContain("secret");
    const never = vi.fn();
    await expect(fireClaudeUsageWindow({}, never as unknown as typeof fetch)).rejects.toThrow("not_configured");
    expect(never).not.toHaveBeenCalled();
  });
});
