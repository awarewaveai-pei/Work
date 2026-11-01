import { describe, expect, it } from "vitest";
import {
  checkDns, evaluateSender, poolEmailRefusal, recheckSender, runSenderHealth,
  type DnsResolver, type HealthStore, type PoolSender, type SenderStats,
} from "../sender-health";
import { connectedSenderFields, stageCap } from "../sender";

// Card C11.4: DNS (all there, SPF missing, DKIM missing, still missing the next day), bounce threshold (29 not judged,
// 30 at 3% judged), warm-up step (4 days no, 5 days yes), recovery (bounces still high: no), claims older than 31 days.

const DOMAIN = "mail.brand.test";
const GOOD: Record<string, string[][]> = {
  [DOMAIN]: [["v=spf1 include:_spf.google.com ~all"]],
  [`_dmarc.${DOMAIN}`]: [["v=DMARC1; p=none"]],
  [`google._domainkey.${DOMAIN}`]: [["v=DKIM1; k=rsa; p=MIIBIjANBgkq"]],
};

function resolver(txt: Record<string, string[][]>, opts: { cname?: Record<string, string[]>; timeout?: string[] } = {}): DnsResolver {
  const err = (code: string) => Object.assign(new Error(code), { code });
  return {
    async resolveTxt(name) {
      if (opts.timeout?.includes(name)) throw err("ETIMEOUT");
      if (!(name in txt)) throw err("ENOTFOUND");
      return txt[name];
    },
    async resolveCname(name) {
      if (opts.cname?.[name]) return opts.cname[name];
      throw err("ENODATA");
    },
  };
}
const without = (name: string) => Object.fromEntries(Object.entries(GOOD).filter(([k]) => k !== name));

const sender = (over: Partial<PoolSender> = {}): PoolSender => ({
  id: "s1", organization_id: null, email: `hello@${DOMAIN}`, daily_limit: 50, warmup_stage: "w1",
  health_status: "healthy", dns_status: null, ...over,
});
const QUIET: SenderStats = { sent7: 0, hardBounced7: 0, sendDays: [] };
const D1 = "2026-11-02", D2 = "2026-11-03";

describe("checkDns", () => {
  it("all three present", async () => {
    expect(await checkDns(DOMAIN, resolver(GOOD))).toEqual({ spf: true, dkim: true, dmarc: true });
  });
  it("SPF that does not include Google counts as missing", async () => {
    const r = resolver({ ...GOOD, [DOMAIN]: [["v=spf1 include:mailgun.org ~all"]] });
    expect((await checkDns(DOMAIN, r)).spf).toBe(false);
  });
  it("DKIM by CNAME is present; no TXT and no CNAME is missing", async () => {
    const cname = { [`google._domainkey.${DOMAIN}`]: ["dkim.example.net"] };
    expect((await checkDns(DOMAIN, resolver(without(`google._domainkey.${DOMAIN}`), { cname }))).dkim).toBe(true);
    expect((await checkDns(DOMAIN, resolver(without(`google._domainkey.${DOMAIN}`)))).dkim).toBe(false);
  });
  it("a DNS timeout is no answer (null), not a missing record", async () => {
    expect((await checkDns(DOMAIN, resolver(GOOD, { timeout: [`_dmarc.${DOMAIN}`] }))).dmarc).toBeNull();
  });
});

describe("evaluateSender: DNS", () => {
  const at = (d: string) => `${d}T00:30:00.000Z`;
  it("all present: healthy, nothing to report", async () => {
    const v = evaluateSender(sender(), await checkDns(DOMAIN, resolver(GOOD)), QUIET, D1, at(D1));
    expect(v).toMatchObject({ health: "healthy", timeline: null, notify: null });
  });
  it("SPF missing: warning, timeline and one push", async () => {
    const v = evaluateSender(sender(), await checkDns(DOMAIN, resolver({ ...GOOD, [DOMAIN]: [] })), QUIET, D1, at(D1));
    expect(v.health).toBe("warning");
    expect(v.timeline).toContain("SPF");
    expect(v.notify).toContain("SPF");
  });
  it("DKIM missing: warning", async () => {
    const v = evaluateSender(sender(), await checkDns(DOMAIN, resolver(without(`google._domainkey.${DOMAIN}`))), QUIET, D1, at(D1));
    expect(v.health).toBe("warning");
    expect(v.reasons.join()).toContain("DKIM");
  });
  it("still missing the next day: paused (no second push for the same day's warning)", async () => {
    const found = await checkDns(DOMAIN, resolver(without(`google._domainkey.${DOMAIN}`)));
    const day1 = evaluateSender(sender(), found, QUIET, D1, at(D1));
    const sameDay = evaluateSender(sender({ health_status: "warning", dns_status: day1.patch.dns_status as PoolSender["dns_status"] }), found, QUIET, D1, at(D1));
    expect(sameDay).toMatchObject({ health: "warning", notify: null });
    const day2 = evaluateSender(sender({ health_status: "warning", dns_status: day1.patch.dns_status as PoolSender["dns_status"] }), found, QUIET, D2, at(D2));
    expect(day2.health).toBe("paused");
    expect(day2.notify).toContain("已暫停");
  });
});

describe("evaluateSender: bounces", () => {
  it("29 sent is not judged, even all bounced", async () => {
    const v = evaluateSender(sender(), await checkDns(DOMAIN, resolver(GOOD)), { sent7: 29, hardBounced7: 29, sendDays: [] }, D1, "x");
    expect(v.health).toBe("healthy");
  });
  it("30 sent at 3% is paused", async () => {
    const v = evaluateSender(sender(), await checkDns(DOMAIN, resolver(GOOD)), { sent7: 100, hardBounced7: 3, sendDays: [] }, D1, "x");
    expect(v.health).toBe("paused");
    const just = evaluateSender(sender(), await checkDns(DOMAIN, resolver(GOOD)), { sent7: 30, hardBounced7: 1, sendDays: [] }, D1, "x");
    expect(just.health).toBe("paused");  // 1/30 = 3.3%
    const under = evaluateSender(sender(), await checkDns(DOMAIN, resolver(GOOD)), { sent7: 34, hardBounced7: 1, sendDays: [] }, D1, "x");
    expect(under.health).toBe("healthy");  // 2.9%
  });
});

describe("evaluateSender: warm-up step", () => {
  it("4 send days at 70% do not step up; 5 do", async () => {
    const found = await checkDns(DOMAIN, resolver(GOOD));
    expect(evaluateSender(sender(), found, { sent7: 28, hardBounced7: 0, sendDays: [7, 7, 7, 7] }, D1, "x").patch.warmup_stage).toBeUndefined();
    const v = evaluateSender(sender(), found, { sent7: 35, hardBounced7: 0, sendDays: [7, 7, 7, 7, 7] }, D1, "x");
    expect(v.patch.warmup_stage).toBe("w2");
    expect(v.timeline).toContain("w2");
  });
  it("one day under 70% or a 2% bounce rate holds the stage; full never steps", async () => {
    const found = await checkDns(DOMAIN, resolver(GOOD));
    expect(evaluateSender(sender(), found, { sent7: 34, hardBounced7: 0, sendDays: [7, 7, 6, 7, 7] }, D1, "x").patch.warmup_stage).toBeUndefined();
    expect(evaluateSender(sender(), found, { sent7: 50, hardBounced7: 1, sendDays: [10, 10, 10, 10, 10] }, D1, "x").patch.warmup_stage).toBeUndefined();
    expect(evaluateSender(sender({ warmup_stage: "full" }), found, { sent7: 250, hardBounced7: 0, sendDays: [50, 50, 50, 50, 50] }, D1, "x").patch.warmup_stage).toBeUndefined();
  });
  it("stage caps 10 / 20 / 35 / min(50, own limit)", () => {
    expect([stageCap("w1", 50), stageCap("w2", 50), stageCap("w3", 50), stageCap("full", 50), stageCap("full", 30)]).toEqual([10, 20, 35, 50, 30]);
  });
});

function memoryStore(senders: PoolSender[], events: Array<{ event_type: string; created_at: string }>, claims: string[]) {
  const updates: Array<[string, Record<string, unknown>]> = [];
  const timeline: string[] = [];
  const store: HealthStore = {
    async poolSenders() { return senders; },
    async sender(id) { return senders.find((s) => s.id === id) ?? null; },
    async events() { return events; },
    async updateSender(id, patch) { updates.push([id, patch]); },
    async timeline(_s, title) { timeline.push(title); },
    async deleteClaimsBefore(iso) {
      const before = claims.filter((c) => c < iso).length;
      claims.splice(0, claims.length, ...claims.filter((c) => c >= iso));
      return before;
    },
  };
  return { store, updates, timeline, claims };
}

describe("runSenderHealth and recheckSender", () => {
  const now = new Date("2026-11-03T00:30:00.000Z");
  it("deletes claims older than 31 days and keeps the rest", async () => {
    const m = memoryStore([], [], ["2026-09-30T00:00:00.000Z", "2026-10-03T12:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
    const r = await runSenderHealth({ store: m.store, resolver: resolver(GOOD), notify: async () => {}, now });
    expect(r.claimsDeleted).toBe(1);
    expect(m.claims).toEqual(["2026-10-03T12:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
  });
  it("a paused mailbox is not unpaused by the daily run", async () => {
    const m = memoryStore([sender({ health_status: "paused" })], [], []);
    const r = await runSenderHealth({ store: m.store, resolver: resolver(GOOD), notify: async () => {}, now });
    expect(r.senders[0].health).toBe("paused");
    expect(m.updates[0][1].health_status).toBeUndefined();
  });
  it("recovery with bounces still high stays paused and says why; clean data recovers", async () => {
    const bounced = [
      ...Array.from({ length: 40 }, () => ({ event_type: "sent", created_at: "2026-11-01T02:00:00.000Z" })),
      ...Array.from({ length: 2 }, () => ({ event_type: "hard_bounced", created_at: "2026-11-01T03:00:00.000Z" })),
    ];
    const high = memoryStore([sender({ health_status: "paused" })], bounced, []);
    const r1 = await recheckSender({ store: high.store, resolver: resolver(GOOD), notify: async () => {}, now }, "s1");
    expect(r1.healthy).toBe(false);
    expect(r1.reasons.join()).toContain("退信率");
    expect(high.updates[0][1].health_status).toBeUndefined();

    const clean = memoryStore([sender({ health_status: "paused" })], bounced.slice(0, 40), []);
    const r2 = await recheckSender({ store: clean.store, resolver: resolver(GOOD), notify: async () => {}, now }, "s1");
    expect(r2.healthy).toBe(true);
    expect(clean.updates[0][1].health_status).toBe("healthy");
    expect(clean.timeline[0]).toContain("恢復");
  });
  it("recovery with a DNS record still missing stays paused", async () => {
    const m = memoryStore([sender({ health_status: "paused" })], [], []);
    const r = await recheckSender({ store: m.store, resolver: resolver({ ...GOOD, [`_dmarc.${DOMAIN}`]: [] }), notify: async () => {}, now }, "s1");
    expect(r).toMatchObject({ healthy: false });
    expect(r.reasons.join()).toContain("DMARC");
  });
});

describe("connectedSenderFields (OAuth callback)", () => {
  const opts = { connectorId: "c1", today: "2026-11-02" };
  it("a pool connect starts warm-up at w1, auto, 50/day", () => {
    expect(connectedSenderFields(null, { ...opts, pool: true })).toMatchObject({ send_mode: "auto", daily_limit: 50, warmup_stage: "w1", warmup_started_at: "2026-11-02", connector_id: "c1" });
    expect(connectedSenderFields({ send_mode: "draft" }, { ...opts, pool: true })).toMatchObject({ send_mode: "auto", warmup_stage: "w1" });
  });
  it("reconnecting a pool mailbox never restarts warm-up; a plain connect stays draft", () => {
    expect(connectedSenderFields({ send_mode: "auto" }, { ...opts, pool: true })).toEqual({ connector_id: "c1" });
    expect(connectedSenderFields(null, { ...opts, pool: false })).toEqual({ provider: "gmail", stream_type: "cold", daily_limit: 20, connector_id: "c1" });
  });
});

describe("poolEmailRefusal (SPEC I10: the main domain never sends cold mail)", () => {
  it("refuses the main domain and free mail, admits a subdomain", () => {
    expect(poolEmailRefusal("Sales@Aware-Wave.com", "aware-wave.com")).toContain("主網域");
    expect(poolEmailRefusal("me@gmail.com", "aware-wave.com")).toContain("免費信箱");
    expect(poolEmailRefusal("hello@mail.aware-wave.com", "aware-wave.com")).toBeNull();
    expect(poolEmailRefusal("hello@reach.brand.test", "aware-wave.com")).toBeNull();
  });
});
