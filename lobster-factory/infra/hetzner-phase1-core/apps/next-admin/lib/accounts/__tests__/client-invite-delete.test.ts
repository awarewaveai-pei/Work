import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteClientAccount } from "../client-invite";

// An in-memory stand-in for the few PostgREST calls deleteClientAccount makes (eq / in / or / contains, select with
// count, insert, delete) and GoTrue's getUserById / deleteUser. Deleting a profile cascades its memberships (0001).
type Row = Record<string, unknown>;
const UNIT = "00000000-0000-4000-8000-0000000000a1";
const BRAND = "00000000-0000-4000-8000-0000000000a2";
const OTHER = "00000000-0000-4000-8000-0000000000a3";
const OTHER_BRAND = "00000000-0000-4000-8000-0000000000a4";
const USER = "00000000-0000-4000-8000-0000000000b1";
let tables: Record<string, Row[]>;
let users: Map<string, { id: string; email: string; app_metadata: Row }>;
let deleteUserFails = 0;

function query(table: string) {
  const filters: Array<(r: Row) => boolean> = [];
  let op: "select" | "delete" = "select";
  let head = false;
  const q = {
    select: (_cols?: string, opts?: { head?: boolean }) => { head = Boolean(opts?.head); return q; },
    delete: () => { op = "delete"; return q; },
    insert: async (rows: Row[]) => { tables[table].push(...rows); return { error: null }; },
    eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
    in: (c: string, v: unknown[]) => { filters.push((r) => v.includes(r[c])); return q; },
    or: (expr: string) => {
      const alts = expr.split(",").map((p) => p.split(".eq."));
      filters.push((r) => alts.some(([c, v]) => r[c] === v));
      return q;
    },
    contains: (c: string, v: Row) => { filters.push((r) => Object.entries(v).every(([k, x]) => (r[c] as Row)?.[k] === x)); return q; },
    then: (resolve: (v: unknown) => void) => {
      const hit = tables[table].filter((r) => filters.every((f) => f(r)));
      if (op === "delete") {
        tables[table] = tables[table].filter((r) => !hit.includes(r));
        if (table === "profiles") tables.organization_memberships = tables.organization_memberships.filter((m) => !hit.some((p) => p.id === m.user_id));
        return resolve({ error: null });
      }
      return resolve(head ? { count: hit.length, error: null } : { data: hit, error: null });
    },
  };
  return q;
}
const sb = {
  from: query,
  auth: { admin: {
    getUserById: async (id: string) => ({ data: { user: users.get(id) ?? null }, error: users.has(id) ? null : { status: 404 } }),
    deleteUser: async (id: string) => {
      if (deleteUserFails > 0) { deleteUserFails--; return { error: { message: "gotrue down" } }; }
      users.delete(id);
      return { error: null };
    },
  } },
} as unknown as SupabaseClient;

const accountGone = () => !users.has(USER) && !tables.profiles.some((p) => p.id === USER)
  && !tables.organization_memberships.some((m) => m.user_id === USER);

describe("deleteClientAccount: the cash-register site deleted the person (M10 sourceDeleted)", () => {
  beforeEach(() => {
    deleteUserFails = 0;
    users = new Map([[USER, { id: USER, email: "boss@unit.test", app_metadata: { user_kind: "client", org_id: UNIT } }]]);
    tables = {
      organizations: [{ id: UNIT, parent_organization_id: null, name: "Unit" }, { id: BRAND, parent_organization_id: UNIT, name: "Unit 品牌" },
        { id: OTHER, parent_organization_id: null, name: "Other" }],
      profiles: [{ id: USER, email: "boss@unit.test", default_organization_id: UNIT }],
      organization_memberships: [{ organization_id: UNIT, user_id: USER }],
      social_brand_members: [{ organization_id: BRAND, user_id: USER, role: "owner" }],
      social_audit_log: [],
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("off (staff pressing 刪除): a brand role is still a 409 still_member and nothing is removed", async () => {
    await expect(deleteClientAccount(sb, UNIT, USER)).resolves.toEqual({ ok: false, status: 409, error: "still_member" });
    expect(users.has(USER)).toBe(true);
    expect(tables.social_brand_members).toHaveLength(1);
  });

  it("on: the brand owner role, the sign-in, the profile and the membership all go; the brand left ownerless is named and audited", async () => {
    const out = await deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true });
    expect(out).toEqual({ ok: true, email: "boss@unit.test", brandsWithoutOwner: [{ id: BRAND, name: "Unit 品牌" }] });
    expect(tables.social_brand_members).toEqual([]);
    expect(accountGone()).toBe(true);
    expect(tables.social_audit_log).toEqual([{ organization_id: BRAND, actor: "member_event", action: "member_remove",
      detail: { user_id: USER, role: "owner", reason: "source_deleted" } }]);
  });

  it("on: a role in another unit's brand goes too -- one audit row per brand, both ownerless brands named, the account gone", async () => {
    tables.organizations.push({ id: OTHER_BRAND, parent_organization_id: OTHER, name: "Other 品牌" });
    tables.social_brand_members.push({ organization_id: OTHER_BRAND, user_id: USER, role: "owner" });
    const out = await deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true });
    expect(out).toMatchObject({ ok: true, email: "boss@unit.test" });
    expect((out as { brandsWithoutOwner: Array<{ id: string }> }).brandsWithoutOwner.map((b) => b.id).sort()).toEqual([BRAND, OTHER_BRAND].sort());
    expect(tables.social_brand_members).toEqual([]);
    expect(tables.social_audit_log.map((r) => r.organization_id).sort()).toEqual([BRAND, OTHER_BRAND].sort());
    expect(accountGone()).toBe(true);
  });

  it("on: a failure after the brand roles went is retryable, and the retry finishes and still names the brand", async () => {
    deleteUserFails = 1;
    await expect(deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true })).resolves.toEqual({ ok: false, status: 502, error: "delete_failed" });
    expect(tables.social_brand_members).toEqual([]);
    expect(users.has(USER)).toBe(true);
    const again = await deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true });
    expect(again).toMatchObject({ ok: true, brandsWithoutOwner: [{ id: BRAND, name: "Unit 品牌" }] });
    expect(accountGone()).toBe(true);
    expect(tables.social_audit_log).toHaveLength(1);
    // once more: the account is already gone, which is done
    await expect(deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true })).resolves.toEqual({ ok: true, email: "", gone: true });
  });

  it("on: an account that is not this unit's client is refused, untouched", async () => {
    users.set(USER, { id: USER, email: "boss@unit.test", app_metadata: { user_kind: "client", org_id: OTHER } });
    await expect(deleteClientAccount(sb, UNIT, USER, { sourceDeleted: true })).resolves.toEqual({ ok: false, status: 409, error: "not_this_client" });
    expect(tables.social_brand_members).toHaveLength(1);
    expect(users.has(USER)).toBe(true);
  });
});
