// /api/ops/clients/[slug]/accounts -- the named cases: only staff owner/admin create accounts; a new account is created
// unverified and only the mailed link (token in the fragment) can verify it; the link never creates or reaches another
// user; an email that belongs to staff or another client is never touched; delete only removes this client's accounts
// that hold no brand role. "Unverified cannot be added": 0103 local-verify (DB) + lib/social/__tests__/members-store.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
const NEW_USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

type FakeUser = { id: string; email: string; email_confirmed_at: string | null; app_metadata: Record<string, unknown> };
const state = vi.hoisted(() => ({
  profile: null as null | { id: string },
  user: null as null | FakeUser,
  memberRows: 0,
}));
const admin = vi.hoisted(() => ({
  createUser: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  deleteUser: vi.fn(async (_id: string) => ({ error: null })),
}));
const inserts = vi.hoisted(() => vi.fn(async (_table: string, _row: unknown) => ({ error: null })));
const audit = vi.hoisted(() => vi.fn(async () => undefined));
const mail = vi.hoisted(() => vi.fn(async (_msg: { to: string; text: string }) => ({ ok: true, id: "m1" })));

vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: audit }));
vi.mock("@/lib/mail/resend", () => ({ sendMail: mail }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    auth: { admin },
    from: (table: string) => ({
      select: () => ({
        eq: () => {
          const one =
            table === "organizations"
              ? { data: { id: ORG, name: "Soulful", type: "client" }, error: null }
              : { data: state.profile, error: null };
          // social_brand_members is read as a head count (deleteClientAccount)
          return Object.assign(Promise.resolve({ count: state.memberRows, error: null }), { maybeSingle: async () => one });
        },
      }),
      insert: (row: unknown) => inserts(table, row),
      upsert: (row: unknown) => inserts(table, row),
      delete: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

const { POST, DELETE } = await import("./route");

const ctx = () => ({ params: Promise.resolve({ slug: "soulful" }) });
const post = (headers: Record<string, string>, email = "Staff.Person@Client.example") =>
  new Request("http://localhost/api/ops/clients/soulful/accounts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ops-user-kind": "staff", ...headers },
    body: JSON.stringify({ email, product: "social" }),
  });
const del = (userId: string) =>
  new Request(`http://localhost/api/ops/clients/soulful/accounts?userId=${userId}`, {
    method: "DELETE",
    headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "admin" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  state.profile = null;
  state.user = null;
  state.memberRows = 0;
  admin.createUser.mockImplementation(async (attrs: { email: string; app_metadata: Record<string, unknown> }) => ({
    data: { user: { id: NEW_USER, email: attrs.email, email_confirmed_at: null, app_metadata: attrs.app_metadata } },
    error: null,
  }));
  admin.getUserById.mockImplementation(async () => ({ data: { user: state.user }, error: null }));
  admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "HASHED-TOKEN-abc" }, user: { id: NEW_USER } }, error: null });
});

describe("POST accounts", () => {
  it.each([
    ["viewer", "staff"],
    ["operator", "staff"],
    ["admin", "client"],
  ])("refuses role %s as %s before any account is touched", async (role, kind) => {
    const res = await POST(post({ "x-ops-claims-role": role, "x-ops-user-kind": kind }), ctx());
    expect(res.status).toBe(403);
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.generateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("creates the account unverified, mails a fragment link on the product door, never returns the token", async () => {
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(JSON.parse(text)).toMatchObject({ ok: true, userId: NEW_USER, kind: "invite", created: true });
    expect(text).not.toContain("HASHED-TOKEN");
    expect(admin.createUser).toHaveBeenCalledWith({
      email: "staff.person@client.example",
      email_confirm: false,
      app_metadata: { user_kind: "client", org_id: ORG },
    });
    expect(admin.createUser.mock.calls[0][0]).not.toHaveProperty("password");
    // "recovery" never creates a user; "invite"/"magiclink" would create one without user_kind (= staff)
    expect(admin.generateLink).toHaveBeenCalledWith({ type: "recovery", email: "staff.person@client.example" });
    const sent = mail.mock.calls[0][0] as { to: string; text: string };
    expect(sent.to).toBe("staff.person@client.example");
    expect(sent.text).toContain("https://social.aware-wave.com/login/set-password#token_hash=HASHED-TOKEN-abc&type=recovery");
    expect(JSON.stringify(audit.mock.calls)).not.toContain("HASHED-TOKEN");
  });

  it("sends nothing when the link resolved to a different user than the one checked", async () => {
    admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "HASHED-TOKEN-abc" }, user: { id: OTHER } }, error: null });
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(409);
    expect(mail).not.toHaveBeenCalled();
  });

  it("refuses an email that belongs to another organization and leaves that account alone", async () => {
    state.profile = { id: OTHER };
    state.user = { id: OTHER, email: "staff.person@client.example", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { user_kind: "client", org_id: "another-org" } };
    const res = await POST(post({ "x-ops-claims-role": "owner" }), ctx());
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: "email_taken" });
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(admin.generateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("refuses when the profile's email now resolves to a different auth email (link is generated by email)", async () => {
    state.profile = { id: "same-org-user" };
    state.user = { id: "same-org-user", email: "renamed@client.example", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: ORG } };
    const res = await POST(post({ "x-ops-claims-role": "owner" }), ctx());
    expect(res.status).toBe(409);
    expect(admin.generateLink).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});

describe("DELETE accounts", () => {
  it("never deletes an account of another organization or a staff account", async () => {
    for (const meta of [{ user_kind: "client", org_id: "another-org" }, {}]) {
      state.user = { id: OTHER, email: "x@y.example", email_confirmed_at: null, app_metadata: meta };
      const res = await DELETE(del(OTHER), ctx());
      expect(res.status).toBe(404);
    }
    expect(admin.deleteUser).not.toHaveBeenCalled();
  });

  it("refuses while the account still holds a brand role (removed in 成員, where the last-owner rule lives)", async () => {
    state.user = { id: NEW_USER, email: "a@client.example", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: { user_kind: "client", org_id: ORG } };
    state.memberRows = 1;
    const res = await DELETE(del(NEW_USER), ctx());
    expect(res.status).toBe(409);
    expect(admin.deleteUser).not.toHaveBeenCalled();
    state.memberRows = 0;
    expect((await DELETE(del(NEW_USER), ctx())).status).toBe(200);
    expect(admin.deleteUser).toHaveBeenCalledWith(NEW_USER);
  });
});
