// SPEC I6: the draft route re-checks the lead right before it touches Gmail -- do_not_contact, the suppression list and
// an invalid MX status each answer 409 with the reason, before any token is refreshed.
import { describe, expect, it, vi } from "vitest";

const MSG = { id: "00000000-0000-4000-8000-00000000000a", organization_id: "00000000-0000-4000-8000-0000000000c1", lead_id: "lead-1", subject: null, body: "hi", status: "approved" };
const state = vi.hoisted(() => ({ lead: {} as Record<string, unknown>, suppression: [] as unknown[], verified: [] as Array<{ email: string; status: string }> }));

vi.mock("@/lib/org-client", () => {
  const query = (table: string) => {
    const result = table === "co_messages" ? { data: MSG, error: null }
      : table === "co_leads" ? { data: state.lead, error: null }
      : table === "co_suppression_list" ? { data: state.suppression, error: null }
      : table === "co_verified_emails" ? { data: state.verified, error: null }
      : { data: null, error: null };
    // the agency's own Gmail connector exists (organization_id IS NULL); the lead's org has none
    const agency = table === "co_connector_accounts" ? { data: { id: "agency-gmail", organization_id: null, credentials_ref: "ref", is_enabled: true }, error: null } : null;
    let orgNull = false;
    const q: Record<string, unknown> = {};
    let paged = false;   // a keyset page after the first (.gt) is empty
    for (const k of ["select", "eq", "in", "not", "limit", "gte", "order", "insert", "update", "upsert"]) q[k] = () => q;
    q.is = (col: string) => { if (col === "organization_id") orgNull = true; return q; };
    q.gt = () => { paged = true; return q; };
    q.maybeSingle = async () => (agency && orgNull ? agency : result);
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(paged ? { data: [], error: null } : result).then(ok);
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from: query }) };
});
// a customer's own organization slug (lib/outreach/db-client.ts)
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { slug: "org-c1" }, error: null }) }) }) }) }) }));
vi.mock("@/lib/secret-vault", () => ({ getSecret: vi.fn(async () => { throw new Error("vault must not be reached when the lead is blocked"); }), connectorSecretRef: (id: string) => id }));

const { POST } = await import("./route");
const STAFF = { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1" };
const CLIENT = { "x-ops-user-kind": "client", "x-ops-org-id": MSG.organization_id, "x-ops-user-id": "c-1" };
const call = (who: Record<string, string> = STAFF) => POST(new Request("http://app.test/api/outreach/messages/gmail-draft", { method: "POST",
  headers: { ...who, "content-type": "application/json" },
  body: JSON.stringify({ messageId: MSG.id }) }));
const lead = (extra: Record<string, unknown> = {}) => ({ id: "lead-1", organization_id: MSG.organization_id, name: "Shop", email: "x@blocked.example", website: null, do_not_contact: false, ...extra });

describe("POST /api/outreach/messages/gmail-draft re-checks the lead before drafting", () => {
  it("a do_not_contact lead is refused with 409 and the reason", async () => {
    state.lead = lead({ do_not_contact: true }); state.suppression = []; state.verified = [];
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ ok: false, blocked: true, reason: "do_not_contact" });
  });
  it("a lead that replied (or turned warm) since approval is refused: the cold sequence is over", async () => {
    state.lead = lead({ status: "replied" }); state.suppression = []; state.verified = [];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("warm");
  });
  it("a lead on the suppression list is refused, whatever the case of the stored address", async () => {
    state.lead = lead({ email: "X@Blocked.Example" }); state.suppression = [{ id: "s1", email: "x@blocked.example", domain: null, scope: "email" }]; state.verified = [];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("suppressed");
  });
  it("a company-scope suppression row blocks the lead of that name", async () => {
    state.lead = lead({ name: "ACME 咖啡" }); state.suppression = [{ id: "s2", email: null, domain: null, company_name: "acme 咖啡", scope: "company" }]; state.verified = [];
    expect((await (await call()).json()).reason).toBe("suppressed");
  });
  it("an address with a line break never reaches a header", async () => {
    state.lead = lead({ email: ["x@ok.example", "Bcc: evil@x.example"].join("\n") }); state.suppression = []; state.verified = [];
    expect((await (await call()).json()).reason).toBe("email_invalid");
  });
  it("a pasted display-name address is refused as invalid, not a 500 from the suppression read", async () => {
    state.lead = lead({ email: '"John" <j@x.example>' }); state.suppression = []; state.verified = [];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("email_invalid");
  });
  it("an address whose domain has no mail server is refused", async () => {
    state.lead = lead(); state.suppression = []; state.verified = [{ email: "x@blocked.example", status: "invalid" }];
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).reason).toBe("email_invalid");
  });
  it("a customer never drafts in the agency's mailbox; staff may (self-use before a client connects)", async () => {
    state.lead = lead(); state.suppression = []; state.verified = [{ email: "x@blocked.example", status: "unknown" }];
    const client = await (await call(CLIENT)).json();
    expect(client.error).toMatch(/no connected Gmail connector/);
    const staff = await (await call()).json();
    expect(staff.error).not.toMatch(/no connected Gmail connector/);
  });
});
