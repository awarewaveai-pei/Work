import { describe, expect, it, vi } from "vitest";
import { resendAccountFor, sharedWith } from "@/lib/mail/resend-accounts";
import { mailQuotaUnavailable, runMailQuotaWatch, type MailQuotaDeps } from "@/lib/schedules/mail-quota";
import type { Notice } from "@/lib/schedules/stop-notice";

const ENV = { RESEND_API_KEY: "re_main_secret", RESEND_API_KEY_ORACLE: "re_oracle_secret" };
const NAMES = new Map([["awarewave-ops", "AwareWave"], ["soulful-expression", "Soulful"], ["oracle-aware-wave-com", "東西方命理"]]);

const usage = (daily: number, monthly: number) =>
  vi.fn(async () => new Response(JSON.stringify({ object: "usage", emails: { daily: { used: daily, limit: 100 }, monthly: { used: monthly, limit: 3000 } } }), { status: 200 }));

function deps(orgSlug: string, fetchImpl: typeof fetch, raised: Notice[], fingerprints = new Set<string>()): MailQuotaDeps {
  return {
    orgSlug,
    env: ENV,
    fetch: fetchImpl,
    orgNames: async () => NAMES,
    alreadyNotified: async (fp) => fingerprints.has(fp),
    raise: async (n) => { raised.push(n); fingerprints.add(n.fingerprint); },
    now: new Date("2026-11-26T05:00:00Z"),
  };
}

describe("resend-accounts: one account, one owner list", () => {
  it("the two organizations on the main account get the same account and each other's name", () => {
    const a = resendAccountFor("awarewave-ops")!;
    const b = resendAccountFor("soulful-expression")!;
    expect(a).toBe(b);
    expect(sharedWith(a, "awarewave-ops")).toEqual(["soulful-expression"]);
    expect(sharedWith(b, "soulful-expression")).toEqual(["awarewave-ops"]);
    expect(sharedWith(resendAccountFor("oracle-aware-wave-com")!, "oracle-aware-wave-com")).toEqual([]);
  });
});

describe("mail_quota_watch unavailable", () => {
  it("no account for the organization, or the account's key not set", () => {
    expect(mailQuotaUnavailable("some-client", ENV)).toBe("沒有對應的寄信帳號");
    expect(mailQuotaUnavailable(undefined, ENV)).toBe("沒有對應的寄信帳號");
    expect(mailQuotaUnavailable("oracle-aware-wave-com", { RESEND_API_KEY: "x" })).toContain("算命站帳號");
    expect(mailQuotaUnavailable("oracle-aware-wave-com", ENV)).toBeNull();
  });
});

describe("mail_quota_watch run", () => {
  it(">= 80% notifies once; the same day's second run does not; the shared org's run does not either", async () => {
    const raised: Notice[] = [];
    const seen = new Set<string>();
    const s1 = await runMailQuotaWatch(deps("awarewave-ops", usage(80, 340), raised, seen));
    expect(raised).toHaveLength(1);
    expect(raised[0].fingerprint).toBe("mail_quota_watch:main:daily:2026-11-26");
    expect(raised[0].message).toContain("AwareWave、Soulful");
    expect(s1).toBe("主帳號（與 Soulful 共用）今日 80/100、本月 340/3000；已通知今日達 80%");
    await runMailQuotaWatch(deps("awarewave-ops", usage(85, 345), raised, seen));
    await runMailQuotaWatch(deps("soulful-expression", usage(85, 345), raised, seen));
    expect(raised).toHaveLength(1);
  });

  it("below 80% notifies nothing", async () => {
    const raised: Notice[] = [];
    expect(await runMailQuotaWatch(deps("oracle-aware-wave-com", usage(79, 2399), raised))).toBe("算命站帳號今日 79/100、本月 2399/3000");
    expect(raised).toHaveLength(0);
  });

  it("an unreadable counter throws and notifies nothing (never read as 0 sent); the key stays out of the error", async () => {
    const cases: Array<typeof fetch> = [
      vi.fn(async () => new Response(JSON.stringify({ name: "restricted_api_key" }), { status: 401 })),
      vi.fn(async () => { throw new DOMException("timeout", "TimeoutError"); }),
      vi.fn(async () => new Response(JSON.stringify({ object: "usage", emails: {} }), { status: 200 })),
    ];
    for (const f of cases) {
      const raised: Notice[] = [];
      const err = await runMailQuotaWatch(deps("awarewave-ops", f, raised)).then(() => null, (e: Error) => e);
      expect(err?.message).toMatch(/^mail_quota_watch:/);
      expect(err?.message).not.toContain("re_main_secret");
      expect(raised).toHaveLength(0);
    }
  });

  it("no account is skipped, no key throws; neither fetches", async () => {
    const f = usage(0, 0);
    expect(await runMailQuotaWatch(deps("some-client", f, []))).toBe("skipped: 沒有對應的寄信帳號");
    await expect(runMailQuotaWatch({ ...deps("oracle-aware-wave-com", f, []), env: {} })).rejects.toThrow("not_configured");
    expect(f).not.toHaveBeenCalled();
  });
});
