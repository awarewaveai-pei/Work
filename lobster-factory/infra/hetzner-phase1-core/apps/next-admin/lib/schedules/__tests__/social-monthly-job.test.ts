// The social_monthly_report job (C25): registered like the other client jobs, off by default, and its run() makes last month's
// report once, only on the 1st-3rd, and takes it back when nobody got the mail so the next day tries again.
import { beforeEach, describe, expect, it, vi } from "vitest";

const tables = vi.hoisted(() => ({ social_reports: [] as Array<{ name: string }>, social_accounts: [{ id: "a1" }] as unknown[] }));
const rpcs = vi.hoisted(() => ({ calls: [] as Array<{ name: string; args: Record<string, unknown> }> }));
const members = vi.hoisted(() => ({ list: [{ user_id: "u1", email: "owner@x.test", role: "owner" }] as Array<Record<string, unknown>> }));
const mail = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("@/lib/social/store", () => {
  const chain = (rows: unknown[]) => { const c: Record<string, unknown> = {}; for (const m of ["select", "eq", "neq", "order", "limit", "in"]) c[m] = () => c; c.then = (res: (v: unknown) => unknown) => res({ data: rows, error: null }); return c; };
  return {
    SocialStoreError: class extends Error {},
    fail: (e: { message: string }) => { throw new Error(e.message); },
    listBrands: async () => [{ id: "b1", name: "Soulful", slug: "soulful", default_timezone: "Asia/Taipei" }],
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

const { clientJob } = await import("@/lib/schedules/jobs");
const { runMonthlyReport } = await import("@/lib/social/reports");
const at = (iso: string) => new Date(iso);   // Taipei is UTC+8: 2026-10-01T01:00Z is 09:00 on the 1st

beforeEach(() => {
  tables.social_reports = [];
  members.list = [{ user_id: "u1", email: "owner@x.test", role: "owner" }];
  rpcs.calls = [];
  mail.send.mockReset();
  mail.send.mockResolvedValue({ ok: true, id: "m1" });
});

describe("social_monthly_report", () => {
  it("is a registered client job, a daily look, and has a default hour", () => {
    const job = clientJob("social_monthly_report");
    expect(job?.frequencies.map((f) => f.value)).toEqual(["daily"]);
    expect(job?.defaults.hourUtc).toBe(1);
  });

  it("makes last month's report on the 1st and mails the owner its link", async () => {
    expect(await runMonthlyReport("b1", at("2026-10-01T01:00:00Z"))).toMatch(/^sent 2026-09 月報（自動寄出） to 1\/1/);
    const create = rpcs.calls.find((c) => c.name === "social_create_report")!;
    expect(create.args.p_report).toMatchObject({ period_from: "2026-09-01", period_to: "2026-09-30", account_ids: ["a1"] });
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "owner@x.test" });
    expect(mail.send.mock.calls[0][0].text).toContain("https://social.example.test/reports/r1");
  });

  it("does nothing after the 3rd, and nothing twice in a month", async () => {
    expect(await runMonthlyReport("b1", at("2026-10-04T01:00:00Z"))).toMatch(/^skipped/);
    tables.social_reports = [{ name: "2026-09 月報（自動寄出）" }];
    expect(await runMonthlyReport("b1", at("2026-10-02T01:00:00Z"))).toMatch(/^skipped/);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("a brand with nobody to mail is skipped before any report is made", async () => {
    members.list = [{ user_id: "u2", email: "ed@x.test", role: "editor" }];
    expect(await runMonthlyReport("b1", at("2026-10-01T01:00:00Z"))).toMatch(/^skipped/);
    expect(rpcs.calls).toEqual([]);
  });

  it("when every mail fails it throws and deletes the report, so the next day tries again", async () => {
    mail.send.mockResolvedValue({ ok: false, error: "mail_rejected_422" });
    await expect(runMonthlyReport("b1", at("2026-10-01T01:00:00Z"))).rejects.toThrow(/mail_rejected_422/);
    expect(rpcs.calls.map((c) => c.name)).toEqual(["social_create_report", "social_delete_report"]);
  });
});
