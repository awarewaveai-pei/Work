// The social report jobs (C25 + 2026-10-24 週報／月報／季報／年報): each registered like the other client jobs, off by default,
// timed by its own client_schedules row; run() makes the last whole period's report once and takes it back when nobody got
// the mail so the next due run tries again.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tables = vi.hoisted(() => ({ social_reports: [] as Array<{ name: string }>, social_accounts: [{ id: "a1" }] as unknown[] }));
const rpcs = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: Record<string, unknown> }> }));
const members = vi.hoisted(() => ({ list: [{ user_id: "u1", email: "owner@x.test", role: "owner" }] as Array<Record<string, unknown>> }));
const mail = vi.hoisted(() => ({ send: vi.fn() }));
const brandTz = vi.hoisted(() => ({ tz: "Asia/Taipei" }));

vi.mock("@/lib/social/store", () => {
  const chain = (rows: unknown[]) => { const c: Record<string, unknown> = {}; for (const m of ["select", "eq", "neq", "order", "limit", "in"]) c[m] = () => c; c.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null }); return c; };
  return {
    SocialStoreError: class extends Error {},
    fail: (e: { message: string }) => { throw new Error(e.message); },
    listBrands: async () => [{ id: "b1", name: "Soulful", slug: "soulful", default_timezone: brandTz.tz }],
    listMembers: async () => members.list,
    db: () => ({
      from: (t: keyof typeof tables) => chain(tables[t]),
      rpc: async (name: string, args: Record<string, unknown>) => { rpcs.calls.push({ name, args }); return { data: "r1", error: null }; },
    }),
  };
});
vi.mock("@/lib/mail/resend", () => ({ sendMail: mail.send }));
vi.mock("@/lib/portal/doors", () => ({ nextAdminProducts: () => [{ key: "social" }], productHost: () => "social.example.test" }));
vi.mock("@/lib/supabase-paging", () => ({ selectAll: async () => [] }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
vi.mock("@/lib/collect/run", () => ({ runCollection: vi.fn() }));
vi.mock("@/lib/collect/blocks", () => ({}));
vi.mock("@/lib/cs/cis", () => ({ loadCis: vi.fn() }));
vi.mock("@/lib/cs/chatwoot-baseline", () => ({ applyChatwootBaseline: vi.fn() }));

const { asRegistered, clientJob } = await import("@/lib/schedules/jobs");
const { runPeriodReport } = await import("@/lib/social/reports");
const { NotDueYet } = await import("@/lib/schedules/schedule");
const at = (iso: string) => new Date(iso);   // Taipei is UTC+8: 2026-10-01T01:00Z is 09:00 on the 1st

beforeEach(() => {
  brandTz.tz = "Asia/Taipei";
  tables.social_reports = [];
  members.list = [{ user_id: "u1", email: "owner@x.test", role: "owner" }];
  rpcs.calls = [];
  mail.send.mockReset();
  mail.send.mockResolvedValue({ ok: true, id: "m1" });
});

describe("social report jobs", () => {
  it("each kind is a registered client job with its own frequency, a send day and a 09:00 Taipei default", () => {
    const freq = (k: string) => clientJob(k)?.frequencies.map((f) => f.value);
    expect(freq("social_weekly_report")).toEqual(["weekly"]);
    expect(freq("social_monthly_report")).toEqual(["monthly"]);
    expect(freq("social_quarterly_report")).toEqual(["quarterly"]);
    expect(freq("social_yearly_report")).toEqual(["yearly"]);
    for (const k of ["social_monthly_report", "social_quarterly_report", "social_yearly_report"]) {
      expect(clientJob(k)?.frequencies[0].usesDayOfMonth).toBe(true);
      expect(clientJob(k)?.defaults).toMatchObject({ hourUtc: 1, dayOfMonth: 1 });
    }
  });

  it("a stored row with a frequency its job no longer offers reads as the job's default (the monthly report's old daily look)", () => {
    expect(asRegistered({ jobKey: "social_monthly_report", frequency: "daily" as const }).frequency).toBe("monthly");
    expect(asRegistered({ jobKey: "collect_crawl", frequency: "weekly" as const }).frequency).toBe("weekly");
  });

  it("monthly: makes last month's report and mails the owner its link", async () => {
    expect(await runPeriodReport("monthly", "b1", at("2026-10-01T01:00:00Z"))).toMatch(/^sent 2026-09 月報（自動寄出） to 1\/1/);
    const create = rpcs.calls.find((c) => c.name === "social_create_report")!;
    expect(create.args.p_report).toMatchObject({ period_from: "2026-09-01", period_to: "2026-09-30", account_ids: ["a1"] });
    expect(create.args.p_actor).toBe("system:social_monthly_report");
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "owner@x.test", subject: "Soulful 2026-09 社群月報" });
    expect(mail.send.mock.calls[0][0].text).toContain("https://social.example.test/reports/r1");
  });

  it("a send day later in the month still reports last month (the day is the operator's choice now)", async () => {
    expect(await runPeriodReport("monthly", "b1", at("2026-10-15T01:00:00Z"))).toMatch(/^sent 2026-09 月報/);
  });

  it("weekly / quarterly / yearly report their last whole period under their own actor", async () => {
    await runPeriodReport("weekly", "b1", at("2026-10-21T01:00:00Z"));    // a Wednesday: last week = Mon 10-12 .. Sun 10-18
    await runPeriodReport("quarterly", "b1", at("2026-10-01T01:00:00Z"));
    await runPeriodReport("yearly", "b1", at("2027-01-01T01:00:00Z"));
    const made = rpcs.calls.filter((c) => c.name === "social_create_report").map((c) => [c.args.p_actor, (c.args.p_report as Record<string, unknown>).name, (c.args.p_report as Record<string, unknown>).period_from, (c.args.p_report as Record<string, unknown>).period_to]);
    expect(made).toEqual([
      ["system:social_weekly_report", "2026-10-12～2026-10-18 週報（自動寄出）", "2026-10-12", "2026-10-18"],
      ["system:social_quarterly_report", "2026 Q3 季報（自動寄出）", "2026-07-01", "2026-09-30"],
      ["system:social_yearly_report", "2026 年報（自動寄出）", "2026-01-01", "2026-12-31"],
    ]);
  });

  it("a brand behind Taipei whose month is not over yet: not yet (nothing made), and the next catch-up day sends that month", async () => {
    brandTz.tz = "America/New_York";
    // Taipei 11-01 09:00 = New York 10-31 21:00: October is not over there
    await expect(runPeriodReport("monthly", "b1", at("2026-11-01T01:00:00Z"))).rejects.toBeInstanceOf(NotDueYet);
    expect(rpcs.calls).toEqual([]);
    expect(await runPeriodReport("monthly", "b1", at("2026-11-02T01:00:00Z"))).toMatch(/^sent 2026-10 月報/);
  });

  it("weekly for a brand behind Taipei reports the brand's own last whole week (a week later, never skipped)", async () => {
    brandTz.tz = "America/New_York";
    await runPeriodReport("weekly", "b1", at("2026-10-19T01:00:00Z"));   // Taipei Mon 10-19 09:00 = New York Sun 10-18 21:00
    expect(rpcs.calls.find((c) => c.name === "social_create_report")!.args.p_report).toMatchObject({ period_from: "2026-10-05", period_to: "2026-10-11" });
  });

  it("does nothing twice for one period", async () => {
    tables.social_reports = [{ name: "2026-09 月報（自動寄出）" }];
    expect(await runPeriodReport("monthly", "b1", at("2026-10-02T01:00:00Z"))).toMatch(/^skipped/);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("a brand with nobody to mail is skipped before any report is made", async () => {
    members.list = [{ user_id: "u2", email: "ed@x.test", role: "editor" }];
    expect(await runPeriodReport("monthly", "b1", at("2026-10-01T01:00:00Z"))).toMatch(/^skipped/);
    expect(rpcs.calls).toEqual([]);
  });

  it("when only some mails fail it raises the failure and keeps the report, so the missed person is not silently dropped", async () => {
    members.list = [{ user_id: "u1", email: "owner@x.test", role: "owner" }, { user_id: "u3", email: "client@x.test", role: "client" }];
    mail.send.mockResolvedValueOnce({ ok: true, id: "m1" }).mockResolvedValueOnce({ ok: false, error: "mail_rejected_422" });
    await expect(runPeriodReport("monthly", "b1", at("2026-10-01T01:00:00Z"))).rejects.toThrow(/partial 1\/2 sent, not delivered: client@x.test:mail_rejected_422/);
    expect(rpcs.calls.map((c) => c.name)).toEqual(["social_create_report"]);
  });

  it("when every mail fails it throws and deletes the report, so the next due run tries again", async () => {
    mail.send.mockResolvedValue({ ok: false, error: "mail_rejected_422" });
    await expect(runPeriodReport("monthly", "b1", at("2026-10-01T01:00:00Z"))).rejects.toThrow(/mail_rejected_422/);
    expect(rpcs.calls.map((c) => c.name)).toEqual(["social_create_report", "social_delete_report"]);
  });
});
