// Cards C8.3, C8.5, C8.6 against a fake store: one send per mail across ticks, the window, a paused mailbox, a lead
// gone warm, the paid-verification gate (valid only, risky held, invalid suppressed, 90-day cache, no key = no send),
// and Gmail failures (4xx refused = given back + paused; timeout = left 'sending', never resent). The cap races are SQL
// (co_begin_send), in packages/db/tests/test_0152_sender_pool.py.
import { describe, expect, it } from "vitest";
import { inSendWindow, runAutoSend, tickQuota, type QueuedMail, type SendDeps, type SendLead, type SendStore } from "../send-adapter";
import { GmailSendError } from "../google-oauth";
import type { PoolAccount, SendCaps } from "../sender-pool";
import type { StoredVerdict } from "../mailbox-verify";
import type { EmailStatus } from "../verify-email";

const MON_10 = new Date("2026-11-02T02:00:00Z");  // Monday 10:00 Taipei
const acc = (id: string, over: Partial<PoolAccount> = {}): PoolAccount => ({ id, organization_id: "org", email: `${id}@a.pool.example`, is_active: true,
  health_status: "healthy", send_mode: "auto", warmup_stage: "w1", daily_limit: 50, connector_id: `c-${id}`, ...over });
const lead = (id: string, over: Partial<SendLead> = {}): SendLead => ({ id, organization_id: "org", name: id, email: `${id}@shop.example`, website: null,
  do_not_contact: false, status: "drafted", consent_source: null, next_followup_date: null, ...over });

class FakeStore implements SendStore {
  accounts: PoolAccount[] = [acc("a")];
  mails: Array<QueuedMail & { account: string; status: string }> = [];
  claims: string[] = [];
  verdicts = new Map<string, StoredVerdict>();
  suppressed: string[] = [];
  paused: string[] = [];
  timelines: string[] = [];
  sent: string[] = [];
  add(id: string, l: SendLead = lead(`l-${id}`), over: Partial<QueuedMail> = {}) {
    this.mails.push({ messageId: id, draftId: `d-${id}`, outputType: "cold_email", lead: l, approvedEvidence: 1, account: "a", status: "drafted", ...over });
  }
  async poolAccounts() { return this.accounts; }
  async claimsToday(ids: string[]) { return new Map(ids.map((id) => [id, this.mails.filter((m) => this.claims.includes(m.messageId) && m.account === id).length])); }
  async queue(accountId: string) { return this.mails.filter((m) => m.account === accountId && m.status === "drafted"); }
  async contactBlock(l: SendLead) { return l.do_not_contact ? ("do_not_contact" as const) : null; }
  async verdict(l: SendLead) { return this.verdicts.get(l.email!) ?? null; }
  async saveVerdict(l: SendLead, status: EmailStatus, provider: "hunter" | "zerobounce") { this.verdicts.set(l.email!, { status, provider, verified_at: MON_10.toISOString() }); }
  async suppressInvalid(l: SendLead) { this.suppressed.push(l.email!); }
  // co_begin_send's message rule: drafted -> sending once, the lead re-checked under its lock
  async beginSend(messageId: string, accountId: string, _email: string, caps: SendCaps) {
    const m = this.mails.find((x) => x.messageId === messageId)!;
    const used = this.mails.filter((x) => x.account === accountId && this.claims.includes(x.messageId)).length;
    if (m.status !== "drafted" || m.lead.status === "warm" || used >= caps.mailbox) return false;
    m.status = "sending"; this.claims.push(messageId); return true;
  }
  async markSent(messageId: string) { this.mails.find((x) => x.messageId === messageId)!.status = "sent"; return true; }
  async giveBack(messageId: string) { this.claims = this.claims.filter((c) => c !== messageId); this.mails.find((x) => x.messageId === messageId)!.status = "drafted"; }
  async pause(a: PoolAccount) { this.paused.push(a.id); a.health_status = "paused"; }
  async timeline(_l: SendLead, type: string) { this.timelines.push(type); }
}

function setup(over: Partial<SendDeps> = {}) {
  const store = new FakeStore();
  const gmailSent: string[] = [];
  const verifyCalls: string[] = [];
  const pushes: string[] = [];
  const verdict: { next: EmailStatus | null } = { next: "valid" };
  let failure: GmailSendError | null = null;
  const deps: SendDeps = {
    store, tokenFor: async () => "tok", notify: async (t) => { pushes.push(t); },
    verify: async (l) => { verifyCalls.push(l.email!); return verdict.next ? { status: verdict.next, provider: "hunter" } : null; },
    send: async (_t, draftId) => { if (failure) throw failure; gmailSent.push(draftId); return { id: `g-${draftId}`, threadId: "t" }; },
    now: () => MON_10, random: () => 0, sleep: async () => {}, ...over,
  };
  return { store, deps, gmailSent, verifyCalls, pushes, verdict, fail: (e: GmailSendError | null) => { failure = e; } };
}

describe("auto send", () => {
  it("one mail is sent once, however many ticks run", async () => {
    const { store, deps, gmailSent } = setup();
    store.add("m1");
    await runAutoSend(deps);
    await runAutoSend(deps);
    expect(gmailSent).toEqual(["d-m1"]);
    expect(store.mails[0].status).toBe("sent");
  });

  it("nothing outside Taipei 09-18 Monday to Friday; the tick quota spreads what is left over the ticks left", async () => {
    expect(inSendWindow(new Date("2026-11-02T00:59:00Z"))).toBe(false);  // 08:59
    expect(inSendWindow(new Date("2026-11-02T10:00:00Z"))).toBe(false);  // 18:00
    expect(inSendWindow(new Date("2026-11-07T02:00:00Z"))).toBe(false);  // Saturday
    const { store, deps, gmailSent } = setup({ now: () => new Date("2026-11-02T11:00:00Z") });
    store.add("m1");
    expect((await runAutoSend(deps)).window).toBe(false);
    expect(gmailSent).toEqual([]);
    expect(tickQuota(10, 0, MON_10)).toBe(1);                         // 10 left over 48 ticks
    expect(tickQuota(10, 0, new Date("2026-11-02T09:45:00Z"))).toBe(5); // 17:45: 10 left over 2 ticks
    expect(tickQuota(10, 10, MON_10)).toBe(0);
  });

  it("a paused mailbox sends nothing", async () => {
    const { store, deps, gmailSent } = setup();
    store.accounts = [acc("a", { health_status: "paused" })];
    store.add("m1");
    await runAutoSend(deps);
    expect(gmailSent).toEqual([]);
  });

  it("a lead gone warm after its draft was made is never sent", async () => {
    const { store, deps, gmailSent } = setup();
    store.add("m1", lead("l1", { status: "warm" }));
    store.add("m2", lead("l2", { consent_source: "meta_lead_ad_csv:x" }));
    await runAutoSend(deps);
    expect(gmailSent).toEqual([]);
  });

  it("paid verification: valid is sent; risky held for a person; invalid suppressed; no key sends nothing", async () => {
    for (const [status, sends] of [["valid", 1], ["risky", 0], ["invalid", 0], [null, 0]] as const) {
      const { store, deps, gmailSent, verdict } = setup();
      verdict.next = status;
      store.add("m1");
      await runAutoSend(deps);
      expect(gmailSent.length, String(status)).toBe(sends);
      expect(store.suppressed.length, String(status)).toBe(status === "invalid" ? 1 : 0);
      expect(store.timelines, String(status)).toEqual(status === "risky" ? ["auto_send_held"] : []);
    }
  });

  it("a paid verdict is reused for 90 days, then asked again; an MX-only row never counts", async () => {
    const { store, deps, gmailSent, verifyCalls } = setup();
    store.add("m1");
    store.verdicts.set("l-m1@shop.example", { status: "valid", provider: "zerobounce", verified_at: "2026-08-10T00:00:00Z" }); // 84 days
    await runAutoSend(deps);
    expect(verifyCalls).toEqual([]);
    expect(gmailSent).toEqual(["d-m1"]);
    store.add("m2");
    store.verdicts.set("l-m2@shop.example", { status: "valid", provider: "hunter", verified_at: "2026-07-01T00:00:00Z" }); // 124 days
    store.add("m3");
    store.verdicts.set("l-m3@shop.example", { status: "unknown", provider: "mx_syntax", verified_at: "2026-11-01T00:00:00Z" });
    await runAutoSend({ ...deps, now: () => new Date("2026-11-02T09:55:00Z") });  // 17:55, the last tick: the quota covers both
    expect(verifyCalls).toEqual(["l-m2@shop.example", "l-m3@shop.example"]);
  });

  it("Gmail refuses (4xx): the mail is given back as drafted and the mailbox paused with a push; a timeout leaves it sending", async () => {
    const refused = setup();
    refused.store.add("m1");
    refused.fail(new GmailSendError("gmail drafts.send 429: rate", "refused", 429));
    const r = await runAutoSend(refused.deps);
    expect(r.refused).toBe(1);
    expect(refused.store.mails[0].status).toBe("drafted");
    expect(refused.store.claims).toEqual([]);
    expect(refused.store.paused).toEqual(["a"]);
    expect(refused.pushes[0]).toMatch(/暫停自動寄出/);

    const unsure = setup();
    unsure.store.add("m1");
    unsure.fail(new GmailSendError("gmail drafts.send: timeout", "unknown", null));
    expect((await runAutoSend(unsure.deps)).uncertain).toBe(1);
    expect(unsure.store.mails[0].status).toBe("sending");
    unsure.fail(null);
    await runAutoSend(unsure.deps);  // the next tick does not resend it: reconciliation (gmail-sync) decides
    expect(unsure.gmailSent).toEqual([]);
  });
});

describe("auto send holds", () => {
  it("a follow-up is never sent automatically until C5 threads it; one mail's verifier error holds that mail only", async () => {
    const { store, deps, gmailSent } = setup({
      verify: async (l) => { if (l.email === "l-bad@shop.example") throw new Error("hunter verify 400"); return { status: "valid", provider: "hunter" }; },
      now: () => new Date("2026-11-02T09:55:00Z"),
    });
    store.add("f1", lead("l-f", { next_followup_date: "2026-11-01" }), { outputType: "followup" });
    store.add("bad", lead("l-bad"));
    store.add("ok", lead("l-ok"));
    const r = await runAutoSend(deps);
    expect(gmailSent).toEqual(["d-ok"]);
    expect(r.held).toBe(2);
    expect(r.errors).toEqual([expect.stringContaining("hunter verify 400")]);
  });
});
