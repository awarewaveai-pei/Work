// Card C15.4: the pipeline tick against a fake store (SPEC D23, D24): per-step caps and the daily budget, the review
// policy (manual never approves; sampled ratio; one variant per lead; unsupported and warn go to the queue; auto rows
// carry gate_snapshot.auto=true), and a warm lead never entering any step. The queries are the store's (pipeline-store.ts).
import { describe, expect, it } from "vitest";
import { dailyBudget, PIPELINE_CAP, runPipelineTick, type DecideResult, type DraftRow, type DraftableMessage, type PipelineAccount, type PipelineDeps, type PipelineLead, type PipelineStore, type Profile } from "../pipeline";
import { inSample, pickVariant, type ClaimCheck } from "../review-policy";
import type { PoolAccount } from "../sender-pool";

const NOW = new Date("2026-11-02T02:00:00Z");
const acc = (id: string, over: Partial<PoolAccount> = {}): PoolAccount => ({ id, organization_id: "org", email: `${id}@a.pool.example`, is_active: true,
  health_status: "healthy", send_mode: "auto", warmup_stage: "w3", daily_limit: 50, connector_id: `c-${id}`, ...over });
const lead = (id: string, over: Partial<PipelineLead> = {}): PipelineLead => ({ id, organization_id: "org", service_profile_id: "p1", name: id, observation: null,
  source_url: null, consent_source: null, status: "qualified", do_not_contact: false, website: `https://${id}.example`, email: `${id}@x.example`, ...over });
type Row = DraftRow & { status: string; approved_at?: string };

class FakeStore implements PipelineStore {
  accountsOf: PipelineAccount[] = [acc("a"), acc("b")];  // 2 x 35 x 1.5 = 105 a day
  used = { research: 0, generate: 0 };
  researchFor: PipelineLead[] = [];
  generateFor: PipelineLead[] = [];
  leads = new Map<string, PipelineLead>();
  rows: Row[] = [];
  profiles = new Map<string, Profile>([["p1", { id: "p1", review_mode: "sampled", review_sample_pct: 10 }]]);
  approvedFirsts: DraftableMessage[] = [];
  followups: DraftableMessage[] = [];
  /** leads where a person already approved a first email (the 0149 unique index) */
  approvedLeads = new Set<string>();
  decideCalls = 0;
  async organizations() { return ["org"]; }
  async accounts() { return this.accountsOf; }
  async usedSince() { return this.used; }
  // the fake ignores the limit: the pipeline's own cap is what is under test
  async researchCandidates() { return this.researchFor; }
  async generateCandidates() { return this.generateFor; }
  async undecidedDrafts() { return { rows: this.rows.filter((r) => r.status === "draft" && r.gate_snapshot?.sampled === undefined), leads: this.leads }; }
  async profile(_o: string, id: string | null) { return id ? this.profiles.get(id) ?? null : null; }
  async evidence() { return []; }
  async decide(rowId: string, patch: { status?: "approved"; approved_at?: string; gate_snapshot: Record<string, unknown> }): Promise<DecideResult> {
    this.decideCalls++;
    const row = this.rows.find((r) => r.id === rowId)!;
    if (row.status !== "draft") return "changed";
    if (patch.status === "approved" && this.approvedLeads.has(row.lead_id)) return "conflict";
    row.gate_snapshot = patch.gate_snapshot;
    if (patch.status === "approved") { row.status = "approved"; row.approved_at = patch.approved_at; this.approvedLeads.add(row.lead_id); }
    return "ok";
  }
  async approveFollowups() { return 0; }
  async autoApprovedFollowupLeads() { return []; }
  async skip(ids: string[]) { for (const r of this.rows) if (ids.includes(r.id) && r.status === "draft") r.status = "skipped"; }
  async approvedFirstEmails(_org: string, _senderIds: string[]) { return { rows: this.approvedFirsts, leads: this.leads }; }
  async dueFollowups() { return { rows: this.followups, leads: this.leads }; }
}

function setup(over: Partial<PipelineDeps> = {}) {
  const store = new FakeStore();
  const calls = { research: [] as string[], generate: [] as string[], draft: [] as string[], check: 0 };
  const verdict: { next: ClaimCheck } = { next: { verdict: "supported" } };
  const deps: PipelineDeps = {
    store, now: () => NOW,
    runInOrg: (_org, fn) => fn(),
    research: async (l) => { calls.research.push(l.id); },
    generate: async (l) => { calls.generate.push(l.id); return { status: 200 }; },
    draft: async (id) => { calls.draft.push(id); return { status: 200 }; },
    check: async () => { calls.check++; return verdict.next; },
    ...over,
  };
  return { store, deps, calls, verdict };
}

/** both variants of a lead's first email, as generation writes them */
function pair(store: FakeStore, id: string, gate: DraftRow["quality_gate_status"] = "pass", over: Partial<PipelineLead> = {}) {
  store.leads.set(id, lead(id, over));
  for (const v of ["A", "B"]) store.rows.push({ id: `${id}-${v}`, lead_id: id, variant_label: v, quality_gate_status: gate, body: "您好", gate_snapshot: { profile_id: "p1" }, status: "draft" });
}
const leadsOf = (n: number, prefix = "l") => Array.from({ length: n }, (_, i) => lead(`${prefix}${i}`));

describe("per-step caps and the daily budget (C15.1, C15.3)", () => {
  it("each step handles at most PIPELINE_CAP per tick", async () => {
    const { store, deps, calls } = setup();
    store.researchFor = leadsOf(30, "r");
    store.generateFor = leadsOf(30, "g");
    store.approvedFirsts = Array.from({ length: 30 }, (_, i) => ({ messageId: `m${i}`, leadId: `d${i}`, senderId: "a" }));
    store.followups = Array.from({ length: 30 }, (_, i) => ({ messageId: `f${i}`, leadId: `d${i}`, senderId: "a" }));
    for (let i = 0; i < 30; i++) store.leads.set(`d${i}`, lead(`d${i}`, { status: "sent" }));
    const r = await runPipelineTick(deps);
    expect(PIPELINE_CAP).toBe(20);
    expect(calls.research).toHaveLength(20);
    expect(calls.generate).toHaveLength(20);
    expect(r).toMatchObject({ researched: 20, generated: 20, drafted: 20, followupsDrafted: 20 });
    expect(calls.draft).toHaveLength(40);
  });

  it("research and writing stop for the day at pool caps x 1.5; the room left is what is spent", async () => {
    expect(dailyBudget([acc("a"), acc("b")])).toBe(105);
    expect(dailyBudget([acc("a", { health_status: "paused" })])).toBe(0);  // a mailbox outside the pool counts for nothing
    const { store, deps, calls } = setup();
    store.researchFor = leadsOf(30, "r");
    store.generateFor = leadsOf(30, "g");
    store.used = { research: 105, generate: 100 };
    const r = await runPipelineTick(deps);
    expect(calls.research).toHaveLength(0);
    expect(calls.generate).toHaveLength(5);  // 105 - 100 left
    expect(r.held).toContain("org:research:daily_budget");
  });
});

describe("review policy (C15.1 ③, D23, D24)", () => {
  it("a manual profile is never auto-approved: nothing is decided, the drafts stay for a person", async () => {
    const { store, deps, calls } = setup();
    store.profiles.set("p1", { id: "p1", review_mode: "manual", review_sample_pct: 10 });
    for (let i = 0; i < 10; i++) pair(store, `m${i}`);
    const r = await runPipelineTick(deps);
    expect(r.autoApproved).toBe(0);
    expect(store.decideCalls).toBe(0);
    expect(calls.check).toBe(0);
    expect(store.rows.every((x) => x.status === "draft")).toBe(true);
  });

  it("sampled: about review_sample_pct of the leads go to a person, the rest are approved by the policy", async () => {
    const { store, deps } = setup();
    const N = 300;
    for (let i = 0; i < N; i++) pair(store, `s${i}`);
    for (let t = 0; t < N / PIPELINE_CAP + 1; t++) await runPipelineTick(deps);
    const approved = store.rows.filter((r) => r.status === "approved");
    const queued = store.rows.filter((r) => r.status === "draft");
    expect(approved.length + queued.length).toBe(N);  // one first email per lead, every lead decided
    const expectedQueued = Array.from({ length: N }, (_, i) => inSample(`s${i}`, 10)).filter(Boolean).length;
    expect(queued.length).toBe(expectedQueued);  // the decision is the deterministic hash, not chance
    expect(queued.length).toBeGreaterThan(N * 0.04);
    expect(queued.length).toBeLessThan(N * 0.18);
  });

  it("one variant per lead reaches drafting: the hash picks it, the other is skipped", async () => {
    const { store, deps } = setup();
    for (let i = 0; i < 12; i++) pair(store, `v${i}`);
    await runPipelineTick(deps);
    for (let i = 0; i < 12; i++) {
      const mine = store.rows.filter((r) => r.lead_id === `v${i}`);
      const live = mine.filter((r) => r.status !== "skipped");
      expect(live).toHaveLength(1);
      expect(live[0].variant_label).toBe(pickVariant(`v${i}`));
    }
  });

  it("a second approved variant (a person got there first, the 0149 unique index) is a conflict: nothing approved twice, both skipped", async () => {
    const { store, deps } = setup();
    const id = Array.from({ length: 200 }, (_, i) => `c${i}`).find((x) => !inSample(x, 10))!;  // would be auto-approved
    pair(store, id);
    store.approvedLeads.add(id);
    const r = await runPipelineTick(deps);
    expect(r.autoApproved).toBe(0);
    expect(store.rows.filter((x) => x.status === "approved")).toHaveLength(0);
    expect(store.rows.every((x) => x.status === "skipped")).toBe(true);
  });

  it("an unsupported fact check goes to the queue, with the verdict recorded and no auto mark", async () => {
    const { store, deps, verdict } = setup();
    verdict.next = { verdict: "unsupported", claims: ["去年得獎"] };
    const id = Array.from({ length: 200 }, (_, i) => `u${i}`).find((x) => !inSample(x, 10))!;
    pair(store, id);
    const r = await runPipelineTick(deps);
    const kept = store.rows.find((x) => x.variant_label === pickVariant(id))!;
    expect(r).toMatchObject({ autoApproved: 0, queued: 1 });
    expect(kept.status).toBe("draft");
    expect(kept.gate_snapshot?.claim_check).toEqual({ verdict: "unsupported", claims: ["去年得獎"] });
    expect(kept.gate_snapshot?.auto).toBeUndefined();
  });

  it("a lint warning goes to the queue without paying for a fact check", async () => {
    const { store, deps, calls } = setup();
    const id = Array.from({ length: 200 }, (_, i) => `w${i}`).find((x) => !inSample(x, 10))!;
    pair(store, id, "warn");
    const r = await runPipelineTick(deps);
    expect(calls.check).toBe(0);
    expect(r).toMatchObject({ autoApproved: 0, queued: 1 });
    expect(store.rows.find((x) => x.variant_label === pickVariant(id))!.status).toBe("draft");
  });

  it("a policy approval carries gate_snapshot.auto=true and an approved_at; a sampled-out draft carries neither", async () => {
    const { store, deps } = setup();
    const ids = Array.from({ length: 60 }, (_, i) => `a${i}`);
    for (const id of ids) pair(store, id);
    for (let t = 0; t < 4; t++) await runPipelineTick(deps);
    const approved = store.rows.filter((r) => r.status === "approved");
    expect(approved.length).toBeGreaterThan(0);
    for (const r of approved) {
      expect(r.gate_snapshot?.auto).toBe(true);
      expect(r.gate_snapshot?.sampled).toBe(false);
      expect(r.approved_at).toBe(NOW.toISOString());
    }
    for (const r of store.rows.filter((x) => x.status === "draft")) {
      expect(r.gate_snapshot?.sampled).toBe(true);
      expect(r.gate_snapshot?.auto).toBeUndefined();
    }
  });
});

describe("a lead nobody may cold-email never enters a step (Cold Gate)", () => {
  it("do_not_contact, replied, opted out and Meta lead-ad leads are skipped even when the store returns them", async () => {
    const { store, deps, calls } = setup();
    const bad = [lead("dnc", { do_not_contact: true }), lead("replied", { status: "replied" }), lead("warm", { status: "warm" }),
      lead("unsub", { status: "unsubscribed" }), lead("meta", { consent_source: "meta_lead_ad_csv:form1" })];
    store.researchFor = bad;
    store.generateFor = bad;
    for (const b of bad) { pair(store, b.id, "pass", b); store.leads.set(b.id, b); }
    store.approvedFirsts = bad.map((b) => ({ messageId: `m-${b.id}`, leadId: b.id, senderId: "a" }));
    store.followups = bad.map((b) => ({ messageId: `f-${b.id}`, leadId: b.id, senderId: "a" }));
    const r = await runPipelineTick(deps);
    expect(calls).toMatchObject({ research: [], generate: [], draft: [], check: 0 });
    expect(store.decideCalls).toBe(0);
    expect(r).toMatchObject({ researched: 0, generated: 0, autoApproved: 0, queued: 0, drafted: 0, followupsDrafted: 0 });
  });
});

describe("the operator's own Gmail in draft mode (2026-11-03): drafted for when switched on, never otherwise", () => {
  const mine = (over: Partial<PipelineAccount> = {}): PipelineAccount =>
    ({ ...acc("me", { send_mode: "draft", warmup_stage: "full", daily_limit: 20 }), auto_draft: true, connector_ok: true, ...over });
  it("auto_draft on: its daily_limit sets the budget and its approved mail is drafted", async () => {
    const { store, deps, calls } = setup();
    store.accountsOf = [mine()];
    const asked: string[][] = [];
    store.approvedFirstEmails = async (_o: string, senderIds: string[]) => { asked.push(senderIds); return { rows: [{ messageId: "m1", leadId: "l1", senderId: "me" }], leads: new Map([["l1", lead("l1")]]) }; };
    store.researchFor = leadsOf(40, "r");
    await runPipelineTick(deps);
    expect(dailyBudget(store.accountsOf)).toBe(30);  // 20 x 1.5
    expect(asked).toEqual([["me"]]);
    expect(calls.draft).toEqual(["m1"]);
  });
  it("switch off, the mailbox paused, or its Gmail connector disabled: no budget and no mailbox to draft for", async () => {
    for (const a of [mine({ auto_draft: false }), mine({ health_status: "paused" }), mine({ connector_ok: false })]) {
      const { store, deps, calls } = setup();
      store.accountsOf = [a];
      const asked: string[][] = [];
      store.approvedFirstEmails = async (_o: string, senderIds: string[]) => { asked.push(senderIds); return { rows: [], leads: new Map() }; };
      store.researchFor = leadsOf(5, "r");
      const r = await runPipelineTick(deps);
      expect(dailyBudget([a])).toBe(0);
      expect(calls.research).toEqual([]);
      expect(r.held).toContain("org:research:daily_budget");
      expect(asked).toEqual([[]]);
    }
  });
});
