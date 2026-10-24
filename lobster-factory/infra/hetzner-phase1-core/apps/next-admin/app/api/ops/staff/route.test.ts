// /api/ops/staff -- the named cases (agency-os/handoffs/2026-10-24-staff-tool-grants C4): only the owner writes; an owner's
// tools cannot change; the last owner cannot be demoted; a write keeps the rest of app_metadata and is audited; a new
// staff member is a viewer with no tools; a customer's email is never made staff.
import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "11111111-1111-4111-8111-111111111111";
const OWNER2 = "22222222-2222-4222-8222-222222222222";
const AMY = "33333333-3333-4333-8333-333333333333";
const CLIENT = "44444444-4444-4444-8444-444444444444";

type FakeUser = { id: string; email: string; email_confirmed_at: string | null; app_metadata: Record<string, unknown> };
const users = vi.hoisted(() => new Map<string, FakeUser>());
const org = vi.hoisted(() => ({ row: { id: "org-internal" } as null | { id: string } }));
const inserts = vi.hoisted(() => vi.fn((_table: string, _row: Record<string, unknown>) => ({ error: null })));
const mail = vi.hoisted(() => vi.fn(async (_msg: { to: string; text: string }) => ({ ok: true, id: "m1" })));
const admin = vi.hoisted(() => ({
  listUsers: vi.fn(async () => ({ data: { users: [...users.values()] }, error: null })),
  getUserById: vi.fn(async (id: string) => ({ data: { user: users.get(id) ?? null }, error: null })),
  updateUserById: vi.fn(async (id: string, attrs: { app_metadata: Record<string, unknown> }) => {
    const u = users.get(id)!;
    const next = { ...u, app_metadata: attrs.app_metadata };
    users.set(id, next);
    return { data: { user: next }, error: null };
  }),
  createUser: vi.fn(async (a: { email: string; app_metadata: Record<string, unknown> }) => {
    const u = { id: "55555555-5555-4555-8555-555555555555", email: a.email, email_confirmed_at: null, app_metadata: a.app_metadata };
    users.set(u.id, u);
    return { data: { user: u }, error: null };
  }),
  generateLink: vi.fn(async (a: { email: string }) => {
    const u = [...users.values()].find((x) => x.email === a.email);
    return { data: { user: u, properties: { hashed_token: "h" } }, error: null };
  }),
}));

vi.mock("@/lib/mail/resend", () => ({ sendMail: mail }));
vi.mock("@/lib/accounts/client-invite", async (orig) => ({
  ...(await orig<typeof import("@/lib/accounts/client-invite")>()),
  findAuthUserByEmail: async (email: string) => [...users.values()].find((u) => u.email === email) ?? null,
}));
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({
    auth: { admin },
    from: (table: string) => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: org.row, error: null }) }) }) }),
      insert: async (row: Record<string, unknown>) => inserts(table, row),
    }),
  }),
}));

const { GET, PATCH, POST } = await import("./route");

const req = (method: string, role: string, body?: unknown, userKind = "staff") => new Request("https://app.aware-wave.com/api/ops/staff", {
  method,
  headers: { "content-type": "application/json", "x-ops-claims-role": role, "x-ops-user-kind": userKind, "x-ops-user-id": OWNER },
  body: body === undefined ? undefined : JSON.stringify(body),
});
const user = (id: string, email: string, meta: Record<string, unknown>): FakeUser => ({ id, email, email_confirmed_at: "2026-10-01", app_metadata: meta });

beforeEach(() => {
  users.clear();
  users.set(OWNER, user(OWNER, "pei@x.test", { ops_role: "owner" }));
  users.set(AMY, user(AMY, "amy@x.test", { ops_role: "operator", provider: "email", staff_tools: ["social"] }));
  users.set(CLIENT, user(CLIENT, "c@x.test", { user_kind: "client", org_id: "o1" }));
  inserts.mockClear();
  mail.mockClear();
  org.row = { id: "org-internal" };
});

describe("/api/ops/staff", () => {
  it("lists staff only (no customers), owners first; admin may read but not edit", async () => {
    const res = await GET(req("GET", "admin"));
    const json = await res.json();
    expect(json.staff.map((a: { email: string }) => a.email)).toEqual(["pei@x.test", "amy@x.test"]);
    expect(json.canEdit).toBe(false);
    expect((await GET(req("GET", "operator"))).status).toBe(403);
    expect((await GET(req("GET", "owner", undefined, "client"))).status).toBe(403);
  });

  it("only the owner writes", async () => {
    for (const role of ["admin", "operator", "viewer"]) {
      expect((await PATCH(req("PATCH", role, { userId: AMY, tools: [] }))).status, role).toBe(403);
      expect((await POST(req("POST", role, { email: "n@x.test" }))).status, role).toBe(403);
    }
  });

  it("the owner sets tools and role; the rest of app_metadata stays; the change is audited", async () => {
    const res = await PATCH(req("PATCH", "owner", { userId: AMY, role: "viewer", tools: ["content", "ops/clients"] }));
    expect(res.status).toBe(200);
    expect(users.get(AMY)!.app_metadata).toEqual({ ops_role: "viewer", provider: "email", staff_tools: ["content", "ops/clients"] });
    const [table, row] = inserts.mock.calls[0];
    expect(table).toBe("ops_audit_events");
    expect(row).toMatchObject({ organization_id: "org-internal", event_type: "staff.access_updated", target_id: AMY });
    expect(row.payload).toMatchObject({ actor_user_id: OWNER, tools: { from: ["social"], to: ["content", "ops/clients"] } });
  });

  it("an owner's tools cannot change; unknown tools and roles are refused", async () => {
    expect((await PATCH(req("PATCH", "owner", { userId: OWNER, tools: [] }))).status).toBe(409);
    expect((await PATCH(req("PATCH", "owner", { userId: AMY, tools: ["not-a-tool"] }))).status).toBe(400);
    expect((await PATCH(req("PATCH", "owner", { userId: AMY, role: "god" }))).status).toBe(400);
    expect((await PATCH(req("PATCH", "owner", { userId: CLIENT, tools: [] }))).status).toBe(404);
    expect(inserts).not.toHaveBeenCalled();
  });

  it("the last owner cannot be demoted; with a second owner, one can step down", async () => {
    const last = await PATCH(req("PATCH", "owner", { userId: OWNER, role: "admin" }));
    expect([last.status, (await last.json()).error]).toEqual([409, "last_owner"]);
    expect(users.get(OWNER)!.app_metadata.ops_role).toBe("owner");
    users.set(OWNER2, user(OWNER2, "o2@x.test", { ops_role: "owner" }));
    expect((await PATCH(req("PATCH", "owner", { userId: OWNER, role: "admin" }))).status).toBe(200);
    // two demotions at once: the writes run one at a time, so the second sees one owner left
    users.set(OWNER, user(OWNER, "pei@x.test", { ops_role: "owner" }));
    const both = await Promise.all([OWNER, OWNER2].map((id) => PATCH(req("PATCH", "owner", { userId: id, role: "admin" }))));
    expect(both.map((r) => r.status).sort()).toEqual([200, 409]);
    expect([...users.values()].filter((u) => u.app_metadata.ops_role === "owner")).toHaveLength(1);
  });

  it("no internal organization to audit under: nothing is changed (503)", async () => {
    org.row = null;
    const res = await PATCH(req("PATCH", "owner", { userId: AMY, tools: [] }));
    expect([res.status, (await res.json()).error]).toEqual([503, "audit_unavailable"]);
    expect(users.get(AMY)!.app_metadata.staff_tools).toEqual(["social"]);
    expect((await POST(req("POST", "owner", { email: "n@x.test" }))).status).toBe(503);
    expect(admin.createUser).not.toHaveBeenCalledWith(expect.objectContaining({ email: "n@x.test" }));
  });

  it("an account created before the mail failed is still audited", async () => {
    mail.mockResolvedValueOnce({ ok: false, error: "send_failed" } as never);
    const res = await POST(req("POST", "owner", { email: "late@x.test" }));
    expect(res.status).toBe(502);
    expect(inserts.mock.calls.map(([, row]) => [row.event_type, (row.payload as { email: string }).email])).toEqual([["staff.invited", "late@x.test"]]);
  });

  it("a new staff member is a viewer with no tools, mailed a set-password link on the staff host; a customer's email is refused", async () => {
    const res = await POST(req("POST", "owner", { email: "New@X.test" }));
    expect(res.status).toBe(200);
    expect(admin.createUser).toHaveBeenCalledWith(expect.objectContaining({ email: "new@x.test", email_confirm: false, app_metadata: { user_kind: "staff", ops_role: "viewer", staff_tools: [] } }));
    expect(mail.mock.calls[0][0].text).toContain("https://app.aware-wave.com/login/set-password#token_hash=h");
    expect((await POST(req("POST", "owner", { email: "c@x.test" }))).status).toBe(409);
    expect((await POST(req("POST", "owner", { email: "amy@x.test" }))).status).toBe(409);   // already verified staff
  });
});
