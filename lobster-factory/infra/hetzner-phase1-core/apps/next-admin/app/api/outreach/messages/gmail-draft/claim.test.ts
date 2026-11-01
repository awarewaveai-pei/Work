// gmail-draft takes the row before Gmail is called (two requests never both draft one email) and drafts only from the
// mailbox the email was written for (its signature is in the body; SPEC D12).
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "00000000-0000-4000-8000-0000000000c1";
const MSG = { id: "00000000-0000-4000-8000-00000000000a", organization_id: ORG, lead_id: "lead-1", subject: "主旨", body: "hi", status: "approved",
  prompt_snapshot: { sender_id: "s-1" } };
const s = vi.hoisted(() => ({ sender: {} as Record<string, unknown>, taken: true as boolean, created: 0, fail: false as false | "refused" | "unknown", updates: [] as unknown[], built: "",
  msg: null as Record<string, unknown> | null, events: 0 }));

vi.mock("@/lib/outreach/contact-guard", () => ({ contactBlock: async () => null }));
vi.mock("@/lib/secret-vault", () => ({ getSecret: async () => "refresh", connectorSecretRef: (id: string) => id }));
vi.mock("@/lib/outreach/google-oauth", () => {
  class GmailDraftError extends Error { constructor(message: string, readonly created: "no" | "unknown") { super(message); } }
  return {
    GmailDraftError,
    refreshAccessToken: async () => ({ access_token: "at" }),
    buildRfc2822Message: (m: { bodyText: string }) => { s.built = m.bodyText; return "raw"; }, toBase64Url: (x: string) => x,
    createGmailDraft: async () => {
      if (s.fail === "refused") throw new GmailDraftError("gmail drafts.create 400", "no");
      if (s.fail === "unknown") throw new GmailDraftError("gmail drafts.create: socket hang up", "unknown");
      s.created++; return { id: "d-1" };
    },
  };
});
vi.mock("@/lib/org-client", () => {
  const query = (table: string) => {
    let updating = false;
    const q: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "in", "not", "gte", "order", "insert"]) q[k] = () => q;
    q.update = (p: unknown) => { updating = true; if (table === "co_messages") s.updates.push(p); return q; };
    q.limit = () => q;
    const one = () => table === "co_messages" ? (updating ? { data: s.taken ? { subject: "主旨", body: "edited after the read" } : null, error: null } : { data: s.msg ?? MSG, error: null })
      : table === "co_leads" ? { data: { id: "lead-1", organization_id: ORG, name: "Shop", email: "x@ok.example", website: null, do_not_contact: false }, error: null }
      : table === "co_sender_accounts" ? { data: s.sender, error: null } : { data: null, error: null };
    q.maybeSingle = async () => one();
    q.then = (ok: (v: unknown) => unknown) => Promise.resolve(
      table === "co_connector_accounts" ? { data: [{ id: "c-1", organization_id: ORG, credentials_ref: "ref", is_enabled: true, settings: { email: "Pool@x.example" } }], error: null }
        : table === "co_sending_events" ? { count: s.events, error: null } : one()).then(ok);
    return q;
  };
  return { getOrgSupabaseWriteClient: async () => ({ from: query }) };
});

process.env.GOOGLE_OAUTH_CLIENT_ID = "id";
process.env.GOOGLE_OAUTH_CLIENT_SECRET = "secret";
const { POST } = await import("./route");
const call = (extra: Record<string, unknown> = {}) => POST(new Request("http://app.test/api/outreach/messages/gmail-draft", { method: "POST",
  headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "owner", "x-ops-user-id": "u-1", "content-type": "application/json" },
  body: JSON.stringify({ messageId: MSG.id, ...extra }) }));

beforeEach(() => {
  s.sender = { id: "s-1", organization_id: ORG, email: "pool@x.example", daily_limit: 50, is_active: true, stream_type: "cold", provider: "gmail" };
  s.taken = true; s.created = 0; s.fail = false; s.updates.length = 0; s.built = ""; s.msg = null; s.events = 0;
});

describe("gmail-draft", () => {
  it("drafts from the mailbox the email names", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).senderEmail).toBe("pool@x.example");
    expect(s.created).toBe(1);
    expect(s.built).toBe("edited after the read"); // the content taken, not the content read before
  });

  it("a Gmail refusal gives the row back to approved; an ambiguous failure leaves it taken and says to look in Gmail", async () => {
    s.fail = "refused";
    expect((await call()).status).toBe(502);
    expect(s.updates).toMatchObject([{ status: "drafted" }, { status: "approved", drafted_at: null }]);
    s.updates.length = 0; s.fail = "unknown";
    const res = await call();
    expect(res.status).toBe(502);
    expect((await res.json()).warning).toMatch(/Gmail/);
    expect(s.updates).toMatchObject([{ status: "drafted" }]);
  });

  it("a stale take (drafted, old, no event) is retaken only by a person who confirmed Gmail has no draft; a recent or finished one never", async () => {
    s.msg = { ...MSG, status: "drafted", drafted_at: new Date(Date.now() - 20 * 60_000).toISOString() };
    const unconfirmed = await call();
    expect(unconfirmed.status).toBe(409);
    expect((await unconfirmed.json()).error).toBe("drafted_unconfirmed");
    expect(s.created).toBe(0);
    expect((await call({ confirmedNoDraft: true })).status).toBe(200);
    s.events = 1; s.created = 0;
    expect((await call({ confirmedNoDraft: true })).status).toBe(400);
    s.events = 0; s.msg = { ...MSG, status: "drafted", drafted_at: new Date().toISOString() };
    expect((await call({ confirmedNoDraft: true })).status).toBe(400);
    expect(s.created).toBe(0);
  });

  it("a row another request already took is 409 and Gmail is never called", async () => {
    s.taken = false;
    const res = await call();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("status_changed");
    expect(s.created).toBe(0);
  });

  it("a named mailbox of another organization, or no longer cold, is refused", async () => {
    s.sender = { ...s.sender, organization_id: "00000000-0000-4000-8000-0000000000c2" };
    expect((await call()).status).toBe(409);
    s.sender = { ...s.sender, organization_id: ORG, stream_type: "warm" };
    expect((await call()).status).toBe(409);
    s.sender = { ...s.sender, stream_type: "cold", provider: "fluentsmtp" };
    expect((await call()).status).toBe(409);
    expect(s.created).toBe(0);
  });
});
