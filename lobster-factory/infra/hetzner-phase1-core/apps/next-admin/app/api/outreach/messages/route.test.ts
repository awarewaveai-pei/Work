// messages/route.ts (SPEC §5.3, §5.4, D23): who a draft is billed to (ADR 017 §3), what one generation writes, the
// review policy, and the PATCH rules that keep one first email per lead on its way out.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const LEAD_ID = "00000000-0000-4000-8000-00000000001a";
const MSG_ID = "00000000-0000-4000-8000-0000000000aa";
const SIGNATURE = "王小明\n好夥伴工作室\nhttps://partner.example";

const GOOD = JSON.stringify({
  subjects: ["想請教貴店的課表", "關於週末親子課"],
  bodies: [
    { label: "A", text: "您好，看到貴店週末開了親子課。如果不適合，我就不再打擾。", evidence_ids: ["lead-observation"] },
    { label: "B", text: "您好，注意到親子課很受歡迎。如果不適合，我就不再打擾。", evidence_ids: ["lead-observation"] },
  ],
  followups: [{ step: 2, delay_days: 3, text: "再補充一個想法。如果不適合，我就不再打擾。" }],
});

interface Op { table: string; kind: "select" | "insert" | "update" | "delete"; payload?: unknown; filters: Array<[string, unknown[]]> }

const m = vi.hoisted(() => ({
  grantFor: vi.fn(async (_feature: string, _ctx?: unknown) => ({ allowed: true })),
  actorFor: vi.fn(),
  claude: vi.fn(async (_g: unknown, _k: string, _p: string) => ({ text: "", model: "m" })),
  claims: vi.fn(async () => ({ verdict: "supported" as const })),
  ops: [] as Op[],
  state: {} as Record<string, unknown>,
}));

vi.mock("@/lib/entitlements/grant", () => ({ grantFor: m.grantFor }));
vi.mock("@/lib/social/authz", () => ({ actorFor: m.actorFor }));
vi.mock("@/lib/outreach/ai-claude", () => ({ generateWithClaude: m.claude }));
vi.mock("@/lib/outreach/ai-openai", () => ({ generateWithOpenAI: vi.fn() }));
vi.mock("@/lib/outreach/ai-gemini", () => ({ generateWithGemini: vi.fn() }));
vi.mock("@/lib/outreach/claim-check", () => ({ checkClaims: m.claims }));
vi.mock("@/lib/secret-vault", () => ({ getSecret: async () => "key", connectorSecretRef: (id: string) => `co_connector:${id}` }));
vi.mock("@/lib/org-client", () => {
  const query = (table: string) => {
    const op: Op = { table, kind: "select", filters: [] };
    const q: Record<string, unknown> = {};
    for (const k of ["eq", "is", "not", "in", "neq", "lt", "match", "order", "limit"]) q[k] = (...a: unknown[]) => { op.filters.push([k, a]); return q; };
    q.select = () => q;
    q.insert = (p: unknown) => { op.kind = "insert"; op.payload = p; return q; };
    q.update = (p: unknown) => { op.kind = "update"; op.payload = p; return q; };
    q.delete = () => { op.kind = "delete"; return q; };
    const result = (single: boolean) => { m.ops.push(op); return respond(op, single); };
    q.maybeSingle = async () => result(true);
    q.single = async () => result(true);
    q.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => Promise.resolve(result(false)).then(ok, bad);
    return q;
  };
  function respond(op: Op, single: boolean): unknown {
    const s = m.state;
    if (op.table === "co_leads") return { data: s.lead, error: null };
    if (op.table === "co_service_profiles") return { data: s.profile ?? null, error: null };
    if (op.table === "co_sender_accounts") return { data: s.sender ? [s.sender] : [], error: null };
    if (op.table === "organizations") return { data: { name: "好夥伴工作室" }, error: null };
    // single = the AI ladder's key lookup; list = the Gmail connections a mailbox must have (sender.ts)
    if (op.table === "co_connector_accounts") return single ? { data: { id: "conn-1" }, error: null }
      : { data: s.connected === false ? [] : [{ settings: { email: (s.sender as { email: string }).email } }], error: null };
    if (op.table === "co_messages") {
      if (op.kind === "insert") return { data: op.payload, error: null };
      if (op.kind === "update") return (s.updateError as object) ?? (s.updateNull ? { data: null, error: null } : { data: { id: MSG_ID, ...(op.payload as object) }, error: null });
      return s.current ? { data: s.current, error: null } : { data: null, count: (s.outbound as number) ?? 0, error: null };
    }
    return { data: null, error: null };
  }
  return { getOrgSupabaseWriteClient: async () => ({ from: query }) };
});

const { POST, PATCH } = await import("./route");
const headers = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" };
const post = () => POST(new Request("http://app.test/api/outreach/messages", { method: "POST", headers, body: JSON.stringify({ leadId: LEAD_ID }) }));
const patch = (body: Record<string, unknown>) =>
  PATCH(new Request("http://app.test/api/outreach/messages", { method: "PATCH", headers, body: JSON.stringify({ id: MSG_ID, ...body }) }));
const inserted = () => (m.ops.find((o) => o.table === "co_messages" && o.kind === "insert")?.payload ?? []) as Array<Record<string, unknown>>;

beforeEach(() => {
  m.grantFor.mockReset(); m.grantFor.mockResolvedValue({ allowed: true }); m.actorFor.mockReset(); m.claude.mockReset(); m.claims.mockReset();
  m.claude.mockResolvedValue({ text: GOOD, model: "m" });
  m.actorFor.mockResolvedValue(null);
  m.claims.mockResolvedValue({ verdict: "supported" });
  m.ops.length = 0;
  m.state = {
    lead: { id: LEAD_ID, organization_id: ORG, service_profile_id: "p-1", name: "小樹親子館", observation: "週末開親子課", source_url: "https://tree.example",
      consent_source: "self_published:https://tree.example/contact", do_not_contact: false },
    profile: { id: "p-1", service_name: "課程行銷", privacy_url: "https://partner.example/privacy", review_mode: "manual", review_sample_pct: 10, forbidden_words: [] },
    sender: { id: "s-1", organization_id: ORG, email: "hi@partner.example", display_name: "王小明", signature_block: SIGNATURE },
  };
});

describe("POST /api/outreach/messages bills the lead's organization", () => {
  it("a caller with a role on the lead's org acts for it (acting carries that org)", async () => {
    const acting = { orgId: ORG, actor: "ops:owner:u-1" };
    m.actorFor.mockResolvedValue(acting);
    await post();
    expect(m.actorFor).toHaveBeenCalledWith(expect.any(Request), ORG);
    expect(m.grantFor).toHaveBeenCalledWith("outreach.draft", expect.objectContaining({ acting }));
  });

  it("without a role there the org is still named, so the gate answers not_authorized_for_org instead of billing internal", async () => {
    m.actorFor.mockRejectedValue(new Error("not_authorized_for_org"));
    await post();
    const ctx = m.grantFor.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ctx).toMatchObject({ orgId: ORG });
    expect(ctx.acting).toBeUndefined();
  });
});

describe("one generation writes two first emails and the follow-ups", () => {
  it("A and B with their subjects, follow-ups by step, every body ending with the signature, all drafts", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    const rows = inserted();
    expect(rows.map((r) => [r.output_type, r.variant_label, r.version])).toEqual([["cold_email", "A", 1], ["cold_email", "B", 1], ["followup", null, 2]]);
    expect(rows[0].subject).toBe("想請教貴店的課表");
    expect(rows[2]).toMatchObject({ subject: null, followup_delay_days: 3 });
    for (const r of rows) {
      expect(String(r.body).endsWith(SIGNATURE)).toBe(true);
      expect(r.status).toBe("draft");
      expect(r.quality_gate_status).toBe("pass");
    }
    expect(rows[0].evidence_snapshot).toEqual({ evidence_ids: ["lead-observation"] });
  });

  it("a lead that did not publish the address itself gets the notice line on the first emails only", async () => {
    (m.state.lead as Record<string, unknown>).consent_source = "general_source:https://dir.example/x";
    await post();
    const rows = inserted();
    expect(String(rows[0].body)).toContain("個資告知");
    expect(String(rows[0].body)).toContain("https://partner.example/privacy");
    expect(String(rows[2].body)).not.toContain("個資告知");
  });

  it("refuses with 422 when the notice is needed but the profile has no privacy page, or the mailbox has no signature", async () => {
    (m.state.lead as Record<string, unknown>).consent_source = null;
    (m.state.profile as Record<string, unknown>).privacy_url = null;
    expect((await post()).status).toBe(422);
    m.state.profile = { id: "p-1", privacy_url: "https://partner.example/privacy", review_mode: "manual", review_sample_pct: 10 };
    (m.state.sender as Record<string, unknown>).signature_block = null;
    const res = await post();
    expect(res.status).toBe(422);
    expect(inserted()).toEqual([]);
  });

  it("refuses with 422 when the organization's mailbox has no Gmail connection any more", async () => {
    m.state.connected = false;
    expect((await post()).status).toBe(422);
    expect(m.claude).not.toHaveBeenCalled();
  });

  it("refuses with 409 when the lead already has a first email on its way out", async () => {
    m.state.outbound = 1;
    expect((await post()).status).toBe(409);
    expect(m.claude).not.toHaveBeenCalled();
  });

  it("an unreadable reply gets one repair turn; a second unreadable one becomes a blocked manual prompt", async () => {
    m.claude.mockResolvedValueOnce({ text: "not json", model: "m" }).mockResolvedValueOnce({ text: GOOD, model: "m" });
    await post();
    expect(m.claude).toHaveBeenCalledTimes(2);
    expect(String(m.claude.mock.calls[1][2])).toContain("你上一次的回覆格式不對");
    expect(inserted()).toHaveLength(3);

    m.ops.length = 0; m.claude.mockReset(); m.claude.mockResolvedValue({ text: "still not json", model: "m" });
    const body = await (await post()).json();
    expect(body.mode).toBe("manual_prompt");
    const rows = inserted() as unknown as Record<string, unknown>;
    expect(rows).toMatchObject({ quality_gate_status: "block", status: "draft" });
  });
});

describe("sampled review (SPEC D23)", () => {
  beforeEach(() => { m.state.profile = { ...(m.state.profile as object), review_mode: "sampled", review_sample_pct: 0 }; });

  it("keeps one variant per lead and approves it only when the fact check supports it", async () => {
    await post();
    const firsts = inserted().filter((r) => r.output_type === "cold_email");
    expect(firsts.map((r) => r.status).sort()).toEqual(["approved", "skipped"]);
    const kept = firsts.find((r) => r.status === "approved")!;
    expect(kept.gate_snapshot).toMatchObject({ auto: true, claim_check: { verdict: "supported" } });
    expect(kept.approved_at).toBeTruthy();
    expect(m.grantFor).toHaveBeenCalledWith("outreach.qa", expect.anything());
  });

  it("an unsupported claim leaves the kept variant in the queue", async () => {
    m.claims.mockResolvedValue({ verdict: "unsupported", claims: ["x"] } as never);
    await post();
    const statuses = inserted().filter((r) => r.output_type === "cold_email").map((r) => r.status).sort();
    expect(statuses).toEqual(["draft", "skipped"]);
  });

  it("a lead in the sample goes to a person without a fact check", async () => {
    m.state.profile = { ...(m.state.profile as object), review_sample_pct: 100 };
    await post();
    expect(m.claims).not.toHaveBeenCalled();
    expect(inserted().filter((r) => r.output_type === "cold_email").map((r) => r.status).sort()).toEqual(["draft", "skipped"]);
  });
});

describe("PATCH review", () => {
  const current = (over: Record<string, unknown> = {}) => ({ organization_id: ORG, lead_id: LEAD_ID, output_type: "cold_email", subject: "主旨",
    body: `內文\n\n${SIGNATURE}`, gate_snapshot: { required: { signature: SIGNATURE, notice: null }, forbidden: [] }, quality_gate_status: "pass", status: "draft", ...over });

  it("approving a first email skips its other variant", async () => {
    m.state.current = current();
    const res = await patch({ status: "approved" });
    expect(res.status).toBe(200);
    const updates = m.ops.filter((o) => o.table === "co_messages" && o.kind === "update");
    expect(updates[1].payload).toEqual({ status: "skipped" });
    expect(updates[1].filters).toContainEqual(["neq", ["id", MSG_ID]]);
  });

  it("a second approved first email for the lead is 409 variant_already_approved", async () => {
    m.state.current = current();
    m.state.updateError = { data: null, error: { code: "23505", message: "duplicate key" } };
    const res = await patch({ status: "approved" });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("variant_already_approved");
  });

  it("an edit that removes the signature is blocked and cannot be approved", async () => {
    m.state.current = current();
    const res = await patch({ status: "approved", body: "新的內文，沒有署名" });
    expect(res.status).toBe(422);
    expect((await res.json()).findings).toContain("內文沒有以署名結尾");
  });

  it("a drafted email no longer changes", async () => {
    m.state.current = current({ status: "drafted" });
    expect((await patch({ status: "approved" })).status).toBe(409);
  });
});

describe("C2 critic round", () => {
  it("a refused outreach.qa grant keeps the paid generation: rows written, the kept variant waits for a person", async () => {
    m.state.profile = { ...(m.state.profile as object), review_mode: "sampled", review_sample_pct: 0 };
    m.grantFor.mockImplementation(async (feature: string) => { if (feature === "outreach.qa") throw new Error("no_credits"); return { allowed: true }; });
    const res = await post();
    expect(res.status).toBe(200);
    const firsts = inserted().filter((r) => r.output_type === "cold_email");
    expect(firsts.map((r) => r.status).sort()).toEqual(["draft", "skipped"]);
    expect(firsts.find((r) => r.status === "draft")!.gate_snapshot).toMatchObject({ claim_check: { verdict: "error" } });
  });

  it("a pasted reply goes through the same guard with no AI call; an unreadable paste is 400", async () => {
    const paste = (pastedReply: string) => POST(new Request("http://app.test/api/outreach/messages", { method: "POST", headers,
      body: JSON.stringify({ leadId: LEAD_ID, pastedReply }) }));
    const res = await paste(GOOD);
    expect((await res.json()).mode).toBe("manual_paste");
    expect(m.claude).not.toHaveBeenCalled();
    expect(inserted()).toHaveLength(3);
    expect((await paste("not json")).status).toBe(400);
  });

  it("a new set retires the lead's unsent one only after the new set is written, never the new rows", async () => {
    await post();
    const retire = m.ops.findIndex((o) => o.table === "co_messages" && o.kind === "update");
    const insert = m.ops.findIndex((o) => o.table === "co_messages" && o.kind === "insert");
    expect(m.ops[retire].payload).toEqual({ status: "skipped" });
    expect(m.ops[retire].filters).toContainEqual(["in", ["status", ["draft", "needs_edit"]]]);
    expect(m.ops[retire].filters.some(([k, a]) => k === "lt" && a[0] === "created_at")).toBe(true);
    expect(insert).toBeLessThan(retire);
  });

  it("the profile the email was written under is recorded (the sampled unlock counts by it)", async () => {
    await post();
    expect(inserted()[0].gate_snapshot).toMatchObject({ profile_id: "p-1" });
  });

  it("PATCH loses to a concurrent change (409 status_changed) and refuses to approve a row without required parts", async () => {
    m.state.current = { organization_id: ORG, lead_id: LEAD_ID, output_type: "cold_email", subject: "s", body: `b

${SIGNATURE}`,
      gate_snapshot: { required: { signature: SIGNATURE, notice: null } }, quality_gate_status: "pass", status: "draft" };
    m.state.updateNull = true;
    const raced = await patch({ status: "approved" });
    expect(raced.status).toBe(409);
    expect((await raced.json()).error).toBe("status_changed");
    const update = m.ops.find((o) => o.table === "co_messages" && o.kind === "update")!;
    expect(update.filters).toContainEqual(["eq", ["status", "draft"]]);
    m.state.updateNull = false;
    m.state.current = { ...(m.state.current as object), gate_snapshot: null };
    expect((await (await patch({ status: "approved" })).json()).error).toBe("regenerate_required");
  });
});
