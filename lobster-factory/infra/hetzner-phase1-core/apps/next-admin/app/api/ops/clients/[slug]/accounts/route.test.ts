// /api/ops/clients/[slug]/accounts -- the named cases: only staff owner/admin create accounts; a new account is created
// unverified and only the mailed link (token in the fragment) can verify it; the link never creates or reaches another
// user; an email that belongs to staff or another client is never touched; delete only removes this client's accounts
// that hold no brand role; only a product the client holds, on a served door, is offered or mailed, and each person's role
// is read from that product's member list. "Unverified cannot be added": 0103 local-verify (DB) + lib/social/__tests__/members-store.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG = "2bf60452-3d4d-47c2-9970-b9046ed1a35a";
const NEW_USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "33333333-3333-4333-8333-333333333333";

type FakeUser = { id: string; email: string; email_confirmed_at: string | null; app_metadata: Record<string, unknown> };
const state = vi.hoisted(() => ({
  profile: null as null | { id: string; default_organization_id?: string },
  profileById: null as null | { default_organization_id: string },
  user: null as null | FakeUser,
  memberRows: 0,
  otherOrgMemberships: 0,
  membershipRows: [] as Array<{ user_id: string; profiles: { email: string } }>,
  held: new Set<string>(),
  members: [] as Array<{ user_id: string; role: string }>,
}));
const admin = vi.hoisted(() => ({
  createUser: vi.fn(),
  getUserById: vi.fn(),
  generateLink: vi.fn(),
  deleteUser: vi.fn(async (_id: string) => ({ error: null })),
}));
const deletes = vi.hoisted(() => vi.fn((_table: string) => undefined));
const inserts = vi.hoisted(() => vi.fn(async (_table: string, _row: unknown) => ({ error: null })));
const audit = vi.hoisted(() => vi.fn(async () => undefined));
const mail = vi.hoisted(() => vi.fn(async (_msg: { to: string; text: string }) => ({ ok: true, id: "m1" })));

vi.mock("@/lib/ops-audit", () => ({ recordOpsAudit: audit }));
vi.mock("@/lib/mail/resend", () => ({ sendMail: mail }));
vi.mock("@/lib/entitlements/door-holds", () => ({ holdsProduct: async ({ productKey }: { productKey: string }) => state.held.has(productKey) }));
vi.mock("@/lib/social/store", () => ({ listMembers: async () => state.members }));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseUrl: () => process.env.SUPABASE_URL,
  getServiceRoleKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY,
  getSupabaseWriteClient: () => ({
    auth: { admin },
    from: (table: string) => ({
      select: () => ({
        eq: (col: string) => {
          const one =
            table === "organizations"
              ? { data: { id: ORG, name: "Soulful", type: "client" }, error: null }
              : { data: col === "id" ? state.profileById : state.profile, error: null };
          // head counts: social_brand_members (brand roles), organization_memberships .neq(this org)
          const rows = table === "organization_memberships" ? state.membershipRows : null;
          return Object.assign(Promise.resolve({ count: state.memberRows, data: rows, error: null }), {
            maybeSingle: async () => one,
            neq: async () => ({ count: state.otherOrgMemberships, error: null }),
          });
        },
      }),
      insert: (row: unknown) => inserts(table, row),
      upsert: (row: unknown) => inserts(table, row),
      delete: () => ({ eq: async () => (deletes(table), { error: null }) }),
    }),
  }),
}));

const { GET, POST, DELETE } = await import("./route");

const ctx = () => ({ params: Promise.resolve({ slug: "soulful" }) });
const post = (headers: Record<string, string>, email = "Staff.Person@Client.example", product = "social") =>
  new Request("http://localhost/api/ops/clients/soulful/accounts", {
    method: "POST",
    headers: { "content-type": "application/json", "x-ops-user-kind": "staff", ...headers },
    body: JSON.stringify({ email, product }),
  });
const get = () =>
  new Request("http://localhost/api/ops/clients/soulful/accounts", { headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "admin" } });
const del = (userId: string) =>
  new Request(`http://localhost/api/ops/clients/soulful/accounts?userId=${userId}`, {
    method: "DELETE",
    headers: { "x-ops-user-kind": "staff", "x-ops-claims-role": "admin" },
  });

const gotrueSearch = vi.fn(async (_url: string) => new Response(JSON.stringify({ users: [] }), { status: 200 }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", gotrueSearch);
  vi.stubEnv("SUPABASE_URL", "https://supabase.example");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
  state.profile = null;
  state.profileById = null;
  state.user = null;
  state.memberRows = 0;
  state.otherOrgMemberships = 0;
  state.membershipRows = [];
  state.held = new Set(["social"]);
  state.members = [];
  admin.createUser.mockImplementation(async (attrs: { email: string; app_metadata: Record<string, unknown> }) => ({
    data: { user: { id: NEW_USER, email: attrs.email, email_confirmed_at: null, app_metadata: attrs.app_metadata } },
    error: null,
  }));
  admin.getUserById.mockImplementation(async () => ({ data: { user: state.user }, error: null }));
  admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "HASHED-TOKEN-abc" }, user: { id: NEW_USER } }, error: null });
});

describe("GET accounts -- products the client holds, roles from each product's own list", () => {
  it("offers only held products on a served door, and reads each person's role from the member list", async () => {
    state.held = new Set(["social", "tarot", "content"]); // content's door is closed (enabled: false)
    state.membershipRows = [{ user_id: NEW_USER, profiles: { email: "a@client.example" } }, { user_id: OTHER, profiles: { email: "b@client.example" } }];
    admin.getUserById.mockImplementation(async (id: string) => ({
      data: { user: { id, email: id === NEW_USER ? "a@client.example" : "b@client.example", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: ORG } } },
      error: null,
    }));
    state.members = [{ user_id: NEW_USER, role: "editor" }];
    const body = await (await GET(get(), ctx())).json();
    expect(body.products.map((p: { key: string }) => p.key)).toEqual(["social", "tarot"]);
    expect(body.products[0].settings).toBe(`/tools/social?brand=${ORG}&view=settings`);
    expect(body.products[1].settings).toBeNull();
    expect(body.accounts.map((a: { roles: unknown }) => a.roles)).toEqual([{ social: "編輯" }, { social: null }]);
  });

  it("a client that holds nothing is offered nothing", async () => {
    state.held = new Set();
    expect((await (await GET(get(), ctx())).json()).products).toEqual([]);
  });
});

describe("POST accounts", () => {
  it("refuses a product the client does not hold, and a held product whose door is closed, before any account is touched", async () => {
    state.held = new Set(["social", "content"]);
    for (const product of ["tarot", "content"]) {
      const res = await POST(post({ "x-ops-claims-role": "admin" }, "a@client.example", product), ctx());
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: "product_not_held" });
    }
    expect(admin.createUser).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

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

describe("POST accounts -- a half-made account is finished by pressing again (nobody opens Supabase)", () => {
  const exists = { data: { user: null }, error: { code: "email_exists", message: "already registered" } };
  const searchReturns = (u: FakeUser) =>
    gotrueSearch.mockResolvedValueOnce(new Response(JSON.stringify({ users: [u] }), { status: 200 }));

  it("adopts this client's auth user that has no profile, then mails it", async () => {
    admin.createUser.mockResolvedValueOnce(exists);
    searchReturns({ id: NEW_USER, email: "staff.person@client.example", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: ORG } });
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, userId: NEW_USER, kind: "invite", created: true });
    expect(inserts.mock.calls.map((c) => c[0])).toEqual(["profiles", "organization_memberships"]);
    expect(mail).toHaveBeenCalledTimes(1);
  });

  it("never adopts a user the search returned that only resembles the email (the filter is a substring LIKE)", async () => {
    admin.createUser.mockResolvedValueOnce(exists);
    searchReturns({ id: OTHER, email: "staff.person@client.example.tw", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: ORG } });
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(503);
    expect(inserts).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("never adopts a staff (or other client) auth user that has no profile", async () => {
    admin.createUser.mockResolvedValueOnce(exists);
    searchReturns({ id: OTHER, email: "staff.person@client.example", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: {} });
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(409);
    expect(inserts).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });

  it("clears this client's profile whose sign-in account is gone, then creates the account", async () => {
    state.profile = { id: OTHER, default_organization_id: ORG };
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(200);
    expect(deletes).toHaveBeenCalledWith("profiles");
    expect(admin.createUser).toHaveBeenCalledTimes(1);
  });

  it("leaves another client's leftover profile alone", async () => {
    state.profile = { id: OTHER, default_organization_id: "another-org" };
    const res = await POST(post({ "x-ops-claims-role": "admin" }), ctx());
    expect(res.status).toBe(409);
    expect(deletes).not.toHaveBeenCalled();
    expect(admin.createUser).not.toHaveBeenCalled();
  });
});

describe("POST accounts -- repair never touches what something else still uses", () => {
  it("keeps a leftover profile that still has a membership in another organization", async () => {
    state.profile = { id: OTHER, default_organization_id: ORG };
    state.otherOrgMemberships = 1;
    expect((await POST(post({ "x-ops-claims-role": "admin" }), ctx())).status).toBe(409);
    expect(deletes).not.toHaveBeenCalled();
  });

  it("does not adopt an auth user whose profile row belongs to another client", async () => {
    admin.createUser.mockResolvedValueOnce({ data: { user: null }, error: { code: "email_exists", message: "already" } });
    gotrueSearch.mockResolvedValueOnce(new Response(JSON.stringify({ users: [{ id: NEW_USER, email: "staff.person@client.example", email_confirmed_at: null, app_metadata: { user_kind: "client", org_id: ORG } }] }), { status: 200 }));
    state.profileById = { default_organization_id: "another-org" };
    expect((await POST(post({ "x-ops-claims-role": "admin" }), ctx())).status).toBe(409);
    expect(inserts).not.toHaveBeenCalled();
  });

  it("a failed press deletes nothing (a second press may already be using the account)", async () => {
    inserts.mockResolvedValueOnce({ error: { message: "boom" } } as never);
    expect((await POST(post({ "x-ops-claims-role": "admin" }), ctx())).status).toBe(503);
    expect(admin.deleteUser).not.toHaveBeenCalled();
    expect(deletes).not.toHaveBeenCalled();
    expect(mail).not.toHaveBeenCalled();
  });
});
